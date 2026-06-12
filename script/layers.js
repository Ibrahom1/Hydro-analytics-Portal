// Global GeoServer IP variables
const geoserverUrl='172.18.7.35'
const mamAyman = "172.18.1.179"; // National, Provincial, District, Tehsil
const mamHimael = "172.18.1.147";
const ibrahim  = "172.18.1.112";
const mapDiv = document.getElementById("map1");

function canHydroMapAcceptLayerChanges(map) {
  if (!map || typeof map.getStyle !== 'function') return false;
  try {
    const style = map.getStyle();
    if (!style || !Array.isArray(style.layers)) return false;
    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) return true;
    if (map.__hydroStyleReadyForLayers && map.__hydroStyleReadyStyle === map.style) return true;
    return Boolean(map.style?._loaded);
  } catch (error) {
    return false;
  }
}

function waitForHydroMapStyleReady(map, timeoutMs = 45000) {
  if (!map) return Promise.resolve(null);
  if (canHydroMapAcceptLayerChanges(map)) {
    map.__hydroStyleReadyForLayers = true;
    map.__hydroStyleReadyStyle = map.style;
    return Promise.resolve(map);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      map.off?.('load', check);
      map.off?.('style.load', markReady);
      map.off?.('styledata', check);
      clearTimeout(timeoutId);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      map.__hydroStyleReadyForLayers = true;
      map.__hydroStyleReadyStyle = map.style;
      cleanup();
      resolve(map);
    };
    const markReady = () => {
      map.__hydroStyleReadyForLayers = true;
      map.__hydroStyleReadyStyle = map.style;
      finish();
    };
    const check = () => {
      if (settled) return;
      if (canHydroMapAcceptLayerChanges(map)) finish();
    };
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Map style was not ready in time.'));
    }, timeoutMs);

    map.on?.('load', check);
    map.on?.('style.load', markReady);
    map.on?.('styledata', check);
    check();
  });
}

function whenHydroMapStyleReady(map, callback, timeoutMs) {
  waitForHydroMapStyleReady(map, timeoutMs)
    .then((readyMap) => {
      if (readyMap) callback();
    })
    .catch((error) => console.warn('[Map readiness] Map style was not ready:', error.message || error));
}

// DEW Exposure
let exposuresLoadPromise = null;
const exposureDistricts = new Set();
const DEW_EXPOSURE_API_URL = "http://172.18.1.108:8000/get-exposures/";

function setExposureDropdownMessage(msg) {
  const el = document.getElementById('dew-exposure-status');
  if (el) el.textContent = msg;
}

function getDewMap() {
  return typeof map1 !== 'undefined' ? map1 : null;
}

async function fetchDewJson(path = "") {
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

function normalizeExposureList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.exposures)) return payload.exposures;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeExposureFeatureCollection(payload) {
  if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return payload;
  }
  if (payload?.data?.type === 'FeatureCollection' && Array.isArray(payload.data.features)) {
    return payload.data;
  }
  if (Array.isArray(payload?.features)) {
    return { type: 'FeatureCollection', features: payload.features };
  }
  return { type: 'FeatureCollection', features: [] };
}

function waitForDewMapStyle(map) {
  if (!map) return Promise.reject(new Error('Map is not available.'));
  return waitForHydroMapStyleReady(map, 45000).then(() => undefined);
}

function bindExposureControls() {
  const dropdown = document.getElementById('exposure-dropdown');
  if (!dropdown || dropdown._dewBound) return;
  dropdown._dewBound = true;
  dropdown.addEventListener('change', (e) => {
    if (e.target.value) fetchExposureDetails(e.target.value);
  });
}

function toggleDewExposurePanel() {
  const panel = document.getElementById('dew-exposure-panel');
  if (!panel) {
    console.warn("[DEW Exposures] Panel element not found.");
    return;
  }

  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) fetchExposures();
}

function closeDewExposurePanel() {
  const panel = document.getElementById('dew-exposure-panel');
  if (panel) panel.style.display = 'none';
}

const fetchExposuresLegacy = async () => {
  const exposureDropdown = document.getElementById("exposure-dropdown");
  if (!exposureDropdown) return;
  if (exposuresLoadPromiseLegacy) return exposuresLoadPromiseLegacy;

  setExposureDropdownMessage("Loading exposures...");
  bindExposureControls();

  exposuresLoadPromise = (async () => {
    try {
      const exposures = normalizeExposureList(await fetchDewJson());
      const fragment = document.createDocumentFragment();
      fragment.appendChild(new Option("Select an exposure", ""));

      if (!exposures.length) {
        fragment.appendChild(new Option("No exposures available", ""));
        exposureDropdown.replaceChildren(fragment);
        setExposureDropdownMessage("No exposures available");
        return;
      }

      for (const exposure of exposures) {
        const id = exposure?.id ?? exposure?.exposure_id ?? exposure?.ID;
        const remarks = exposure?.remarks ?? exposure?.name ?? exposure?.title;
        if (id === undefined || id === null || id === "") {
          console.warn("[DEW Exposures] Skipping exposure without id.", { remarks });
          continue;
        }
        fragment.appendChild(new Option(`${id} - ${remarks || "No remarks"}`, String(id)));
      }

      exposureDropdown.replaceChildren(fragment);
      setExposureDropdownMessage("");
    } catch (error) {
      exposuresLoadPromise = null;
      console.warn(`[DEW Exposures] Service unavailable. ${error?.message || "Request failed."}`);
      setExposureDropdownMessage("Exposure service unavailable");
    }
  })();

  return exposuresLoadPromise;
};

function collectDewCoordinates(node, bucket) {
  if (!Array.isArray(node)) return;

  if (
    node.length >= 2 &&
    typeof node[0] === 'number' &&
    Number.isFinite(node[0]) &&
    typeof node[1] === 'number' &&
    Number.isFinite(node[1])
  ) {
    bucket.push([node[0], node[1]]);
    return;
  }

  node.forEach((child) => collectDewCoordinates(child, bucket));
}

function zoomToDewFeatures(map, features) {
  const points = [];
  features.forEach((feature) => collectDewCoordinates(feature?.geometry?.coordinates, points));
  if (!points.length) return;

  const bounds = points.reduce((acc, point) => acc.extend(point), new mapboxgl.LngLatBounds(points[0], points[0]));
  map.fitBounds(bounds, {
    padding: { top: 80, right: 80, bottom: 80, left: 80 },
    maxZoom: 11,
    duration: 900
  });
}

const fetchExposureDetails = async (exposureId) => {
  const dewMap = getDewMap();

  try {
    await waitForDewMapStyle(dewMap);
    setExposureDropdownMessage("Loading exposure details...");

    const featureCollection = normalizeExposureFeatureCollection(
      await fetchDewJson(`?exposure_id=${encodeURIComponent(exposureId)}`)
    );
    const { features } = featureCollection;
    if (!Array.isArray(features)) throw new Error('Invalid GeoJSON format: missing "features".');
    if (!features.length) throw new Error("No exposure features returned.");

    const layerId = "dewpolygon";

    if (dewMap.getSource(layerId)) {
      dewMap.getSource(layerId).setData(featureCollection);
    } else {
      dewMap.addSource(layerId, {
        type: "geojson",
        data: featureCollection,
      });
    }

    if (!dewMap.getLayer(`${layerId}_fill`)) {
      dewMap.addLayer({
        id: `${layerId}_fill`,
        type: "fill",
        source: layerId,
        layout: { visibility: "visible" },
        paint: {
          "fill-color": "#FF0000",
          "fill-opacity": 0.3,
          "fill-outline-color": "#FF0000",
        },
      });
    }

    if (!dewMap.getLayer(`${layerId}_outline`)) {
      dewMap.addLayer({
        id: `${layerId}_outline`,
        type: "line",
        source: layerId,
        layout: { visibility: "visible" },
        paint: {
          "line-color": "#FF0000",
          "line-opacity": 1,
          "line-width": 1.5,
        },
      });
    }

    dewMap.setLayoutProperty(`${layerId}_fill`, "visibility", "visible");
    dewMap.setLayoutProperty(`${layerId}_outline`, "visibility", "visible");

    exposureDistricts.clear();
    for (const feature of features) {
      if (feature.properties?.exposure_feature_assessment) {
        for (const province of Object.values(feature.properties.exposure_feature_assessment)) {
          if (!province || typeof province !== "object") continue;
          for (const district of Object.keys(province)) {
            exposureDistricts.add(district);
          }
        }
      }
    }

    if (dewMap.getLayer("district_boundary_fill") && exposureDistricts.size) {
      dewMap.setFilter("district_boundary_fill", ["in", "name", ...exposureDistricts]);
    } else if (dewMap.getLayer("DistrictBoundaryHighlight") && exposureDistricts.size) {
      dewMap.setFilter("DistrictBoundaryHighlight", ["in", "name", ...exposureDistricts]);
    }

    zoomToDewFeatures(dewMap, features);
    setExposureDropdownMessage("");
  } catch (error) {
    console.error("Error fetching exposure details:", error);
    setExposureDropdownMessage("Error loading exposure details");
  }
};

function initDewExposureControls() {
  setExposureDropdownMessage("Open to load exposures");
  bindExposureControls();

  const dropdown = document.getElementById("exposure-dropdown");
  if (!dropdown || dropdown._dewLazyLoadBound) return;
  dropdown._dewLazyLoadBound = true;
  dropdown.addEventListener("focus", fetchExposures);
  dropdown.addEventListener("mousedown", fetchExposures);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDewExposureControls);
} else {
  initDewExposureControls();
}

function updateLayerToggleRowHighlight(checkbox) {
  if (!checkbox) return;
  const rowLabel = checkbox.closest('label');
  if (!rowLabel) return;
  rowLabel.classList.toggle('layer-active', Boolean(checkbox.checked));
  rowLabel.classList.toggle('layer-inactive', !checkbox.checked);
}

function initLayerToggleRowHighlighting() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Initial sync (covers any checkboxes pre-checked in HTML).
  sidebar.querySelectorAll('input[type="checkbox"]').forEach(updateLayerToggleRowHighlight);

  // Keep synced for all checkbox changes (including ones that don't call toggleHighlight()).
  if (sidebar.__layerToggleHighlightBound) return;
  sidebar.__layerToggleHighlightBound = true;
  sidebar.addEventListener(
    'change',
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'checkbox') return;
      updateLayerToggleRowHighlight(target);
    },
    true
  );
}

// Global variables for blinking functionality
let selectedTehsils = [];
let selectedDistrict = [];
let blinkInterval = null;

//This is for blink button Tehsils (Tehsil Layer)
function updateBlinkLayersButtonVisibility() {
  const btn = document.getElementById('blinkLayersBtn');
  if (!btn) return;
  const tehsilCheckbox = document.getElementById('tslBoundary');
  const districtCheckbox = document.getElementById('dstBoundary');
  const shouldShow = Boolean(tehsilCheckbox?.checked || districtCheckbox?.checked);
  btn.style.display = shouldShow ? 'flex' : 'none';
}

// Reusable popup creator for feature layers
function createFeaturePopup(feature, layerType, accentColor, displayAttributes) {
  const formatProp = (label, value) => {
    return `<div class="discharge-item"><span class="discharge-label">${label}:</span><span class="discharge-value">${value || 'N/A'}</span></div>`;
  };

  let headerName = 'Unknown ' + layerType;
  let mainAttr = displayAttributes[0] || 'name';
  if (feature.properties && feature.properties[mainAttr]) {
    headerName = feature.properties[mainAttr];
  }

  let contentRows = '';
  contentRows += formatProp('Location', `${feature.geometry?.coordinates?.[1]?.toFixed(5) || 'N/A'}, ${feature.geometry?.coordinates?.[0]?.toFixed(5) || 'N/A'}`);
  contentRows += formatProp(layerType, headerName);

  for (let i = 0; i < displayAttributes.length; i++) {
    const attr = displayAttributes[i];
    if (feature.properties && feature.properties[attr]) {
      contentRows += formatProp(attr.charAt(0).toUpperCase() + attr.slice(1).replace('_', ' '), feature.properties[attr]);
    }
  }

  const popupHTML = `
    <div class="ffd-popup-container">
      <div class="popup-header" style="border-left: 4px solid ${accentColor};">
        <div class="station-info">
          <h3 class="station-name">${headerName}</h3>
          <div class="status-badge" style="background-color: ${accentColor};">
            <i class="fas fa-map-marker-alt"></i>
            ${layerType}
          </div>
        </div>
      </div>
      <div class="popup-content">
        <div class="discharge-section">
          <div class="discharge-grid">
            ${contentRows}
          </div>
        </div>
      </div>
    </div>
    <style>
      .ffd-popup-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        width: 280px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        overflow: hidden;
        border: 2px solid ${accentColor};
        position: relative;
      }
      .popup-header {
        background: #f8f9fa;
        padding: 8px 12px;
        border-bottom: 2px solid #f3e5f5;
      }
      .station-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .station-name {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        line-height: 1.2;
        flex: 1;
      }
      .status-badge {
        color: white;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        white-space: nowrap;
      }
      .popup-content {
        padding: 8px 12px 12px;
      }
      .discharge-section {
        margin-bottom: 8px;
      }
      .discharge-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .discharge-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #f3e5f5;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .discharge-label {
        font-size: 13px;
        font-weight: 500;
        color: #495057;
      }
      .discharge-value {
        font-size: 14px;
        font-weight: 700;
        color: #212529;
      }
      .mapboxgl-popup-close-button { display: none !important; }
      .mapboxgl-popup-content { padding: 0 !important; border-radius: 8px !important; }
      .mapboxgl-popup-tip { border-top-color: #ffffff !important; }
    </style>
  `;

  return popupHTML;
}

function handleTslBoundary(checkbox) {
  if (checkbox.checked) {
    updateBlinkLayersButtonVisibility();
    // Optionally add the layer back if it doesn't exist
    if (!map1.getLayer("TehsilBoundaryHighlight")) {
      // Only add if the underlying source exists (it is style-dependent and re-added after style switches).
      if (!map1.getSource('tehsilBoundary')) return;

      const layerDef = {
        id: "TehsilBoundaryHighlight", // Layer to show highlight
        type: "fill",
        source: "tehsilBoundary",
        "source-layer": "tehsil_boundary",
        paint: {
          "fill-color": "orange", // Highlight color
          "fill-opacity": 0.3, // Semi-transparent
        },
        filter: ["in", "name", ""], // Initially no features are selected
      };

      map1.addLayer(layerDef);
    }
  } else {
    updateBlinkLayersButtonVisibility();
    // Remove the highlight layer if it exists
    if (map1.getLayer("TehsilBoundaryHighlight")) {
      map1.removeLayer("TehsilBoundaryHighlight");
    }
  }
}

//This is for blink button districts
function handleDisBoundary(checkbox) {
  if (checkbox.checked) {
    updateBlinkLayersButtonVisibility();
    // Optionally add the layer back if it doesn't exist
    if (!map1.getLayer("DistrictBoundaryHighlight")) {
      // Only add if the underlying source exists (it is style-dependent and re-added after style switches).
      if (!map1.getSource('districtBoundary')) return;

      const layerDef = {
        id: "DistrictBoundaryHighlight", // Layer to show highlight
        type: "fill",
        source: "districtBoundary",
        "source-layer": "district_boundary",
        paint: {
          "fill-color": "orange", // Highlight color
          "fill-opacity": 0.3, // Semi-transparent
        },
        filter: ["in", "name", ""], // Initially no features are selected
      };

      map1.addLayer(layerDef);
    }
  } else {
    updateBlinkLayersButtonVisibility();
    // Remove the highlight layer if it exists
    if (map1.getLayer("DistrictBoundaryHighlight")) {
      map1.removeLayer("DistrictBoundaryHighlight");
    }
  }
}


// In case you want to also trigger on page load (keep button hidden if box unchecked)
document.addEventListener('DOMContentLoaded', function () {
  const checkbox = document.getElementById('tslBoundary');
  handleTslBoundary(checkbox);
});


// In case you want to also trigger on page load (keep button hidden if box unchecked)
document.addEventListener('DOMContentLoaded', function () {
  const checkbox = document.getElementById('dstBoundary');
  handleDisBoundary(checkbox);
});

// Ensure the sidebar checkbox rows visually highlight when toggled.
document.addEventListener('DOMContentLoaded', initLayerToggleRowHighlighting);

// Sidebar layer search (filters checkbox rows by text).
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('app-sidebar');
  const searchInput = sidebar?.querySelector('.sidebar-search-input');
  if (!sidebar || !searchInput) return;

  const labels = Array.from(sidebar.querySelectorAll('label')).filter(label =>
    label.querySelector('input[type="checkbox"]')
  );
  const panels = Array.from(sidebar.querySelectorAll('.section-panel'));

  const capturePanelPadding = (panel) => {
    if (!panel.dataset.padTop || !panel.dataset.padBottom) {
      const styles = window.getComputedStyle(panel);
      panel.dataset.padTop = styles.paddingTop || '0px';
      panel.dataset.padBottom = styles.paddingBottom || '0px';
    }
  };

  const setPanelPadding = (panel, top, bottom) => {
    panel.style.paddingTop = top;
    panel.style.paddingBottom = bottom;
  };

  const openPanel = (panel) => {
    capturePanelPadding(panel);
    panel.classList.remove('hidden');
    panel.classList.add('is-open');
    setPanelPadding(panel, panel.dataset.padTop, panel.dataset.padBottom);
    panel.style.height = `${panel.scrollHeight}px`;
    panel.style.opacity = '1';
  };

  const closePanel = (panel) => {
    capturePanelPadding(panel);
    panel.classList.remove('is-open');
    panel.style.height = '0px';
    panel.style.opacity = '0';
    setPanelPadding(panel, '0px', '0px');
    panel.classList.add('hidden');
  };

  let searchActive = false;

  const normalize = (value) => String(value || '').toLowerCase().trim();

  const storePanelState = () => {
    panels.forEach(panel => {
      panel.dataset.searchHidden = panel.classList.contains('hidden') ? '1' : '0';
    });
  };

  const restorePanelState = () => {
    panels.forEach(panel => {
      if (!panel.dataset.searchHidden) return;
      if (panel.dataset.searchHidden === '1') {
        closePanel(panel);
      } else {
        openPanel(panel);
      }
      delete panel.dataset.searchHidden;
    });
  };

  const clearLabelState = () => {
    labels.forEach(label => {
      label.classList.remove('search-hidden', 'search-match');
    });
  };

  searchInput.addEventListener('input', () => {
    const query = normalize(searchInput.value);

    if (!query) {
      searchActive = false;
      clearLabelState();
      restorePanelState();
      return;
    }

    if (!searchActive) {
      searchActive = true;
      storePanelState();
    }

    labels.forEach(label => {
      const text = normalize(label.textContent);
      const isMatch = text.includes(query);
      label.classList.toggle('search-hidden', !isMatch);
      label.classList.toggle('search-match', isMatch);
    });

    panels.forEach(panel => {
      const hasMatch = panel.querySelector('label.search-match');
      if (hasMatch) {
        openPanel(panel);
      } else {
        closePanel(panel);
      }
    });

    labels.filter(label => label.classList.contains('search-match')).forEach(label => {
      let panel = label.closest('.section-panel');
      while (panel) {
        openPanel(panel);
        panel = panel.parentElement?.closest('.section-panel');
      }
    });
  });
});

// Sidebar overlay toggle behavior.
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('app-sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const closeBtn = document.getElementById('sidebar-close');
  if (!sidebar || !toggleBtn) return;

  const syncSidebarHeight = () => {
    const bottomGap = 16;
    const minHeight = 260;
    const sidebarTop = sidebar.getBoundingClientRect().top;
    const availableHeight = window.innerHeight - sidebarTop - bottomGap;
    sidebar.style.maxHeight = `${Math.max(minHeight, availableHeight)}px`;
  };

  const setClosed = (closed) => {
    sidebar.classList.toggle('is-closed', closed);
    toggleBtn.setAttribute('aria-expanded', String(!closed));
    if (closeBtn) {
      closeBtn.setAttribute('aria-expanded', String(!closed));
      closeBtn.style.display = closed ? 'none' : 'inline-flex';
    }
    toggleBtn.classList.toggle('is-hidden', !closed);
    syncSidebarHeight();
  };

  syncSidebarHeight();
  setClosed(false);
  window.addEventListener('resize', syncSidebarHeight);
  window.addEventListener('load', syncSidebarHeight);

  toggleBtn.addEventListener('click', () => {
    const nextState = !sidebar.classList.contains('is-closed');
    setClosed(nextState);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => setClosed(true));
  }
});

// Spin the logo like a coin once after 30 seconds.
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo');
  if (!logo) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  setTimeout(() => {
    logo.classList.add('logo-spin-once');

    const cleanup = () => {
      logo.classList.remove('logo-spin-once');
      logo.removeEventListener('animationend', cleanup);
    };

    logo.addEventListener('animationend', cleanup);
  }, 20000);
});


//Getting dates for the slider layers in met

function getNextNDaysWithTime(offset = 0, hours2 = null, minutes2 = null, seconds2 = null) {
  const currentDate = new Date();
  const futureDate = new Date(
    currentDate.getTime() + offset * 24 * 60 * 60 * 1000
  );
  const year = futureDate.getUTCFullYear();
  const month = String(futureDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(futureDate.getUTCDate()).padStart(2, "0");

  // Use provided hours2 and minutes2 if they are not null, otherwise use the current time
  const hours =
    hours2 !== null
      ? hours2
      : String(futureDate.getUTCHours()).padStart(2, "0");
  const minutes =
    minutes2 !== null
      ? minutes2
      : String(futureDate.getUTCMinutes()).padStart(2, "0");
  const seconds =
    seconds2 !== null
      ? seconds2
      : String(futureDate.getUTCSeconds()).padStart(2, "0");

  const utcFormattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;

  return utcFormattedDateTime;
}

//Function to get N days for slider layers 
function getNextNDays(offset = 0, type = "") {
  const currentDate = new Date();
  const futureDate = new Date(
    currentDate.getTime() + offset * 24 * 60 * 60 * 1000
  );
  const year = futureDate.getFullYear();
  const month = String(futureDate.getMonth() + 1).padStart(2, "0");
  const day = String(futureDate.getDate()).padStart(2, "0");

  if (type === "short") {
    const shortMonthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const shortMonth = shortMonthNames[futureDate.getMonth()];
    return `${day} ${shortMonth}`;
  }
  return `${year}-${month}-${day}`;
}
// function for hours
function getNextNHours(offset = 0, type = "short") {
            const currentDate = new Date();
            const futureDate = new Date(currentDate.getTime() + (offset * 60 * 60 * 1000));
            
            if (type === "short") {
                const hours = String(futureDate.getHours()).padStart(2, '0');
                return `${hours}:00`;
            }
            return futureDate.toISOString();
        }
function getNextDaysMidnight(offset = 0) {
  const currentDate = new Date();
  const futureDate = new Date(
    currentDate.getTime() + offset * 24 * 60 * 60 * 1000
  );
  const year = futureDate.getUTCFullYear();
  const month = String(futureDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(futureDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}T00:00:00Z`;
}
// Function to add boundary layers to a map
function addBoundaryLayers(map) {
  // Only attempt to add sources/layers once the style is available.
  if (!map || typeof map.getLayer !== 'function' || typeof map.getSource !== 'function') return;

  const safeAddSource = (id, sourceDef) => {
    if (!map.getSource(id)) {
      map.addSource(id, sourceDef);
    }
  };

  const safeAddLayer = (layerDef, beforeId) => {
    if (map.getLayer(layerDef.id)) return;
    if (beforeId && map.getLayer(beforeId)) {
      map.addLayer(layerDef, beforeId);
      return;
    }
    map.addLayer(layerDef);
  };
  // National Boundary
  safeAddSource("nationalBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:national_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  safeAddLayer({
    id: "nationalBoundary",
    type: "line",
    source: "nationalBoundary",
    "source-layer": "national_boundary",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.8,
      "line-color": "black",
      "line-width": 2,
    },
  });

  // Provincial Boundary
  safeAddSource("provincialBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:provincial_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  safeAddLayer({
    id: "provincialBoundary",
    type: "line",
    source: "provincialBoundary",
    "source-layer": "provincial_boundary",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.8,
      "line-color": "green",
      "line-width": 2,
    },
  });

  // District Boundary
  safeAddSource("districtBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:district_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  safeAddLayer({
    id: "DistrictBoundary",
    type: "fill",
    source: "districtBoundary",
    "source-layer": "district_boundary",
    layout: {
      visibility: "visible", // Ensure it's visible
    },
    paint: {
      "fill-opacity": 0.2,
      "fill-color": "transparent",
    },
  });
  safeAddLayer({
    id: "districtBoundary",
    type: "line",
    source: "districtBoundary",
    "source-layer": "district_boundary",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.8,
      "line-color": "purple",
      "line-width": 1.5,
    },
  });
  safeAddLayer({
    id: "districtBoundary_label",
    type: "symbol",
    source: "districtBoundary",
    "source-layer": "district_boundary",
    minzoom: 6,
    layout: {
      visibility: "none",
      "text-field": "{name}",
      "text-letter-spacing": 0.1,
      "text-size": 13,
      "text-offset": [0, 0],
      "text-anchor": "center",
    },
    paint: {
      "text-color": "black",
      "text-halo-color": "#000000",

    },
  });

  safeAddLayer({
    id: "DistrictBoundaryHighlight", // Layer to show highlight
    type: "fill",
    source: "districtBoundary",
    "source-layer": "district_boundary",
    paint: {
      "fill-color": "orange", // Highlight color
      "fill-opacity": 0.3, // Semi-transparent
    },
    filter: ["in", "name", ""], // Initially no features are selected
  });

  // Arrays are now global - no need to redeclare here

  // Add the source
  safeAddSource("tehsilBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:tehsil_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add the boundary line layer
  safeAddLayer({
    id: "TehsilBoundaryLine",
    type: "line",
    source: "tehsilBoundary",
    "source-layer": "tehsil_boundary",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.8,
      "line-color": "black",
      "line-width": 1,
    },
  });

  // Add the fill layer
  safeAddLayer({
    id: "TehsilBoundary",
    type: "fill",
    source: "tehsilBoundary",
    "source-layer": "tehsil_boundary",
    layout: {
      visibility: "visible", // Ensure it's visible
    },
    paint: {
      "fill-opacity": 0.2,
      "fill-color": "transparent",
    },
  });



  // Add a highlighted layer for interaction
  safeAddLayer({
    id: "TehsilBoundaryHighlight", // Layer to show highlight
    type: "fill",
    source: "tehsilBoundary",
    "source-layer": "tehsil_boundary",
    paint: {
      "fill-color": "orange", // Highlight color
      "fill-opacity": 0.3, // Semi-transparent
    },
    filter: ["in", "name", ""], // Initially no features are selected
  });


  safeAddLayer({
    id: "tehsilBoundary_label",
    type: "symbol",
    source: "tehsilBoundary",
    "source-layer": "tehsil_boundary",
    minzoom: 6,
    layout: {
      visibility: "none",
      "text-field": "{name}",
      "text-letter-spacing": 0.1,
      "text-size": 13,
      "text-offset": [0, 0],
      "text-anchor": "center",
    },
    paint: {
      "text-color": "black",

    },
  });
 
 
  // Attach interaction handlers once (this function is called again after style changes).
  if (!map.__boundaryInteractionsAttached) {
    map.__boundaryInteractionsAttached = true;

    // Add click event listener for Districts
    map.on("click", "DistrictBoundary", (e) => {
      const visibility = map.getLayoutProperty("districtBoundary_label", "visibility");
      if (visibility !== "visible") return;

      if (blinkInterval) {
        console.log("Blinking is active - district selection is locked");
        return;
      }

      if (e.features && e.features.length > 0) {
        const clickedFeature = e.features[0];
        const districtName = clickedFeature.properties.name;

        if (!selectedDistrict.includes(districtName)) {
          selectedDistrict.push(districtName);
        } else {
          selectedDistrict = selectedDistrict.filter(name => name !== districtName);
        }

        map.setFilter("DistrictBoundaryHighlight", ["in", "name", ...selectedDistrict]);
      }
    });

    map.on("mouseenter", "DistrictBoundary", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "DistrictBoundary", () => {
      map.getCanvas().style.cursor = "";
    });

    // Add click event listener for Tehsils
    map.on("click", "TehsilBoundary", (e) => {
      const visibility = map.getLayoutProperty("tehsilBoundary_label", "visibility");
      if (visibility !== "visible") return;

      if (blinkInterval) {
        console.log("Blinking is active - tehsil selection is locked");
        return;
      }

      if (e.features && e.features.length > 0) {
        const clickedFeature = e.features[0];
        const tehsilName = clickedFeature.properties.name;

        if (!selectedTehsils.includes(tehsilName)) {
          selectedTehsils.push(tehsilName);
        } else {
          selectedTehsils = selectedTehsils.filter(name => name !== tehsilName);
        }

        map.setFilter("TehsilBoundaryHighlight", ["in", "name", ...selectedTehsils]);
      }
    });

    map.on("mouseenter", "TehsilBoundary", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "TehsilBoundary", () => {
      map.getCanvas().style.cursor = "";
    });
  }


  safeAddSource("Union_Council", {
    type: "geojson",
    data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Union_Council&outputFormat=application/json&srsName=EPSG:3857`,
  });
  safeAddLayer({
    id: "Union_Council",
    type: "line",
    source: "Union_Council",
    layout: {
      visibility: "visible",
    },
    paint: {
      "line-opacity": 1,
      "line-color": "brown",
      "line-width": 1,
    },
  });
  safeAddLayer({
    id: "unionBoundary_label",
    type: "symbol",
    source: "Union_Council",
    minzoom: 8,
    layout: {
      visibility: "none",
      "text-field": "{uc}",
      "text-letter-spacing": 0.1,
      "text-size": 13,
      "text-offset": [0, 0],
      "text-anchor": "center",
    },
    paint: {
      "text-color": "black",
      "text-halo-color": "#000000",

    },
  });

  // Invisible always-on layers keep boundary sources warm, so checkbox toggles
  // only change visibility instead of waiting for first-time tile/data loading.
  safeAddLayer({
    id: "__boundaryWarmup_national",
    type: "line",
    source: "nationalBoundary",
    "source-layer": "national_boundary",
    layout: { visibility: "visible" },
    paint: {
      "line-opacity": 0,
      "line-color": "#000000",
      "line-width": 1,
    },
  });
  safeAddLayer({
    id: "__boundaryWarmup_provincial",
    type: "line",
    source: "provincialBoundary",
    "source-layer": "provincial_boundary",
    layout: { visibility: "visible" },
    paint: {
      "line-opacity": 0,
      "line-color": "#000000",
      "line-width": 1,
    },
  });
  safeAddLayer({
    id: "__boundaryWarmup_district",
    type: "fill",
    source: "districtBoundary",
    "source-layer": "district_boundary",
    layout: { visibility: "visible" },
    paint: {
      "fill-opacity": 0,
      "fill-color": "#000000",
    },
  });
  safeAddLayer({
    id: "__boundaryWarmup_tehsil",
    type: "fill",
    source: "tehsilBoundary",
    "source-layer": "tehsil_boundary",
    layout: { visibility: "visible" },
    paint: {
      "fill-opacity": 0,
      "fill-color": "#000000",
    },
  });
  safeAddLayer({
    id: "__boundaryWarmup_unionCouncil",
    type: "line",
    source: "Union_Council",
    layout: { visibility: "visible" },
    paint: {
      "line-opacity": 0,
      "line-color": "#000000",
      "line-width": 1,
    },
  });
}
document.addEventListener('DOMContentLoaded', function () {
  const boundaryToggles = [
    {
      checkboxId: 'natBoundary',
      layers: ['nationalBoundary']
    },
    {
      checkboxId: 'prvBoundary',
      layers: ['provincialBoundary']
    },
    {
      checkboxId: 'dstBoundary',
      layers: ['districtBoundary', 'districtBoundary_label', 'DistrictBoundary']
    },
    {
      checkboxId: 'tslBoundary',
      layers: ['TehsilBoundary', 'TehsilBoundaryLine', 'tehsilBoundary_label']
    },
    {
      checkboxId: 'uncBoundary',
      layers: ['Union_Council', 'unionBoundary_label']
    }
  ];

  // Helper to get current layer visibility state from checkboxes
  function getVisibilityStates() {
    const state = {};
    boundaryToggles.forEach(toggle => {
      const checkbox = document.getElementById(toggle.checkboxId);
      if (checkbox) {
        toggle.layers.forEach(layerId => {
          state[layerId] = checkbox.checked ? 'visible' : 'none';
        });
      }
    });
    return state;
  }

  // Helper to apply stored visibility state
  function applyVisibilityStates(map, visibilityState) {
    for (const [layerId, visibility] of Object.entries(visibilityState)) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }
  }

  function moveLayersToTop(map, layerIds) {
    if (!map || typeof map.moveLayer !== 'function') return;
    layerIds.forEach(layerId => {
      try {
        if (map.getLayer(layerId)) {
          map.moveLayer(layerId);
        }
      } catch (e) {
        // Ignore move errors (e.g., during transient style rebuilds)
      }
    });
  }

  function bringBoundaryLayersToTop() {
    // Order matters: later layers end up above earlier ones.
    moveLayersToTop(map1, [
      // fills below
      'DistrictBoundary',
      'TehsilBoundary',
      // lines
      'nationalBoundary',
      'provincialBoundary',
      'districtBoundary',
      'TehsilBoundaryLine',
      'Union_Council',
      // labels above lines
      'districtBoundary_label',
      'tehsilBoundary_label',
      'unionBoundary_label',
      // highlights top-most
      'DistrictBoundaryHighlight',
      'TehsilBoundaryHighlight'
    ]);
  }

  let boundaryListenersAttached = false;

  function whenMapStyleReady(map, cb) {
    whenHydroMapStyleReady(map, cb);
  }

  function ensureBoundaryLayersAndSync() {
    // Add sources/layers (safe) then apply visibility based on current checkbox state.
    addBoundaryLayers(map1);
    const visibilityState = getVisibilityStates();
    applyVisibilityStates(map1, visibilityState);
    bringBoundaryLayersToTop();

    // Keep blink button state consistent if those boxes are checked.
    const tsl = document.getElementById('tslBoundary');
    if (tsl) handleTslBoundary(tsl);
    const dst = document.getElementById('dstBoundary');
    if (dst) handleDisBoundary(dst);
  }

  function attachBoundaryCheckboxListeners() {
    if (boundaryListenersAttached) return;
    boundaryListenersAttached = true;

    boundaryToggles.forEach(toggle => {
      const checkbox = document.getElementById(toggle.checkboxId);
      if (!checkbox) return;

      checkbox.addEventListener('change', function () {
        // If the user toggles before boundaries exist, ensure they get registered first.
        whenMapStyleReady(map1, () => {
          ensureBoundaryLayersAndSync();
          const isVisible = this.checked;
          toggle.layers.forEach(layerId => setLayerVisibility(map1, layerId, isVisible));
          bringBoundaryLayersToTop();
        });
      });
    });
  }

  // Attach checkbox listeners immediately.
  attachBoundaryCheckboxListeners();

  // Ensure boundaries are present if map style is already ready.
  whenHydroMapStyleReady(map1, ensureBoundaryLayersAndSync);

  window.ensureBoundaryLayersAndSync = ensureBoundaryLayersAndSync;

  // map2.on('load', function () {
  //   addBoundaryLayers(map2);
  //   const visibilityState = getVisibilityStates();
  //   applyVisibilityStates(map2, visibilityState);
  // });

});
// Function to set layer visibility
function setLayerVisibility(map, layerId, isVisible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
  }
}

// Legacy handler used by many inline `onchange` attributes in index.html.
// (Some layers are also managed by dedicated listeners elsewhere.)
function toggleHighlight(checkbox) {
  // Always update the UI highlight for the row, even if this toggle isn't handled here.
  updateLayerToggleRowHighlight(checkbox);

  if (!checkbox || !checkbox.id) return;
  if (typeof map1 === 'undefined' || !map1) return;

  const boundaryMap = {
    natBoundary: ['nationalBoundary'],
    prvBoundary: ['provincialBoundary'],
    dstBoundary: ['districtBoundary', 'districtBoundary_label', 'DistrictBoundary'],
    tslBoundary: ['TehsilBoundary', 'TehsilBoundaryLine', 'tehsilBoundary_label'],
    uncBoundary: ['Union_Council', 'unionBoundary_label']
  };

  const targetLayers = boundaryMap[checkbox.id];

  if (targetLayers && typeof map1 !== 'undefined' && map1) {
    const apply = () => {
      // Ensure boundary sources/layers exist for the current style.
      addBoundaryLayers(map1);

      // Apply visibility for the requested toggle.
      targetLayers.forEach(layerId => setLayerVisibility(map1, layerId, checkbox.checked));

      // Keep boundaries on top so they don't get hidden under other layers.
      try {
        ['DistrictBoundary', 'TehsilBoundary', 'nationalBoundary', 'provincialBoundary', 'districtBoundary', 'TehsilBoundaryLine', 'Union_Council',
          'districtBoundary_label', 'tehsilBoundary_label', 'unionBoundary_label', 'DistrictBoundaryHighlight', 'TehsilBoundaryHighlight'
        ].forEach(id => {
          if (map1.getLayer(id)) map1.moveLayer(id);
        });
      } catch (e) {
        // ignore
      }

      // Keep blink button consistent.
      if (typeof updateBlinkLayersButtonVisibility === 'function') {
        updateBlinkLayersButtonVisibility();
      }
    };

    whenHydroMapStyleReady(map1, apply);
  }

  if (checkbox.id === 'monsoonvideo') {
    const map = document.getElementById('map2');
    const video = document.getElementById('monsoonVideo');
    if (map && video) {
      if (checkbox.checked) {
        map.style.display = "none";
        video.style.display = "block";
        video.play();
      } else {
        map.style.display = "block";
        video.style.display = "none";
        video.pause();
      }
    }
  }

  if (checkbox.id === 'ahp_kp') {
    const legendImg = document.getElementById('legend-image');
    if (legendImg) {
      legendImg.style.display = checkbox.checked ? 'block' : 'none';
      legendImg.style.position = 'fixed';
      legendImg.style.zIndex = 9999;
    }
  }

  if (checkbox.id === 'slider') {
    const timelineContainer = document.querySelector('.timeline-slider-container');
    if (timelineContainer) {
      timelineContainer.style.display = checkbox.checked ? 'block' : 'none';
      if (!checkbox.checked && typeof closeSlider === 'function') {
        closeSlider();
      }
    }
  }

  if (checkbox.id === 'ffd') {
    const legend = document.getElementById('ffdLegend');
    if (legend) {
      legend.remove();
    }
  }

  if (typeof toggleFloodLegend === 'function') {
    toggleFloodLegend();
  }
}

// Overall projection toggle for Hydro Outlook 2025/2026.
const overallProjectionTargets = {
  '2026': [
    'natBoundary',
    'prvBoundary',
    'kp_Rivers',
    'PakRivers',
    'Reservoirs',
    'india',
    'ffd',
    'swatHighExtent',
    'kabilHighFlood',
    'upperIndusHighFlood',
    'lowerIndusHighFlood',
    'jhelumMediumFlood',
    'chenabHighFlood',
    'raviMediumFlood',
    'sutlejMediumFlood',
    'di_ht',
    'bajaur150',
    'buner150',
    'mardanMedium',
    'dg_ht',
    'jamshoro',
    'Kirthar_extent',
    'jhall',
    'kechPanjgurMedium',
    'kechPanjgurHigh',
    'manawarTawiLow',
    'manawarTawiMedium',
    'muzExtent',
    'p_panjal',
    'hyder'
  ],
  '2025': [
    'natBoundary',
    'prvBoundary',
    'kp_Rivers',
    'PakRivers',
    'Reservoirs',
    'india',
    'ffd',
    'swatHighExtent_2025',
    'kabilMediumFlood_2025',
    'upperIndusHighFlood_2025',
    'lowerIndusHighFlood_2025',
    'chenabHighFlood_2025',
    'raviHighFlood_2025',
    'sutlejHighFlood_2025',
    'buner150_2025',
    'bajaur150_2025',
    'dg_ht_2025',
    'chakwal_2025',
    'Kirthar_extent_2025',
    'jhall_2025',
    'p_panjal_2025',
    'hyder_2025',
    'inundationCom5to21'
  ]
};

const overallProjectionVectorLayerIds = [
  'nationalBoundary',
  '3_Swat_River_50yr_Flood_Extent',
  'khfex',
  'Bajaur_150mm',
  'Buner_150mm',
  'Mardan_inundation_filter',
  'kech_panjgur_50mm_filter',
  'kech_panjgur_100mm_filter',
  'munawar_tawi_60mm_filter',
  'munawar_150mm_filter',
  'DG khan HT',
  'Pir_Panjal_HT',
  'KIRTHAR_RANGE',
  'jhal_magsi_arc_Complete',
  'DI_Khan_HT',
  'uihfex',
  'lihfex',
  'jmfex',
  'chfex',
  'rhfex',
  'shfex'
];

const overallProjectionTopRasterLayerIds = [
  'Flood_Extent_Comulated_5to21f'
];

function bringOverallProjectionVectorsToTop() {
  if (typeof map1 === 'undefined' || !map1) return;
  overallProjectionVectorLayerIds.forEach((layerId) => {
    if (map1.getLayer(layerId)) {
      try {
        map1.moveLayer(layerId);
      } catch (e) {
        // Ignore move errors during transient style rebuilds.
      }
    }
  });

  overallProjectionTopRasterLayerIds.forEach((layerId) => {
    if (map1.getLayer(layerId)) {
      try {
        map1.moveLayer(layerId);
      } catch (e) {
        // Ignore move errors during transient style rebuilds.
      }
    }
  });
}

function setCheckboxStateAndDispatch(id, checked) {
  const checkbox = document.getElementById(id);
  if (!checkbox) return;
  if (checkbox.checked === checked) return;
  checkbox.checked = checked;
  updateLayerToggleRowHighlight(checkbox);
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

function toggleOverallProjection(checkbox, scope = '2026') {
  if (!checkbox) return;
  updateLayerToggleRowHighlight(checkbox);
  const targets = overallProjectionTargets[scope] || [];
  targets.forEach((id) => setCheckboxStateAndDispatch(id, checkbox.checked));

  if ((scope === '2025' || scope === '2026') && typeof map1 !== 'undefined' && map1) {
    addBoundaryLayers(map1);
    setLayerVisibility(map1, 'nationalBoundary', checkbox.checked);
    setLayerVisibility(map1, 'provincialBoundary', checkbox.checked);
  }

  // Ensure vector extents stay above raster layers for this grouped toggle.
  setTimeout(bringOverallProjectionVectorsToTop, 0);
}

// ============================================
// OPTIMIZED WEATHER LAYER CONTROLLER WITH OPACITY CONTROLS
// ============================================

class WeatherLayerController {
  constructor() {
    this.controllers = new Map();
    this.apiCache = new Map();
    this.apiThrottle = new Map();
    this.THROTTLE_DELAY = 50; // Reduced for better responsiveness
    this.hourlyLayersAdded = false;
    this.weeklyLayersAdded = false;
    this.defaultOpacity = 0.7; // Default opacity value (70%)
    this.initializeControllers();
  }

  // Use existing global functions for time formatting
  getNextNHoursWithTime(offset = 0) {
    const currentDate = new Date();
    const futureDate = new Date(currentDate.getTime() + (offset * 60 * 60 * 1000));
    return futureDate.toISOString().replace(/\.[0-9]+Z$/, 'Z');
  }

  getNextNDaysWithTime(offset = 0) {
    return getNextDaysMidnight(offset); // UPDATED: Use new daily midnight function
  }

  // Optimized method to check if map and layer exist
  layerExists(layerId) {
    try {
      return typeof map1 !== 'undefined' &&
             map1.getLayer &&
             map1.getLayer(layerId) !== undefined;
    } catch (error) {
      return false;
    }
  }

  // Optimized method to check if source exists
  sourceExists(sourceId) {
    try {
      return typeof map1 !== 'undefined' &&
             map1.getSource &&
             map1.getSource(sourceId) !== undefined;
    } catch (error) {
      return false;
    }
  }

  // Add Meteoblue hourly precipitation layers to the map (vector)
  addMeteoblueHourlyLayers() {
    if (this.hourlyLayersAdded) return;
   
    const metbluT = '1c9f9d57164f';
    const model = "NEMSIN";
   
    for (let hourOffset = 0; hourOffset < 11; hourOffset++) {
      const time = this.getNextNHoursWithTime(hourOffset);
      const sourceId = `meteoblue_nems_cloudprecipitation_hourly_forecast_${hourOffset}`;
      const baseUrl = `https://maps-api.meteoblue.com/v1/map/vector/${model}/${time}/cloudsLow~73~low cld lay~hourly~none~contourSteps~20.0~40.0~60.0~80.0~95.0_cloudsMid~74~mid cld lay~hourly~none~contourSteps~20.0~40.0~60.0~80.0~95.0_precip~61~sfc~hourly~none~contourSteps~0.1~0.25~0.5~1.0~1.5~2.0~3.0~5.0~7.0~10.0~15.0~20.0~30.0_snow~679~sfc~hourly~none~contourSteps~0.2/{z}/{x}/{y}?apikey=${metbluT}`;
     
      // Add source if it doesn't exist
      if (!this.sourceExists(sourceId)) {
        try {
          map1.addSource(sourceId, {
            type: "vector",
            tiles: [baseUrl]
          });
        } catch (error) {
          console.warn(`Failed to add source ${sourceId}:`, error);
          continue;
        }
      }

      // Add precipitation layer
      const precipLayerId = `meteoblue_nems_precipitation_hourly_forecast_${hourOffset}`;
      if (!this.layerExists(precipLayerId)) {
        try {
          map1.addLayer({
            id: precipLayerId,
            type: "fill",
            source: sourceId,
            "source-layer": "precip",
            paint: {
              "fill-antialias": false,
              "fill-opacity": 0,
              "fill-opacity-transition": { duration: 300 },
              "fill-color": [
                "interpolate", ["linear"], ["get", "minValue"],
                0.1, "rgba(133,247,244,0.5)",
                0.25, "rgba(133,247,244,1.0)",
                0.5, "rgba(105,148,252,1.0)",
                1, "rgba(90,123,248,1.0)",
                1.5, "rgba(1,124,254,1.0)",
                2, "rgba(2,104,213,1.0)",
                3, "rgba(3,151,135,1.0)",
                5, "rgba(2,198,33,1.0)",
                7, "rgba(174,255,3,1.0)",
                10, "rgba(218,255,53,1.0)",
                15, "rgba(255,173,2,1.0)",
                20, "rgba(255,97,1,1.0)",
                25, "rgba(252,60,3,1.0)",
                30, "rgba(251,20,3,1.0)"
              ]
            },
            layout: { visibility: "none" }
          }, 'nationalBoundary');
        } catch (error) {
          console.warn(`Failed to add layer ${precipLayerId}:`, error);
        }
      }
    }
    this.hourlyLayersAdded = true;
    console.log('Hourly precipitation layers added successfully');
  }

  // Add Meteoblue weekly precipitation layers to the map (vector, multi-layer) - UPDATED FOR DAILY ACCUMULATION
  addMeteoblueWeeklyLayers() {
    if (this.weeklyLayersAdded) return;
   
    const metbluT = '1c9f9d57164f';
    const model = "NEMSIN";
    const totalWPAIndex = 8;
   
    for (let index = 0; index < totalWPAIndex; index++) {
      const time = this.getNextNDaysWithTime(index);
      const sourceId = `meteoblue_nems_cloudprecipitation_forecast_${index}`;
      // UPDATED: Daily accumulation URL with new contour steps and proper encoding
      const baseUrl = `https://maps-api.meteoblue.com/v1/map/vector/${model}/${time}/cloudsLow~73~low%20cld%20lay~daily~mean~contourSteps~20.0~40.0~60.0~80.0~95.0_cloudsMid~74~mid%20cld%20lay~daily~mean~contourSteps~20.0~40.0~60.0~80.0~95.0_precip~61~sfc~daily~sum~contourSteps~1~2~3~4~5~6~8~10~12~16~18~20~25~30~35~40~50~60~70~80~90~100~125~150_snow~679~sfc~daily~sum~contourSteps~1~5~10~20~30/{z}/{x}/{y}?apikey=${metbluT}`;
     
      // Add source if it doesn't exist
      if (!this.sourceExists(sourceId)) {
        try {
          map1.addSource(sourceId, {
            type: "vector",
            tiles: [baseUrl],
          });
        } catch (error) {
          console.warn(`Failed to add source ${sourceId}:`, error);
          continue;
        }
      }

      // Add all layer types for this day
      this.addWeeklyLayerSet(sourceId, index);
    }
    this.weeklyLayersAdded = true;
    console.log('Weekly precipitation layers added successfully');
  }

  // Helper method to add all layer types for a weekly forecast day - UPDATED FOR DAILY ACCUMULATION
  addWeeklyLayerSet(sourceId, index) {
    const layers = [
      {
        id: `meteoblue_nems_cloudlow_forecast_${index}`,
        sourceLayer: "cloudsLow",
        paint: {
          "fill-antialias": false,
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 300 },
          "fill-color": [
            "interpolate", ["linear"], ["get", "minValue"],
            0, "rgba(255,255,255,0.0)",
            20, "rgba(255,255,255,0.2)",
            40, "rgba(255,255,255,0.3)",
            60, "rgba(255,255,255,0.5)",
            80, "rgba(255,255,255,0.8)",
            95, "rgba(255,255,255,0.9)"
          ]
        }
      },
      {
        id: `meteoblue_nems_cloudmid_forecast_${index}`,
        sourceLayer: "cloudsMid",
        paint: {
          "fill-antialias": false,
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 300 },
          "fill-color": [
            "interpolate", ["linear"], ["get", "minValue"],
            0, "rgba(255,255,255,0.0)",
            20, "rgba(255,255,255,0.2)",
            40, "rgba(255,255,255,0.3)",
            60, "rgba(255,255,255,0.5)",
            80, "rgba(255,255,255,0.8)",
            95, "rgba(255,255,255,0.9)"
          ]
        }
      },
      {
        id: `meteoblue_nems_precipitation_forecast_${index}`,
        sourceLayer: "precip",
        paint: {
          "fill-antialias": false,
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 300 },
          // UPDATED: New precipitation color scale for daily accumulation
          "fill-color": [
            "interpolate", ["linear"], ["get", "minValue"],
            1, "rgba(240,249,255,1.0)",   /* very light cyan */
            2, "rgba(222,243,252,1.0)",
            3, "rgba(191,235,250,1.0)",
            4, "rgba(160,225,248,1.0)",
            5, "rgba(133,217,246,1.0)",   /* cyan */
            6, "rgba(110,200,242,1.0)",
            8, "rgba(82,176,237,1.0)",
            10, "rgba(64,149,230,1.0)",   /* blue */
            12, "rgba(49,136,227,1.0)",
            16, "rgba(33,121,223,1.0)",
            18, "rgba(29,156,109,1.0)",   /* teal */
            20, "rgba(26,178,64,1.0)",    /* green */
            25, "rgba(111,201,54,1.0)",
            30, "rgba(173,230,47,1.0)",   /* lime green */
            35, "rgba(209,242,46,1.0)",
            40, "rgba(247,250,46,1.0)",   /* yellow */
            50, "rgba(250,213,41,1.0)",
            60, "rgba(252,176,36,1.0)",   /* orange */
            70, "rgba(250,141,38,1.0)",
            80, "rgba(249,102,35,1.0)",   /* red-orange */
            90, "rgba(246,66,35,1.0)",
            100, "rgba(243,33,33,1.0)",   /* red */
            125, "rgba(216,0,117,1.0)",   /* magenta */
            150, "rgba(166,0,157,1.0)"    /* deep purple */
          ]
        }
      },
      {
        id: `meteoblue_nems_snow_forecast_${index}`,
        sourceLayer: "snow", // FIXED: Changed from "layerSnow" to "snow"
        paint: {
          "fill-pattern": "snowPattern",
          "fill-antialias": false
        }
      }
    ];

    layers.forEach(layerConfig => {
      if (!this.layerExists(layerConfig.id)) {
        try {
          map1.addLayer({
            id: layerConfig.id,
            type: "fill",
            source: sourceId,
            "source-layer": layerConfig.sourceLayer,
            paint: layerConfig.paint,
            layout: { visibility: "none" }
          }, 'nationalBoundary');
        } catch (error) {
          console.warn(`Failed to add layer ${layerConfig.id}:`, error);
        }
      }
    });
  }

  // Generic controller factory
  createController(config) {
    return {
      layerIds: config.layerIds || Array.from({ length: config.layerCount }, (_, i) =>
        `meteoblue_${config.layerType}_precipitation_${config.forecast}_${i}`),
      autoPlayTimer: null,
      activeIndex: 0,
      config: config,
     
      updateActiveLayer: (index) => this.updateLayer(config.id, index),
      startAutoPlay: () => this.startAutoPlay(config.id),
      pauseAutoPlay: () => this.pauseAutoPlay(config.id),
      resetAutoPlay: () => this.resetAutoPlay(config.id)
    };
  }

  initializeControllers() {
    // Hourly precipitation controller - explicit layer IDs
    this.controllers.set('hrs', this.createController({
      id: 'hrs',
      layerType: 'nems',
      forecast: 'hourly_forecast',
      layerCount: 11,
      layerIds: Array.from({ length: 11 }, (_, i) =>
        `meteoblue_nems_precipitation_hourly_forecast_${i}`),
      toggleId: 'hrs-precip-toggle',
      sliderId: 'hrs-precip-slider',
      controlsId: 'hrs-precip-controls',
      timestampsId: 'hrs-precip-timestamps',
      playbackId: 'hrs-precip-playback',
      opacitySliderId: 'hrs-opacity-slider', // Add opacity slider ID
      opacityValueId: 'hrs-opacity-value', // Add opacity value display ID
      timeFunction: (i) => getNextNHours(i, 'short'),
      intervalSpeed: 1000
    }));

    // Weekly precipitation controller - explicit layer IDs
    this.controllers.set('wky', this.createController({
      id: 'wky',
      layerType: 'nems',
      forecast: 'forecast',
      layerCount: 8,
      layerIds: Array.from({ length: 8 }, (_, i) =>
        `meteoblue_nems_precipitation_forecast_${i}`),
      toggleId: 'wky-precip-toggle',
      sliderId: 'wky-precip-slider',
      controlsId: 'wky-precip-controls',
      timestampsId: 'wky-precip-calendar',
      playbackId: 'wky-precip-playback',
      opacitySliderId: 'wky-opacity-slider', // Add opacity slider ID
      opacityValueId: 'wky-opacity-value', // Add opacity value display ID
      timeFunction: (i) => getNextNDays(i, 'short'),
      intervalSpeed: 1000
    }));
  }

  // Get current opacity for a controller
  getCurrentOpacity(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (!controller) return this.defaultOpacity;

    const opacitySlider = document.getElementById(controller.config.opacitySliderId);
    if (opacitySlider) {
      return parseFloat(opacitySlider.value) / 100;
    }
    return this.defaultOpacity;
  }

  // Update opacity for current active layer
  async updateCurrentLayerOpacity(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (!controller) return;

    const opacity = this.getCurrentOpacity(controllerId);
    const activeLayerId = controller.layerIds[controller.activeIndex];
   
    if (activeLayerId && this.layerExists(activeLayerId)) {
      try {
        const layer = map1.getLayer(activeLayerId);
        if (layer && layer.type === 'fill') {
          map1.setPaintProperty(activeLayerId, 'fill-opacity', opacity);
        } else if (layer && layer.type === 'raster') {
          map1.setPaintProperty(activeLayerId, 'raster-opacity', opacity);
        }
        console.log(`Updated opacity for ${activeLayerId} to ${opacity}`);
      } catch (error) {
        console.warn(`Failed to update opacity for ${activeLayerId}:`, error);
      }
    }
  }

  // Optimized throttled API call wrapper
  async throttledApiCall(key, apiFunction) {
    const now = Date.now();
    const lastCall = this.apiThrottle.get(key) || 0;
   
    if (now - lastCall < this.THROTTLE_DELAY) {
      return new Promise(resolve => {
        setTimeout(() => {
          this.apiThrottle.set(key, Date.now());
          resolve(apiFunction());
        }, this.THROTTLE_DELAY - (now - lastCall));
      });
    }
   
    this.apiThrottle.set(key, now);
    return apiFunction();
  }

  // Optimized layer visibility update with better error handling
  async updateLayerVisibility(layerId, visible, opacity = 1) {
    if (!this.layerExists(layerId)) {
      console.warn(`Layer ${layerId} not found on map`);
      return false;
    }

    const cacheKey = `${layerId}_${visible}_${opacity}`;
    if (this.apiCache.has(cacheKey)) {
      return this.apiCache.get(cacheKey);
    }

    const result = await this.throttledApiCall(`visibility_${layerId}`, () => {
      try {
        map1.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
       
        if (visible && opacity !== undefined) {
          // Check if layer has fill-opacity property before setting it
          try {
            const layer = map1.getLayer(layerId);
            if (layer && layer.type === 'fill') {
              map1.setPaintProperty(layerId, 'fill-opacity', opacity);
            } else if (layer && layer.type === 'raster') {
              map1.setPaintProperty(layerId, 'raster-opacity', opacity);
            }
          } catch (paintError) {
            // Layer might not support opacity, continue without error
            console.debug(`Layer ${layerId} doesn't support opacity property:`, paintError);
          }
        }
       
        console.log(`Layer ${layerId} - visibility: ${visible ? 'visible' : 'none'}, opacity: ${opacity}`);
        return true;
      } catch (error) {
        console.warn(`Failed to update layer ${layerId}:`, error);
        return false;
      }
    });

    this.apiCache.set(cacheKey, result);
    // Clear cache after 2 seconds to keep it fresh
    setTimeout(() => this.apiCache.delete(cacheKey), 2000);
    return result;
  }

  // Modified updateLayer method to include opacity
  async updateLayer(controllerId, index) {
    const controller = this.controllers.get(controllerId);
    if (!controller) {
      console.warn(`Controller ${controllerId} not found`);
      return;
    }

    controller.activeIndex = index;
    const config = controller.config;
    const currentOpacity = this.getCurrentOpacity(controllerId);
   
    // Update slider
    const sliderEl = document.getElementById(config.sliderId);
    if (sliderEl) sliderEl.value = index;

    console.log(`Updating ${controllerId} precipitation layer to index: ${index}`);
    console.log(`Available layer IDs:`, controller.layerIds);
    console.log(`Target layer ID:`, controller.layerIds[index]);

    // Efficiently update layers - hide all first, then show active with current opacity
    for (let i = 0; i < controller.layerIds.length; i++) {
      const layerId = controller.layerIds[i];
      if (i === index) {
        console.log(`Showing layer: ${layerId} with opacity: ${currentOpacity}`);
        await this.updateLayerVisibility(layerId, true, currentOpacity);
      } else {
        await this.updateLayerVisibility(layerId, false, 0);
      }
    }

    // Update timestamp highlights
    this.updateTimestampHighlights(config.timestampsId, index);
  }

  // Optimized timestamp highlights update
  updateTimestampHighlights(timestampsId, activeIndex) {
    const timestampsEl = document.getElementById(timestampsId);
    if (!timestampsEl) return;

    const children = timestampsEl.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle('active', i === activeIndex);
    }
  }

  // Optimized autoplay functions
  startAutoPlay(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (!controller) return;

    const playbackBtn = document.getElementById(controller.config.playbackId);
    if (playbackBtn) playbackBtn.textContent = '❚❚';
   
    controller.autoPlayTimer = setInterval(async () => {
      controller.activeIndex = (controller.activeIndex + 1) % controller.config.layerCount;
      await controller.updateActiveLayer(controller.activeIndex);
    }, controller.config.intervalSpeed);
  }

  pauseAutoPlay(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (!controller) return;

    const playbackBtn = document.getElementById(controller.config.playbackId);
    if (playbackBtn) playbackBtn.textContent = '▶';
   
    if (controller.autoPlayTimer) {
      clearInterval(controller.autoPlayTimer);
      controller.autoPlayTimer = null;
    }
  }

  resetAutoPlay(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (!controller || !controller.autoPlayTimer) return;

    this.pauseAutoPlay(controllerId);
    this.startAutoPlay(controllerId);
  }

  // Optimized toggle function
  async toggleRainfall(controllerId, checkbox) {
    const controller = this.controllers.get(controllerId);
    if (!controller) {
      console.warn(`Controller ${controllerId} not found`);
      return;
    }

    const visible = checkbox.checked;
    const controls = document.getElementById(controller.config.controlsId);
   
    if (visible) {
      // Add layers if not already added
      if (controllerId === 'hrs' && !this.hourlyLayersAdded) {
        await this.waitForMapStyle();
        this.addMeteoblueHourlyLayers();
      } else if (controllerId === 'wky' && !this.weeklyLayersAdded) {
        await this.waitForMapStyle();
        this.addMeteoblueWeeklyLayers();
      }

      controls?.classList.remove('hidden');
      console.log(`Showing ${controllerId} precipitation layers`);
     
      // Show the active layer immediately
      await this.updateLayer(controllerId, controller.activeIndex);
    } else {
      controls?.classList.add('hidden');
      console.log(`Hiding ${controllerId} precipitation layers`);
     
      // Pause autoplay first
      this.pauseAutoPlay(controllerId);
     
      // Hide all layers
      const hidePromises = controller.layerIds.map(layerId =>
        this.updateLayerVisibility(layerId, false)
      );
      await Promise.allSettled(hidePromises);
    }
  }

  // Helper method to wait for map style to load
  waitForMapStyle() {
    return waitForHydroMapStyleReady(map1).catch(() => undefined);
  }

  // Optimized close function
  async closeRainfall(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (!controller) return;

    const toggle = document.getElementById(controller.config.toggleId);
    const controls = document.getElementById(controller.config.controlsId);
   
    if (toggle) toggle.checked = false;
    controls?.classList.add('hidden');
   
    // Stop autoplay
    this.pauseAutoPlay(controllerId);
   
    // Hide all layers
    const hidePromises = controller.layerIds.map(layerId =>
      this.updateLayerVisibility(layerId, false)
    );
    await Promise.allSettled(hidePromises);
   
    console.log(`Closed ${controllerId} precipitation controls`);
  }

  // Modified event listeners initialization to include opacity controls
  initializeEventListeners() {
    this.controllers.forEach((controller, controllerId) => {
      const config = controller.config;
     
      // Slider interaction
      const sliderEl = document.getElementById(config.sliderId);
      if (sliderEl) {
        sliderEl.addEventListener('input', async (e) => {
          const index = parseInt(e.target.value);
          await controller.updateActiveLayer(index);
          controller.resetAutoPlay();
        });
      }

      // Opacity slider interaction
      const opacitySliderEl = document.getElementById(config.opacitySliderId);
      const opacityValueEl = document.getElementById(config.opacityValueId);
     
      if (opacitySliderEl && opacityValueEl) {
        opacitySliderEl.addEventListener('input', async (e) => {
          const opacityPercent = e.target.value;
          const opacity = parseFloat(opacityPercent) / 100;
         
          // Update the display value
          opacityValueEl.textContent = `${opacityPercent}%`;
         
          // Update the current active layer's opacity
          await this.updateCurrentLayerOpacity(controllerId);
         
          console.log(`Updated ${controllerId} opacity to ${opacity}`);
        });
      }

      // Playback button
      const playbackBtn = document.getElementById(config.playbackId);
      if (playbackBtn) {
        playbackBtn.addEventListener('click', async () => {
          // Ensure layers are added before playback
          if (controllerId === 'hrs' && !this.hourlyLayersAdded) {
            await this.waitForMapStyle();
            this.addMeteoblueHourlyLayers();
          } else if (controllerId === 'wky' && !this.weeklyLayersAdded) {
            await this.waitForMapStyle();
            this.addMeteoblueWeeklyLayers();
          }
         
          await controller.updateActiveLayer(controller.activeIndex);
         
          if (controller.autoPlayTimer) {
            controller.pauseAutoPlay();
          } else {
            controller.startAutoPlay();
          }
        });
      }

      // Initialize timestamps/calendar
      const timestampsEl = document.getElementById(config.timestampsId);
      if (timestampsEl) {
        const timestamps = Array.from({ length: config.layerCount }, (_, i) =>
          config.timeFunction(i)
        );
        const lastIndex = Math.max(1, config.layerCount - 1);
        timestampsEl.innerHTML = timestamps.map((time, index) => {
          const left = (index / lastIndex) * 100;
          return `<span class="time-marker text-center cursor-pointer hover:bg-gray-600 p-1 rounded ${index === 0 ? 'active' : ''}"
                 style="left: ${left}%;"
                 onclick="weatherController.updateLayer('${controllerId}', ${index})">${time}</span>`;
        }).join('');
      }
    });
  }

  // Optimized cleanup method
  cleanup() {
    this.controllers.forEach((controller) => {
      if (controller.autoPlayTimer) {
        clearInterval(controller.autoPlayTimer);
        controller.autoPlayTimer = null;
      }
    });
    this.apiCache.clear();
    this.apiThrottle.clear();
    console.log('Weather controller cleaned up');
  }
}

// Initialize the weather controller
let weatherController;

// Ensure DOM is loaded before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    weatherController = new WeatherLayerController();
    weatherController.initializeEventListeners();
  });
} else {
  weatherController = new WeatherLayerController();
  weatherController.initializeEventListeners();
}

// Global functions for backward compatibility
function toggleHourlyRainfall(checkbox) {
  return weatherController?.toggleRainfall('hrs', checkbox);
}

function toggleWeeklyRainfall(checkbox) {
  return weatherController?.toggleRainfall('wky', checkbox);
}

function closeHourlyRainfall() {
  return weatherController?.closeRainfall('hrs');
}

function closeWeeklyRainfall() {
  return weatherController?.closeRainfall('wky');
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  weatherController?.cleanup();
});
//This slider for Lightning forecast layer

const idSuffixes = ["today", "onedayahead", "twodayahead", "threedayahead",
  "fourdayahead", "fivedayahead", "sixdayahead", "sevendayahead", "eightdayahead"];

document.addEventListener('DOMContentLoaded', () => {
  const ltwToggle = document.getElementById('ltw');
  const dateSlider = document.getElementById('ltw-slider');
  const datesContainer = document.getElementById('ltw-dates');
  const playButton = document.getElementById('ltw-play');
  let autoPlayInterval = null;
  let currentIndex = 0;

  // Initialize dates
  const dates = Array.from({ length: 9 }, (_, i) => getNextNDays(i, 'short'));
  datesContainer.innerHTML = dates.map(date =>
    `<span class="text-center" style="width: ${100 / 9}%">${date}</span>`
  ).join('');

  const addLightningForecastLayers = () => {
    idSuffixes.forEach((suffix, index) => {
      const id = `forecast_${suffix}`;
      const time = getNextNDays(index);

      if (!map1.getSource(id)) {
        map1.addSource(id, {
          type: 'raster',
          tiles: [
            `https://maps.effis.emergency.copernicus.eu/gwis?SERVICE=WMS&REQUEST=GetMap&LAYERS=ecmwf.extra.lightning&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&TIME=${time}`
          ],
          tileSize: 256
        });
      }

      if (!map1.getLayer(id)) {
        map1.addLayer({
          id: id,
          type: 'raster',
          source: id,
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': index === 0 ? 1 : 0 }
        });
      }
    });
  };

  window.addLightningForecastLayers = addLightningForecastLayers;
  whenHydroMapStyleReady(map1, addLightningForecastLayers);
  // Toggle visibility
  ltwToggle.addEventListener('change', (e) => {
    const visible = e.target.checked;
    idSuffixes.forEach(suffix => {
      const layerId = `forecast_${suffix}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
    if (visible) updateActiveLayer(0);

    const toggleDiv = document.querySelector('.mt-4.space-y-2');
    if (toggleDiv) {
      if (visible) {
        toggleDiv.classList.remove('hidden');
      } else {
        toggleDiv.classList.add('hidden');
      }
    }
  });
  // Slider interaction
  dateSlider.addEventListener('input', (e) => {
    currentIndex = parseInt(e.target.value);
    updateActiveLayer(currentIndex);
    resetAutoPlay();
  });
  // Play/pause functionality
  playButton.addEventListener('click', () => {
    if (autoPlayInterval) {
      pauseAutoPlay();
    } else {
      startAutoPlay();
    }
  });

  function updateActiveLayer(index) {
    currentIndex = index;
    dateSlider.value = index;

    idSuffixes.forEach((suffix, i) => {
      const layerId = `forecast_${suffix}`;
      const opacity = i === index ? 1 : 0;
      if (map1.getLayer(layerId)) {
        map1.setPaintProperty(layerId, 'raster-opacity', opacity);
      }
    });

    // Update date highlights
    Array.from(datesContainer.children).forEach((span, i) => {
      span.style.fontWeight = i === index ? 'bold' : 'normal';
      span.style.color = i === index ? '#FFFF00' : '#FFFF';
    });
  }

  window.setLightningIndex = updateActiveLayer;

  function startAutoPlay() {
    playButton.textContent = '❚❚';
    autoPlayInterval = setInterval(() => {
      currentIndex = (currentIndex + 1) % idSuffixes.length;
      updateActiveLayer(currentIndex);
    }, 1000);
  }

  function pauseAutoPlay() {
    playButton.textContent = '▶';
    clearInterval(autoPlayInterval);
    autoPlayInterval = null;
  }

  function resetAutoPlay() {
    if (autoPlayInterval) {
      pauseAutoPlay();
      startAutoPlay();
    }
  }
});
document.addEventListener('DOMContentLoaded', () => {
  // Create or get the label for the new layer
  // (Ensure that your HTML contains an element with the id 'wpa-label'.)
  const wpaLabel = document.getElementById('wpa-label');
  if (wpaLabel) {
    wpaLabel.textContent = 'Weekly Precipitation Accumulation';
  }

  // Get DOM elements for the new controls
  const wpaToggle = document.getElementById('wpa'); // Checkbox or toggle input
  const wpaSlider = document.getElementById('wpa-slider'); // Slider input element
  const wpaDatesContainer = document.getElementById('wpa-dates'); // Container for the date labels
  const wpaPlayButton = document.getElementById('wpa-play'); // Button for play/pause

  let wpaAutoPlayInterval = null;
  let wpaCurrentIndex = 0;
  const totalWPAIndex = 10; // Number of forecast layers for weekly precipitation

  // Helper function to format dates into "Apr 10", etc.
  function formatDate(dateString) {
    const date = new Date(dateString);
    // Define options to get abbreviated month and numeric day
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  // Initialize the date labels; adjust width for each label using 100/totalWPAIndex percentage
  const dates = Array.from({ length: totalWPAIndex }, (_, i) => {
    // Get the full date string (assuming getNextNDaysWithTime returns an ISO string or similar)
    const fullDate = getNextNDaysWithTime(i + 1, "00", "00", "00").split("T")[0];
    // Format the date using our helper function
    return formatDate(fullDate);
  });

  // Render the date labels in the container
  wpaDatesContainer.innerHTML = dates
    .map(date => `<span class="text-center" style="width: ${100 / totalWPAIndex}%;">${date}</span>`)
    .join('');

  const addWeeklyAccumulationLayers = () => {
    for (let index = 0; index < totalWPAIndex; index++) {
      const layerId = `Convective_precipitation_weekly_kgm2_forecast_${index + 1}`;
      if (!map1.getSource(layerId)) {
        map1.addSource(layerId, {
          type: 'raster',
          tiles: [
            `https://geo.weather.gc.ca/geomet?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&time=${getNextNDaysWithTime(index + 1, "00", "00", "00")}&layers=GDPS.ETA_PR`
          ]
        });
      }
      if (!map1.getLayer(layerId)) {
        map1.addLayer({
          id: layerId,
          type: 'raster',
          source: layerId,
          layout: {
            visibility: 'none'
          },
          paint: {
            'raster-opacity': index === 0 ? 1 : 0
          }
        }, 'nationalBoundary');
      }
    }
  };

  window.addWeeklyAccumulationLayers = addWeeklyAccumulationLayers;
  whenHydroMapStyleReady(map1, addWeeklyAccumulationLayers);

  // Toggle visibility of the weekly precipitation accumulation layers
  wpaToggle.addEventListener('change', (e) => {
    const visible = e.target.checked;
    for (let index = 0; index < totalWPAIndex; index++) {
      const layerId = `Convective_precipitation_weekly_kgm2_forecast_${index + 1}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }
    if (visible) updateActiveWPALayer(0);

    // Optionally toggle a container for your controls (make sure your HTML has an element with the class 'wpa-controls')
    const toggleDiv = document.querySelector('.wpa-controls');
    if (toggleDiv) {
      if (visible) {
        toggleDiv.classList.remove('hidden');
      } else {
        toggleDiv.classList.add('hidden');
      }
    }
  });

  // Listen for slider changes for manual layer switching
  wpaSlider.addEventListener('input', (e) => {
    wpaCurrentIndex = parseInt(e.target.value);
    updateActiveWPALayer(wpaCurrentIndex);
    resetWPAutoPlay();
  });

  // Play/pause control for automatic layer cycling
  wpaPlayButton.addEventListener('click', () => {
    if (wpaAutoPlayInterval) {
      pauseWPAutoPlay();
    } else {
      startWPAutoPlay();
    }
  });

  // Function to update which layer is active by setting the corresponding opacity function
  function updateActiveWPALayer(index) {
    wpaCurrentIndex = index;
    wpaSlider.value = index;
    for (let idx = 0; idx < totalWPAIndex; idx++) {
      const layerId = `Convective_precipitation_weekly_kgm2_forecast_${idx + 1}`;
      const opacity = idx === index ? 1 : 0;
      if (map1.getLayer(layerId)) {
        map1.setPaintProperty(layerId, 'raster-opacity', opacity);
      }
    }
    // Highlight the current date in the slider's date container
    Array.from(wpaDatesContainer.children).forEach((span, i) => {
      span.style.fontWeight = i === index ? 'bold' : 'normal';
      span.style.color = i === index ? '#FFFF00' : '#FFFFFF';
    });
  }

  window.setWeeklyAccumulationIndex = updateActiveWPALayer;

  // Function to start autoplay cycling
  function startWPAutoPlay() {
    wpaPlayButton.textContent = '❚❚'; // Change the button text to pause symbol
    wpaAutoPlayInterval = setInterval(() => {
      wpaCurrentIndex = (wpaCurrentIndex + 1) % totalWPAIndex;
      updateActiveWPALayer(wpaCurrentIndex);
    }, 1000);
  }

  // Function to pause autoplay cycling
  function pauseWPAutoPlay() {
    wpaPlayButton.textContent = '▶'; // Change the button text to play symbol
    clearInterval(wpaAutoPlayInterval);
    wpaAutoPlayInterval = null;
  }

  // Reset autoplay after manual slider input
  function resetWPAutoPlay() {
    if (wpaAutoPlayInterval) {
      pauseWPAutoPlay();
      startWPAutoPlay();
    }
  }
});

// Precipitation 2026 Slider Implementation
document.addEventListener('DOMContentLoaded', () => {
  const precip2026Toggle = document.getElementById('precip2026');
  const precip2026Slider = document.getElementById('precip2026-slider');
  const precip2026MonthsContainer = document.getElementById('precip2026-months');
  const precip2026PlayButton = document.getElementById('precip2026-play');
  const precip2026SpeedButton = document.getElementById('precip2026-speed');
  const precip2026OpacityBtn = document.getElementById('precip2026-opacity-btn');
  const precip2026OpacityControls = document.getElementById('precip2026-opacity-controls');
  const precip2026OpacitySlider = document.getElementById('precip2026-opacity-slider');
  const precip2026OpacityValue = document.getElementById('precip2026-opacity-value');

  let precip2026AutoPlayInterval = null;
  let precip2026CurrentIndex = 0;
  const totalMonths = 12;
  let precip2026Speed = 1000; // Default speed: 1000ms (1x)
  let precip2026SpeedLevel = 2; // 0.5x, 1x, or 2x (start at 1x)
  let precip2026Opacity = 0.8; // Default opacity (80%)

  // Month names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Render the month labels
  precip2026MonthsContainer.innerHTML = monthNames
    .map(month => `<span class="text-center" style="width: ${100 / totalMonths}%;">${month}</span>`)
    .join('');

  const addPrecip2026Layers = () => {
    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      const sourceId = `Precipitation_2026_source_${month}`;
      
      if (!map1.getSource(sourceId)) {
        map1.addSource(sourceId, {
          'type': 'raster',
          'tiles': [
            `http://${ahad}:8080/geoserver/Precipitation_2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Precipitation_2026:${month}&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
          ],
          'tileSize': 256
        });
      }

      if (!map1.getLayer(layerId)) {
        map1.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          layout: {
            visibility: 'none'
          },
          paint: {
            'raster-opacity': month === 1 ? 0.8 : 0
          }
        }, 'nationalBoundary');
      }
    }
  };

  window.addPrecip2026Layers = addPrecip2026Layers;
  function whenPrecip2026StyleReady(cb) {
    whenHydroMapStyleReady(map1, cb);
  }

  function syncPrecip2026Visibility() {
    if (!precip2026Toggle) return;
    const visible = precip2026Toggle.checked;

    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }

    if (visible) {
      updateActivePrecip2026Layer(precip2026CurrentIndex);
    }
  }

  function ensurePrecip2026LayersAndSync() {
    addPrecip2026Layers();
    syncPrecip2026Visibility();
  }

  whenPrecip2026StyleReady(ensurePrecip2026LayersAndSync);

  if (map1 && !map1.__precip2026StyleBound) {
    map1.__precip2026StyleBound = true;
    map1.on('style.load', () => {
      map1.__hydroStyleReadyForLayers = true;
      map1.__hydroStyleReadyStyle = map1.style;
      ensurePrecip2026LayersAndSync();
    });
  }

  // Toggle visibility of the Precipitation 2026 layers
  precip2026Toggle.addEventListener('change', (e) => {
    const visible = e.target.checked;

    whenPrecip2026StyleReady(() => {
      addPrecip2026Layers();
      for (let month = 1; month <= totalMonths; month++) {
        const layerId = `Precipitation_2026_month_${month}`;
        if (map1.getLayer(layerId)) {
          map1.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
      }

      if (visible) {
        updateActivePrecip2026Layer(0);
      }
    });

    // Toggle the controls container
    const toggleDiv = document.querySelector('.precip2026-controls');
    if (toggleDiv) {
      if (visible) {
        toggleDiv.classList.remove('hidden');
      } else {
        toggleDiv.classList.add('hidden');
        pausePrecip2026AutoPlay();
      }
    }
  });

  // Listen for slider changes
  precip2026Slider.addEventListener('input', (e) => {
    precip2026CurrentIndex = parseInt(e.target.value);
    updateActivePrecip2026Layer(precip2026CurrentIndex);
    resetPrecip2026AutoPlay();
  });

  // Play/pause control
  precip2026PlayButton.addEventListener('click', () => {
    if (precip2026AutoPlayInterval) {
      pausePrecip2026AutoPlay();
    } else {
      startPrecip2026AutoPlay();
    }
  });

  // Speed control - cycles through 0.5x, 1x, 2x
  precip2026SpeedButton.addEventListener('click', () => {
    precip2026SpeedLevel++;
    if (precip2026SpeedLevel > 3) {
      precip2026SpeedLevel = 1;
    }
    
    // Update speed based on level
    switch(precip2026SpeedLevel) {
      case 1:
        precip2026Speed = 2000; // 0.5x speed (slower)
        precip2026SpeedButton.textContent = '0.5x';
        break;
      case 2:
        precip2026Speed = 1000; // 1x speed (normal)
        precip2026SpeedButton.textContent = '1x';
        break;
      case 3:
        precip2026Speed = 500; // 2x speed (faster)
        precip2026SpeedButton.textContent = '2x';
        break;
    }
    
    // If autoplay is active, restart with new speed
    if (precip2026AutoPlayInterval) {
      pausePrecip2026AutoPlay();
      startPrecip2026AutoPlay();
    }
  });

  // Opacity button toggle
  precip2026OpacityBtn.addEventListener('click', () => {
    if (precip2026OpacityControls.classList.contains('hidden')) {
      precip2026OpacityControls.classList.remove('hidden');
    } else {
      precip2026OpacityControls.classList.add('hidden');
    }
  });

  // Opacity slider control
  precip2026OpacitySlider.addEventListener('input', (e) => {
    const opacityPercent = parseInt(e.target.value);
    precip2026Opacity = opacityPercent / 100;
    precip2026OpacityValue.textContent = opacityPercent + '%';
    
    // Update opacity of the currently active layer
    const activeMonth = precip2026CurrentIndex + 1;
    const layerId = `Precipitation_2026_month_${activeMonth}`;
    if (map1.getLayer(layerId)) {
      map1.setPaintProperty(layerId, 'raster-opacity', precip2026Opacity);
    }
  });

  // Update active layer based on month index (0-11)
  function updateActivePrecip2026Layer(index) {
    precip2026CurrentIndex = index;
    precip2026Slider.value = index;
    
    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      const opacity = (month - 1) === index ? precip2026Opacity : 0;
      if (map1.getLayer(layerId)) {
        map1.setPaintProperty(layerId, 'raster-opacity', opacity);
      }
    }
    
    // Highlight current month
    Array.from(precip2026MonthsContainer.children).forEach((span, i) => {
      span.style.fontWeight = i === index ? 'bold' : 'normal';
      span.style.color = i === index ? '#FFFF00' : '#FFFFFF';
    });
  }

  window.setPrecip2026Index = updateActivePrecip2026Layer;

  // Start autoplay
  function startPrecip2026AutoPlay() {
    precip2026PlayButton.textContent = '❚❚';
    precip2026AutoPlayInterval = setInterval(() => {
      precip2026CurrentIndex = (precip2026CurrentIndex + 1) % totalMonths;
      updateActivePrecip2026Layer(precip2026CurrentIndex);
    }, precip2026Speed);
  }

  // Pause autoplay
  function pausePrecip2026AutoPlay() {
    precip2026PlayButton.textContent = '▶';
    if (precip2026AutoPlayInterval) {
      clearInterval(precip2026AutoPlayInterval);
      precip2026AutoPlayInterval = null;
    }
  }

  // Reset autoplay after manual slider movement
  function resetPrecip2026AutoPlay() {
    if (precip2026AutoPlayInterval) {
      pausePrecip2026AutoPlay();
      startPrecip2026AutoPlay();
    }
  }
});

// Access the blink button using its id
const blinkBtn = document.getElementById("blinkLayersBtn");
// Attach click event listener to the button
blinkBtn.addEventListener("click", function () {
  // Check if blinking is already active
  if (blinkInterval) {
    // Stop blinking: clear the interval and reset the fill opacity
    clearInterval(blinkInterval);
    blinkInterval = null;
    map1.setPaintProperty("TehsilBoundaryHighlight", "fill-opacity", 0.3);
    map1.setPaintProperty("DistrictBoundaryHighlight", "fill-opacity", 0.3);
    blinkBtn.textContent = "Start Blinking";
    
    // ADDED: Log that selection is now unlocked
    console.log("Blinking stopped - district and tehsil selection is now unlocked");
  } else {
    // Begin blinking effect: toggle the opacity every 500 milliseconds
    // ADDED: Log that selection is now locked
    console.log("Blinking started - district and tehsil selection is now locked");
    
    let isVisible = true;
    blinkInterval = setInterval(() => {
      // Toggle opacity between 0.5 (visible) and 0 (invisible)
      map1.setPaintProperty("TehsilBoundaryHighlight", "fill-opacity", isVisible ? 0 : 0.3);
      map1.setPaintProperty("DistrictBoundaryHighlight", "fill-opacity", isVisible ? 0 : 0.3);
      isVisible = !isVisible;
    }, 500);
    blinkBtn.textContent = "Stop Blinking";
  }
});


function handleHECRASVideo(checkbox, file) {
  if (!checkbox.checked) return;

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center';

  const video = document.createElement('video');
  video.src = file;
  video.controls = true;
  video.loop = true;
  video.autoplay = true;
  video.className = 'max-w-6xl max-h-[90vh] shadow-lg';

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.className = 'absolute top-4 right-4 text-white text-3xl font-bold bg-black bg-opacity-60 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-90';
  closeBtn.onclick = () => {
    overlay.remove();
    checkbox.checked = false;
  };

  overlay.appendChild(video);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

let hecrasActive = false;


// function showImage(checkbox, imgSrc){
//   if(checkbox.checked){
//     var modal = document.getElementById('modalOverlay');
//     var img = document.getElementById('modalImage');
//     img.src = imgSrc;
//     modal.style.display = 'flex';
//     setTimeout(() => {img.focus();}, 100);
//     // Uncheck all others of type to allow only 1 at a time
//     document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
//       if(cb !== checkbox) cb.checked = false;
//     });
//   }else{
//     closeModal();
//   }
// }
// function closeModal(){
//   document.getElementById('modalOverlay').style.display = 'none';
//   // Uncheck all checkboxes when closing modal
//   document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
// }

// // Optional: ESC key closes modal.
// document.addEventListener('keydown', function(evt){
//   if(evt.key === "Escape"){
//     closeModal();
//   }
// });

function toggleFloodLegend() {
  // Check if any riverine flooding checkboxes are checked
  const checkedBoxes = document.querySelectorAll('#riverineFlooding input[type="checkbox"]:checked');
  
  if (checkedBoxes.length > 0) {
    // Show legend if any checkbox is checked
    showFloodLegend();
  } else {
    // Hide legend if no checkboxes are checked
    hideFloodLegend();
  }
}

// Function to show the legend
function showFloodLegend() {
  // Remove existing legend if it exists
  const existingLegend = document.getElementById('floodLegend');
  if (existingLegend) {
    existingLegend.remove();
  }

  // Create legend container
  const legend = document.createElement('div');
  legend.id = 'floodLegend';
  
  // Apply styles via JavaScript
  Object.assign(legend.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: 'white',
    border: '2px solid #ccc',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: '1000',
    minWidth: '180px',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px'
  });

  // Create legend title
  const title = document.createElement('div');
  title.textContent = 'Flood Extent Legend';
  Object.assign(title.style, {
    fontWeight: 'bold',
    marginBottom: '10px',
    fontSize: '16px',
    color: '#333',
    borderBottom: '1px solid #eee',
    paddingBottom: '6px'
  });
  legend.appendChild(title);

  // Define static flood levels (always show all three)
  const floodLevels = [
    { color: 'purple', label: 'Ex.High Flood' },
    { color: 'brown', label: 'Very High Flood' },
    { color: '#F72D24', label: 'High Flood' },
    { color: '#FBAB12', label: 'Medium Flood' },
    { color: '#2C9326', label: 'Low Flood' }
    
  ];

  // Create legend items for all flood levels
  floodLevels.forEach(level => {
    const legendItem = document.createElement('div');
    Object.assign(legendItem.style, {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '8px',
      gap: '10px'
    });

    // Create color circle
    const colorCircle = document.createElement('div');
    Object.assign(colorCircle.style, {
      width: '16px',
      height: '16px',
      borderRadius: '50%',
      backgroundColor: level.color,
      flexShrink: '0',
      border: '1px solid rgba(0,0,0,0.1)'
    });

    // Create label
    const label = document.createElement('span');
    label.textContent = level.label;
    Object.assign(label.style, {
      color: '#333',
      fontSize: '14px',
      fontWeight: '500'
    });

    legendItem.appendChild(colorCircle);
    legendItem.appendChild(label);
    legend.appendChild(legendItem);
  });

  // Add legend to page
  document.body.appendChild(legend);
}

// Function to hide the legend
function hideFloodLegend() {
  const existingLegend = document.getElementById('floodLegend');
  if (existingLegend) {
    existingLegend.remove();
  }
}

function updateFloodLegend() {
  createFloodLegend();
}



// function createImageContainer() {
//   const map1 = document.getElementById('map1');
//   if (!document.getElementById('river-image-container')) {
//     const imageContainer = document.createElement('div');
//     imageContainer.id = 'river-image-container';
//     imageContainer.style.cssText = `
//     position: fixed;
//     bottom: 20px;
//     left: 50%;
//     transform: translateX(-50%);
//     z-index: 1000;
//     background: rgba(0, 0, 0, 0.8);
//     border-radius: 8px;
//     padding: 15px;
//     box-shadow: 0 4px 8px rgba(0,0,0,0.3);
//     width: 800px;
//     max-height: 800px;
//     overflow: auto;
//     display: none;
// `;

//     map1.appendChild(imageContainer);
//   }
// }

// function toggleRiverImage(checkboxId, imageName) {
//   const checkbox = document.getElementById(checkboxId);
//   const imageContainer = document.getElementById('river-image-container');
  
//   if (!imageContainer) {
//     createImageContainer();
//     return toggleRiverImage(checkboxId, imageName); // Retry after creating container
//   }
  
//   const imageWrapperClass = `river-wrapper-${checkboxId}`;
//   const existingWrapper = document.querySelector(`.${imageWrapperClass}`);
  
//   if (checkbox.checked) {
//     if (!existingWrapper) {
//       // Create wrapper div for image and close button
//       const wrapper = document.createElement('div');
//       wrapper.className = imageWrapperClass;
//       wrapper.style.cssText = `
//         position: relative;
//         margin-bottom: 15px;
//         display: inline-block;
//         width: 100%;
//       `;
      
//       // Create title
//       const title = document.createElement('div');
//       title.style.cssText = `
//         color: white;
//         font-size: 14px;
//         font-weight: bold;
//         margin-bottom: 8px;
//         text-align: center;
//       `;
      
//       // Custom titles
//       if (checkboxId === 'kabilMediumFlood') {
//         title.textContent = 'Kabul Medium';
//       } else if (checkboxId === 'kabilHighFlood') {
//         title.textContent = 'Kabul High';
//       } else {
//         title.textContent = checkboxId
//           .replace(/([A-Z])/g, ' $1')
//           .replace(/^./, str => str.toUpperCase());
//       }
      
//       // Create image
//       const img = document.createElement('img');
//       img.src = imageName;
//       img.alt = `${checkboxId} River Image`;
//       img.style.cssText = `
//         width: 100%;
//         height: auto;
//         border-radius: 4px;
//         margin-bottom: 10px;
//         border: 2px solid #ffffff;
//         display: block;
//       `;
      
//       img.onerror = function () {
//         console.error(`Failed to load image: ${imageName}`);
//         this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SW1hZ2UgTm90IEZvdW5kPC90ZXh0Pjwvc3ZnPg==';
//       };
      
//       // Create close button
//       const closeButton = document.createElement('button');
//       closeButton.innerHTML = '×';
//       closeButton.style.cssText = `
//         position: absolute;
//         top: 5px;
//         right: 5px;
//         width: 25px;
//         height: 25px;
//         border: none;
//         background: rgba(255, 255, 255, 0.8);
//         color: #000;
//         border-radius: 50%;
//         font-size: 16px;
//         font-weight: bold;
//         cursor: pointer;
//         display: flex;
//         align-items: center;
//         justify-content: center;
//         z-index: 1001;
//         transition: background-color 0.2s;
//       `;
      
//       // Close button hover effect
//       closeButton.onmouseenter = function() {
//         this.style.background = 'rgba(255, 255, 255, 1)';
//       };
//       closeButton.onmouseleave = function() {
//         this.style.background = 'rgba(255, 255, 255, 0.8)';
//       };
      
//       // Close button click handler
//       closeButton.onclick = function(e) {
//         e.preventDefault();
//         e.stopPropagation();
        
//         // Uncheck the corresponding checkbox
//         checkbox.checked = false;
        
//         // Remove the wrapper
//         wrapper.remove();
        
//         // Hide container if no images left
//         if (imageContainer.children.length === 0) {
//           imageContainer.style.display = 'none';
//         }
//       };
      
//       // Assemble the wrapper
//       wrapper.appendChild(title);
//       wrapper.appendChild(img);
//       wrapper.appendChild(closeButton);
      
//       // Add to container
//       imageContainer.appendChild(wrapper);
//     }
//     imageContainer.style.display = 'block';
//   } else {
//     if (existingWrapper) {
//       existingWrapper.remove();
//     }
    
//     if (imageContainer.children.length === 0) {
//       imageContainer.style.display = 'none';
//     }
//   }
// }


/////Slideshow code 
let activeAdvisoryData = null;
let currentImageIndex = 0;
let autoPlayActive = false;
let slideTimer = null;

const advisoryImageData = {
    punjab: [
        { src: 'media/Advisories/DGKhan.jpg', title: 'DG Khan' },
        { src: 'media/Advisories/flooding urban punjab.png', title: 'Flood Punjab' },
        { src: 'media/Advisories/gujranwala.jpg', title: 'Gujranwala' },
        { src: 'media/Advisories/Pir_Panjal.jpg', title: 'Pir Panjal 1' },
        { src: 'media/Advisories/Pir Panjal Map _ North Eastern Punjab 2.jpg', title: 'Pir Panjal 2' }
    ],
    sindh: [
        { src: 'media/Advisories/Sindh.jpg', title: 'Sindh' }
    ],
    balochistan: [
        { src: 'media/Advisories/kirthar Range.jpg', title: 'Kirthar Range' }
    ],
    kpk: [
        { src: 'media/Advisories/D I Khan.jpg', title: 'DI Khan' }
    ],
    dew: [
        { src: 'media/Exposures+Levels/Swat.png', title: 'Swat' },
        { src: 'media/Exposures+Levels/kabul_medium.png', title: 'Kabul Medium' },
        { src: 'media/Exposures+Levels/kabul_high.png', title: 'Kabul High' },
        { src: 'media/Exposures+Levels/upper_indus.png', title: 'Upper Indus' },
        { src: 'media/Exposures+Levels/lower_indus.png', title: 'Lower Indus' },
        { src: 'media/Exposures+Levels/chenab.png', title: 'Chenab' },
        { src: 'media/Exposures+Levels/jhelum.png', title: 'Jhelum' },
        { src: 'media/Exposures+Levels/ravi_low.png', title: 'Ravi' }
    ],
    alerts:
    [
      { src: 'media/Alerts/Picture1.png', title: 'Pre Monsoon Weather Alert' },
      { src: 'media/Alerts/Picture2.png', title: 'Flash Flood Northern Areas' },
      { src: 'media/Alerts/Picture3.png', title: 'Flash Flooding in GB & KPK' },
      { src: 'media/Alerts/Picture4.png', title: 'Hydro Situation Update 24-48 hrs' },
      { src: 'media/Alerts/Picture5.png', title: 'Rainfall Alert Punjab' },
      { src: 'media/Alerts/Picture6.png', title: 'Rainfall Alert KPK' },
      { src: 'media/Alerts/Picture7.png', title: 'Rainfall Alert Sindh' },
      { src: 'media/Alerts/Picture8.png', title: 'Rainfall Alert Balochistan' },
      { src: 'media/Alerts/Picture9.jpg', title: 'Rainfall Alert KP' },
      { src: 'media/Alerts/Picture10.png', title: 'Rainfall Alert Balochistan' },
      { src: 'media/Alerts/Picture11.jpg', title: 'Rainfall Alert Punjab' },
      { src: 'media/Alerts/Picture12.png', title: 'Urban Flooding Punjab' },
      { src: 'media/Alerts/Picture13.png', title: 'Flash FLooding Northern & AJK' },
      { src: 'media/Alerts/Picture14.png', title: 'Urban Flooding SIndh' },
      { src: 'media/Alerts/Picture15.png', title: 'Flash Flooding Balochistan' },
      { src: 'media/Alerts/Picture16.png', title: 'Flood Hill Torrents Punjab' },
      { src: 'media/Alerts/Picture17.png', title: 'Flash Flood KPK' },
      { src: 'media/Alerts/Picture18.png', title: 'Flash Flood AJK, GB' },
      { src: 'media/Alerts/Picture19.png', title: 'Flash Flood Balochistan' },
      { src: 'media/Alerts/Picture20.png', title: 'Flash Flood Isb/Rwp' },
      { src: 'media/Alerts/Picture21.png', title: 'Flash Flood Gilgit/AJK' },
      { src: 'media/Alerts/Picture22.png', title: 'Flash Flood KPK' },
      { src: 'media/Alerts/Picture23.png', title: 'Flash Flood Balochistan' },

  ]
};

// Keep the slideshow modal outside sidebar containers so fixed positioning
// always covers the full viewport on both desktop and mobile.
const advisoryModalEl = document.getElementById('slideshowModal');
if (advisoryModalEl && advisoryModalEl.parentElement !== document.body) {
  document.body.appendChild(advisoryModalEl);
}

function launchAdvisorySlideshow(region) {
  activeAdvisoryData = advisoryImageData[region];
  if (!activeAdvisoryData || activeAdvisoryData.length === 0) return;
  
  currentImageIndex = 0;
  refreshSlideDisplay();
  document.getElementById('slideshowModal').style.display = 'flex';
  
  // Reset play state
  autoPlayActive = false;
  updatePlayPauseIcon();
}

function closeAdvisorySlideshow() {
  document.getElementById('slideshowModal').style.display = 'none';
  stopSlideAutoPlay();
  activeAdvisoryData = null;
  currentImageIndex = 0;
}

function refreshSlideDisplay() {
  if (!activeAdvisoryData || activeAdvisoryData.length === 0) return;
  
  const slide = activeAdvisoryData[currentImageIndex];
  const modal = document.getElementById('slideshowModal');
  if (!modal) return;
  const img = modal.querySelector('#slideshowImage');
  const counter = modal.querySelector('#slideCounter');
  const title = modal.querySelector('#slideTitle');
  const prevBtn = modal.querySelector('#prevBtn');
  const nextBtn = modal.querySelector('#nextBtn');
  if (!img || !counter || !title || !prevBtn || !nextBtn) return;
  
  img.src = slide.src;
  counter.textContent = `${currentImageIndex + 1} / ${activeAdvisoryData.length}`;
  title.textContent = slide.title;
  
  // Update button states
  prevBtn.disabled = currentImageIndex === 0;
  nextBtn.disabled = currentImageIndex === activeAdvisoryData.length - 1;
}

function goToNextSlide() {
  if (!activeAdvisoryData || currentImageIndex >= activeAdvisoryData.length - 1) return;
  currentImageIndex++;
  refreshSlideDisplay();
}

function goToPreviousSlide() {
  if (!activeAdvisoryData || currentImageIndex <= 0) return;
  currentImageIndex--;
  refreshSlideDisplay();
}

function toggleSlidePlayback() {
  if (autoPlayActive) {
      stopSlideAutoPlay();
  } else {
      startSlideAutoPlay();
  }
}

function startSlideAutoPlay() {
  if (!activeAdvisoryData || activeAdvisoryData.length <= 1) return;
  
  autoPlayActive = true;
  updatePlayPauseIcon();
  
  slideTimer = setInterval(() => {
      if (currentImageIndex < activeAdvisoryData.length - 1) {
          goToNextSlide();
      } else {
          // Loop back to first slide
          currentImageIndex = 0;
          refreshSlideDisplay();
      }
  }, 3000); // Change slide every 3 seconds
}

function stopSlideAutoPlay() {
  autoPlayActive = false;
  updatePlayPauseIcon();
  if (slideTimer) {
      clearInterval(slideTimer);
      slideTimer = null;
  }
}

function updatePlayPauseIcon() {
  const modal = document.getElementById('slideshowModal');
  if (!modal) return;
  const btn = modal.querySelector('#playPauseBtn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (!icon) return;
  
  if (autoPlayActive) {
      icon.className = 'fa-solid fa-pause';
  } else {
      icon.className = 'fa-solid fa-play';
  }
}

// Keyboard controls
document.addEventListener('keydown', function(evt) {
  if (document.getElementById('slideshowModal').style.display === 'flex') {
      switch(evt.key) {
          case 'Escape':
              closeAdvisorySlideshow();
              break;
          case 'ArrowLeft':
              goToPreviousSlide();
              break;
          case 'ArrowRight':
              goToNextSlide();
              break;
          case ' ':
              evt.preventDefault();
              toggleSlidePlayback();
              break;
      }
  }
});

// Click outside image to close
document.getElementById('slideshowModal').addEventListener('click', function(e) {
  if (e.target === this) {
      closeAdvisorySlideshow();
  }
});
// Global GeoServer IP variables
const mustafa = "172.18.1.37"; // Swat, Panjgora, etc.
const ahad = "172.18.1.85"; // AJK, Jhal, hyd layers, etc.
let isPlaying = false;
let playInterval;
let currentDay = 1;
const sliderContainer = document.querySelector('.timeline-slider-container');
const dragHandle = document.querySelector('.drag-handle');
const resizeHandle = document.querySelector('.resize-handle');
const slider = document.getElementById('timelineSlider');
const weekLabels = document.querySelectorAll('.week-label');

// Global checkbox state storage for basemap changes
let checkboxStates = {};
let blinkingState = {
  isBlinking: false,
  selectedDistricts: [],
  selectedTehsils: [],
  blinkButtonText: "Start Blinking"
};

// function swapLngLatInGeoJSON(gj) {
//   const flipPair = (c) => (Array.isArray(c) && c.length >= 2 ? [c[1], c[0], ...c.slice(2)] : c);

//   const flipCoords = (geom) => {
//     if (!geom) return geom;
//     const { type, coordinates, geometries } = geom;

//     switch (type) {
//       case 'Point':
//         return { ...geom, coordinates: flipPair(coordinates) };
//       case 'MultiPoint':
//       case 'LineString':
//         return { ...geom, coordinates: coordinates.map(flipPair) };
//       case 'MultiLineString':
//       case 'Polygon':
//         return { ...geom, coordinates: coordinates.map(ring => ring.map(flipPair)) };
//       case 'MultiPolygon':
//         return { ...geom, coordinates: coordinates.map(poly => poly.map(ring => ring.map(flipPair))) };
//       case 'GeometryCollection':
//         return { ...geom, geometries: geometries.map(g => flipCoords(g)) };
//       default:
//         return geom;
//     }
//   };

//   const swapLatLonProps = (props = {}) => {
//     const latKeys = ['lat', 'latitude', 'LAT', 'Lat'];
//     const lonKeys = ['lon', 'lng', 'long', 'longitude', 'LON', 'Lon', 'Lng'];

//     const findKey = (keys) => keys.find(k => Object.prototype.hasOwnProperty.call(props, k));
//     const latK = findKey(latKeys);
//     const lonK = findKey(lonKeys);

//     if (latK && lonK) {
//       const tmp = props[latK];
//       props[latK] = props[lonK];
//       props[lonK] = tmp;
//     }
//     return props;
//   };

//   // Feature
//   const fixFeature = (f) => ({
//     ...f,
//     geometry: flipCoords(f.geometry),
//     properties: swapLatLonProps({ ...(f.properties || {}) })
//   });

//   // FeatureCollection vs single Feature/Geometry
//   if (gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
//     return { ...gj, features: gj.features.map(fixFeature) };
//   }
//   if (gj && gj.type === 'Feature') {
//     return fixFeature(gj);
//   }
//   // raw Geometry
//   return flipCoords(gj);
// }


// Function to save all checkbox states and blinking state
function saveCheckboxStates() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  checkboxStates = {};
  checkboxes.forEach(checkbox => {
    if (checkbox.id) {
      checkboxStates[checkbox.id] = checkbox.checked;
    }
  });

  // Save blinking state - check if global variables exist
  try {
    if (typeof selectedDistrict !== 'undefined' && Array.isArray(selectedDistrict)) {
      blinkingState.selectedDistricts = [...selectedDistrict];
    }

    if (typeof selectedTehsils !== 'undefined' && Array.isArray(selectedTehsils)) {
      blinkingState.selectedTehsils = [...selectedTehsils];
    }

    if (typeof blinkInterval !== 'undefined') {
      blinkingState.isBlinking = blinkInterval !== null;
    }

    const blinkBtn = document.getElementById("blinkLayersBtn");
    if (blinkBtn) {
      blinkingState.blinkButtonText = blinkBtn.textContent;
    }
  } catch (e) {
    console.log("Could not save blinking state:", e);
  }
}

// Function to restore checkbox states and trigger layers
function restoreCheckboxStates() {
  Object.keys(checkboxStates).forEach(checkboxId => {
    const checkbox = document.getElementById(checkboxId);
    if (checkbox && checkboxStates[checkboxId]) {
      checkbox.checked = true;
      // Trigger the change event to show the layer
      const event = new Event('change');
      checkbox.dispatchEvent(event);
    }
  });

  // Restore blinking state after a short delay to ensure layers are loaded
  setTimeout(() => {
    restoreBlinkingState();
  }, 500);
}

// Function to restore blinking functionality
function restoreBlinkingState() {
  // Only restore if we had selections before
  if (blinkingState.selectedDistricts.length > 0 || blinkingState.selectedTehsils.length > 0) {
    // Check if global variables exist (they should now since we made them global)
    if (typeof window.selectedDistrict !== 'undefined' || typeof selectedDistrict !== 'undefined') {
      selectedDistrict.length = 0; // Clear array
      selectedDistrict.push(...blinkingState.selectedDistricts);
    }

    if (typeof window.selectedTehsils !== 'undefined' || typeof selectedTehsils !== 'undefined') {
      selectedTehsils.length = 0; // Clear array
      selectedTehsils.push(...blinkingState.selectedTehsils);
    }

    // Wait a bit longer for layers to be properly loaded
    setTimeout(() => {
      // Restore highlight layer filters
      if (map1.getLayer("DistrictBoundaryHighlight") && blinkingState.selectedDistricts.length > 0) {
        try {
          map1.setFilter("DistrictBoundaryHighlight", ["in", "DISTRICT", ...blinkingState.selectedDistricts]);
        } catch (e) {
          console.log("Could not restore district filter:", e);
        }
      }

      if (map1.getLayer("TehsilBoundaryHighlight") && blinkingState.selectedTehsils.length > 0) {
        try {
          map1.setFilter("TehsilBoundaryHighlight", ["in", "name", ...blinkingState.selectedTehsils]);
        } catch (e) {
          console.log("Could not restore tehsil filter:", e);
        }
      }

      // Restore blinking if it was active
      if (blinkingState.isBlinking) {
        const blinkBtn = document.getElementById("blinkLayersBtn");
        if (blinkBtn && blinkBtn.textContent === "Start Blinking") {
          // Simulate click to start blinking
          blinkBtn.click();
        }
      }
    }, 200);
  }
}
let isResizing = false;
let dragOffsetX, dragOffsetY, startWidth;
const sliderLayerConfig = {
  day_1: ['Swat_rivert', 'Panjgora_river', 'Upper_indus_flood'],
  day_2: ['Panjgora_river'],
  day_3: ['Upper_indus_flood'],
  day_4: ['2_Swat_River_25yr_Flood_Extent'],
  day_5: ['khfex'],
  day_6: ['upper_KP'],
  day_7: ['DG khan HT'],
  day_8: ['DI_Khan_HT'],
  day_9: ['Lower_KP'],
  day_10: ['jlfex'],
  day_11: ['Barrages'],
  day_12: ['cmfex'],
  day_13: ['Kabil_medium_flood'],
  day_14: ['Lower_indus_high_flood'],
  day_15: ['G16_Flood_Inundation_2011_SUPARCO'],
  day_16: ['VIIRS_20230726_20230730_FloodExtent_PAK'],
  day_17: ['sumAL43EGE'],
  day_18: ['Combined'],
  day_19: ['G18_Flood_Inundation_2013_SUPARCO'],
  day_20: ['Under_construction'],
  day_21: ['STREAM_218_5_9_Pk'],
  day_22: ['AccRainEGE'],
  day_23: ['FloodSummary1_30'],
  day_24: ['Pakistan_Rivers'],
  day_25: ['Dams_Water_Bodies'],
  day_26: ['Ready_for_Construction'],
  day_27: ['Future'],
  day_28: ['Ongoing'],
  day_29: ['EGE_probRgt50'],
  day_30: ['KP_RIVERS'],
  day_31: ['STREAM_412_5_9']
};


function updateWeekHighlight(day) {
  let activeIndex = 0;
  if (day >= 1 && day <= 7) activeIndex = 0;
  else if (day >= 8 && day <= 14) activeIndex = 1;
  else if (day >= 15 && day <= 21) activeIndex = 2;
  else if (day >= 22 && day <= 28) activeIndex = 3;
  else activeIndex = 4;

  weekLabels.forEach((label, index) => {
    label.classList.toggle('active', index === activeIndex);
  });
}

function formatDate(day) {
  const date = new Date(2025, 6, day); // July (0-based)
  const dayStr = String(day).padStart(2, '0');
  return `Week ${Math.ceil(day / 7)}: ${dayStr}/07/2025`;
}

function getAllSliderLayers() {
  return [...new Set(Object.values(sliderLayerConfig).flat())];
}

function hideAllSliderLayers() {
  const allLayers = getAllSliderLayers();
  allLayers.forEach(layerId => {
    if (map1.getLayer(layerId)) {
      map1.setLayoutProperty(layerId, 'visibility', 'none');
    }
  });
}

function showLayersForDay(day) {
  hideAllSliderLayers();
  const layers = sliderLayerConfig[`day_${day}`] || [];
  const visible = [];

  layers.forEach(id => {
    if (map1.getLayer(id)) {
      map1.setLayoutProperty(id, 'visibility', 'visible');
      visible.push(id);
    } else {
      console.warn(`Layer "${id}" not found`);
    }
  });

  document.getElementById('layerInfo').textContent =
    visible.length > 0 ? `Active layers: ${visible.join(', ')}` : `No layers for day ${day}`;
}

function updateSliderPosition(day, show = true) {
  currentDay = day;
  document.getElementById('timelineSlider').value = day;
  document.getElementById('dateDisplay').textContent = formatDate(day);
  if (show) showLayersForDay(day);
  updateWeekHighlight(day);
}


function togglePlayPause() {
  const btn = document.getElementById('playPauseBtn');

  if (isPlaying) {
    clearInterval(playInterval);
    btn.textContent = '▶ Play';
    isPlaying = false;
    return;
  }

  const speed = parseInt(document.getElementById('speedSelect').value);

  playInterval = setInterval(() => {
    currentDay++;
    if (currentDay > 31) {
      currentDay = 1; // ✅ Loop back to day 1
    }
    updateSliderPosition(currentDay, true); // explicitly show layers during play
  }, speed);

  btn.textContent = '⏸ Pause';
  isPlaying = true;
}


function closeSlider() {
  updateSliderPosition(1, false);
  document.getElementById('layerInfo').textContent = 'Layers: Ready to load';
  clearInterval(playInterval);
  isPlaying = false;
  document.getElementById('playPauseBtn').textContent = '▶ Play';
  hideAllSliderLayers();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('timelineSlider').value = 1;
  document.getElementById('dateDisplay').textContent = formatDate(1);
  updateWeekHighlight(1);
  document.getElementById('layerInfo').textContent = 'Layers: Ready to load';


});

function toggleSliderCheckbox() {
  const checkbox = document.getElementById('slider');
  checkbox.checked = !checkbox.checked;
  toggleHighlight(checkbox); // Call the toggle function with the new state
}


dragHandle.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragOffsetX = e.clientX - sliderContainer.offsetLeft;
  dragOffsetY = e.clientY - sliderContainer.offsetTop;
  document.body.style.userSelect = 'none';
});

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  startWidth = sliderContainer.offsetWidth;
  dragOffsetX = e.clientX;
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const newLeft = e.clientX - dragOffsetX;
    const newTop = e.clientY - dragOffsetY;
    sliderContainer.style.left = `${newLeft}px`;
    sliderContainer.style.top = `${newTop}px`;
    sliderContainer.style.bottom = 'auto';
    sliderContainer.style.transform = 'none'; // disable original center transform
  }

  if (isResizing) {
    const newWidth = startWidth + (e.clientX - dragOffsetX);
    const minWidth = 600;
    const maxWidth = window.innerWidth - 40; // give some margin
    sliderContainer.style.minWidth = `${Math.max(minWidth, Math.min(newWidth, maxWidth))}px`;
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
  isResizing = false;
  document.body.style.userSelect = '';
});

//-------------------------------------------------------------------------------------------------------------------////
const map1Layers = [
  "Swat_rivert", "Panjgora_river", "Kabil_medium_flood", "Lower_indus_high_flood",
  "Upper_indus_flood", "cmfex", "khfex", "jlfex", "2_Swat_River_25yr_Flood_Extent",
  "rlfex", "slfex", "Barrages", "KPKDrainage_Density", "P_panjal_Cl", "Sindh",
  "Kirthar", "DG khan", "	Gujranwala",
  "upper_KP", "Lower_KP", "kpk_urban", "urban_punjab",
  "nationalBoundary", "provincialBoundary", "districtBoundary", "districtBoundary_label",
  "DistrictBoundary", "TehsilBoundary", "TehsilBoundaryLine", "tehsilBoundary_label",
  "Union_Council", "DistrictBoundaryHighlight", "TehsilBoundaryHighlight",
  // Terrain/Raster layers
  "Terrain_Jhal_Depth", "Terrain_hyd", "Depth_Max_Terrain_DEM_AJK1",
  // Other important layers that were missing
  "glofas", "gmrc_wapda_stations", "pmd_stations", "damaged_pmd_stations",
  "ffd_point", "ffd_label", "DI_Khan_HT", "DG khan HT", "Pir_Panjal_HT",
  "Mardan_inundation_filter",
  "kech_panjgur_50mm_filter", "kech_panjgur_100mm_filter",
  "munawar_tawi_60mm_filter", "munawar_150mm_filter",
  "Hyderabad_arc", "jhal_magsi_arc_Complete", "KIRTHAR_RANGE", "lihfex", "limfex",
  "lilfex", "uihfex", "uilfex", "chfex", "clfex", "klfex", "jhfex", "jmfex",
  "3_Swat_River_50yr_Flood_Extent", "1_Swat_River_5yr_Flood_Extent", "Muzafferabad_arc",
  "Jamshoro flooding", "rhfex", "rmfex", "shfex", "smfex", "urban_sindh", "indian",
  "Future", "Ready_for_Construction", "Ongoing", "Under_construction", "STREAM_412_5_9",
  "impact_line_layer", "impact_fill_layer", "impact_fill_outline_layer", "impact_point_layer"
];

///Map
mapboxgl.accessToken = 'pk.eyJ1IjoiemVlc2hhbjEwIiwiYSI6ImNtMXN0YXVhbTBhYnIybHNhOHRheHRwOWoifQ.vgmSlaE3lAnZPy59Ni7SkQ';
const map1 = new mapboxgl.Map({
  container: 'map1',
  style: 'mapbox://styles/mapbox/standard',
  center: [69.3451, 30.3753],
  zoom: 5.2,
  projection: 'mercator'
});

// Track custom layers added by this app (map1.js + script.js)
const customLayerRegistry = new Set(Array.isArray(map1Layers) ? map1Layers : []);
let requestLayerReorderUpdate = () => {};

const _addLayer = map1.addLayer.bind(map1);
map1.addLayer = function (layer, beforeId) {
  if (layer && layer.id) {
    customLayerRegistry.add(layer.id);
  }
  return _addLayer(layer, beforeId);
};

const _setLayoutProperty = map1.setLayoutProperty.bind(map1);
map1.setLayoutProperty = function (layerId, prop, value) {
  const result = _setLayoutProperty(layerId, prop, value);
  if (prop === 'visibility') {
    requestLayerReorderUpdate();
  }
  return result;
};

const _setPaintProperty = map1.setPaintProperty.bind(map1);
map1.setPaintProperty = function (layerId, prop, value) {
  const result = _setPaintProperty(layerId, prop, value);
  if (prop && String(prop).includes('opacity')) {
    requestLayerReorderUpdate();
  }
  return result;
};

const layers = [
  'STREAM_412_5_9',
  'STREAM_218_5_9_Pk'
];
const initialOrders = [7, 8, 9];
const fullOrders = [5, 6, 7, 8, 9];
let zoomedOnce = false;
const controlStates = {
  geoglowsForecastControl: false,
};
let pendingCheckboxRestore = false;
let pendingStyleIsSatellite = false;
let pendingBasemapConfig = null;
let pendingLightPreset = 'day';

const IMPACT_METRIC_KEYS = [
  'schools',
  'railway_stations',
  'settlements',
  'hospitals',
  'bridges',
  'airports',
  'population'
];

const IMPACT_METRIC_LABELS = {
  schools: 'Schools',
  railway_stations: 'Railway stations',
  population: 'Total population exposed',
  hospitals: 'Hospitals',
  bridges: 'Bridges',
  airports: 'Airports',
  settlements: 'Settlements'
};

const IMPACT_METRIC_GIFS = {
  schools: 'media/UI/impact_gif/school.gif',
  railway_stations: 'media/UI/impact_gif/railway.gif',
  population: 'media/UI/impact_gif/population.gif',
  hospitals: 'media/UI/impact_gif/hospital.gif',
  bridges: 'media/UI/impact_gif/bridge.gif',
  airports: 'media/UI/impact_gif/airport.gif',
  settlements: 'media/UI/impact_gif/settlement.gif'
};

const IMPACT_SOURCES = {
  line: 'impact_line_source',
  fill: 'impact_fill_source',
  point: 'impact_point_source'
};

const IMPACT_LAYERS = {
  line: 'impact_line_layer',
  fill: 'impact_fill_layer',
  fillOutline: 'impact_fill_outline_layer',
  point: 'impact_point_layer'
};

const IMPACT_HIGHLIGHT_STYLE = {
  selectedOutlineColor: '#111827',
  lineWidthDefault: 4,
  lineWidthSelected: 7,
  lineWidthPulseBoost: 2,
  lineOpacityDefault: 0.9,
  lineOpacitySelected: 0.82,
  lineOpacityPulseBoost: 0.18,
  fillOpacityDefault: 0.35,
  fillOpacitySelected: 0.62,
  fillOpacityPulseBoost: 0.18,
  fillOutlineWidthDefault: 2,
  fillOutlineWidthSelected: 4,
  fillOutlineWidthPulseBoost: 1.4,
  pointRadiusDefault: 6,
  pointRadiusSelected: 10,
  pointRadiusPulseBoost: 2,
  pointStrokeWidthDefault: 1.5,
  pointStrokeWidthSelected: 3,
  pointStrokeWidthPulseBoost: 1,
  pointOpacityDefault: 0.95,
  pointOpacitySelected: 0.78,
  pointOpacityPulseBoost: 0.22,
  breatheDurationMs: 1000,
  breatheTickMs: 80
};

let impactRowsById = new Map();
let impactGeojsonCache = null;
let impactTotals = null;
let impactSelectedDate = '';
let impactSelectedFeatureId = '';
let impactBreatheTimer = null;
let impactBreatheStartedAt = 0;
let impactPopupInstance = null;
let impactPanelOpen = false;
let impactControlsInitialized = false;
let impactLayerEventsBound = false;

function getImpactUiRefs() {
  return {
    openBtn: document.getElementById('impact-open-btn'),
    modal: document.getElementById('impact-date-modal'),
    closeBtn: document.getElementById('impact-modal-close'),
    cancelBtn: document.getElementById('impact-cancel-btn'),
    loadBtn: document.getElementById('impact-load-btn'),
    dateInput: document.getElementById('impact-date-input'),
    status: document.getElementById('impact-modal-status'),
    summaryPanel: document.getElementById('impact-summary-panel'),
    summaryDate: document.getElementById('impact-summary-date'),
    summaryGrid: document.getElementById('impact-summary-grid'),
    summaryClose: document.getElementById('impact-summary-close')
  };
}

function formatImpactNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatImpactDisplayDate(dateValue) {
  if (!dateValue) return '-';

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(dateValue);

  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

function escapeImpactHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseImpactMetric(value) {
  const parsed = Number.parseInt(String(value ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeImpactColor(rawColor) {
  const normalized = String(rawColor ?? '').trim();
  if (!normalized) return '#ef4444';

  if (/^#[0-9A-Fa-f]{3}$/.test(normalized) || /^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized;
  }

  const colorMap = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    yellow: '#f59e0b',
    orange: '#f97316',
    purple: '#a855f7',
    pink: '#ec4899',
    brown: '#92400e',
    teal: '#14b8a6',
    cyan: '#06b6d4',
    gray: '#64748b',
    grey: '#64748b'
  };

  return colorMap[normalized.toLowerCase()] || '#ef4444';
}

function setImpactModalStatus(message, type = 'info') {
  const { status } = getImpactUiRefs();
  if (!status) return;

  status.textContent = message || '';
  status.classList.remove('error', 'success');
  if (type === 'error') status.classList.add('error');
  if (type === 'success') status.classList.add('success');
}

function setImpactModalOpen(isOpen) {
  const { modal } = getImpactUiRefs();
  if (!modal) return;

  modal.classList.toggle('open', Boolean(isOpen));
  modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

function ensureImpactDefaultDate() {
  const { dateInput } = getImpactUiRefs();
  if (!dateInput || dateInput.value) return;

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  dateInput.value = `${now.getFullYear()}-${month}-${day}`;
}

function openImpactModal() {
  ensureImpactDefaultDate();
  setImpactModalStatus('');
  setImpactModalOpen(true);
}

function closeImpactModal() {
  setImpactModalOpen(false);
}

function closeImpactSummaryPanel() {
  const { summaryPanel } = getImpactUiRefs();
  if (!summaryPanel) return;
  summaryPanel.classList.remove('open');
  impactPanelOpen = false;
}

function clearImpactSummaryPanel(message = 'No impact exposure loaded.') {
  const { summaryDate, summaryGrid } = getImpactUiRefs();
  if (summaryDate) {
    summaryDate.textContent = '-';
  }
  if (summaryGrid) {
    summaryGrid.innerHTML = `<div class="impact-summary-empty">${escapeImpactHtml(message)}</div>`;
  }
  closeImpactSummaryPanel();
}

function renderImpactSummaryPanel(totals, dateValue) {
  const { summaryPanel, summaryDate, summaryGrid } = getImpactUiRefs();
  if (!summaryPanel || !summaryDate || !summaryGrid) return;

  summaryDate.textContent = formatImpactDisplayDate(dateValue);
  const cards = IMPACT_METRIC_KEYS.map((key) => {
    const label = IMPACT_METRIC_LABELS[key] || key;
    const iconPath = IMPACT_METRIC_GIFS[key] || '';
    const keyClass = `key-${key.replace(/_/g, '-')}`;
    return `
      <div class="impact-summary-card ${escapeImpactHtml(keyClass)}">
        <div class="impact-summary-card-head">
          <span class="impact-summary-card-icon" aria-hidden="true">
            <img src="${escapeImpactHtml(iconPath)}" alt="" />
          </span>
          <div class="impact-summary-card-label">${escapeImpactHtml(label)}</div>
        </div>
        <div class="impact-summary-card-value">${formatImpactNumber(totals[key] || 0)}</div>
      </div>
    `;
  }).join('');

  summaryGrid.innerHTML = cards;
  summaryPanel.classList.add('open');
  impactPanelOpen = true;
}

function setImpactLoadButtonState(isLoading) {
  const { loadBtn } = getImpactUiRefs();
  if (!loadBtn) return;

  loadBtn.disabled = Boolean(isLoading);
  loadBtn.textContent = isLoading ? 'Loading...' : 'Load Impact';
}

function extractImpactRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizeImpactRows(payload) {
  const rows = extractImpactRows(payload);
  return rows
    .map((row) => {
      const rawId = row?.id ?? row?.ID ?? row?.objectid ?? row?.OBJECTID;
      if (rawId === undefined || rawId === null || rawId === '') return null;
      const id = String(rawId).trim();
      if (!id) return null;

      const normalized = {
        id,
        color: normalizeImpactColor(row?.color),
        schools: parseImpactMetric(row?.schools),
        railway_stations: parseImpactMetric(row?.railway_stations),
        population: parseImpactMetric(row?.population),
        hospitals: parseImpactMetric(row?.hospitals),
        bridges: parseImpactMetric(row?.bridges),
        airports: parseImpactMetric(row?.airports),
        settlements: parseImpactMetric(row?.settlements)
      };

      return normalized;
    })
    .filter(Boolean);
}

function normalizeImpactFeatureCollection(payload) {
  if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return payload;
  }
  if (payload?.data?.type === 'FeatureCollection' && Array.isArray(payload.data.features)) {
    return payload.data;
  }
  if (Array.isArray(payload?.features)) {
    return { type: 'FeatureCollection', features: payload.features };
  }
  return { type: 'FeatureCollection', features: [] };
}

function getImpactJoinId(properties) {
  const idValue = properties?.id ?? properties?.objectid;
  if (idValue === undefined || idValue === null || idValue === '') return '';
  return String(idValue).trim();
}

function joinImpactRowsToFeatures(featureCollection, rowMap) {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

  const joinedFeatures = features
    .map((feature) => {
      const props = feature?.properties || {};
      const joinId = getImpactJoinId(props);
      if (!joinId) return null;

      const row = rowMap.get(joinId);
      if (!row) return null;

      return {
        ...feature,
        properties: {
          ...props,
          impact_id: joinId,
          impact_color: row.color,
          impact_schools: row.schools,
          impact_railway_stations: row.railway_stations,
          impact_population: row.population,
          impact_hospitals: row.hospitals,
          impact_bridges: row.bridges,
          impact_airports: row.airports,
          impact_settlements: row.settlements
        }
      };
    })
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    features: joinedFeatures
  };
}

function splitImpactFeatureCollection(featureCollection) {
  const result = {
    lines: { type: 'FeatureCollection', features: [] },
    fills: { type: 'FeatureCollection', features: [] },
    points: { type: 'FeatureCollection', features: [] }
  };

  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

  features.forEach((feature) => {
    const geomType = feature?.geometry?.type;
    if (!geomType) return;

    if (geomType === 'LineString' || geomType === 'MultiLineString') {
      result.lines.features.push(feature);
      return;
    }

    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      result.fills.features.push(feature);
      return;
    }

    if (geomType === 'Point' || geomType === 'MultiPoint') {
      result.points.features.push(feature);
    }
  });

  return result;
}

function collectImpactCoordinates(node, bucket) {
  if (!Array.isArray(node)) return;

  if (
    node.length >= 2 &&
    typeof node[0] === 'number' &&
    Number.isFinite(node[0]) &&
    typeof node[1] === 'number' &&
    Number.isFinite(node[1])
  ) {
    bucket.push([node[0], node[1]]);
    return;
  }

  node.forEach((child) => collectImpactCoordinates(child, bucket));
}

function zoomToImpactFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return;

  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    map1.flyTo({
      center: geometry.coordinates,
      zoom: Math.max(map1.getZoom(), 10),
      duration: 900
    });
    return;
  }

  const points = [];
  collectImpactCoordinates(geometry.coordinates, points);
  if (!points.length) return;

  const bounds = points.reduce((acc, point) => acc.extend(point), new mapboxgl.LngLatBounds(points[0], points[0]));
  map1.fitBounds(bounds, {
    padding: { top: 80, right: 80, bottom: 80, left: 80 },
    maxZoom: 11,
    duration: 900
  });
}

function buildImpactPopupHtml(properties) {
  const metricRows = IMPACT_METRIC_KEYS
    .map((key) => {
      const label = IMPACT_METRIC_LABELS[key] || key;
      const value = parseImpactMetric(properties?.[`impact_${key}`]);
      const iconPath = IMPACT_METRIC_GIFS[key] || '';
      return `
        <div class="impact-popup-row">
          <span class="impact-popup-label-wrap">
            <img src="${escapeImpactHtml(iconPath)}" alt="" class="impact-popup-icon" />
            <span class="impact-popup-label">${escapeImpactHtml(label)}</span>
          </span>
          <span class="impact-popup-value">${formatImpactNumber(value)}</span>
        </div>
      `;
    })
    .join('');

  return `
    <div class="impact-popup-container">
      <div class="impact-popup-header">
        <div>
          <div class="impact-popup-title">Exposure details</div>
          <div class="impact-popup-subtitle">Exposure indicators</div>
        </div>
      </div>
      <div class="impact-popup-body">
        ${metricRows}
      </div>
    </div>
    <style>
      .impact-popup-container {
        width: 320px;
        border-radius: 14px;
        overflow: hidden;
        border: 2px solid #6366f1;
        background: #ffffff;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.26);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      .impact-popup-header {
        background: linear-gradient(140deg, #eef2ff, #e0ecff);
        padding: 12px 14px;
        border-bottom: 1px solid #c7d2fe;
      }
      .impact-popup-title {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
      }
      .impact-popup-subtitle {
        margin-top: 3px;
        font-size: 12px;
        color: #334155;
      }
      .impact-popup-body {
        padding: 12px 14px 14px;
        display: grid;
        gap: 6px;
      }
      .impact-popup-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border: 1px soli d #dbe4f0;
        border-radius: 8px;
        background: #f8fafc;
        padding: 6px 8px;
      }
      .impact-popup-label-wrap {
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .impact-popup-icon {
        width: 20px;
        height: 20px;
        object-fit: contain;
      }
      .impact-popup-label {
        font-size: 12px;
        color: #334155;
        font-weight: 600;
      }
      .impact-popup-value {
        font-size: 14px;
        color: #0f172a;
        font-weight: 700;
      }
      .mapboxgl-popup-close-button {
        display: none !important;
      }
      .mapboxgl-popup-content {
        padding: 0 !important;
        border-radius: 10px !important;
      }
    </style>
  `;
}

function openImpactPopup(feature, lngLat) {
  if (!feature) return;

  if (impactPopupInstance) {
    impactPopupInstance.remove();
  }

  impactPopupInstance = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true,
    maxWidth: '320px'
  })
    .setLngLat(lngLat)
    .setHTML(buildImpactPopupHtml(feature.properties || {}))
    .addTo(map1);

  impactPopupInstance.on('close', () => {
    stopImpactSelectionBreathe();
    if (impactSelectedFeatureId) {
      setImpactFeatureBreathe(impactSelectedFeatureId, 0);
    }
  });

  if (impactSelectedFeatureId) {
    startImpactSelectionBreathe();
  }
}

function getImpactFeatureId(feature) {
  const rawId = feature?.id ?? feature?.properties?.impact_id;
  if (rawId === undefined || rawId === null || rawId === '') return '';
  return String(rawId).trim();
}

function applyImpactFeatureState(featureId, selected) {
  if (!featureId) return;

  Object.values(IMPACT_SOURCES).forEach((sourceId) => {
    if (!map1.getSource(sourceId)) return;
    map1.setFeatureState(
      { source: sourceId, id: featureId },
      { selected: Boolean(selected) }
    );
  });
}

function setImpactFeatureBreathe(featureId, breatheValue) {
  if (!featureId) return;

  const normalized = Math.max(0, Math.min(1, Number(breatheValue) || 0));
  Object.values(IMPACT_SOURCES).forEach((sourceId) => {
    if (!map1.getSource(sourceId)) return;
    map1.setFeatureState(
      { source: sourceId, id: featureId },
      { breathe: normalized }
    );
  });
}

function getImpactBreatheValue(nowMs = Date.now()) {
  const duration = Math.max(200, Number(IMPACT_HIGHLIGHT_STYLE.breatheDurationMs) || 1000);
  const phase = ((nowMs - impactBreatheStartedAt) % duration) / duration;
  return (Math.sin((phase * Math.PI * 2) - (Math.PI / 2)) + 1) / 2;
}

function stopImpactSelectionBreathe() {
  if (impactBreatheTimer) {
    clearInterval(impactBreatheTimer);
    impactBreatheTimer = null;
  }
}

function startImpactSelectionBreathe() {
  if (!impactSelectedFeatureId) return;

  stopImpactSelectionBreathe();
  impactBreatheStartedAt = Date.now();
  setImpactFeatureBreathe(impactSelectedFeatureId, 0);

  const tickMs = Math.max(50, Number(IMPACT_HIGHLIGHT_STYLE.breatheTickMs) || 80);
  impactBreatheTimer = setInterval(() => {
    if (!impactSelectedFeatureId) {
      stopImpactSelectionBreathe();
      return;
    }
    setImpactFeatureBreathe(impactSelectedFeatureId, getImpactBreatheValue(Date.now()));
  }, tickMs);
}

function setImpactSelectedFeature(featureId) {
  const nextId = String(featureId ?? '').trim();

  if (impactSelectedFeatureId && impactSelectedFeatureId !== nextId) {
    applyImpactFeatureState(impactSelectedFeatureId, false);
    setImpactFeatureBreathe(impactSelectedFeatureId, 0);
  }

  impactSelectedFeatureId = nextId;

  if (impactSelectedFeatureId) {
    applyImpactFeatureState(impactSelectedFeatureId, true);
    setImpactFeatureBreathe(impactSelectedFeatureId, 0);
    return;
  }

  stopImpactSelectionBreathe();
}

function onImpactFeatureClick(e) {
  const feature = e?.features?.[0];
  if (!feature) return;

  const featureId = getImpactFeatureId(feature);
  setImpactSelectedFeature(featureId);

  zoomToImpactFeature(feature);
  openImpactPopup(feature, e.lngLat);
}

function onImpactFeatureMouseEnter() {
  if (map1 && map1.getCanvas()) {
    map1.getCanvas().style.cursor = 'pointer';
  }
}

function onImpactFeatureMouseLeave() {
  if (map1 && map1.getCanvas()) {
    map1.getCanvas().style.cursor = '';
  }
}

function removeImpactLayerEvents() {
  if (!impactLayerEventsBound) return;

  Object.values(IMPACT_LAYERS).forEach((layerId) => {
    if (map1.getLayer(layerId)) {
      map1.off('click', layerId, onImpactFeatureClick);
      map1.off('mouseenter', layerId, onImpactFeatureMouseEnter);
      map1.off('mouseleave', layerId, onImpactFeatureMouseLeave);
    }
  });

  impactLayerEventsBound = false;
}

function bindImpactLayerEvents() {
  removeImpactLayerEvents();

  Object.values(IMPACT_LAYERS).forEach((layerId) => {
    if (map1.getLayer(layerId)) {
      map1.on('click', layerId, onImpactFeatureClick);
      map1.on('mouseenter', layerId, onImpactFeatureMouseEnter);
      map1.on('mouseleave', layerId, onImpactFeatureMouseLeave);
    }
  });

  impactLayerEventsBound = true;
}

function removeImpactVisuals(keepCache = false) {
  stopImpactSelectionBreathe();
  removeImpactLayerEvents();

  Object.values(IMPACT_LAYERS).forEach((layerId) => {
    if (map1.getLayer(layerId)) {
      map1.removeLayer(layerId);
    }
  });

  Object.values(IMPACT_SOURCES).forEach((sourceId) => {
    if (map1.getSource(sourceId)) {
      map1.removeSource(sourceId);
    }
  });

  if (impactPopupInstance) {
    impactPopupInstance.remove();
    impactPopupInstance = null;
  }

  if (!keepCache) {
    impactGeojsonCache = null;
    impactRowsById = new Map();
    impactTotals = null;
    impactSelectedDate = '';
    impactSelectedFeatureId = '';
  }
}

function upsertImpactSource(sourceId, data) {
  if (map1.getSource(sourceId)) {
    map1.getSource(sourceId).setData(data);
    return;
  }
  map1.addSource(sourceId, {
    type: 'geojson',
    data,
    promoteId: 'impact_id'
  });
}

function renderImpactFeatures(featureCollection) {
  removeImpactVisuals(true);

  const split = splitImpactFeatureCollection(featureCollection);
  impactGeojsonCache = featureCollection;

  if (split.lines.features.length) {
    upsertImpactSource(IMPACT_SOURCES.line, split.lines);
    map1.addLayer({
      id: IMPACT_LAYERS.line,
      type: 'line',
      source: IMPACT_SOURCES.line,
      paint: {
        'line-color': ['coalesce', ['get', 'impact_color'], '#ef4444'],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.lineWidthSelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.lineWidthPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.lineWidthDefault
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.lineOpacitySelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.lineOpacityPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.lineOpacityDefault
        ]
      }
    });
  }

  if (split.fills.features.length) {
    upsertImpactSource(IMPACT_SOURCES.fill, split.fills);
    map1.addLayer({
      id: IMPACT_LAYERS.fill,
      type: 'fill',
      source: IMPACT_SOURCES.fill,
      paint: {
        'fill-color': ['coalesce', ['get', 'impact_color'], '#ef4444'],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.fillOpacitySelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.fillOpacityPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.fillOpacityDefault
        ]
      }
    });
    map1.addLayer({
      id: IMPACT_LAYERS.fillOutline,
      type: 'line',
      source: IMPACT_SOURCES.fill,
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          IMPACT_HIGHLIGHT_STYLE.selectedOutlineColor,
          ['coalesce', ['get', 'impact_color'], '#ef4444']
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.fillOutlineWidthSelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.fillOutlineWidthPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.fillOutlineWidthDefault
        ],
        'line-opacity': 0.95
      }
    });
  }

  if (split.points.features.length) {
    upsertImpactSource(IMPACT_SOURCES.point, split.points);
    map1.addLayer({
      id: IMPACT_LAYERS.point,
      type: 'circle',
      source: IMPACT_SOURCES.point,
      paint: {
        'circle-color': ['coalesce', ['get', 'impact_color'], '#ef4444'],
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.pointRadiusSelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.pointRadiusPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.pointRadiusDefault
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          IMPACT_HIGHLIGHT_STYLE.selectedOutlineColor,
          '#ffffff'
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.pointStrokeWidthSelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.pointStrokeWidthPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.pointStrokeWidthDefault
        ],
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          [
            '+',
            IMPACT_HIGHLIGHT_STYLE.pointOpacitySelected,
            [
              '*',
              ['coalesce', ['feature-state', 'breathe'], 0],
              IMPACT_HIGHLIGHT_STYLE.pointOpacityPulseBoost
            ]
          ],
          IMPACT_HIGHLIGHT_STYLE.pointOpacityDefault
        ]
      }
    });
  }

  bindImpactLayerEvents();

  if (impactSelectedFeatureId) {
    setImpactSelectedFeature(impactSelectedFeatureId);
    if (impactPopupInstance) {
      startImpactSelectionBreathe();
    }
  }
}

function calculateImpactTotals(rows) {
  const totals = {
    schools: 0,
    railway_stations: 0,
    population: 0,
    hospitals: 0,
    bridges: 0,
    airports: 0,
    settlements: 0
  };

  rows.forEach((row) => {
    IMPACT_METRIC_KEYS.forEach((key) => {
      totals[key] += parseImpactMetric(row[key]);
    });
  });

  return totals;
}

async function loadImpactForDate(dateValue) {
  if (!dateValue) {
    setImpactModalStatus('Please select a date first.', 'error');
    return;
  }

  setImpactLoadButtonState(true);
  setImpactModalStatus('Loading impact rows...', 'info');

  try {
    const impactResponse = await fetch(`http://172.18.1.45:5009/api/impact?date=${encodeURIComponent(dateValue)}`, {
      cache: 'no-store'
    });
    if (!impactResponse.ok) {
      throw new Error(`Impact API request failed (${impactResponse.status})`);
    }

    const impactPayload = await impactResponse.json();
    const normalizedRows = normalizeImpactRows(impactPayload);
    impactRowsById = new Map(normalizedRows.map((row) => [row.id, row]));

    if (!normalizedRows.length) {
      removeImpactVisuals(false);
      clearImpactSummaryPanel('No impact rows found for selected date.');
      setImpactModalStatus('No data available for selected date.', 'error');
      return;
    }

    setImpactModalStatus('Loading impact geometry...', 'info');

    const ids = Array.from(impactRowsById.keys());
    const geometryResponse = await fetch(`http://172.18.1.45:5009/api/gis/gloric?ids=${encodeURIComponent(ids.join(','))}`, {
      cache: 'no-store'
    });
    if (!geometryResponse.ok) {
      throw new Error(`Geometry API request failed (${geometryResponse.status})`);
    }

    const geometryPayload = await geometryResponse.json();
    const sourceFeatureCollection = normalizeImpactFeatureCollection(geometryPayload);
    const joinedFeatureCollection = joinImpactRowsToFeatures(sourceFeatureCollection, impactRowsById);

    if (!joinedFeatureCollection.features.length) {
      removeImpactVisuals(false);
      clearImpactSummaryPanel('No matching impact features were returned.');
      setImpactModalStatus('No matching map features for selected date.', 'error');
      return;
    }

    impactSelectedDate = dateValue;
    impactTotals = calculateImpactTotals(normalizedRows);
    setImpactSelectedFeature('');
    renderImpactFeatures(joinedFeatureCollection);
    renderImpactSummaryPanel(impactTotals, impactSelectedDate);

    setImpactModalStatus(
      `Loaded ${joinedFeatureCollection.features.length} features for ${impactSelectedDate}.`,
      'success'
    );
    closeImpactModal();
  } catch (error) {
    console.error('Impact workflow failed:', error);
    removeImpactVisuals(false);
    clearImpactSummaryPanel('Unable to load impact data.');
    setImpactModalStatus(error?.message || 'Failed to load impact data.', 'error');
  } finally {
    setImpactLoadButtonState(false);
  }
}

function restoreImpactOnStyleLoad() {
  if (!impactGeojsonCache || !Array.isArray(impactGeojsonCache.features) || !impactGeojsonCache.features.length) {
    return;
  }

  renderImpactFeatures(impactGeojsonCache);
  if (impactPanelOpen && impactTotals) {
    renderImpactSummaryPanel(impactTotals, impactSelectedDate);
  }
}

function initImpactControls() {
  if (impactControlsInitialized) return;

  const refs = getImpactUiRefs();
  if (!refs.openBtn || !refs.modal || !refs.loadBtn || !refs.dateInput) return;

  impactControlsInitialized = true;
  ensureImpactDefaultDate();
  clearImpactSummaryPanel();

  refs.openBtn.addEventListener('click', openImpactModal);
  refs.closeBtn?.addEventListener('click', closeImpactModal);
  refs.cancelBtn?.addEventListener('click', closeImpactModal);
  refs.summaryClose?.addEventListener('click', closeImpactSummaryPanel);

  refs.modal.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.impactClose === 'true') {
      closeImpactModal();
    }
  });

  refs.loadBtn.addEventListener('click', () => {
    loadImpactForDate(refs.dateInput.value);
  });

  refs.dateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadImpactForDate(refs.dateInput.value);
    }
  });
}

document.addEventListener('DOMContentLoaded', initImpactControls);

function getKarachiHour() {
  try {
    const hourString = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      hour12: false
    }).format(new Date());
    const hour = Number.parseInt(hourString, 10);
    return Number.isNaN(hour) ? null : hour;
  } catch (error) {
    console.warn('Failed to read Karachi time:', error);
    return null;
  }
}

function getKarachiLightPreset() {
  const hour = getKarachiHour();
  if (hour === null) return 'day';

  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

function refreshKarachiLightPreset(map) {
  const nextPreset = getKarachiLightPreset();
  pendingLightPreset = nextPreset;
  applyBasemapConfig(map, { lightPreset: nextPreset });
}

function applyBasemapConfig(map, config) {
  if (!map || typeof map.setConfigProperty !== 'function' || !config) return;

  if (config.theme) {
    try {
      map.setConfigProperty('basemap', 'theme', config.theme);
    } catch (error) {
      console.warn('Failed to apply basemap theme:', error);
    }
  }

  if (config.lightPreset) {
    try {
      map.setConfigProperty('basemap', 'lightPreset', config.lightPreset);
    } catch (error) {
      console.warn('Failed to apply basemap light preset:', error);
    }
  }
}

function applyPendingBasemapConfig(map) {
  const nextConfig = pendingBasemapConfig ? { ...pendingBasemapConfig } : {};
  if (pendingLightPreset && !nextConfig.lightPreset) {
    nextConfig.lightPreset = pendingLightPreset;
  }
  if (Object.keys(nextConfig).length === 0) return;

  applyBasemapConfig(map, nextConfig);
  pendingBasemapConfig = null;
}

// // Global variable to store FFD data to avoid re-fetching on basemap changes
// let ffdGeojsonData = null;

// //----------------------------------------------------------------LAYERS---------------------------------------------------------------------// 
// function addHydrometLayersToMap(map) {
//   if (map._hydrometLayersAdded) {
//   return;
// }
// map._hydrometLayersAdded = true;

// // Global variables
// let lastUpdateTime = null;

// // FFD API code - Function to fetch FFD data
// const fetchFFDData = async () => {
//   console.log('Fetching FFD data from API');

//   // Add timeout to fetch request for better reliability
//   const controller = new AbortController();
//   const timeoutId = setTimeout(() => controller.abort(), 100000); // 10 second timeout

//   try {
//     // Simple fetch without any custom headers to avoid CORS issues
//     const response = await fetch(`http://172.18.7.21/get-ffd-waterlevels/?_t=${Date.now()}`, {
//       signal: controller.signal,
//       method: 'GET'
//     });
//     clearTimeout(timeoutId);

//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const geojson = await response.json();

//     // Normalize status to Title Case and process the data
//     geojson.features.forEach(feature => {
//       const inflow = feature.properties.inflow_discharge;

//       // Keep original status intact; add a normalized uppercase key for styling/logic
//       const rawStatus = String(feature.properties.status || '').trim();
//       feature.properties.status_upper = rawStatus.toUpperCase().replace(/\s+/g, '_'); 
//       // -> "EX_HIGH", "VERY_HIGH", "NORMAL", etc.

//       // Classify inflow
//       let inflowClass = 'LOW';
//       if (typeof inflow === 'number') {
//         if (inflow > 100000) inflowClass = 'HIGH';
//         else if (inflow > 30000) inflowClass = 'MEDIUM';
//       }
//       feature.properties.inflow_class = inflowClass;
//     });

//     return geojson;
//   } catch (error) {
//     clearTimeout(timeoutId);
//     if (error.name === 'AbortError') {
//       console.error('FFD fetch timed out after 10 seconds');
//       throw new Error('FFD data fetch timed out');
//     } else {
//       console.error('FFD fetch failed:', error);
//       throw error;
//     }
//   }
// };

// // Function to update FFD data
// const updateFFDData = async (showNotification = false) => {
//   try {
//     console.log('Updating FFD data...');

//     // Fetch fresh data
//     const newGeojson = await fetchFFDData();

//     // Update the cached data
//     ffdGeojsonData = newGeojson;
//     lastUpdateTime = new Date();

//     // Update the map source if it exists
//     if (map1.getSource('ffd')) {
//       map1.getSource('ffd').setData(newGeojson);
//       console.log('FFD data updated successfully at', lastUpdateTime.toLocaleTimeString());

//       // Optional: Show a brief notification to user
//       if (showNotification) {
//         showUpdateNotification('FFD data updated successfully');
//       }
//     }

//   } catch (error) {
//     console.error('Failed to update FFD data:', error);
//     // Optional: Show error notification
//     if (showNotification) {
//       showUpdateNotification('Failed to update FFD data', 'error');
//     }
//   }
// };

// // Function to show update notifications (optional)
// const showUpdateNotification = (message, type = 'success') => {
//   // Create a temporary notification element
//   const notification = document.createElement('div');
//   notification.style.cssText = `
//     position: fixed;
//     top: 20px;
//     right: 20px;
//     padding: 12px 20px;
//     background: ${type === 'error' ? '#dc3545' : '#28a745'};
//     color: white;
//     border-radius: 6px;
//     font-size: 14px;
//     font-weight: 500;
//     z-index: 10000;
//     box-shadow: 0 4px 12px rgba(0,0,0,0.15);
//     opacity: 0;
//     transition: opacity 0.3s ease;
//   `;
//   notification.textContent = message;

//   document.body.appendChild(notification);

//   // Fade in
//   setTimeout(() => {
//     notification.style.opacity = '1';
//   }, 100);

//   // Remove after 3 seconds
//   setTimeout(() => {
//     notification.style.opacity = '0';
//     setTimeout(() => {
//       document.body.removeChild(notification);
//     }, 300);
//   }, 3000);
// };

// //FFD API code - Function to add FFD layers
// const addFFDLayers = async () => {
//   try {
//     // Check if source already exists to prevent duplicates
//     if (map1.getSource('ffd')) {
//       return;
//     }

//     // Fetch initial data
//     const geojson = await fetchFFDData();

//     // Cache the processed data
//     ffdGeojsonData = geojson;
//     lastUpdateTime = new Date();

//     // Add GeoJSON source
//     map1.addSource('ffd', {
//       type: 'geojson',
//       data: geojson
//     });

//     // Check current checkbox state
//     const ffdCheckbox = document.getElementById('ffd');
//     const initialVisibility = (ffdCheckbox && ffdCheckbox.checked) ? 'visible' : 'none';

//     // Add circle layer
//     map1.addLayer({
//       id: 'ffd_point',
//       type: 'circle',
//       source: 'ffd',
//       layout: {
//         'visibility': initialVisibility
//       },
//       paint: {
//        'circle-color': [
//     'match',
//     ['get', 'status'],
//     'Normal', '#28a745',           // Green - Normal Flow
//     'NORMAL', '#28a745',           // Green - Normal Flow
//     'Low', '#00FFFF',             // Teal - Low Flood  
//     'LOW', '#00FFFF',             // Teal - Low Flood
//     'Medium', '#0000FF',          // Blue - Medium Flood
//     'MEDIUM', '#0000FF',          // Blue - Medium Flood
//     'High', '#fd7e14',            // Orange - High Flood
//     'HIGH', '#fd7e14',            // Orange - High Flood
//     'Very High', '#7B3F00',       // Purple/Dark Red - Very High Flood
//     'VERY_HIGH', '#7B3F00',       // Purple/Dark Red - Very High Flood
//     'Exceptionally High', '#ff0000', // Red - Exceptionally High Flood
//     'EX_HIGH', '#ff0000',         // Red - Exceptionally High Flood
//     '#999999'                     // Default gray
//   ],
//         'circle-radius': 7,
//         'circle-opacity': 1,
//         'circle-stroke-color': '#fff',
//         'circle-stroke-width': 2
//       }
//     });

//     // Add label layer
//     map1.addLayer({
//       id: 'ffd_label',
//       type: 'symbol',
//       source: 'ffd',
//       layout: {
//         'visibility': initialVisibility,
//         'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'outflow_discharge']]],
//         'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
//         'text-size': 12,
//         'text-offset': [0, 1.5],     // Positive Y moves label downward
//         'text-anchor': 'top'    
//       },
//       paint: {
//         'text-color': '#ffffff',
//         'text-halo-color': '#000000',
//         'text-halo-width': 1
//       }
//     });

//     // Add popup on click (keeping your existing popup code)
//     // Enhanced FFD popup click handler with professional styling and N/A units fix
//     map1.on('click', 'ffd_point', (e) => {
//         const props = e.features[0].properties;

//         // Format the From and Lag Hours information
//         let fromAndLagHTML = '';
//         if (props.from && props.lag_hours) {
//             try {
//                 // Handle both string arrays and actual arrays
//                 let fromArray = Array.isArray(props.from) ? props.from : JSON.parse(props.from);
//                 let lagArray = Array.isArray(props.lag_hours) ? props.lag_hours : JSON.parse(props.lag_hours);

//                 if (fromArray.length > 0 && lagArray.length > 0) {
//                     fromAndLagHTML = `
//                         <div class="upstream-section">
//                             <h4 class="section-title">
//                                 <i class="fas fa-arrow-up"></i> Upstream Stations
//                             </h4>
//                             <div class="upstream-list">`;

//                     for (let i = 0; i < fromArray.length; i++) {
//                         const lagTime = lagArray[i] ? `${lagArray[i]} hours` : 'N/A';
//                         fromAndLagHTML += `
//                             <div class="upstream-item">
//                                 <span class="station-name"><strong>${fromArray[i]}</strong></span>
//                                 <span class="lag-time"><strong>Lag: ${lagTime}</strong></span>
//                             </div>`;
//                     }

//                     fromAndLagHTML += `</div></div>`;
//                 }
//             } catch (error) {
//                 console.warn('Error parsing from/lag_hours:', error);
//                 if (props.from && props.from.length > 0) {
//                     fromAndLagHTML = `
//                         <div class="upstream-section">
//                             <h4 class="section-title">
//                                 <i class="fas fa-arrow-up"></i> Upstream Stations
//                             </h4>
//                             <div class="upstream-simple">
//                                 <div class="upstream-item">
//                                     <span class="station-name"><strong>${props.from}</strong></span>
//                                     ${props.lag_hours ? `<span class="lag-time"><strong>Lag: ${props.lag_hours} hours</strong></span>` : ''}
//                                 </div>
//                             </div>
//                         </div>`;
//                 }
//             }
//         }

//         // Get status color for consistent theming
//         const statusColor = getStatusColor(props.status);

//         // Add last update time to popup
//         const lastUpdateInfo = lastUpdateTime ? 
//             `<div class="update-info">
//                 <i class="fas fa-sync-alt"></i>
//                 Last updated: ${lastUpdateTime.toLocaleTimeString()}
//             </div>` : '';

//         // Format discharge values with proper units and highlighting - NO UNITS FOR N/A
//         const formatDischarge = (value, label, isInflow = false) => {
//             if (!value || value === 'N/A' || (typeof value === 'string' && value.toLowerCase() === 'n/a') || (typeof value === 'string' && value.trim() === '')) {
//                 return `
//                     <div class="discharge-item">
//                         <span class="discharge-label">${label}:</span>
//                         <span class="discharge-value no-data">N/A</span>
//                     </div>`;
//             }

//             // Parse numeric value for formatting
//             const numericValue = parseFloat(value);
//             const formattedValue = !isNaN(numericValue) ? numericValue.toLocaleString() : value;

//             return `
//                 <div class="discharge-item">
//                     <span class="discharge-label">${label}:</span>
//                     <span class="discharge-value ${isInflow ? 'inflow-highlight' : 'outflow-bold'}">
//                         ${formattedValue} ft³/s
//                     </span>
//                 </div>`;
//         };

//         // Format trend with icons - NO UNITS FOR N/A
//         const formatTrend = (trend, label) => {
//             if (!trend || trend === 'N/A' || (typeof trend === 'string' && trend.toLowerCase() === 'n/a') || (typeof trend === 'string' && trend.trim() === '')) {
//                 return `
//                     <div class="trend-item trend-unknown">
//                         <span class="trend-label">${label}:</span>
//                         <span class="trend-value">
//                             <i class="fas fa-question-circle"></i> N/A
//                         </span>
//                     </div>`;
//             }

//             let trendIcon = '';
//             let trendClass = '';

//             switch(String(trend).toLowerCase()) {
//                 case 'rising':
//                 case 'increasing':
//                     trendIcon = '<i class="fas fa-arrow-up trend-rising"></i>';
//                     trendClass = 'trend-rising';
//                     break;
//                 case 'falling':
//                 case 'decreasing':
//                     trendIcon = '<i class="fas fa-arrow-down trend-falling"></i>';
//                     trendClass = 'trend-falling';
//                     break;
//                 case 'stable':
//                 case 'steady':
//                     trendIcon = '<i class="fas fa-minus trend-stable"></i>';
//                     trendClass = 'trend-stable';
//                     break;
//                 default:
//                     trendIcon = '<i class="fas fa-question-circle"></i>';
//                     trendClass = 'trend-unknown';
//             }

//             return `
//                 <div class="trend-item ${trendClass}">
//                     <span class="trend-label">${label}:</span>
//                     <span class="trend-value">
//                         ${trendIcon} ${trend}
//                     </span>
//                 </div>`;
//         };

//         const popupHTML = `
//             <div class="ffd-popup-container">
//                 <!-- Header Section -->
//                 <div class="popup-header" style="border-left: 4px solid ${statusColor};">
//                     <div class="station-info">
//                         <h3 class="station-name">${props.name || 'Unknown Station'}</h3>
//                         <div class="status-badge" style="background-color: ${statusColor};">
//                             <i class="fas fa-water"></i>
//                             ${props.status || 'Unknown'}
//                         </div>
//                     </div>
//                 </div>

//                 <!-- Main Content -->
//                 <div class="popup-content">
//                     <!-- Discharge Information -->
//                     <div class="discharge-section">
//                         <div class="discharge-grid">
//                             ${formatDischarge(props.inflow_discharge, 'Inflow', true)}
//                             ${formatDischarge(props.outflow_discharge, 'Outflow', false)}
//                         </div>
//                     </div>

//                     <!-- Trend Information -->
//                     ${(props.inflow_trend || props.outflow_trend) ? `
//                         <div class="trend-section">
//                             <div class="trend-grid">
//                                 ${formatTrend(props.inflow_trend, 'Inflow Trend')}
//                                 ${formatTrend(props.outflow_trend, 'Outflow Trend')}
//                             </div>
//                         </div>
//                     ` : ''}

//                     <!-- Timestamp -->
//                     <div class="timestamp-section">
//                         <div class="timestamp-item">
//                             <i class="fas fa-clock"></i>
//                             <span class="timestamp-value">${props.recording_time || 'Unknown'}</span>
//                         </div>
//                     </div>

//                     <!-- Last Update Info -->
//                     ${lastUpdateInfo}

//                     <!-- Upstream Stations -->
//                     ${fromAndLagHTML}
//                 </div>
//             </div>

//             <style>
//                 .ffd-popup-container {
//                     font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//                     width: 280px;
//                     background: #ffffff;
//                     border-radius: 12px;
//                     box-shadow: 
//                         0 8px 32px rgba(0, 0, 0, 0.12),
//                         0 2px 8px rgba(0, 0, 0, 0.08);
//                     overflow: hidden;
//                     border: 2px solid #2196f3;
//                     position: relative;
//                 }

//                 .popup-header {
//                     background: #f8f9fa;
//                     padding: 8px 12px;
//                     border-bottom: 2px solid #e3f2fd;
//                 }

//                 .station-info {
//                     display: flex;
//                     justify-content: space-between;
//                     align-items: center;
//                     gap: 12px;
//                 }

//                 .station-name {
//                     font-size: 16px;
//                     font-weight: 700;
//                     color: #1a1a1a;
//                     margin: 0;
//                     line-height: 1.2;
//                     flex: 1;
//                 }

//                 .status-badge {
//                     color: white;
//                     padding: 4px 8px;
//                     border-radius: 16px;
//                     font-size: 11px;
//                     font-weight: 600;
//                     text-transform: uppercase;
//                     letter-spacing: 0.3px;
//                     display: flex;
//                     align-items: center;
//                     gap: 3px;
//                     box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
//                     white-space: nowrap;
//                 }

//                 .popup-content {
//                     padding: 8px 12px 12px;
//                 }

//                 .section-title {
//                     font-size: 12px;
//                     font-weight: 600;
//                     color: #495057;
//                     margin: 0 0 8px 0;
//                     display: flex;
//                     align-items: center;
//                     gap: 6px;
//                     text-transform: uppercase;
//                     letter-spacing: 0.3px;
//                 }

//                 .section-title i {
//                     color: #6c757d;
//                     font-size: 10px;
//                 }

//                 .discharge-section, .trend-section {
//                     margin-bottom: 8px;
//                 }

//                 .discharge-grid, .trend-grid {
//                     display: flex;
//                     flex-direction: column;
//                     gap: 4px;
//                 }

//                 .discharge-item, .trend-item {
//                     display: flex;
//                     justify-content: space-between;
//                     align-items: center;
//                     padding: 4px 8px;
//                     background: #f8f9fa;
//                     border-radius: 6px;
//                     border: 1px solid #e3f2fd;
//                     box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
//                 }

//                 .discharge-label, .trend-label {
//                     font-size: 13px;
//                     font-weight: 500;
//                     color: #495057;
//                 }

//                 .discharge-value {
//                     font-size: 14px;
//                     font-weight: 700;
//                     color: #212529;
//                 }

//                 .discharge-value.no-data {
//                     color: #6c757d;
//                     font-style: italic;
//                     font-weight: 500;
//                 }

//                 .inflow-highlight {
//                     color: #007bff !important;
//                     font-weight: 800 !important;
//                     font-size: 15px !important;
//                 }

//                 .outflow-bold {
//                     font-weight: 800 !important;
//                     font-size: 14px !important;
//                 }

//                 .trend-value {
//                     display: flex;
//                     align-items: center;
//                     gap: 4px;
//                     font-size: 12px;
//                     font-weight: 500;
//                 }

//                 .trend-rising {
//                     color: #dc3545;
//                 }

//                 .trend-falling {
//                     color: #28a745;
//                 }

//                 .trend-stable {
//                     color: #6c757d;
//                 }

//                 .trend-unknown {
//                     color: #ffc107;
//                 }

//                 .timestamp-section {
//                     padding-top: 10px;
//                     border-top: 1px solid #e0e0e0;
//                 }

//                 .timestamp-item {
//                     display: flex;
//                     align-items: center;
//                     gap: 6px;
//                     font-size: 12px;
//                     color: #6c757d;
//                     justify-content: center;
//                 }

//                 .timestamp-item i {
//                     color: #adb5bd;
//                     font-size: 11px;
//                 }

//                 .timestamp-value {
//                     font-weight: 500;
//                     color: #495057;
//                 }

//                 .update-info {
//                     display: flex;
//                     align-items: center;
//                     gap: 6px;
//                     font-size: 11px;
//                     color: #6c757d;
//                     justify-content: center;
//                     margin-top: 8px;
//                     padding-top: 8px;
//                     border-top: 1px solid #f0f0f0;
//                 }

//                 .update-info i {
//                     color: #28a745;
//                     font-size: 10px;
//                 }

//                 .upstream-section {
//                     margin-top: 10px;
//                     padding-top: 10px;
//                     border-top: 1px solid #e0e0e0;
//                 }

//                 .upstream-list, .upstream-simple {
//                     display: flex;
//                     flex-direction: column;
//                     gap: 6px;
//                 }

//                 .upstream-item {
//                     display: flex;
//                     justify-content: space-between;
//                     align-items: center;
//                     padding: 6px 10px;
//                     background: #f8f9fa;
//                     border-radius: 6px;
//                     border: 1px solid #e9ecef;
//                 }

//                 .upstream-item .station-name {
//                     font-size: 12px;
//                     font-weight: 600;
//                     color: #495057;
//                     flex: 1;
//                     margin: 0;
//                 }

//                 .lag-time {
//                     font-size: 11px;
//                     color: #495057;
//                     background: #e3f2fd;
//                     padding: 2px 6px;
//                     border-radius: 10px;
//                     font-weight: 600;
//                     border: 1px solid #bbdefb;
//                 }

//                 /* Hide default close button */
//                 .mapboxgl-popup-close-button {
//                     display: none !important;
//                 }

//                 .mapboxgl-popup-content {
//                     padding: 0 !important;
//                     border-radius: 8px !important;
//                 }

//                 .mapboxgl-popup-tip {
//                     border-top-color: #ffffff !important;
//                 }
//             </style>
//         `;

//         // Show popup with enhanced styling
//         new mapboxgl.Popup({
//             closeButton: false,
//             closeOnClick: true,
//             maxWidth: '300px',
//             className: 'ffd-enhanced-popup'
//         })
//             .setLngLat(e.lngLat)
//             .setHTML(popupHTML)
//             .addTo(map1);

//         // Check if this is one of our special dams and show fluid meter with reservoir level
//         const damData = {
//             'Mangla Dam': { percentage: fillPercentage_Mangla, level: val_Mangla },
//             'Chashma': { percentage: fillPercentage_Chashma, level: val_Chashma },
//             'Tarbela Dam': { percentage: fillPercentage_Tarbela, level: val_Tarbela }
//         };

//         if (damData.hasOwnProperty(props.name)) {
//             const dam = damData[props.name];
//             showDamFluidMeter(props.name, dam.percentage, dam.level);
//         }
//     });

//     // Helper function to get status color (keeping your existing function)
//     function getStatusColor(status) {
//         const normalizedStatus = status ? status.toUpperCase() : '';

//         switch(normalizedStatus) {
//             case 'NORMAL': 
//                 return '#28a745';  // Green - Normal Flow
//             case 'LOW': 
//                 return '#00FFFF';  // Teal - Low Flood
//             case 'MEDIUM': 
//                 return '#0000FF';  // Blue - Medium Flood
//             case 'HIGH': 
//                 return '#fd7e14';  // Orange - High Flood
//             case 'VERY_HIGH': 
//             case 'VERY HIGH':
//                 return '#7B3F00';  // Purple/Dark Red - Very High Flood
//             case 'EX_HIGH':
//             case 'EXCEPTIONALLY_HIGH':
//             case 'EXCEPTIONALLY HIGH': 
//                 return '#ff0000';  // Red - Exceptionally High Flood
//             default: 
//                 return '#999999';  // Default gray
//         }
//     }

//     // Change cursor to pointer on hover
//     map1.on('mouseenter', 'ffd_point', () => {
//       map1.getCanvas().style.cursor = 'pointer';
//     });

//     map1.on('mouseleave', 'ffd_point', () => {
//       map1.getCanvas().style.cursor = '';
//     });

//   } catch (error) {
//     console.error('Failed to load FFD data:', error);
//   }
// };

// // Add FFD layers when map is loaded or if already loaded
// if (map1.isStyleLoaded()) {
//   addFFDLayers();
// } else {
//   map1.on('load', addFFDLayers);
// }

// // Toggle visibility based on checkbox (only add listener once)
// if (!document.getElementById("ffd")._ffdListenerAdded) {
//   document.getElementById("ffd").addEventListener("change", function () {
//     const isVisible = this.checked;

//     // Function to apply visibility once layers are available
//     const applyFFDVisibility = () => {
//       // Toggle FFD point layer
//       if (map1.getLayer("ffd_point")) {
//         map1.setLayoutProperty("ffd_point", "visibility", isVisible ? "visible" : "none");
//       }

//       // Toggle FFD label layer
//       if (map1.getLayer("ffd_label")) {
//         map1.setLayoutProperty("ffd_label", "visibility", isVisible ? "visible" : "none");
//       }
//     };

//     // If layers exist, apply immediately
//     if (map1.getLayer("ffd_point") && map1.getLayer("ffd_label")) {
//       applyFFDVisibility();
//     } else {
//       // If layers don't exist yet, wait for them to be added
//       const checkForLayers = () => {
//         if (map1.getLayer("ffd_point") && map1.getLayer("ffd_label")) {
//           applyFFDVisibility();
//         } else {
//           // Check again in 100ms
//           setTimeout(checkForLayers, 100);
//         }
//       };
//       checkForLayers();
//     }
//   });
//   document.getElementById("ffd")._ffdListenerAdded = true;
// }

// // Add refresh button as a separate control next to FFD label
// const addRefreshButtonToFFDLabel = () => {
//   // Wait for the FFD label to exist
//   const checkForFFDLabel = () => {
//     const ffdLabel = document.querySelector('label[for="ffd"]').closest('.flex');
//     if (ffdLabel) {
//       // Check if refresh button already exists
//       if (document.querySelector('.ffd-refresh-btn')) {
//         return;
//       }

//       // Create refresh button as a separate element
//       const refreshButton = document.createElement('button');
//       refreshButton.className = 'ffd-refresh-btn';
//       refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
//       refreshButton.style.cssText = `
//         background: transparent;
//         border: none;
//         color: #9ca3af;
//         cursor: pointer;
//         padding: 6px;
//         border-radius: 4px;
//         font-size: 12px;
//         transition: all 0.2s ease;
//         display: flex;
//         align-items: center;
//         justify-content: center;
//         width: 24px;
//         height: 24px;
//         margin-left: 8px;
//         z-index: 1000000;
//       `;

//       // Add hover effects
//       refreshButton.addEventListener('mouseenter', () => {
//         refreshButton.style.color = '#ffffff';
//         refreshButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
//       });

//       refreshButton.addEventListener('mouseleave', () => {
//         refreshButton.style.color = '#9ca3af';
//         refreshButton.style.backgroundColor = 'transparent';
//       });

//       // Add click handler with proper event handling
//       refreshButton.addEventListener('click', async (e) => {
//         e.preventDefault();
//         e.stopPropagation();

//         // Show loading state
//         const icon = refreshButton.querySelector('i');
//         const originalClass = icon.className;
//         icon.className = 'fas fa-spinner fa-spin';
//         refreshButton.disabled = true;
//         refreshButton.style.opacity = '0.7';

//         try {
//           await updateFFDData(true);
//         } finally {
//           // Reset button state
//           icon.className = originalClass;
//           refreshButton.disabled = false;
//           refreshButton.style.opacity = '1';
//         }
//       });

//       // Insert the refresh button after the FFD label (as a sibling, not child)
//       ffdLabel.parentNode.insertBefore(refreshButton, ffdLabel.nextSibling);

//       console.log('FFD refresh button added successfully');
//     } else {
//       // Try again in 100ms if label not found
//       setTimeout(checkForFFDLabel, 100);
//     }
//   };

//   checkForFFDLabel();
// };

// // Add the refresh button to FFD label
// addRefreshButtonToFFDLabel();

// // Expose functions globally for debugging/manual control
// window.updateFFDData = updateFFDData;





////Workaround FFD code is here
// Global variable to store FFD data to avoid re-fetching on basemap changes
let ffdGeojsonData = null;

// Flood routing map for lag times
const FLOOD_ROUTING_MAP = {
  // Indus
  "Skardu": { "from": [], "lag": [] },
  "Partab Bridge (Bunji)": { "from": ["Skardu"], "lag": [12] },
  "Besham ": { "from": ["Partab Bridge (Bunji)"], "lag": [19] },
  "Tarbela Dam": { "from": ["Besham "], "lag": [6] },
  "Kalabagh": { "from": ["Tarbela Dam"], "lag": [26] },
  "Chashma": { "from": ["Kalabagh"], "lag": [12] },
  "Taunsa": { "from": ["Chashma"], "lag": [58] },
  "Guddu": { "from": ["Taunsa", "Panjnad"], "lag": [84, 52] },
  "Sukkur": { "from": ["Guddu"], "lag": [32] },
  "Kotri": { "from": ["Sukkur"], "lag": [173] },
  // Jhelum
  "Muzaffarabad": { "from": [], "lag": [] },
  "Domel ": { "from": [], "lag": [] },
  "Chattar Klass": { "from": [], "lag": [] },
  "Azad Pattan": { "from": [], "lag": [] },
  "Kotli ": { "from": [], "lag": [] },
  "Mangla Dam": { "from": ["Kohala "], "lag": [5] },
  "Rasul": { "from": ["Mangla Dam"], "lag": [18] },
  // Chenab
  "Marala": { "from": ["Akhnoor"], "lag": [5] },
  "Khanki": { "from": ["Marala"], "lag": [9] },
  "Q.Abad": { "from": ["Khanki"], "lag": [6] },
  "Trimmu": { "from": ["Q.Abad", "Rasul"], "lag": [64, 64] },
  // Ravi
  "Jassar": { "from": ["Madhopur"], "lag": [12] },
  "Shahdara": { "from": ["Jassar"], "lag": [22] },
  "Balloki": { "from": ["Shahdara"], "lag": [19] },
  "Sidhnai": { "from": ["Balloki"], "lag": [48] },
  // Sutlej
  "Ganda Singh Wala": { "from": ["Harike"], "lag": [19] },
  "Sulemanki": { "from": ["Ganda Singh Wala"], "lag": [53] },
  "Islam": { "from": ["Sulemanki"], "lag": [60] },
  // Panjnad
  "Panjnad": { "from": ["Trimmu", "Sidhnai", "Islam"], "lag": [81, 63, 74] },
};

// Helper function to convert string with commas to number
const convertToNumber = (value) => {
  if (value && value !== "n/a" && value !== "N/A") {
    try {
      return parseFloat(value.toString().replace(/,/g, ""));
    } catch (error) {
      console.warn(`Failed to convert value '${value}' to number:`, error);
      return "n/a";
    }
  }
  return "n/a";
};

// Helper function to convert API response to GeoJSON
const convertToGeojson = (data) => {
  // Handle both possible data structures
  let locations = [];
  if (data.dams && data.headworks) {
    // Combine dams and headworks
    locations = [...data.dams.dams, ...data.headworks.headworks];
  } else if (data.data) {
    locations = data.data;
  } else if (Array.isArray(data)) {
    locations = data;
  } else {
    console.error('Unexpected data structure:', data);
    return { "type": "FeatureCollection", "features": [] };
  }

  const geojson = {
    "type": "FeatureCollection",
    "features": locations.map(location => ({
      "type": "Feature",
      "properties": {
        "id": location.id,
        "name": location.name,
        "status": location.status,
        "outflow_discharge": convertToNumber(location.outflow_discharge),
        "inflow_discharge": convertToNumber(location.inflow_discharge),
        "outflow_time": location.outflow_time || "n/a",
        "recording_time": location.recording_time || "n/a",
        "outflow_trend": location.outflow_trend || "n/a",
        "inflow_trend": location.inflow_trend || "n/a",
        "area_name": location.area_name || "",
        "height": location.height || "",
        "latitude": location.latitude ?? "",
        "longitude": location.longitude ?? "",
        "cyp_discharge": location.cyp_discharge || "",
        "cyp_status": location.cyp_status || "",
        "cyp_date": location.cyp_date || "",
        "from": FLOOD_ROUTING_MAP[location.name]?.from || [],
        "lag_hours": FLOOD_ROUTING_MAP[location.name]?.lag || [],
      },
      "geometry": {
        "type": "Point",
        "coordinates": [
          parseFloat(location.lat),
          parseFloat(location.long),
        ],
      },
    }))
  };

  return geojson;
};

//----------------------------------------------------------------LAYERS---------------------------------------------------------------------// 
function add3DBuildingsLayer(map) {
  const layerId = 'add-3d-buildings';
  const fallbackSourceId = 'mapbox-streets-buildings';

  if (!map || !map.getStyle || map.getLayer(layerId)) return;

  let sourceId = 'composite';
  if (!map.getSource(sourceId)) {
    sourceId = fallbackSourceId;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8'
      });
    }
  }

  const layers = map.getStyle().layers || [];
  const labelLayer = layers.find(layer => layer.type === 'symbol' && layer.layout && layer.layout['text-field']);
  const layerDef = {
    id: layerId,
    source: sourceId,
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    minzoom: 15,
    paint: {
      'fill-extrusion-color': '#aaa',
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        15,
        0,
        15.05,
        ['get', 'height']
      ],
      'fill-extrusion-base': [
        'interpolate',
        ['linear'],
        ['zoom'],
        15,
        0,
        15.05,
        ['get', 'min_height']
      ],
      'fill-extrusion-opacity': 0.6
    }
  };

  try {
    if (labelLayer?.id && map.getLayer(labelLayer.id)) {
      map.addLayer(layerDef, labelLayer.id);
    } else {
      map.addLayer(layerDef);
    }
  } catch (error) {
    console.warn('3D buildings setup error:', error);
  }
}

function addHydrometLayersToMap(map) {
  if (map._hydrometLayersAdded) {
    return;
  }
  map._hydrometLayersAdded = true;

  // Global variables
  let lastUpdateTime = null;

  // FFD API code - Function to fetch FFD data from GitHub
  const fetchFFDData = async () => {
    console.log('Fetching FFD data from GitHub');

    // Add timeout to fetch request for better reliability
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      // Fetch from GitHub raw URL with cache busting
      const response = await fetch(`https://raw.githubusercontent.com/Ibrahom1/hydrosituation/main/latest.json?_t=${Date.now()}`, {
        signal: controller.signal,
        method: 'GET'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Convert to GeoJSON format with flood routing data
      let geojson = convertToGeojson(data);
      // Flip coordinates and any lat/lon-style properties
      // geojson = swapLngLatInGeoJSON(geojson);


      // Normalize status and process the data
      geojson.features.forEach(feature => {
        const inflow = feature.properties.inflow_discharge;

        // Keep original status intact; add a normalized uppercase key for styling/logic
        const rawStatus = String(feature.properties.status || '').trim();
        feature.properties.status_upper = rawStatus.toUpperCase().replace(/\s+/g, '_');
        // -> "EX_HIGH", "VERY_HIGH", "NORMAL", etc.

        // Classify inflow
        let inflowClass = 'LOW';
        if (typeof inflow === 'number') {
          if (inflow > 100000) inflowClass = 'HIGH';
          else if (inflow > 30000) inflowClass = 'MEDIUM';
        }
        feature.properties.inflow_class = inflowClass;
      });

      return geojson;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('FFD fetch timed out after 10 seconds');
        throw new Error('FFD data fetch timed out');
      } else {
        console.error('FFD fetch failed:', error);
        throw error;
      }
    }
  };

  // Function to update FFD data
  const updateFFDData = async (showNotification = false) => {
    try {
      console.log('Updating FFD data...');

      // Fetch fresh data
      const newGeojson = await fetchFFDData();

      // Update the cached data
      ffdGeojsonData = newGeojson;
      lastUpdateTime = new Date();

      // Update the map source if it exists
      if (map1.getSource('ffd')) {
        map1.getSource('ffd').setData(newGeojson);
        console.log('FFD data updated successfully at', lastUpdateTime.toLocaleTimeString());

        // Optional: Show a brief notification to user
        if (showNotification) {
          showUpdateNotification('FFD data updated successfully');
        }
      }

    } catch (error) {
      console.error('Failed to update FFD data:', error);
      // Optional: Show error notification
      if (showNotification) {
        showUpdateNotification('Failed to update FFD data', 'error');
      }
    }
  };

  // Function to show update notifications (optional)
  const showUpdateNotification = (message, type = 'success') => {
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Fade in
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  };

  //FFD API code - Function to add FFD layers
  const addFFDLayers = async () => {
    try {
      // Check if source already exists to prevent duplicates
      if (map1.getSource('ffd')) {
        return;
      }

      // Fetch initial data
      const geojson = await fetchFFDData();

      // Cache the processed data
      ffdGeojsonData = geojson;
      lastUpdateTime = new Date();

      // Add GeoJSON source
      map1.addSource('ffd', {
        type: 'geojson',
        data: geojson
      });

      // Check current checkbox state
      const ffdCheckbox = document.getElementById('ffd');
      const initialVisibility = (ffdCheckbox && ffdCheckbox.checked) ? 'visible' : 'none';

      // Add circle layer
      map1.addLayer({
        id: 'ffd_point',
        type: 'circle',
        source: 'ffd',
        layout: {
          'visibility': initialVisibility
        },
        paint: {
          'circle-color': [
            'match',
            ['get', 'status'],
            'Normal', '#28a745',           // Green - Normal Flow
            'NORMAL', '#28a745',           // Green - Normal Flow
            'Low', '#00FFFF',             // Teal - Low Flood  
            'LOW', '#00FFFF',             // Teal - Low Flood
            'Medium', '#0000FF',          // Blue - Medium Flood
            'MEDIUM', '#0000FF',          // Blue - Medium Flood
            'High', '#fd7e14',            // Orange - High Flood
            'HIGH', '#fd7e14',            // Orange - High Flood
            'Very High', '#7B3F00',       // Purple/Dark Red - Very High Flood
            'VERY_HIGH', '#7B3F00',       // Purple/Dark Red - Very High Flood
            'Exceptionally High', '#ff0000', // Red - Exceptionally High Flood
            'EX_HIGH', '#ff0000',         // Red - Exceptionally High Flood
            '#999999'                     // Default gray
          ],
          'circle-radius': 7,
          'circle-opacity': 1,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });

      // Add label layer
      map1.addLayer({
        id: 'ffd_label',
        type: 'symbol',
        source: 'ffd',
        layout: {
          'visibility': initialVisibility,
          'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'outflow_discharge']]],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-offset': [0, 1.5],     // Positive Y moves label downward
          'text-anchor': 'top'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1
        }
      });

      const resolveHydroApiBase = (port) => {
        const host = window.location.protocol === 'file:' ? 'localhost' : (window.location.hostname || 'localhost');
        return `http://${host}:${port}`;
      };

      const ffdHistoryConfig = {
        apiBase: resolveHydroApiBase(5000),
        defaultDays: 7,
        minDate: '2014-01-01'
      };

      let ffdHistoryChart = null;
      let ffdHistoryFullscreenChart = null;
      let ffdHistoryName = null;
      let ffdHistoryLastSeries = null;
      let ffdHistoryFallbackYear = null;
      let ffdHistoryCurrentProps = null;
      let ffdHistoryCompareMode = 'none';

      const ffdHistoryCompareLabels = {
        none: 'No comparison',
        month: 'Previous month',
        year: 'Previous year'
      };

      const getTodayStr = () => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      const parseFFDHistoryTimestampParts = (value, fallbackYear = null) => {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;

        const normalizedIsoMatch = raw.match(/^([0-9T:\-\.Z]+)\|(PKT|PST)?$/i);
        if (normalizedIsoMatch) {
          const parsedIso = new Date(normalizedIsoMatch[1]);
          if (Number.isNaN(parsedIso.getTime())) return null;
          return {
            date: parsedIso,
            timezone: normalizedIsoMatch[2] ? normalizedIsoMatch[2].toUpperCase() : 'PKT',
            hasExplicitYear: true,
            monthIndex: parsedIso.getMonth(),
            day: parsedIso.getDate(),
            hour: parsedIso.getHours(),
            minute: parsedIso.getMinutes()
          };
        }

        const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})(?:-(\d{2,4}))?\s+(\d{1,2})(?::(\d{2}))?\s*(PKT|PST)?\s*$/i);
        if (match) {
          const day = Number(match[1]);
          const monthText = match[2].slice(0, 1).toUpperCase() + match[2].slice(1, 3).toLowerCase();
          const yearText = match[3];
          const hour = Number(match[4]);
          const minute = match[5] !== undefined ? Number(match[5]) : 0;
          const timezone = match[6] ? match[6].toUpperCase() : 'PKT';

          const monthMap = {
            Jan: 0,
            Feb: 1,
            Mar: 2,
            Apr: 3,
            May: 4,
            Jun: 5,
            Jul: 6,
            Aug: 7,
            Sep: 8,
            Oct: 9,
            Nov: 10,
            Dec: 11
          };
          const monthIndex = monthMap[monthText];
          if (monthIndex === undefined || Number.isNaN(day) || Number.isNaN(hour) || Number.isNaN(minute)) {
            return null;
          }

          const hasExplicitYear = Boolean(yearText);
          let year = Number.isInteger(fallbackYear) ? fallbackYear : new Date().getFullYear();
          if (yearText) {
            const parsedYear = Number(yearText);
            if (!Number.isNaN(parsedYear)) {
              year = yearText.length === 2 ? 2000 + parsedYear : parsedYear;
            }
          }

          const dt = new Date(year, monthIndex, day, hour, minute, 0, 0);
          return Number.isNaN(dt.getTime()) ? null : {
            date: dt,
            timezone,
            hasExplicitYear,
            monthIndex,
            day,
            hour,
            minute
          };
        }

        const nativeParsed = new Date(raw);
        return Number.isNaN(nativeParsed.getTime()) ? null : {
          date: nativeParsed,
          timezone: '',
          hasExplicitYear: true,
          monthIndex: nativeParsed.getMonth(),
          day: nativeParsed.getDate(),
          hour: nativeParsed.getHours(),
          minute: nativeParsed.getMinutes()
        };
      };

      const parseFFDHistoryTimestamp = (value, fallbackYear = null) => {
        const parsed = parseFFDHistoryTimestampParts(value, fallbackYear);
        return parsed ? parsed.date : null;
      };

      const formatFFDHistoryTime = (dateObj) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
        const hours = dateObj.getHours();
        const minutes = dateObj.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        if (minutes === 0) {
          return `${hour12} ${ampm}`;
        }
        return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
      };

      const getFFDHistoryTickMode = (labels) => {
        const parsedDates = (labels || []).map(label => parseFFDHistoryTimestamp(label, ffdHistoryFallbackYear)).filter(Boolean);
        if (parsedDates.length < 2) {
          return { includeTimeInTick: true, includeYearInTick: true };
        }

        const minTs = Math.min(...parsedDates.map(dt => dt.getTime()));
        const maxTs = Math.max(...parsedDates.map(dt => dt.getTime()));
        const totalHours = (maxTs - minTs) / (1000 * 60 * 60);
        const years = new Set(parsedDates.map(dt => dt.getFullYear()));

        return {
          includeTimeInTick: totalHours <= 48,
          includeYearInTick: years.size > 1 || totalHours > (24 * 330)
        };
      };

      const formatFFDHistoryDateTime = (rawLabel, options = {}) => {
        const includeTimeInTick = options.includeTimeInTick !== false;
        const includeYearInTick = options.includeYearInTick === true;
        const parsedParts = parseFFDHistoryTimestampParts(rawLabel, ffdHistoryFallbackYear);
        if (!parsedParts || !parsedParts.date) {
          return {
            tick: String(rawLabel || ''),
            tooltip: String(rawLabel || '')
          };
        }

        const parsed = parsedParts.date;
        const timezone = parsedParts.timezone ? ` ${parsedParts.timezone}` : '';

        const day = parsed.getDate();
        const month = parsed.toLocaleString('en-US', { month: 'short' });
        const year = parsed.getFullYear();
        const time = formatFFDHistoryTime(parsed);
        const dateTick = includeYearInTick ? `${day} ${month} ${String(year).slice(-2)}` : `${day} ${month}`;
        return {
          tick: includeTimeInTick ? [dateTick, time] : dateTick,
          tooltip: `${day} ${month} ${year}, ${time}${timezone}`
        };
      };

      const getFFDHistoryPointKey = (rawLabel) => {
        const parsed = parseFFDHistoryTimestampParts(rawLabel, ffdHistoryFallbackYear);
        if (parsed && parsed.date) {
          return `ts:${parsed.date.getTime()}:${parsed.timezone || ''}`;
        }
        return `raw:${String(rawLabel || 'Unknown')}`;
      };

      const resolveFFDHistorySeriesPoints = (series, fallbackYear) => {
        if (!Array.isArray(series)) return [];

        const resolved = [];
        let rollingYear = Number.isInteger(fallbackYear) ? fallbackYear : new Date().getFullYear();
        let previous = null;

        series.forEach((point) => {
          const rawLabel = point && point.x ? String(point.x) : 'Unknown';
          const parsed = parseFFDHistoryTimestampParts(rawLabel, rollingYear);
          const numericValue = Number(point?.y);
          if (!parsed || !Number.isFinite(numericValue)) return;

          let candidate = parsed.date;
          if (!parsed.hasExplicitYear && previous && candidate.getTime() < previous.getTime()) {
            const prevMonth = previous.getMonth();
            const currMonth = parsed.monthIndex;
            if (prevMonth >= 9 && currMonth <= 2) {
              rollingYear += 1;
              candidate = new Date(rollingYear, parsed.monthIndex, parsed.day, parsed.hour, parsed.minute, 0, 0);
            }
          }

          if (parsed.hasExplicitYear) {
            rollingYear = candidate.getFullYear();
          }

          if (Number.isNaN(candidate.getTime())) return;

          resolved.push({
            y: numericValue,
            date: candidate,
            timezone: parsed.timezone || 'PKT',
            label: `${candidate.toISOString()}|${parsed.timezone || 'PKT'}`
          });
          previous = candidate;
        });

        return resolved;
      };

      const setFFDHistoryStatus = (text) => {
        const statusEl = document.getElementById('ffd-history-status');
        if (statusEl) {
          statusEl.textContent = text;
        }
      };

      const escapeFFDHistoryHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));

      const parseFFDHistoryNumber = (value) => {
        if (value === null || value === undefined || value === '' || value === 'n/a' || value === 'N/A') {
          return null;
        }
        const numeric = Number(String(value).replace(/,/g, ''));
        return Number.isFinite(numeric) ? numeric : null;
      };

      const formatFFDHistoryNumber = (value, decimals = 0) => {
        if (!Number.isFinite(value)) return '--';
        return Number(value).toLocaleString(undefined, {
          maximumFractionDigits: decimals,
          minimumFractionDigits: decimals
        });
      };

      const formatFFDHistoryValue = (value, decimals = 0) => {
        if (!Number.isFinite(value)) return '--';
        return `${formatFFDHistoryNumber(value, decimals)} cusecs`;
      };

      const parseFFDHistoryDateInput = (value, endOfDay = false) => {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const date = endOfDay
          ? new Date(year, month, day, 23, 59, 59, 999)
          : new Date(year, month, day, 0, 0, 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
      };

      const formatFFDHistoryDateInput = (dateObj) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      const formatFFDHistoryShortDate = (dateObj, includeTime = false) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '--';
        const day = dateObj.getDate();
        const month = dateObj.toLocaleString('en-US', { month: 'short' });
        const dateText = `${day} ${month} ${dateObj.getFullYear()}`;
        return includeTime ? `${dateText}, ${formatFFDHistoryTime(dateObj)}` : dateText;
      };

      const formatFFDHistoryCardDate = (dateObj) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return 'Date unavailable';
        const day = dateObj.getDate();
        const month = dateObj.toLocaleString('en-US', { month: 'long' });
        return `${day}-${month}-${dateObj.getFullYear()}`;
      };

      const getFFDHistoryComparisonLabel = (mode = ffdHistoryCompareMode) => (
        ffdHistoryCompareLabels[mode] || ffdHistoryCompareLabels.month
      );

      const getFFDHistoryCardDate = (point, fallbackRange = null) => {
        if (point?.date instanceof Date && !Number.isNaN(point.date.getTime())) {
          return point.date;
        }
        if (fallbackRange?.end instanceof Date && !Number.isNaN(fallbackRange.end.getTime())) {
          return fallbackRange.end;
        }
        return null;
      };

      const getFFDHistoryStats = (points) => {
        const ordered = (Array.isArray(points) ? points : [])
          .filter(point => Number.isFinite(point?.y))
          .sort((a, b) => a.date - b.date);

        if (!ordered.length) {
          return {
            count: 0,
            latest: null,
            latestPoint: null,
            max: null,
            maxPoint: null,
            min: null,
            mean: null
          };
        }

        let sum = 0;
        let maxPoint = ordered[0];
        let minPoint = ordered[0];
        ordered.forEach((point) => {
          sum += point.y;
          if (point.y > maxPoint.y) maxPoint = point;
          if (point.y < minPoint.y) minPoint = point;
        });

        const latestPoint = ordered[ordered.length - 1];
        return {
          count: ordered.length,
          latest: latestPoint.y,
          latestPoint,
          max: maxPoint.y,
          maxPoint,
          min: minPoint.y,
          mean: sum / ordered.length
        };
      };

      const formatFFDHistoryPointMeta = (point) => {
        if (!point || !point.date) return 'No timestamp';
        return formatFFDHistoryShortDate(point.date, true);
      };

      const formatFFDHistoryDelta = (currentValue, compareValue) => {
        if (!Number.isFinite(currentValue) || !Number.isFinite(compareValue)) return '';
        const diff = currentValue - compareValue;
        if (compareValue === 0) {
          return `${diff >= 0 ? '+' : '-'}${formatFFDHistoryNumber(Math.abs(diff))}`;
        }
        const pct = (diff / Math.abs(compareValue)) * 100;
        return `${pct >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)}%`;
      };

      const setFFDHistorySummaryMessage = (message) => {
        const summaryEl = document.getElementById('ffd-history-summary');
        if (summaryEl) {
          summaryEl.innerHTML = `<div class="ffd-history-empty">${escapeFFDHistoryHTML(message)}</div>`;
        }
      };

      const updateFFDHistoryCompareButtons = () => {
        document.querySelectorAll('[data-ffd-compare]').forEach((button) => {
          const mode = button.getAttribute('data-ffd-compare');
          button.classList.toggle('active', mode === ffdHistoryCompareMode);
        });
      };

      const getFFDHistorySelectedRange = () => {
        const startInput = document.getElementById('ffd-history-start');
        const endInput = document.getElementById('ffd-history-end');
        const startVal = startInput ? startInput.value : '';
        const endVal = endInput ? endInput.value : '';
        if (!startVal || !endVal) return null;
        const start = parseFFDHistoryDateInput(startVal);
        const end = parseFFDHistoryDateInput(endVal, true);
        if (!start || !end) return null;
        return { start, end, startVal, endVal };
      };

      const getFFDHistoryRangeFromPoints = (points, selectedRange = null) => {
        if (selectedRange && selectedRange.start && selectedRange.end) {
          return { start: selectedRange.start, end: selectedRange.end };
        }

        const timestamps = (Array.isArray(points) ? points : [])
          .map(point => point?.date instanceof Date ? point.date.getTime() : NaN)
          .filter(Number.isFinite);

        if (!timestamps.length) return null;
        return {
          start: new Date(Math.min(...timestamps)),
          end: new Date(Math.max(...timestamps))
        };
      };

      const shiftFFDHistoryDate = (dateObj, mode) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
        const shifted = new Date(dateObj.getTime());
        if (mode === 'year') {
          shifted.setFullYear(shifted.getFullYear() - 1);
          return shifted;
        }
        if (mode === 'month') {
          const originalDay = shifted.getDate();
          shifted.setDate(1);
          shifted.setMonth(shifted.getMonth() - 1);
          const maxDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
          shifted.setDate(Math.min(originalDay, maxDay));
          return shifted;
        }
        return null;
      };

      const getFFDHistoryComparisonRange = (currentRange, mode) => {
        if (!currentRange || mode === 'none') return null;
        const start = shiftFFDHistoryDate(currentRange.start, mode);
        const end = shiftFFDHistoryDate(currentRange.end, mode);
        if (!start || !end) return null;
        return { start, end };
      };

      const filterFFDHistoryPointsByRange = (points, range) => {
        if (!range?.start || !range?.end) return Array.isArray(points) ? points : [];
        return (Array.isArray(points) ? points : []).filter((point) => (
          point?.date instanceof Date &&
          point.date.getTime() >= range.start.getTime() &&
          point.date.getTime() <= range.end.getTime()
        ));
      };

      const fetchFFDHistorySeries = async ({ name, days = null, range = null }) => {
        const fallbackYear = range?.end
          ? range.end.getFullYear()
          : new Date().getFullYear();

        let url = `${ffdHistoryConfig.apiBase}/api/history?name=${encodeURIComponent(name)}`;
        if (range?.start && range?.end) {
          url += `&start_date=${encodeURIComponent(formatFFDHistoryDateInput(range.start))}&end_date=${encodeURIComponent(formatFFDHistoryDateInput(range.end))}`;
        } else {
          url += `&days=${days || ffdHistoryConfig.defaultDays}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('history status');
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error('history payload');
        }

        const inflow = Array.isArray(data.inflow) ? data.inflow : [];
        const outflow = Array.isArray(data.outflow) ? data.outflow : [];
        return {
          raw: data,
          fallbackYear,
          inflow: resolveFFDHistorySeriesPoints(inflow, fallbackYear),
          outflow: resolveFFDHistorySeriesPoints(outflow, fallbackYear)
        };
      };

      const getFFDHistoryDisplayKey = (dateObj) => {
        const roundedMs = Math.round(dateObj.getTime() / 60000) * 60000;
        return `ts:${roundedMs}`;
      };

      const buildFFDHistoryChartBundle = ({
        currentInflow = [],
        currentOutflow = [],
        comparisonInflow = [],
        comparisonOutflow = [],
        currentRange = null,
        comparisonRange = null,
        comparisonMode = ffdHistoryCompareMode,
        comparisonError = null
      }) => {
        const metaByKey = new Map();

        const addLabelMeta = (dateObj, timezone = 'PKT') => {
          if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
          const key = getFFDHistoryDisplayKey(dateObj);
          if (!metaByKey.has(key)) {
            const roundedDate = new Date(Number(key.slice(3)));
            metaByKey.set(key, {
              key,
              date: roundedDate,
              label: `${roundedDate.toISOString()}|${timezone || 'PKT'}`
            });
          }
          return key;
        };

        const alignComparisonDate = (dateObj) => {
          if (!currentRange || !comparisonRange || !(dateObj instanceof Date)) return dateObj;
          return new Date(currentRange.start.getTime() + (dateObj.getTime() - comparisonRange.start.getTime()));
        };

        const registerPoints = (points, isComparison = false) => {
          points.forEach((point) => {
            const displayDate = isComparison ? alignComparisonDate(point.date) : point.date;
            addLabelMeta(displayDate, point.timezone);
          });
        };

        registerPoints(currentInflow);
        registerPoints(currentOutflow);
        registerPoints(comparisonInflow, true);
        registerPoints(comparisonOutflow, true);

        const orderedMeta = Array.from(metaByKey.values()).sort((a, b) => {
          if (a.date.getTime() !== b.date.getTime()) return a.date - b.date;
          return a.label.localeCompare(b.label);
        });
        const labels = orderedMeta.map(item => item.label);
        const indexMap = new Map(orderedMeta.map((item, index) => [item.key, index]));

        const createSeriesArray = () => new Array(labels.length).fill(null);
        const createTooltipArray = () => new Array(labels.length).fill('');
        const inflowData = createSeriesArray();
        const outflowData = createSeriesArray();
        const comparisonInflowData = createSeriesArray();
        const comparisonOutflowData = createSeriesArray();
        const comparisonInflowTooltips = createTooltipArray();
        const comparisonOutflowTooltips = createTooltipArray();

        const placePoint = (target, point, displayDate) => {
          const key = addLabelMeta(displayDate, point.timezone);
          const idx = indexMap.get(key);
          if (idx !== undefined) target[idx] = point.y;
          return idx;
        };

        currentInflow.forEach(point => placePoint(inflowData, point, point.date));
        currentOutflow.forEach(point => placePoint(outflowData, point, point.date));
        comparisonInflow.forEach((point) => {
          const idx = placePoint(comparisonInflowData, point, alignComparisonDate(point.date));
          if (idx !== undefined) comparisonInflowTooltips[idx] = `actual ${formatFFDHistoryPointMeta(point)}`;
        });
        comparisonOutflow.forEach((point) => {
          const idx = placePoint(comparisonOutflowData, point, alignComparisonDate(point.date));
          if (idx !== undefined) comparisonOutflowTooltips[idx] = `actual ${formatFFDHistoryPointMeta(point)}`;
        });

        const hasComparisonData = comparisonMode !== 'none' && (comparisonInflow.length > 0 || comparisonOutflow.length > 0);

        return {
          labels,
          inflowData,
          outflowData,
          comparisonInflowData,
          comparisonOutflowData,
          comparisonInflowTooltips,
          comparisonOutflowTooltips,
          currentInflow,
          currentOutflow,
          comparisonInflow,
          comparisonOutflow,
          currentRange,
          comparisonRange,
          comparisonMode,
          comparisonLabel: getFFDHistoryComparisonLabel(comparisonMode),
          comparisonError,
          hasComparisonData
        };
      };

      const renderFFDHistorySummary = (bundle) => {
        const summaryEl = document.getElementById('ffd-history-summary');
        if (!summaryEl) return;

        const currentInflowStats = getFFDHistoryStats(bundle.currentInflow);
        const currentOutflowStats = getFFDHistoryStats(bundle.currentOutflow);
        const comparisonInflowStats = getFFDHistoryStats(bundle.comparisonInflow);
        const comparisonOutflowStats = getFFDHistoryStats(bundle.comparisonOutflow);
        const liveInflow = parseFFDHistoryNumber(ffdHistoryCurrentProps?.inflow_discharge);
        const liveOutflow = parseFFDHistoryNumber(ffdHistoryCurrentProps?.outflow_discharge);

        const currentInflow = Number.isFinite(liveInflow) ? liveInflow : currentInflowStats.latest;
        const currentOutflow = Number.isFinite(liveOutflow) ? liveOutflow : currentOutflowStats.latest;
        const hasComparison = bundle.comparisonMode !== 'none';
        const currentInflowDate = formatFFDHistoryCardDate(getFFDHistoryCardDate(currentInflowStats.latestPoint, bundle.currentRange));
        const currentOutflowDate = formatFFDHistoryCardDate(getFFDHistoryCardDate(currentOutflowStats.latestPoint, bundle.currentRange));
        const comparisonInflowDate = formatFFDHistoryCardDate(getFFDHistoryCardDate(comparisonInflowStats.latestPoint, bundle.comparisonRange));
        const comparisonOutflowDate = formatFFDHistoryCardDate(getFFDHistoryCardDate(comparisonOutflowStats.latestPoint, bundle.comparisonRange));
        const inflowDelta = hasComparison
          ? formatFFDHistoryDelta(currentInflow, comparisonInflowStats.latest)
          : '';
        const outflowDelta = hasComparison
          ? formatFFDHistoryDelta(currentOutflow, comparisonOutflowStats.latest)
          : '';
        const emptyComparisonMeta = bundle.comparisonError
          ? 'Comparison unavailable'
          : 'No comparison data';
        const inflowComparisonMeta = comparisonInflowStats.count
          ? (inflowDelta ? `Now ${inflowDelta}` : 'Same as now')
          : emptyComparisonMeta;
        const outflowComparisonMeta = comparisonOutflowStats.count
          ? (outflowDelta ? `Now ${outflowDelta}` : 'Same as now')
          : emptyComparisonMeta;

        const cards = hasComparison ? [
          {
            label: `Inflow ${currentInflowDate}`,
            value: formatFFDHistoryValue(currentInflow),
            meta: '',
            tone: 'inflow'
          },
          {
            label: `Inflow ${comparisonInflowDate}`,
            value: formatFFDHistoryValue(comparisonInflowStats.latest),
            meta: inflowComparisonMeta,
            tone: 'compare-inflow'
          },
          {
            label: `Outflow ${currentOutflowDate}`,
            value: formatFFDHistoryValue(currentOutflow),
            meta: '',
            tone: 'outflow'
          },
          {
            label: `Outflow ${comparisonOutflowDate}`,
            value: formatFFDHistoryValue(comparisonOutflowStats.latest),
            meta: outflowComparisonMeta,
            tone: 'compare-outflow'
          }
        ] : [
          {
            label: `Inflow ${currentInflowDate}`,
            value: formatFFDHistoryValue(currentInflow),
            meta: '',
            tone: 'inflow'
          },
          {
            label: `Outflow ${currentOutflowDate}`,
            value: formatFFDHistoryValue(currentOutflow),
            meta: '',
            tone: 'outflow'
          },
          {
            label: 'Mean Inflow',
            value: formatFFDHistoryValue(currentInflowStats.mean),
            meta: `${formatFFDHistoryNumber(currentInflowStats.count)} records`,
            tone: 'mean'
          },
          {
            label: 'Mean Outflow',
            value: formatFFDHistoryValue(currentOutflowStats.mean),
            meta: `${formatFFDHistoryNumber(currentOutflowStats.count)} records`,
            tone: 'mean'
          }
        ];

        summaryEl.innerHTML = cards.map(card => `
          <div class="ffd-history-card ${card.tone}">
            <span>${escapeFFDHistoryHTML(card.label)}</span>
            <strong>${escapeFFDHistoryHTML(card.value)}</strong>
            ${card.meta ? `<small>${escapeFFDHistoryHTML(card.meta)}</small>` : ''}
          </div>
        `).join('');
      };

      const renderFFDHistoryChart = (canvasId, bundle, isFullscreen = false) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) {
          return;
        }

        if (isFullscreen) {
          if (ffdHistoryFullscreenChart) {
            ffdHistoryFullscreenChart.destroy();
          }
        } else {
          if (ffdHistoryChart) {
            ffdHistoryChart.destroy();
          }
        }

        const labels = bundle?.labels || [];
        const comparisonLabel = bundle?.comparisonLabel || getFFDHistoryComparisonLabel();
        const datasets = [
          {
            label: 'Inflow',
            data: bundle?.inflowData || [],
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            fill: false,
            tension: 0.35,
            spanGaps: true,
            pointRadius: isFullscreen ? 3 : 2,
            pointHoverRadius: isFullscreen ? 5 : 4,
            borderWidth: isFullscreen ? 3 : 2.5
          },
          {
            label: 'Outflow',
            data: bundle?.outflowData || [],
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.18)',
            fill: true,
            tension: 0.35,
            spanGaps: true,
            pointRadius: isFullscreen ? 3 : 2,
            pointHoverRadius: isFullscreen ? 5 : 4,
            borderWidth: isFullscreen ? 3 : 2.5
          }
        ];

        if (bundle?.hasComparisonData) {
          datasets.push(
            {
              label: `Inflow - ${comparisonLabel}`,
              data: bundle.comparisonInflowData || [],
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              fill: false,
              tension: 0.35,
              spanGaps: true,
              pointRadius: isFullscreen ? 2 : 1.5,
              pointHoverRadius: isFullscreen ? 5 : 4,
              borderWidth: isFullscreen ? 2.5 : 2,
              borderDash: [6, 5],
              historyTooltips: bundle.comparisonInflowTooltips || []
            },
            {
              label: `Outflow - ${comparisonLabel}`,
              data: bundle.comparisonOutflowData || [],
              borderColor: '#fb7185',
              backgroundColor: 'rgba(251, 113, 133, 0.08)',
              fill: false,
              tension: 0.35,
              spanGaps: true,
              pointRadius: isFullscreen ? 2 : 1.5,
              pointHoverRadius: isFullscreen ? 5 : 4,
              borderWidth: isFullscreen ? 2.5 : 2,
              borderDash: [3, 5],
              historyTooltips: bundle.comparisonOutflowTooltips || []
            }
          );
        }

        const tickMode = getFFDHistoryTickMode(labels);

        const chartInstance = new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: {
                labels: {
                  color: '#e2e8f0',
                  boxWidth: 14,
                  usePointStyle: true
                }
              },
              tooltip: {
                callbacks: {
                  title: function (items) {
                    if (!items || !items.length) return '';
                    const label = items[0].label;
                    return formatFFDHistoryDateTime(label).tooltip;
                  },
                  label: function (context) {
                    if (context.parsed.y === null) return null;
                    const detail = context.dataset.historyTooltips?.[context.dataIndex];
                    const suffix = detail ? ` (${detail})` : '';
                    return `${context.dataset.label}: ${Number(context.parsed.y).toLocaleString()} cusecs${suffix}`;
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: {
                  color: '#cbd5f5',
                  maxTicksLimit: isFullscreen ? 12 : 6,
                  autoSkip: true,
                  minRotation: 0,
                  maxRotation: 0,
                  callback: function (value, index) {
                    const rawLabel = labels[value];
                    return formatFFDHistoryDateTime(rawLabel, tickMode).tick;
                  }
                },
                grid: { color: 'rgba(148, 163, 184, 0.15)' }
              },
              y: {
                ticks: {
                  color: '#cbd5f5',
                  callback: function (value) {
                    return Number(value).toLocaleString();
                  }
                },
                grid: { color: 'rgba(148, 163, 184, 0.15)' }
              }
            }
          }
        });

        if (isFullscreen) {
          ffdHistoryFullscreenChart = chartInstance;
        } else {
          ffdHistoryChart = chartInstance;
        }
      };

      const loadFFDHistoryData = async () => {
        if (!ffdHistoryName) return;

        const selectedRange = getFFDHistorySelectedRange();
        ffdHistoryFallbackYear = selectedRange?.end
          ? selectedRange.end.getFullYear()
          : new Date().getFullYear();

        try {
          setFFDHistoryStatus('Loading history...');
          setFFDHistorySummaryMessage('Loading station summary...');
          updateFFDHistoryCompareButtons();

          const currentSeries = await fetchFFDHistorySeries({
            name: ffdHistoryName,
            days: ffdHistoryConfig.defaultDays,
            range: selectedRange
          });

          const allCurrentPoints = [...currentSeries.inflow, ...currentSeries.outflow];
          if (allCurrentPoints.length === 0) {
            setFFDHistoryStatus('No data for selected range');
            const emptyBundle = buildFFDHistoryChartBundle({
              currentRange: selectedRange ? { start: selectedRange.start, end: selectedRange.end } : null,
              comparisonMode: ffdHistoryCompareMode
            });
            renderFFDHistoryChart('ffd-history-canvas', emptyBundle);
            ffdHistoryLastSeries = null;
            setFFDHistorySummaryMessage('No history data for the selected range.');
            return;
          }

          const currentRange = getFFDHistoryRangeFromPoints(allCurrentPoints, selectedRange);
          let comparisonRange = getFFDHistoryComparisonRange(currentRange, ffdHistoryCompareMode);
          let comparisonSeries = { inflow: [], outflow: [] };
          let comparisonError = null;

          if (comparisonRange) {
            try {
              comparisonSeries = await fetchFFDHistorySeries({
                name: ffdHistoryName,
                range: comparisonRange
              });
              comparisonSeries.inflow = filterFFDHistoryPointsByRange(comparisonSeries.inflow, comparisonRange);
              comparisonSeries.outflow = filterFFDHistoryPointsByRange(comparisonSeries.outflow, comparisonRange);
            } catch (compareError) {
              console.warn('FFD history comparison fetch failed:', compareError);
              comparisonError = compareError;
            }
          }

          const chartBundle = buildFFDHistoryChartBundle({
            currentInflow: currentSeries.inflow,
            currentOutflow: currentSeries.outflow,
            comparisonInflow: comparisonSeries.inflow || [],
            comparisonOutflow: comparisonSeries.outflow || [],
            currentRange,
            comparisonRange,
            comparisonMode: ffdHistoryCompareMode,
            comparisonError
          });

          renderFFDHistoryChart('ffd-history-canvas', chartBundle);
          renderFFDHistorySummary(chartBundle);
          ffdHistoryLastSeries = chartBundle;

          if (selectedRange) {
            setFFDHistoryStatus(`Showing: ${formatFFDHistoryDateInput(selectedRange.start)} to ${formatFFDHistoryDateInput(selectedRange.end)}`);
          } else {
            setFFDHistoryStatus(`Showing: Last ${ffdHistoryConfig.defaultDays} days`);
          }
        } catch (error) {
          console.warn('FFD history fetch failed:', error);
          setFFDHistoryStatus('History service unavailable');
          renderFFDHistoryChart('ffd-history-canvas', buildFFDHistoryChartBundle({ comparisonMode: ffdHistoryCompareMode }));
          setFFDHistorySummaryMessage('History service unavailable.');
          ffdHistoryLastSeries = null;
        }
      };

      const ensureFFDHistoryPanelInitialized = () => {
        if (window.__ffdHistoryPanelReady) return;
        window.__ffdHistoryPanelReady = true;

        const panel = document.getElementById('ffd-history-panel');
        if (!panel) return;
        const header = panel.querySelector('.ffd-history-header');

        const closeBtn = document.getElementById('ffd-history-close');
        const dateToggleBtn = document.getElementById('ffd-history-date-toggle');
        const fullscreenBtn = document.getElementById('ffd-history-fullscreen-btn');
        const fullscreenPanel = document.getElementById('ffd-history-fullscreen-panel');
        const fullscreenClose = document.getElementById('ffd-history-fullscreen-close');
        const controlsSection = panel.querySelector('.ffd-history-controls');
        const applyBtn = document.getElementById('ffd-history-apply');
        const resetBtn = document.getElementById('ffd-history-reset');
        const startInput = document.getElementById('ffd-history-start');
        const endInput = document.getElementById('ffd-history-end');
        const compareButtons = panel.querySelectorAll('[data-ffd-compare]');

        const setControlsOpen = (isOpen) => {
          panel.classList.toggle('controls-open', isOpen);
          if (dateToggleBtn) {
            dateToggleBtn.setAttribute('aria-expanded', String(isOpen));
          }
          if (ffdHistoryChart) {
            requestAnimationFrame(() => {
              ffdHistoryChart.resize();
            });
          }
        };

        setControlsOpen(false);

        const today = getTodayStr();
        if (startInput) {
          startInput.min = ffdHistoryConfig.minDate;
          startInput.max = today;
        }
        if (endInput) {
          endInput.min = ffdHistoryConfig.minDate;
          endInput.max = today;
        }

        const syncBounds = () => {
          if (!startInput || !endInput) return;
          endInput.min = startInput.value || ffdHistoryConfig.minDate;
          startInput.max = endInput.value || today;
        };

        if (startInput && endInput) {
          startInput.addEventListener('change', syncBounds);
          endInput.addEventListener('change', syncBounds);
          syncBounds();
        }

        const stopMapEvents = (event) => {
          event.stopPropagation();
        };

        const bindStopEvents = (el) => {
          if (!el) return;
          ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((evt) => {
            el.addEventListener(evt, stopMapEvents);
          });
        };

        bindStopEvents(startInput);
        bindStopEvents(endInput);
        bindStopEvents(applyBtn);
        bindStopEvents(resetBtn);
        bindStopEvents(dateToggleBtn);
        bindStopEvents(controlsSection);
        compareButtons.forEach((button) => {
          bindStopEvents(button);
          button.addEventListener('click', async () => {
            const nextMode = button.getAttribute('data-ffd-compare') || 'month';
            if (nextMode === ffdHistoryCompareMode) return;
            ffdHistoryCompareMode = nextMode;
            updateFFDHistoryCompareButtons();
            await loadFFDHistoryData();
          });
        });
        updateFFDHistoryCompareButtons();

        if (dateToggleBtn) {
          dateToggleBtn.addEventListener('click', () => {
            const isOpen = panel.classList.contains('controls-open');
            setControlsOpen(!isOpen);
          });
        }

        const closeFullscreen = () => {
          if (!fullscreenPanel) return;
          fullscreenPanel.classList.remove('open');
          if (ffdHistoryFullscreenChart) {
            ffdHistoryFullscreenChart.destroy();
            ffdHistoryFullscreenChart = null;
          }
        };

        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            panel.classList.remove('open');
            closeFullscreen();
          });
        }

        if (fullscreenBtn && fullscreenPanel) {
          fullscreenBtn.addEventListener('click', () => {
            if (!ffdHistoryLastSeries) {
              setFFDHistoryStatus('Load history before fullscreen');
              return;
            }
            const fullscreenTitle = document.querySelector('.ffd-history-fullscreen-title');
            if (fullscreenTitle) {
              fullscreenTitle.textContent = `${ffdHistoryName || 'FFD'} - Fullscreen History`;
            }
            fullscreenPanel.classList.add('open');
            renderFFDHistoryChart(
              'ffd-history-canvas-full',
              ffdHistoryLastSeries,
              true
            );
          });
        }

        if (fullscreenClose) {
          fullscreenClose.addEventListener('click', closeFullscreen);
        }

        if (applyBtn) {
          applyBtn.addEventListener('click', async () => {
            if (!startInput || !endInput) return;
            if (!startInput.value || !endInput.value) {
              setFFDHistoryStatus('Select both start and end dates');
              return;
            }
            if (new Date(startInput.value) > new Date(endInput.value)) {
              setFFDHistoryStatus('Start date must be before end date');
              return;
            }
            if (new Date(startInput.value) < new Date(ffdHistoryConfig.minDate)) {
              startInput.value = ffdHistoryConfig.minDate;
              syncBounds();
            }
            if (new Date(endInput.value) > new Date(today)) {
              endInput.value = today;
              syncBounds();
            }
            await loadFFDHistoryData();
          });
        }

        if (resetBtn) {
          resetBtn.addEventListener('click', async () => {
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
            await loadFFDHistoryData();
          });
        }

        if (header) {
          let isDragging = false;
          let startX = 0;
          let startY = 0;
          let startLeft = 0;
          let startTop = 0;
          let panelWidth = 0;
          let panelHeight = 0;
          let pointerId = null;
          let hasMoved = false;

          const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

          const detachDragListeners = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('blur', onPointerUp);
          };

          const endDrag = () => {
            isDragging = false;
            pointerId = null;
            panel.classList.remove('dragging');
            detachDragListeners();
          };

          const onPointerMove = (event) => {
            if (!isDragging) return;
            if (pointerId !== null && event.pointerId !== pointerId) return;

            hasMoved = true;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const newLeft = startLeft + dx;
            const newTop = startTop + dy;

            const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

            panel.style.left = `${clamp(newLeft, 8, maxLeft)}px`;
            panel.style.top = `${clamp(newTop, 8, maxTop)}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            event.preventDefault();
          };

          const onPointerUp = (event) => {
            if (!isDragging) return;
            if (pointerId !== null && event && event.pointerId !== undefined && event.pointerId !== pointerId) return;

            if (hasMoved) {
              panel.dataset.dragged = 'true';
            }
            endDrag();

            const fluidContainer = document.getElementById('fluidMeterContainer');
            if (fluidContainer && fluidContainer.style.display === 'block') {
              if (!fluidContainer.style.left || fluidContainer.style.left === 'auto') {
                dockFluidMeter(fluidContainer);
              }
            }
          };

          header.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (event.target && event.target.closest('button')) return;
            const rect = panel.getBoundingClientRect();
            isDragging = true;
            hasMoved = false;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            panelWidth = rect.width;
            panelHeight = rect.height;
            panel.classList.add('dragging');
            if (typeof header.setPointerCapture === 'function' && event.pointerId !== undefined) {
              try {
                header.setPointerCapture(event.pointerId);
              } catch (_) {
                // Ignore capture failures; listeners still handle drag.
              }
            }
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
            window.addEventListener('blur', onPointerUp);
          });

          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              endDrag();
            }, true);
          }
        }
      };

      const openFFDHistoryPanel = async (name, props = null) => {
        ensureFFDHistoryPanelInitialized();

        const panel = document.getElementById('ffd-history-panel');
        const titleEl = document.getElementById('ffd-history-name');
        if (!panel || !titleEl) return;
        const keepManualPosition = panel.classList.contains('open') && panel.dataset.dragged === 'true';

        ffdHistoryName = name || 'Unknown Station';
        ffdHistoryCurrentProps = props || null;
        titleEl.textContent = `${ffdHistoryName} - History`;
        panel.classList.remove('controls-open');
        const dateToggleBtn = document.getElementById('ffd-history-date-toggle');
        if (dateToggleBtn) {
          dateToggleBtn.setAttribute('aria-expanded', 'false');
        }

        if (!keepManualPosition) {
          panel.dataset.dragged = '';
          panel.style.width = `${Math.round(getFFDHistoryDockWidth())}px`;
          panel.style.right = '16px';
          panel.style.bottom = '16px';
          panel.style.left = 'auto';
          panel.style.top = 'auto';
        }

        panel.classList.add('open');

        const fluidContainer = document.getElementById('fluidMeterContainer');
        if (fluidContainer && fluidContainer.style.display === 'block') {
          if (!fluidContainer.style.left || fluidContainer.style.left === 'auto') {
            dockFluidMeter(fluidContainer);
          }
        }

        if (!keepManualPosition) {
          alignFFDHistoryPanelToFluidMeter();
        }

        await loadFFDHistoryData();
      };

      // Add popup on click (keeping your existing popup code)
      // Enhanced FFD popup click handler with professional styling and N/A units fix
      map1.on('click', 'ffd_point', (e) => {
        const props = e.features[0].properties;

        // Format the From and Lag Hours information using flood routing data
        let fromAndLagHTML = '';
        if (props.from && props.lag_hours) {
          try {
            // Handle both string arrays and actual arrays
            let fromArray = Array.isArray(props.from) ? props.from : JSON.parse(props.from);
            let lagArray = Array.isArray(props.lag_hours) ? props.lag_hours : JSON.parse(props.lag_hours);

            if (fromArray.length > 0 && lagArray.length > 0) {
              fromAndLagHTML = `
                                <div class="upstream-section">
                                    <h4 class="section-title">
                                        <i class="fas fa-arrow-up"></i> Upstream Stations
                                    </h4>
                                    <div class="upstream-list">`;

              for (let i = 0; i < fromArray.length; i++) {
                const lagTime = lagArray[i] ? `${lagArray[i]} hours` : 'N/A';
                fromAndLagHTML += `
                                    <div class="upstream-item">
                                        <span class="station-name"><strong>${fromArray[i]}</strong></span>
                                        <span class="lag-time"><strong>Lag: ${lagTime}</strong></span>
                                    </div>`;
              }

              fromAndLagHTML += `</div></div>`;
            }
          } catch (error) {
            console.warn('Error parsing from/lag_hours:', error);
            if (props.from && props.from.length > 0) {
              fromAndLagHTML = `
                                <div class="upstream-section">
                                    <h4 class="section-title">
                                        <i class="fas fa-arrow-up"></i> Upstream Stations
                                    </h4>
                                    <div class="upstream-simple">
                                        <div class="upstream-item">
                                            <span class="station-name"><strong>${props.from}</strong></span>
                                            ${props.lag_hours ? `<span class="lag-time"><strong>Lag: ${props.lag_hours} hours</strong></span>` : ''}
                                        </div>
                                    </div>
                                </div>`;
            }
          }
        }

        // Get status color for consistent theming
        const statusColor = getStatusColor(props.status);

        // Add last update time to popup
        const lastUpdateInfo = lastUpdateTime ?
          `<div class="update-info">
                        <i class="fas fa-sync-alt"></i>
                        Last updated: ${lastUpdateTime.toLocaleTimeString()}
                    </div>` : '';

        // Format discharge values with proper units and highlighting - NO UNITS FOR N/A
        const formatDischarge = (value, label, isInflow = false) => {
          if (!value || value === 'N/A' || (typeof value === 'string' && value.toLowerCase() === 'n/a') || (typeof value === 'string' && value.trim() === '')) {
            return `
                            <div class="discharge-item">
                                <span class="discharge-label">${label}:</span>
                                <span class="discharge-value no-data">N/A</span>
                            </div>`;
          }

          // Parse numeric value for formatting
          const numericValue = parseFloat(value);
          const formattedValue = !isNaN(numericValue) ? numericValue.toLocaleString() : value;

          return `
                        <div class="discharge-item">
                            <span class="discharge-label">${label}:</span>
                            <span class="discharge-value ${isInflow ? 'inflow-highlight' : 'outflow-bold'}">
                                ${formattedValue} ft³/s
                            </span>
                        </div>`;
        };

        // Format trend with icons - NO UNITS FOR N/A
        const formatTrend = (trend, label) => {
          if (!trend || trend === 'N/A' || (typeof trend === 'string' && trend.toLowerCase() === 'n/a') || (typeof trend === 'string' && trend.trim() === '')) {
            return `
                            <div class="trend-item trend-unknown">
                                <span class="trend-label">${label}:</span>
                                <span class="trend-value">
                                    <i class="fas fa-question-circle"></i> N/A
                                </span>
                            </div>`;
          }

          let trendIcon = '';
          let trendClass = '';

          switch (String(trend).toLowerCase()) {
            case 'rising':
            case 'increasing':
              trendIcon = '<i class="fas fa-arrow-up trend-rising"></i>';
              trendClass = 'trend-rising';
              break;
            case 'falling':
            case 'decreasing':
              trendIcon = '<i class="fas fa-arrow-down trend-falling"></i>';
              trendClass = 'trend-falling';
              break;
            case 'stable':
            case 'steady':
              trendIcon = '<i class="fas fa-minus trend-stable"></i>';
              trendClass = 'trend-stable';
              break;
            default:
              trendIcon = '<i class="fas fa-question-circle"></i>';
              trendClass = 'trend-unknown';
          }

          return `
                        <div class="trend-item ${trendClass}">
                            <span class="trend-label">${label}:</span>
                            <span class="trend-value">
                                ${trendIcon} ${trend}
                            </span>
                        </div>`;
        };

        const hasPopupValue = (value) => {
          if (value === undefined || value === null) return false;
          const text = String(value).trim();
          if (!text) return false;
          const lowered = text.toLowerCase();
          return lowered !== 'n/a' && lowered !== 'null' && lowered !== 'undefined';
        };

        const escapePopupText = (value) => String(value).replace(/[&<>"']/g, (char) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char]));

        const formatMetaRow = (label, value, formatter = null) => {
          if (!hasPopupValue(value)) return '';
          const displayValue = formatter ? formatter(value) : escapePopupText(value);
          return `
                            <div class="popup-meta-item">
                                <span class="popup-meta-label">${label}:</span>
                                <span class="popup-meta-value">${displayValue}</span>
                            </div>`;
        };

        const popupMetadataRows = [
          formatMetaRow('River / Area', props.area_name),
          formatMetaRow('Station Height', props.height)
        ].join('');

        const popupMetadataHTML = popupMetadataRows ? `
                            <div class="popup-meta-section">
                                <div class="popup-meta-grid">
                                    ${popupMetadataRows}
                                </div>
                            </div>` : '';

        const maxPeakHTML = hasPopupValue(props.cyp_discharge) ? `
                            <div class="peak-section">
                                <div class="peak-grid">
                                    <div class="popup-meta-item">
                                        <span class="popup-meta-label">Max. Peak:</span>
                                        <span class="popup-meta-value">${escapePopupText(props.cyp_discharge)}</span>
                                    </div>
                                </div>
                            </div>` : '';

        const popupHTML = `
                    <div class="ffd-popup-container">
                        <!-- Header Section -->
                        <div class="popup-header" style="border-left: 4px solid ${statusColor};">
                            <div class="station-info">
                                <h3 class="station-name">${props.name || 'Unknown Station'}</h3>
                                <div class="status-badge" style="background-color: ${statusColor};">
                                    <i class="fas fa-water"></i>
                                    ${props.status || 'Unknown'}
                                </div>
                            </div>
                        </div>

                        <!-- Main Content -->
                        <div class="popup-content">
                            <!-- Fallback HTML Metadata -->
                            ${popupMetadataHTML}

                            <!-- Discharge Information -->
                            <div class="discharge-section">
                                <div class="discharge-grid">
                                    ${formatDischarge(props.inflow_discharge, 'Inflow', true)}
                                    ${formatDischarge(props.outflow_discharge, 'Outflow', false)}
                                </div>
                            </div>

                            <!-- Trend Information -->
                            ${(props.inflow_trend || props.outflow_trend) ? `
                                <div class="trend-section">
                                    <div class="trend-grid">
                                        ${formatTrend(props.inflow_trend, 'Inflow Trend')}
                                        ${formatTrend(props.outflow_trend, 'Outflow Trend')}
                                    </div>
                                </div>
                            ` : ''}

                            <!-- Timestamp -->
                            <div class="timestamp-section">
                                <div class="timestamp-item">
                                    <i class="fas fa-clock"></i>
                                    <span class="timestamp-value">${props.recording_time || 'Unknown'}</span>
                                </div>
                            </div>

                            <!-- Fallback HTML Max Peak -->
                            ${maxPeakHTML}
                            
                            <!-- Last Update Info -->
                            ${lastUpdateInfo}

                            <!-- Upstream Stations -->
                            ${fromAndLagHTML}
                        </div>
                    </div>

                    <style>
                        .ffd-popup-container {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            width: 280px;
                            background: #ffffff;
                            border-radius: 12px;
                            box-shadow: 
                                0 8px 32px rgba(0, 0, 0, 0.12),
                                0 2px 8px rgba(0, 0, 0, 0.08);
                            overflow: hidden;
                            border: 2px solid #2196f3;
                            position: relative;
                        }

                        .popup-header {
                            background: #f8f9fa;
                            padding: 8px 12px;
                            border-bottom: 2px solid #e3f2fd;
                        }

                        .station-info {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            gap: 12px;
                        }

                        .station-name {
                            font-size: 16px;
                            font-weight: 700;
                            color: #1a1a1a;
                            margin: 0;
                            line-height: 1.2;
                            flex: 1;
                        }

                        .status-badge {
                            color: white;
                            padding: 4px 8px;
                            border-radius: 16px;
                            font-size: 11px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                            display: flex;
                            align-items: center;
                            gap: 3px;
                            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                            white-space: nowrap;
                        }

                        .popup-content {
                            padding: 8px 12px 12px;
                        }

                        .section-title {
                            font-size: 12px;
                            font-weight: 600;
                            color: #495057;
                            margin: 0 0 8px 0;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                        }

                        .section-title i {
                            color: #6c757d;
                            font-size: 10px;
                        }

                        .discharge-section, .trend-section, .popup-meta-section, .peak-section {
                            margin-bottom: 8px;
                        }

                        .discharge-grid, .trend-grid, .popup-meta-grid, .peak-grid {
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                        }

                        .discharge-item, .trend-item, .popup-meta-item {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 4px 8px;
                            background: #f8f9fa;
                            border-radius: 6px;
                            border: 1px solid #e3f2fd;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
                        }

                        .discharge-label, .trend-label, .popup-meta-label {
                            font-size: 13px;
                            font-weight: 500;
                            color: #495057;
                        }

                        .discharge-value, .popup-meta-value {
                            font-size: 14px;
                            font-weight: 700;
                            color: #212529;
                            text-align: right;
                        }

                        .discharge-value.no-data {
                            color: #6c757d;
                            font-style: italic;
                            font-weight: 500;
                        }

                        .inflow-highlight {
                            color: #007bff !important;
                            font-weight: 800 !important;
                            font-size: 15px !important;
                        }

                        .outflow-bold {
                            font-weight: 800 !important;
                            font-size: 14px !important;
                        }

                        .trend-value {
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            font-size: 12px;
                            font-weight: 500;
                        }

                        .trend-rising {
                            color: #dc3545;
                        }

                        .trend-falling {
                            color: #28a745;
                        }

                        .trend-stable {
                            color: #6c757d;
                        }

                        .trend-unknown {
                            color: #ffc107;
                        }

                        .timestamp-section {
                            padding-top: 10px;
                            border-top: 1px solid #e0e0e0;
                        }

                        .timestamp-item {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            font-size: 12px;
                            color: #6c757d;
                            justify-content: center;
                        }

                        .timestamp-item i {
                            color: #adb5bd;
                            font-size: 11px;
                        }

                        .timestamp-value {
                            font-weight: 500;
                            color: #495057;
                        }

                        .update-info {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            font-size: 11px;
                            color: #6c757d;
                            justify-content: center;
                            margin-top: 8px;
                            padding-top: 8px;
                            border-top: 1px solid #f0f0f0;
                        }

                        .update-info i {
                            color: #28a745;
                            font-size: 10px;
                        }

                        .upstream-section {
                            margin-top: 10px;
                            padding-top: 10px;
                            border-top: 1px solid #e0e0e0;
                        }

                        .upstream-list, .upstream-simple {
                            display: flex;
                            flex-direction: column;
                            gap: 6px;
                        }

                        .upstream-item {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 6px 10px;
                            background: #f8f9fa;
                            border-radius: 6px;
                            border: 1px solid #e9ecef;
                        }

                        .upstream-item .station-name {
                            font-size: 12px;
                            font-weight: 600;
                            color: #495057;
                            flex: 1;
                            margin: 0;
                        }

                        .lag-time {
                            font-size: 11px;
                            color: #495057;
                            background: #e3f2fd;
                            padding: 2px 6px;
                            border-radius: 10px;
                            font-weight: 600;
                            border: 1px solid #bbdefb;
                        }

                        /* Hide default close button */
                        .mapboxgl-popup-close-button {
                            display: none !important;
                        }

                        .mapboxgl-popup-content {
                            padding: 0 !important;
                            border-radius: 8px !important;
                        }

                        .mapboxgl-popup-tip {
                            border-top-color: #ffffff !important;
                        }
                    </style>
                `;

        // Show popup with enhanced styling
        new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: true,
          maxWidth: '300px',
          className: 'ffd-enhanced-popup'
        })
          .setLngLat(e.lngLat)
          .setHTML(popupHTML)
          .addTo(map1);

        // Check if this is one of our special dams and show fluid meter with reservoir level
        const damData = {
          'Mangla Dam': {
            percentage: fillPercentage_Mangla,
            level: val_Mangla,
            country: 'Pakistan',
            region: 'Mirpur, AJK',
            fullCapacity: 1242,
            lastYearLevel: lastYearLevel_Mangla,
            avg5YearLevel: avg5YearLevel_Mangla,
            variation5Year: variation5Year_Mangla,
            variationArrow: variation5YearArrow_Mangla,
            variationTrend: variation5YearTrend_Mangla
          },
          'Chashma': {
            percentage: fillPercentage_Chashma,
            level: val_Chashma,
            country: 'Pakistan',
            region: 'Mianwali, Punjab',
            fullCapacity: 649,
            lastYearLevel: lastYearLevel_Chashma,
            avg5YearLevel: avg5YearLevel_Chashma,
            variation5Year: variation5Year_Chashma,
            variationArrow: variation5YearArrow_Chashma,
            variationTrend: variation5YearTrend_Chashma
          },
          'Tarbela Dam': {
            percentage: fillPercentage_Tarbela,
            level: val_Tarbela,
            country: 'Pakistan',
            region: 'Haripur, KP',
            fullCapacity: 1550,
            lastYearLevel: lastYearLevel_Tarbela,
            avg5YearLevel: avg5YearLevel_Tarbela,
            variation5Year: variation5Year_Tarbela,
            variationArrow: variation5YearArrow_Tarbela,
            variationTrend: variation5YearTrend_Tarbela
          }
        };

        if (damData.hasOwnProperty(props.name)) {
          const dam = damData[props.name];
          showDamFluidMeter(props.name, dam.percentage, dam.level, dam);
        }

        if (props.name) {
          openFFDHistoryPanel(props.name, props);
        }
      });

      // Helper function to get status color (keeping your existing function)
      function getStatusColor(status) {
        const normalizedStatus = status ? status.toUpperCase() : '';

        switch (normalizedStatus) {
          case 'NORMAL':
            return '#28a745';  // Green - Normal Flow
          case 'LOW':
            return '#00FFFF';  // Teal - Low Flood
          case 'MEDIUM':
            return '#0000FF';  // Blue - Medium Flood
          case 'HIGH':
            return '#fd7e14';  // Orange - High Flood
          case 'VERY_HIGH':
          case 'VERY HIGH':
            return '#7B3F00';  // Purple/Dark Red - Very High Flood
          case 'EX_HIGH':
          case 'EXCEPTIONALLY_HIGH':
          case 'EXCEPTIONALLY HIGH':
            return '#ff0000';  // Red - Exceptionally High Flood
          default:
            return '#999999';  // Default gray
        }
      }

      // Change cursor to pointer on hover
      map1.on('mouseenter', 'ffd_point', () => {
        map1.getCanvas().style.cursor = 'pointer';
      });

      map1.on('mouseleave', 'ffd_point', () => {
        map1.getCanvas().style.cursor = '';
      });

    } catch (error) {
      console.error('Failed to load FFD data:', error);
    }
  };

  // Add FFD layers (style load already guarantees layers can be added)
  addFFDLayers();

  // Toggle visibility based on checkbox (only add listener once)
  if (!document.getElementById("ffd")._ffdListenerAdded) {
    document.getElementById("ffd").addEventListener("change", function () {
      const isVisible = this.checked;

      // Function to apply visibility once layers are available
      const applyFFDVisibility = () => {
        // Toggle FFD point layer
        if (map1.getLayer("ffd_point")) {
          map1.setLayoutProperty("ffd_point", "visibility", isVisible ? "visible" : "none");
        }

        // Toggle FFD label layer
        if (map1.getLayer("ffd_label")) {
          map1.setLayoutProperty("ffd_label", "visibility", isVisible ? "visible" : "none");
        }
      };

      // If layers exist, apply immediately
      if (map1.getLayer("ffd_point") && map1.getLayer("ffd_label")) {
        applyFFDVisibility();
      } else {
        // If layers don't exist yet, wait for them to be added
        const checkForLayers = () => {
          if (map1.getLayer("ffd_point") && map1.getLayer("ffd_label")) {
            applyFFDVisibility();
          } else {
            // Check again in 100ms
            setTimeout(checkForLayers, 100);
          }
        };
        checkForLayers();
      }
    });
    document.getElementById("ffd")._ffdListenerAdded = true;
  }

  // Add refresh button as a separate control next to FFD label
  const addRefreshButtonToFFDLabel = () => {
    // Wait for the FFD label to exist
    const checkForFFDLabel = () => {
      const ffdLabel = document.querySelector('label[for="ffd"]').closest('.flex');
      if (ffdLabel) {
        // Check if refresh button already exists
        if (document.querySelector('.ffd-refresh-btn')) {
          return;
        }

        // Create refresh button as a separate element
        const refreshButton = document.createElement('button');
        refreshButton.className = 'ffd-refresh-btn';
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshButton.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #9ca3af;
                    cursor: pointer;
                    padding: 6px;
                    border-radius: 4px;
                    font-size: 12px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 24px;
                    height: 24px;
                    margin-left: 8px;
                    z-index: 1000000;
                `;

        // Add hover effects
        refreshButton.addEventListener('mouseenter', () => {
          refreshButton.style.color = '#ffffff';
          refreshButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });

        refreshButton.addEventListener('mouseleave', () => {
          refreshButton.style.color = '#9ca3af';
          refreshButton.style.backgroundColor = 'transparent';
        });

        // Add click handler with proper event handling
        refreshButton.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Show loading state
          const icon = refreshButton.querySelector('i');
          const originalClass = icon.className;
          icon.className = 'fas fa-spinner fa-spin';
          refreshButton.disabled = true;
          refreshButton.style.opacity = '0.7';

          try {
            await updateFFDData(true);
          } finally {
            // Reset button state
            icon.className = originalClass;
            refreshButton.disabled = false;
            refreshButton.style.opacity = '1';
          }
        });

        // Insert the refresh button after the FFD label (as a sibling, not child)
        ffdLabel.parentNode.insertBefore(refreshButton, ffdLabel.nextSibling);

        console.log('FFD refresh button added successfully');
      } else {
        // Try again in 100ms if label not found
        setTimeout(checkForFFDLabel, 100);
      }
    };

    checkForFFDLabel();
  };

  // Add the refresh button to FFD label
  addRefreshButtonToFFDLabel();

  // Expose functions globally for debugging/manual control
  window.updateFFDData = updateFFDData;






  //Glofas sites layer
  if (!map1.getSource("glofas")) {
    map1.addSource("glofas", {
      type: "geojson",
      data: glofas // your GeoJSON variable
    });
  }

  // 2. Add circle layer (remove source-layer)
  if (!map1.getLayer("glofas")) {
    map1.addLayer({
      id: "glofas",
      type: "circle",
      source: "glofas",
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-color": "transparent",
        "circle-radius": 10,
        "circle-stroke-color": "red",
        "circle-stroke-width": 3
      }
    });
  }

  // 3. Toggle visibility on checkbox change
  document.getElementById("Glofas").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "glofas",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // 4. Show popup on click
  map1.on("click", "glofas", function (e) {
    const features = map2.queryRenderedFeatures(e.point, { layers: ["glofas"] });
    if (!features.length) return;

    const feature = features[0];
    const name = feature.properties.Name || "N/A";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
      <div style="color:black;">
        <strong>Name:</strong> ${name}<br>
      </div>
    `)
      .addTo(map1);
  });

  // 5. Change cursor on hover
  map1.on('mouseenter', 'glofas', () => {
    map1.getCanvas().style.cursor = 'pointer';
  });
  map1.on('mouseleave', 'glofas', () => {
    map1.getCanvas().style.cursor = '';
  })

  const escapeGlofPopupValue = (value) => {
    if (value === undefined || value === null || value === '') return 'N/A';
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  };

  const createGlofValueRows = (values) => values
    .map(escapeGlofPopupValue)
    .map(value => `
      <div class="discharge-item glof-value-only">
        <span class="discharge-value">${value}</span>
      </div>
    `)
    .join("");

  const createGlofLabeledRow = (label, value) => `
    <div class="discharge-item">
      <span class="discharge-label">${label}:</span>
      <span class="discharge-value">${escapeGlofPopupValue(value)}</span>
    </div>
  `;

  const createGlofPopupContent = ({ title, badgeText, accentColor, iconClass, bodyHtml }) => `
    <div class="ffd-popup-container">
      <div class="popup-header" style="border-left: 4px solid ${accentColor};">
        <div class="station-info">
          <h3 class="station-name">${escapeGlofPopupValue(title)}</h3>
          <div class="status-badge" style="background-color: ${accentColor};">
            <i class="${iconClass || 'fas fa-map-marker-alt'}"></i>
            ${escapeGlofPopupValue(badgeText)}
          </div>
        </div>
      </div>
      <div class="popup-content">
        <div class="discharge-section">
          <div class="discharge-grid">
            ${bodyHtml}
          </div>
        </div>
      </div>
    </div>
    <style>
      .ffd-popup-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        width: 280px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.12),
          0 2px 8px rgba(0, 0, 0, 0.08);
        overflow: hidden;
        border: 2px solid #2196f3;
        position: relative;
      }
      .popup-header {
        background: #f8f9fa;
        padding: 8px 12px;
        border-bottom: 2px solid #e3f2fd;
      }
      .station-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .station-name {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        line-height: 1.2;
        flex: 1;
      }
      .status-badge {
        color: white;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        white-space: nowrap;
      }
      .popup-content {
        padding: 8px 12px 12px;
      }
      .discharge-section {
        margin-bottom: 8px;
      }
      .discharge-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .discharge-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #e3f2fd;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      }
      .discharge-item.glof-value-only {
        justify-content: flex-start;
      }
      .discharge-label {
        font-size: 13px;
        font-weight: 500;
        color: #495057;
      }
      .discharge-value {
        font-size: 14px;
        font-weight: 700;
        color: #212529;
      }
      .mapboxgl-popup-close-button {
        display: none !important;
      }
      .mapboxgl-popup-content {
        padding: 0 !important;
        border-radius: 8px !important;
      }
      .mapboxgl-popup-tip {
        border-top-color: #ffffff !important;
      }
    </style>
  `;

  const addGlofPointLayer = ({ sourceId, layerId, geoserverLayer, color, checkboxId, popupHtml }) => {
    if (!map1.getSource(sourceId)) {
      map1.addSource(sourceId, {
        type: "geojson",
        data: `http://${ahad}:8080/geoserver/GLOF/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(geoserverLayer)}&outputFormat=application/json&srsName=EPSG:4326`
      });
    }

    if (!map1.getLayer(layerId)) {
      map1.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        layout: {
          visibility: "none",
        },
        paint: {
          "circle-color": color,
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5
        }
      });
    }

    const checkbox = document.getElementById(checkboxId);
    if (checkbox && !checkbox._glofPointLayerBound) {
      checkbox.addEventListener("change", function () {
        if (map1.getLayer(layerId)) {
          map1.setLayoutProperty(layerId, "visibility", this.checked ? "visible" : "none");
        }
      });
      checkbox._glofPointLayerBound = true;
    }

    if (!map1[`_${layerId}PopupBound`]) {
      map1.on("click", layerId, function (e) {
        const feature = e.features && e.features[0];
        if (!feature) return;

        new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: true,
          maxWidth: '300px',
          className: 'ffd-enhanced-popup'
        })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(feature.properties || {}))
          .addTo(map1);
      });

      map1.on("mouseenter", layerId, () => {
        map1.getCanvas().style.cursor = "pointer";
      });

      map1.on("mouseleave", layerId, () => {
        map1.getCanvas().style.cursor = "";
      });

      map1[`_${layerId}PopupBound`] = true;
    }
  };

  addGlofPointLayer({
    sourceId: "gmrc_wapda_stations",
    layerId: "gmrc_wapda_stations",
    geoserverLayer: "GLOF:GMRC_Points",
    color: "#2563eb",
    checkboxId: "gmrcWapda",
    popupHtml: (props) => createGlofPopupContent({
      title: props.Name || "GMRC Wapda",
      badgeText: "GMRC Wapda",
      accentColor: "#2563eb",
      iconClass: "fas fa-satellite-dish",
      bodyHtml: createGlofLabeledRow("station name", props.Name)
    })
  });

  addGlofPointLayer({
    sourceId: "pmd_stations",
    layerId: "pmd_stations",
    geoserverLayer: "GLOF:stations",
    color: "#16a34a",
    checkboxId: "pmdStations",
    popupHtml: (props) => createGlofPopupContent({
      title: props.StationNam || "PMD Station",
      badgeText: props.Status || "PMD",
      accentColor: "#16a34a",
      iconClass: "fas fa-cloud-sun-rain",
      bodyHtml: createGlofValueRows([
        props.StationNam,
        props.Status
      ])
    })
  });

  addGlofPointLayer({
    sourceId: "damaged_pmd_stations",
    layerId: "damaged_pmd_stations",
    geoserverLayer: "GLOF:Damage_Stations",
    color: "#dc2626",
    checkboxId: "damagedPmdStations",
    popupHtml: (props) => createGlofPopupContent({
      title: props.StationNam || "Damaged PMD Station",
      badgeText: "Damaged PMD",
      accentColor: "#dc2626",
      iconClass: "fas fa-triangle-exclamation",
      bodyHtml: createGlofValueRows([
        props.StationNam,
        props.Installati,
        props.Column1,
        props.Column2,
        props.Column_3
      ])
    })
  });

  ///Extremely High flood extent
  map1.addSource("Extremly_high", {
    type: "geojson",
    data: `http://${ahad}:8080/geoserver/monsoon/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=monsoon:Extremly%20high&maxFeatures=50&outputFormat=application/json`
  });

  map1.addLayer({
    id: 'Extremly_high',
    type: 'fill',
    source: "Extremly_high",
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.7,
      "fill-color": "Purple"
    },
    layout: {
      'visibility': 'none'
    }
  });

  document.getElementById("EHFE").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Extremly_high",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  // vERY High flood extent
  map1.addSource("Very_high", {
    type: "geojson",
    data: `http://${ahad}:8080/geoserver/monsoon/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=monsoon:Very_high&maxFeatures=50&outputFormat=application/json`
  });

  map1.addLayer({
    id: 'Very_high',
    type: 'fill',
    source: "Very_high",
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.7,
      "fill-color": "brown"
    },
    layout: {
      'visibility': 'none'
    }
  });

  document.getElementById("VHFE").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Very_high",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  //River swat Extent
  if (!map1.getSource("Swat_rivert")) {
    map1.addSource("Swat_rivert", {
      type: "vector",
      scheme: "tms",
      tiles: [
        `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:Swat_rivert@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
      ],
    });
  }

  if (!map1.getLayer("Swat_rivert")) {
    map1.addLayer({
      id: "Swat_rivert",
      type: "fill",
      source: "Swat_rivert",
      "source-layer": "Swat_rivert",
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-outline-color": "red",
        "fill-opacity": 1,
        "fill-color": "orange",
      },
    });
  }


  //Toggler code for the layers
  document.getElementById("swatRiver").addEventListener("change", function () {
    const isVisible = this.checked;
    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Swat_rivert",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //Panjora

  map1.addSource("Panjgora_river", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:Panjgora_river@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Panjgora_river",
    type: "fill",
    source: "Panjgora_river",
    "source-layer": "Panjgora_river",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 1,
      "fill-color": "orange ",
    },
  });
  document.getElementById("panjgoraRiver").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Panjgora_river",
      "visibility",
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  // Flood layer configurations with their corresponding images of the DEW extent
  const floodLayers = {
    // "Kabil_medium_flood": {
    //   name: "Kabul Medium Flood",
    //   image: "media/Exposures+Levels/kabul_medium.png"
    // },
    // "Lower_indus_high_flood": {
    //   name: "Lower Indus High Flood",
    //   image: "media/Exposures+Levels/lower_indus.png"
    // },
    // "Upper_indus_flood": {
    //   name: "Upper Indus Medium Flood",
    //   image: "media/Exposures+Levels/upper_indus.png"
    // },
    // "cmfex": {
    //   name: "Chenab Medium Flood",
    //   image: "media/Exposures+Levels/chenab.png"
    // },
    // "khfex": {
    //   name: "Kabul High Flood",
    //   image: "media/Exposures+Levels/kabul_high.png"
    // },
    // "jlfex": {
    //   name: "Jhelum Low Flood",
    //   image: "media/Exposures+Levels/jhelum.png"
    // },
    // "2_Swat_River_25yr_Flood_Extent": {
    //   name: "Swat River Medium Flood",
    //   image: "media/Exposures+Levels/Swat.png"
    // },
    // "rlfex": {
    //   name: "Ravi Low Flood",
    //   image: "media/Exposures+Levels/ravi_low.png"
    // },
    // "slfex": {
    //   name: "Sutlej Low Flood",
    //   image: "media/Exposures+Levels/sutlej_low.png"
    // },
    // "DG khan HT":{
    //   name: "DG Khan and Rajanpur Hill Torrents",
    //   image: "media/Exposures+Levels/ft_arc_dg.png"
    // },
    // "DI_Khan_HT":{
    //   name: "DI Khan Hill Torrents",
    //   image: "media/Exposures+Levels/ft_arc_di.png"
    // },
    // "jhal_magsi_arc":{
    //   name: "Jhal Magsi Torrents",
    //   image: "media/Exposures+Levels/ft_arc_jhal.png"
    // },
    // "Hyderabad_arc":{
    //   name: "Hyderabad Flash Floods",
    //   image: "media/Exposures+Levels/ft_arc_hyderabad.png"
    // }
  };

  // // Create fullscreen overlay for image viewing flood extents
  // function createFullscreenOverlay() {
  //   const overlay = document.createElement('div');
  //   overlay.id = 'fullscreen-overlay';
  //   overlay.style.cssText = `
  //   position: fixed;
  //   top: 0;
  //   left: 0;
  //   width: 100%;
  //   height: 100%;
  //   background-color: rgba(0, 0, 0, 0.9);
  //   display: none;
  //   justify-content: center;
  //   align-items: center;
  //   z-index: 10000;
  //   cursor: pointer;
  // `;

  //   const img = document.createElement('img');
  //   img.id = 'fullscreen-image';
  //   img.style.cssText = `
  //   max-width: 90%;
  //   max-height: 90%;
  //   object-fit: contain;
  //   border-radius: 8px;
  //   box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
  // `;

  //   const closeBtn = document.createElement('button');
  //   closeBtn.innerHTML = '×';
  //   closeBtn.style.cssText = `
  //   position: absolute;
  //   top: 20px;
  //   right: 30px;
  //   background: none;
  //   border: none;
  //   color: white;
  //   font-size: 40px;
  //   cursor: pointer;
  //   z-index: 10001;
  // `;

  //   overlay.appendChild(img);
  //   overlay.appendChild(closeBtn);
  //   document.body.appendChild(overlay);

  //   // Close fullscreen on overlay click or close button
  //   overlay.addEventListener('click', closeFullscreen);
  //   closeBtn.addEventListener('click', closeFullscreen);

  //   // Prevent image click from closing overlay
  //   img.addEventListener('click', (e) => e.stopPropagation());

  //   return overlay;
  // }


  // // Close fullscreen image
  // function closeFullscreen() {
  //   const overlay = document.getElementById('fullscreen-overlay');
  //   overlay.style.display = 'none';
  //   document.body.style.overflow = 'auto';
  // }

  // // Create popup content with image of flood extent
  // function createPopupContent(layerName, imagePath) {
  //   return `
  //   <div style="text-align: center; padding: 10px;">
  //     <h3 style="margin: 0 0 10px 0; color: #333;">${layerName}</h3>
  //     <img 
  //       src="${imagePath}" 
  //       alt="${layerName}"
  //       style="
  //         max-width: 250px;
  //         max-height: 200px;
  //         cursor: pointer;
  //         border-radius: 5px;
  //         box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  //         transition: transform 0.2s;
  //       "
  //       onmouseover="this.style.transform='scale(1.05)'"
  //       onmouseout="this.style.transform='scale(1)'"
  //       onclick="showFullscreen('${imagePath}')"
  //     />
  //     <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
  //       Click image to view fullscreen
  //     </p>
  //   </div>
  // `;
  // }

  // // Initialize fullscreen overlay
  // createFullscreenOverlay();


  //DI khan HT extent
map1.addSource("DI_Khan_HT", {
  type: "geojson",
  data: `http://${ahad}:8080/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3ADI_Khan_HT&outputFormat=application%2Fjson`,
});

map1.addLayer({
  id: "DI_Khan_HT",
  type: "fill",
  source: "DI_Khan_HT",
  layout: {
    visibility: "none",
  },
  paint: {
    "fill-outline-color": "red",
    "fill-opacity": 0.5,
    "fill-color": "red",
  },
});

document.getElementById("di_ht").addEventListener("change", function () {
  const isVisible = this.checked;

  map1.setLayoutProperty(
    "DI_Khan_HT",
    "visibility",
    isVisible ? "visible" : "none"
  );
});

  //DG khan HT extent
  map1.addSource("DG khan HT", {
    type: "geojson",
    data: `http://${ahad}:8080/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3ADG%20khan%20HT&outputFormat=application%2Fjson`,
  });
  map1.addLayer({
    id: "DG khan HT",
    type: "fill",
    source: "DG khan HT",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("dg_ht").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "DG khan HT",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  //Pir_Panjal_HT Extent
  map1.addSource("Pir_Panjal_HT", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Pir_Panjal_HT@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Pir_Panjal_HT",
    type: "fill",
    source: "Pir_Panjal_HT",
    "source-layer": "Pir_Panjal_HT",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("p_panjal").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Pir_Panjal_HT",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  //Hyderabad arc extent
  map1.addSource("Hyderabad_arc", {
    type: "geojson",
    data: `http://${ahad}:8080/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3AHyderabad_arc&outputFormat=application%2Fjson`,
  });
  map1.addLayer({
    id: "Hyderabad_arc",
    type: "fill",
    source: "Hyderabad_arc",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("hyder").addEventListener("change", function () { 
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Hyderabad_arc",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  //jhal arc extent
  map1.addSource("jhal_magsi_arc_Complete", {
    type: "geojson",
    data: `http://${ahad}:8080/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3Ajhal_magsi_arc_Complete&outputFormat=application%2Fjson`,
  });
  map1.addLayer({
    id: "jhal_magsi_arc_Complete",
    type: "fill",
    source: "jhal_magsi_arc_Complete",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("jhall").addEventListener("change", function () { 
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "jhal_magsi_arc_Complete",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  // map1.addSource("jhal_magsi_arc_full", {
  //   type: "vector",

  //   scheme: "tms",
  //   tiles: [
  //     `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:jhal_magsi_arc_full@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
  //   ],
  // });
  // map1.addLayer({
  //   id: "jhal_magsi_arc_full",
  //   type: "fill",
  //   source: "jhal_magsi_arc_full",
  //   "source-layer": "jhal_magsi_arc_full",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "fill-outline-color": "red",
  //     "fill-opacity": 0.5,
  //     "fill-color": "red",
  //   },
  // }, 'water');
  // document.getElementById("jhall").addEventListener("change", function () {
  //   const isVisible = this.checked;
  //   map1.setLayoutProperty(
  //     "jhal_magsi_arc_full",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });


  ///Kirthar range arc extent
  map1.addSource("KIRTHAR_RANGE", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:KIRTHAR_RANGE@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "KIRTHAR_RANGE",
    type: "fill",
    source: "KIRTHAR_RANGE",
    "source-layer": "KIRTHAR_RANGE",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("Kirthar_extent").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "KIRTHAR_RANGE",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Hill Torrents (Hydrooutlook 2026)
  if (!map1.getSource("Bajaur_150mm")) {
    map1.addSource("Bajaur_150mm", {
     type: "vector",
     scheme: "tms",
     tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:bajaur_hill_torrents@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
     ],
    });
  }

  if (!map1.getLayer("Bajaur_150mm")) {
    map1.addLayer({
      id: "Bajaur_150mm",
      type: "fill",
      source: "Bajaur_150mm",
      "source-layer": "bajaur_hill_torrents",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-outline-color": "#ff0000",
        "fill-opacity": 0.7,
        "fill-color": "#ff0000"
      }
    });
  }

  const bajaur150Checkbox = document.getElementById("bajaur150");
  if (bajaur150Checkbox) {
    bajaur150Checkbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "Bajaur_150mm",
        "visibility",
        isVisible ? "visible" : "none"
      );
    }); 
  }

  // Hill Torrents (Hydrooutlook 2026) - Buner 150mm (WFS GeoJSON)
  if (!map1.getSource("Buner_150mm")) {
    map1.addSource("Buner_150mm", {
      type: "geojson",
      data: `http://${ahad}:8080/geoserver/monsoon/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=monsoon:Buner_inundation_filtered&outputFormat=application/json&srsName=EPSG:4326`
    });
  }

  if (!map1.getLayer("Buner_150mm")) {
    map1.addLayer({
      id: "Buner_150mm",
      type: "fill",
      source: "Buner_150mm",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-outline-color": "#ff0000",
        "fill-opacity": 0.7,
        "fill-color": "#ff0000"
      }
    });
  }

  const buner150Checkbox = document.getElementById("buner150");
  if (buner150Checkbox) {
    buner150Checkbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "Buner_150mm",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Mardan medium (WFS GeoJSON)
  if (!map1.getSource("Mardan_inundation_filter")) {
    map1.addSource("Mardan_inundation_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Mardan_inundation_filter&outputFormat=application/json&srsName=EPSG:4326`
    });
  }

  if (!map1.getLayer("Mardan_inundation_filter")) {
    map1.addLayer({
      id: "Mardan_inundation_filter",
      type: "fill",
      source: "Mardan_inundation_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff8c00"
      }
    });
  }

  const mardanMediumCheckbox = document.getElementById("mardanMedium");
  if (mardanMediumCheckbox) {
    mardanMediumCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "Mardan_inundation_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Kech & Panjgur Medium (50mm)
  if (!map1.getSource("kech_panjgur_50mm_filter")) {
    map1.addSource("kech_panjgur_50mm_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:kech%26panjgur_50mm_filter&outputFormat=application/json&srsName=EPSG:4326`
    });
  }

  if (!map1.getLayer("kech_panjgur_50mm_filter")) {
    map1.addLayer({
      id: "kech_panjgur_50mm_filter",
      type: "fill",
      source: "kech_panjgur_50mm_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff8c00"
      }
    });
  }

  const kechPanjgurMediumCheckbox = document.getElementById("kechPanjgurMedium");
  if (kechPanjgurMediumCheckbox) {
    kechPanjgurMediumCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "kech_panjgur_50mm_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Kech & Panjgur High (100mm)
  if (!map1.getSource("kech_panjgur_100mm_filter")) {
    map1.addSource("kech_panjgur_100mm_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:kech%26panjgaur_100mm_filter&outputFormat=application/json&srsName=EPSG:4326`
    });
  }

  if (!map1.getLayer("kech_panjgur_100mm_filter")) {
    map1.addLayer({
      id: "kech_panjgur_100mm_filter",
      type: "fill",
      source: "kech_panjgur_100mm_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff0000"
      }
    });
  }

  const kechPanjgurHighCheckbox = document.getElementById("kechPanjgurHigh");
  if (kechPanjgurHighCheckbox) {
    kechPanjgurHighCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "kech_panjgur_100mm_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Chakwal (WFS GeoJSON)
  if (!map1.getSource("Chakwal_inundation")) {
    map1.addSource("Chakwal_inundation", {
     type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:chakwal_hill_torrents@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
 }
  if (!map1.getLayer("Chakwal_inundation")) {
    map1.addLayer({
      id: "Chakwal_inundation",
      type: "fill",
      source: "Chakwal_inundation",
      "source-layer": "chakwal_hill_torrents",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff0000"
      }
    });
  }

  const chakwalCheckbox = document.getElementById("chakwal");
  if (chakwalCheckbox) {
    chakwalCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "Chakwal_inundation",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Palkhu Low (75mm)
  if (!map1.getSource("pulkhu_75mm_filter")) {
    map1.addSource("pulkhu_75mm_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:pulkhu_75mm_filter&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("pulkhu_75mm_filter")) {
    map1.addLayer({
      id: "pulkhu_75mm_filter",
      type: "fill",
      source: "pulkhu_75mm_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#2fbf2f"
      }
    });
  }

  const palkhuLowCheckbox = document.getElementById("palkhuLow");
  if (palkhuLowCheckbox) {
    palkhuLowCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "pulkhu_75mm_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Palkhu Medium (150)
  if (!map1.getSource("pulkhu_150_filter")) {
    map1.addSource("pulkhu_150_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:pulkhu_150_filter&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("pulkhu_150_filter")) {
    map1.addLayer({
      id: "pulkhu_150_filter",
      type: "fill",
      source: "pulkhu_150_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff8c00"
      }
    });
  }

  const palkhuMediumCheckbox = document.getElementById("palkhuMedium");
  if (palkhuMediumCheckbox) {
    palkhuMediumCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "pulkhu_150_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Palkhu High (300)
  if (!map1.getSource("pulkhu_300_filter")) {
    map1.addSource("pulkhu_300_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:pulkhu_300_filter&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("pulkhu_300_filter")) {
    map1.addLayer({
      id: "pulkhu_300_filter",
      type: "fill",
      source: "pulkhu_300_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff0000"
      }
    });
  }

  const palkhuHighCheckbox = document.getElementById("palkhuHigh");
  if (palkhuHighCheckbox) {
    palkhuHighCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "pulkhu_300_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Baein & Basantar Medium (150mm)
  if (!map1.getSource("baein_basantar_150mm")) {
    map1.addSource("baein_basantar_150mm", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Baein%26Basantar_150mm&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("baein_basantar_150mm")) {
    map1.addLayer({
      id: "baein_basantar_150mm",
      type: "fill",
      source: "baein_basantar_150mm",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff8c00"
      }
    });
  }

  const baeinBasantarMediumCheckbox = document.getElementById("baeinBasantarMedium");
  if (baeinBasantarMediumCheckbox) {
    baeinBasantarMediumCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "baein_basantar_150mm",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Baein & Basantar High (350mm)
  if (!map1.getSource("baein_basantar_350mm")) {
    map1.addSource("baein_basantar_350mm", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Baein%26Basantar_350mm&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("baein_basantar_350mm")) {
    map1.addLayer({
      id: "baein_basantar_350mm",
      type: "fill",
      source: "baein_basantar_350mm",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff0000"
      }
    });
  }

  const baeinBasantarHighCheckbox = document.getElementById("baeinBasantarHigh");
  if (baeinBasantarHighCheckbox) {
    baeinBasantarHighCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "baein_basantar_350mm",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Manawar Tawi Low (60mm)
  if (!map1.getSource("munawar_tawi_60mm_filter")) {
    map1.addSource("munawar_tawi_60mm_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:munawar_tawi_60mm_filter&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("munawar_tawi_60mm_filter")) {
    map1.addLayer({
      id: "munawar_tawi_60mm_filter",
      type: "fill",
      source: "munawar_tawi_60mm_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#2fbf2f"
      }
    });
  }

  const manawarTawiLowCheckbox = document.getElementById("manawarTawiLow");
  if (manawarTawiLowCheckbox) {
    manawarTawiLowCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "munawar_tawi_60mm_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  // Hill Torrents (Hydrooutlook 2026) - Manawar Tawi Medium (150mm)
  if (!map1.getSource("munawar_150mm_filter")) {
    map1.addSource("munawar_150mm_filter", {
      type: "geojson",
      data: `http://${geoserverUrl}:8080/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:munawar_150mm_filter&outputFormat=application/json&srsName=EPSG:4326`,
    });
  }

  if (!map1.getLayer("munawar_150mm_filter")) {
    map1.addLayer({
      id: "munawar_150mm_filter",
      type: "fill",
      source: "munawar_150mm_filter",
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "#ff8c00"
      }
    });
  }

  const manawarTawiMediumCheckbox = document.getElementById("manawarTawiMedium");
  if (manawarTawiMediumCheckbox) {
    manawarTawiMediumCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "munawar_150mm_filter",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  ///Flood extent of riverine flooding
  //lower indus high flood extent
  map1.addSource("lihfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:lower_indus_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map1.addLayer({
    id: "lihfex",
    type: "fill",
    source: "lihfex",
    "source-layer": "lower_indus_high_outlook_2026",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("lowerIndusHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "lihfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///LOWER INDUS MEDIUM
  map1.addSource("limfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:lower_indus_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map1.addLayer({
    id: "limfex",
    type: "fill",
    source: "limfex",
    "source-layer": "lower_indus_medium_outlook_2026",
    layout: {

      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("lowerIndusMediumFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "limfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///Lower Indus low flood

  map1.addSource("lilfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:lower_indus_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "lilfex",
    type: "fill",
    source: "lilfex",
    "source-layer": "lower_indus_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("lowerIndusLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "lilfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  /////Upper indus high flooding 
  map1.addSource("uihfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:upper_indus_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "uihfex",
    type: "fill",
    source: "uihfex",
    "source-layer": "upper_indus_high_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("upperIndusHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "uihfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  ////Upper indus medium
  map1.addSource("Upper_indus_flood", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:upper_indus_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Upper_indus_flood",
    type: "fill",
    source: "Upper_indus_flood",
    "source-layer": "upper_indus_medium_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("upperIndusFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Upper_indus_flood",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  /////Upper indus Low

  map1.addSource("uilfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:upper_indus_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "uilfex",
    type: "fill",
    source: "uilfex",
    "source-layer": "upper_indus_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("upperIndusLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "uilfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Chenab High flood extent
  map1.addSource("chfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:chenab_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: 'chfex',
    type: 'fill',
    source: "chfex",
    "source-layer": "chenab_high_outlook_2026",
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
    layout: {
      'visibility': 'none'
    }
  });

  document.getElementById("chenabHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "chfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Chenab Medium flood extent
  map1.addSource("cmfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:chenab_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "cmfex",
    type: "fill",
    source: "cmfex",
    "source-layer": "chenab_medium_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("chenabMediumFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "cmfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Chenab Low flood extent
  map1.addSource("clfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:chenab_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: 'clfex',
    type: 'fill',
    source: "clfex",
    "source-layer": "chenab_low_outlook_2026",
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
    layout: {
      'visibility': 'none'
    }
  });

  document.getElementById("chenabLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "clfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Kabul high flood extent
  map1.addSource("khfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:kabul_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "khfex",
    type: "fill",
    source: "khfex",
    "source-layer": "kabul_high_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("kabilHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "khfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Add your existing layer code here
  map1.addSource("Kabil_medium_flood", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:kabul_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Kabil_medium_flood",
    type: "fill",
    source: "Kabil_medium_flood",
    "source-layer": "kabul_medium_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.9,
      "fill-color": "orange",
    },
  });
  document.getElementById("kabilMediumFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Kabil_medium_flood",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  ///kabul low flood extent

  map1.addSource("klfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:kabul_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "klfex",
    type: "fill",
    source: "klfex",
    "source-layer": "kabul_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("kabilLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "klfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  ////Jhelum High
  map1.addSource("jhfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:jhelum_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "jhfex",
    type: "fill",
    source: "jhfex",
    "source-layer": "jhelum_high_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("jhelumHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "jhfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  ///Jhelum Medium
  map1.addSource("jmfex", {
    type: "geojson",
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Ajmfex&outputFormat=application%2Fjson`,
  });

  map1.addLayer({
    id: "jmfex",
    type: "fill",
    source: "jmfex",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("jhelumMediumFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "jmfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });
  // Jhelum low flood extent
  map1.addSource("jlfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:jhelum_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "jlfex",
    type: "fill",
    source: "jlfex",
    "source-layer": "jhelum_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("jhelumLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "jlfex", 
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  // Swat high flood extent
  map1.addSource("3_Swat_River_50yr_Flood_Extent", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:swat_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "3_Swat_River_50yr_Flood_Extent",
    type: "fill",
    source: "3_Swat_River_50yr_Flood_Extent",
    "source-layer": "swat_high_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("swatHighExtent").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "3_Swat_River_50yr_Flood_Extent",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  // Swat medium flood extent
  map1.addSource("2_Swat_River_25yr_Flood_Extent", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:swat_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "2_Swat_River_25yr_Flood_Extent",
    type: "fill",
    source: "2_Swat_River_25yr_Flood_Extent",
    "source-layer": "swat_medium_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("swatExtent").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "2_Swat_River_25yr_Flood_Extent",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Swat low flood extent
  map1.addSource("1_Swat_River_5yr_Flood_Extent", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:swat_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "1_Swat_River_5yr_Flood_Extent",
    type: "fill",
    source: "1_Swat_River_5yr_Flood_Extent",
    "source-layer": "swat_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("swatLowExtent").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "1_Swat_River_5yr_Flood_Extent",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ////Muzzaffarabad arc
  map1.addSource("Muzafferabad_arc", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Muzafferabad_arc@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Muzafferabad_arc",
    type: "fill",
    source: "Muzafferabad_arc",
    "source-layer": "Muzafferabad_arc",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("muzExtent").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Muzafferabad_arc",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  //Muzzaffarabad urban flOODING raster tiff

  map1.addSource('Depth_Max_Terrain_DEM_AJK1', {
    type: 'raster',
    tiles: [
      `http://${ahad}:8080/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Depth_Max_Terrain_DEM_AJK1&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
    ],
    tileSize: 256
  });
  map1.addLayer({
    id: 'Depth_Max_Terrain_DEM_AJK1',
    type: 'raster',
    source: 'Depth_Max_Terrain_DEM_AJK1',
    paint: { 'raster-opacity': 1 },
    layout: { visibility: 'none' }
  }, 'Muzafferabad_arc');


  document.getElementById("muzflash").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Depth_Max_Terrain_DEM_AJK1",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  const addHydroAnalyticsGeoJsonLayer = (layerId, geoserverLayerName, beforeId) => {
    if (!map1.getSource(layerId)) {
      map1.addSource(layerId, {
        type: 'geojson',
        data: `http://${ahad}:8080/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3A${geoserverLayerName}&outputFormat=application%2Fjson`
      });
    }

    if (!map1.getLayer(layerId)) {
      map1.addLayer({
        id: layerId,
        type: 'fill',
        source: layerId,
        layout: { visibility: 'none' },
        paint: {
          'fill-outline-color': '#ff0000',
          'fill-opacity': 0.55,
          'fill-color': '#ff0000'
        }
      }, map1.getLayer(beforeId) ? beforeId : undefined);
    }
  };

  addHydroAnalyticsGeoJsonLayer('Gilgit_HT', 'Gilgit', 'Muzafferabad_arc');
  addHydroAnalyticsGeoJsonLayer('Hunza_HT', 'Hunza', 'Muzafferabad_arc');

  const gilgitHtCheckbox = document.getElementById("gilgitHt");
  if (gilgitHtCheckbox) {
    gilgitHtCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "Gilgit_HT",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }

  const hunzaHtCheckbox = document.getElementById("hunzaHt");
  if (hunzaHtCheckbox) {
    hunzaHtCheckbox.addEventListener("change", function () {
      const isVisible = this.checked;
      map1.setLayoutProperty(
        "Hunza_HT",
        "visibility",
        isVisible ? "visible" : "none"
      );
    });
  }


  //Jhal magzi RASTER TIFF
  map1.addSource('Terrain_Jhal_Depth', {
    type: 'raster',
    tiles: [
      `http://${ahad}:8080/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Terrain_Jhal_Depth&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
    ],
    tileSize: 256
  });
  map1.addLayer({
    id: 'Terrain_Jhal_Depth',
    type: 'raster',
    source: 'Terrain_Jhal_Depth',
    paint: { 'raster-opacity': 1 },
    layout: { visibility: 'none' }
  }, 'jhal_magsi_arc_Complete');


  document.getElementById("jhal").addEventListener("change", function () {
    const isVisible = this.checked;
    console.log(`Jhal checkbox changed: ${isVisible}`);

    // Check if layer exists, if not, add it first
    if (!map1.getLayer("Terrain_Jhal_Depth")) {
      console.log("Layer 'Terrain_Jhal_Depth' not found, adding it now...");

      // Add the source if it doesn't exist
      if (!map1.getSource("Terrain_Jhal_Depth")) {
        console.log("Adding source 'Terrain_Jhal_Depth'...");
        map1.addSource('Terrain_Jhal_Depth', {
          type: 'raster',
          tiles: [
            `http://${ahad}:8080/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Terrain_Jhal_Depth&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
          ],
          tileSize: 256
        });
      } else {
        console.log("Source 'Terrain_Jhal_Depth' already exists");
      }

      // Add the layer (try with beforeId, fallback without it)
      try {
        map1.addLayer({
          id: 'Terrain_Jhal_Depth',
          type: 'raster',
          source: 'Terrain_Jhal_Depth',
          paint: { 'raster-opacity': 1 },
          layout: { visibility: 'none' }
        }); // Use 'water' as beforeId for proper ordering
        console.log("Layer 'Terrain_Jhal_Depth' added successfully with beforeId");
      } catch (e) {
        // If that fails, add without beforeId
        console.log("Adding layer without beforeId...", e.message);
        map1.addLayer({
          id: 'Terrain_Jhal_Depth',
          type: 'raster',
          source: 'Terrain_Jhal_Depth',
          paint: { 'raster-opacity': 1 },
          layout: { visibility: 'none' }
        });
        console.log("Layer 'Terrain_Jhal_Depth' added successfully without beforeId");
      }
    } else {
      console.log("Layer 'Terrain_Jhal_Depth' already exists");
    }

    // Now set the visibility
    try {
      map1.setLayoutProperty(
        "Terrain_Jhal_Depth",
        "visibility",
        isVisible ? "visible" : "none"
      );
      console.log(`Layer visibility set to: ${isVisible ? "visible" : "none"}`);
    } catch (e) {
      console.error("Error setting layer visibility:", e.message);
    }
  });

  /// Hyderabad rASTER TIFF
  map1.addSource('Terrain_hyd', {
    type: 'raster',
    tiles: [
      `http://${ahad}:8080/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Terrain_hyd&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
    ],
    tileSize: 256
  });
  map1.addLayer({
    id: 'Terrain_hyd',
    type: 'raster',
    source: 'Terrain_hyd',
    paint: { 'raster-opacity': 1 },
    layout: { visibility: 'none' }
  },);


  document.getElementById("hyderabad").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Terrain_hyd",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  ///Jamshoro flooding
  map1.addSource("Jamshoro flooding", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Jamshoro flooding@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Jamshoro flooding",
    type: "fill",
    source: "Jamshoro flooding",
    "source-layer": "Jamshoro flooding",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  });
  document.getElementById("jamshoro").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Jamshoro flooding",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });






  //flood extents continued
  // Ravi High flood extent
  map1.addSource("rhfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:ravi_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map1.addLayer({
    id: "rhfex",
    type: "fill",
    source: "rhfex",
    "source-layer": "ravi_high_outlook_2026",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("raviHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "rhfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  // Ravi Medium flood extent
  map1.addSource("rmfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:ravi_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map1.addLayer({
    id: "rmfex",
    type: "fill",
    source: "rmfex",
    "source-layer": "ravi_medium_outlook_2026",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("raviMediumFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "rmfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });




  // Ravi low flood extent
  map1.addSource("rlfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/	gcop:ravi_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "rlfex",
    type: "fill",
    source: "rlfex",
    "source-layer": "ravi_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("raviLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "rlfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  ///Sutlej High Flood
  map1.addSource("shfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:sutlej_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "shfex",
    type: "fill",
    source: "shfex",
    "source-layer": "sutlej_high_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  });
  document.getElementById("sutlejHighFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "shfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  ///Sutlej Medium Flood
  map1.addSource("smfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:sutlej_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map1.addLayer({
    id: "smfex",
    type: "fill",
    source: "smfex",
    "source-layer": "sutlej_medium_outlook_2026",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  });
  document.getElementById("sutlejMediumFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "smfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });




  // Sutlej low flood extent
  map1.addSource("slfex", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:sutlej_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "slfex",
    type: "fill",
    source: "slfex",
    "source-layer": "sutlej_low_outlook_2026",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  });
  document.getElementById("sutlejLowFlood").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "slfex",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });




  // Add click event listeners for all flood layers
  // Object.keys(floodLayers).forEach(layerId => {
  //   map1.on('click', layerId, function (e) {
  //     const layerConfig = floodLayers[layerId];
  //     const coordinates = e.lngLat;

  //     // Create popup with image
  //     const popupContent = createPopupContent(layerConfig.name, layerConfig.image);

  //     new mapboxgl.Popup({
  //       closeOnClick: true,
  //       closeButton: true,
  //       maxWidth: '300px'
  //     })
  //       .setLngLat(coordinates)
  //       .setHTML(popupContent)
  //       .addTo(map1);
  //   });

  //   // Change cursor to pointer when hovering over layers
  //   map1.on('mouseenter', layerId, function () {
  //     map1.getCanvas().style.cursor = 'pointer';
  //   });

  //   map1.on('mouseleave', layerId, function () {
  //     map1.getCanvas().style.cursor = '';
  //   });
  // });

  // // Add keyboard support for closing fullscreen (ESC key)
  // document.addEventListener('keydown', function (e) {
  //   if (e.key === 'Escape') {
  //     closeFullscreen();
  //   }
  // });

  //Barrages layer
  map1.addSource("Barrages", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:barrages_v1@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add the circle layer for Barrages
  map1.addLayer({
    id: "Barrages",
    type: "circle",
    source: "Barrages",
    "source-layer": "barrages_v1",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-opacity": 1,
      "circle-color": "brown",
      "circle-radius": 6
    },
  });

  // Handle the toggle checkbox
  document.getElementById("Barrages").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Barrages",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Add popup on click for Barrages
  map1.on('click', 'Barrages', function (e) {
    // Get the first feature at the click location
    const feature = e.features[0];
    // Get coordinates and handle wrap-around for longitudes
    const coordinates = feature.geometry.type === 'Point' ?
      feature.geometry.coordinates.slice() :
      e.lngLat.toArray();

    // Get the Name2 property from feature
    const name2 = feature.properties.name2 || "N/A";

    // Create and show the popup
    new mapboxgl.Popup()
      .setLngLat(coordinates)
      .setHTML(`<div style="color:black;">${name2}</div>`)
      .addTo(map1);
  });

  // Change the cursor to pointer when hovering over Barrages
  map1.on('mouseenter', 'Barrages', function () {
    map1.getCanvas().style.cursor = 'pointer';
  });
  map1.on('mouseleave', 'Barrages', function () {
    map1.getCanvas().style.cursor = '';
  });

  //Kp drainage raster
  map1.addSource("KPKDrainage_Density", {
    'type': 'raster',
    'tiles': [
      `http://${mustafa}:8080/geoserver/ne/wms?service=WMS&version=1.1.0&request=GetMap&layers=KPKDrainage_Density&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map1.addLayer({
    'id': 'KPKDrainage_Density',
    'type': 'raster',
    'source': 'KPKDrainage_Density',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("kpkDrainageDensity").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "KPKDrainage_Density",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //Pir Panjal raster
  map1.addSource("P_panjal_Cl", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=P_panjal_Cl&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 128
  });

  map1.addLayer({
    'id': 'P_panjal_Cl',
    'type': 'raster',
    'source': 'P_panjal_Cl',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("panjal").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "P_panjal_Cl",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  ////Sargodha raster tiff

  map1.addSource("Depth (Max).Terrain.sargodha", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Depth (Max).Terrain.sargodha&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 128
  });

  map1.addLayer({
    'id': 'Depth (Max).Terrain.sargodha',
    'type': 'raster',
    'source': 'Depth (Max).Terrain.sargodha',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("sargodha").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Depth (Max).Terrain.sargodha",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  ////Rawalpindi raster tiff

  map1.addSource("Depth (Max).Terrain.Rawalpindi", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Depth (Max).Terrain.Rawalpindi&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 128
  });

  map1.addLayer({
    'id': 'Depth (Max).Terrain.Rawalpindi',
    'type': 'raster',
    'source': 'Depth (Max).Terrain.Rawalpindi',
    'layout': { 'visibility': 'none' }
  });




  document.getElementById("rwp").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Depth (Max).Terrain.Rawalpindi",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });



  /////Faislabad raster tiff
  map1.addSource("Depth (Max).Terrain.dem_faislabad", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Depth (Max).Terrain.dem_faislabad&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 128
  });

  map1.addLayer({
    'id': 'Depth (Max).Terrain.dem_faislabad',
    'type': 'raster',
    'source': 'Depth (Max).Terrain.dem_faislabad',
    'layout': { 'visibility': 'none' }
  });

  document.getElementById("fais").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Depth (Max).Terrain.dem_faislabad",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  /////Nowshera raster tiff
  map1.addSource("Nowshera_Depth", {
    'type': 'raster',
    'tiles': [
      `http://${ahad}:8080/geoserver/HydroAnalytics2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Nowshera_Depth&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 128
  });

  map1.addLayer({
    'id': 'Nowshera_Depth',
    'type': 'raster',
    'source': 'Nowshera_Depth',
    'layout': { 'visibility': 'none' }
  });

  document.getElementById("nowshera").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Nowshera_Depth",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });
  /////Charsada raster tiff
  map1.addSource("Charsadda_Depth", {
    'type': 'raster',
    'tiles': [
      `http://${ahad}:8080/geoserver/HydroAnalytics2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Charsadda_Depth&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 128
  });

  map1.addLayer({
    'id': 'Charsadda_Depth',
    'type': 'raster',
    'source': 'Charsadda_Depth',
    'layout': { 'visibility': 'none' }
  });

  document.getElementById("charsadda").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Charsadda_Depth",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });




  //Sindh raster tiff

  map1.addSource("Sindh", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Sindh&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map1.addLayer({
    'id': 'Sindh',
    'type': 'raster',
    'source': 'Sindh',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("Sindh").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Sindh",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });





  //Kirthar raster tiff
  map1.addSource("Kirthar", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Kirthar_Cl&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map1.addLayer({
    'id': 'Kirthar',
    'type': 'raster',
    'source': 'Kirthar',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("Kirthar").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Kirthar",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //DG khan raster tiff-----------------------------------------------------------------------------
  map1.addSource("DG khan", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=DG khan&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });
  map1.addLayer({
    'id': 'DG khan',
    'type': 'raster',
    'source': 'DG khan',
    'layout': { 'visibility': 'none' }
  });
  document.getElementById("DG").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "DG khan",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //DI KHAN raster tiff-----------------------------------------------------------------------------------------------------------------------------------
  map1.addSource("DIKHAN_CL", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=DIKHAN_CL&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map1.addLayer({
    'id': 'DIKHAN_CL',
    'type': 'raster',
    'source': 'DIKHAN_CL',
    'layout': { 'visibility': 'none' }
  });

  document.getElementById("DI").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "DIKHAN_CL",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //gujranwala raster tiff---------------------------------------------------------------------------------------------
  map1.addSource("Gujranwala", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Gujranwala&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map1.addLayer({
    'id': 'Gujranwala',
    'type': 'raster',
    'source': 'Gujranwala',
    'layout': { 'visibility': 'none' }
  });

  document.getElementById("Gujranwala").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Gujranwala",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });




  //upper kp_ahp layer-----------------------------------------------------------------------------------------------------------
  map1.addSource("upper_KP", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=upper_KP&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map1.addLayer({
    'id': 'upper_KP',
    'type': 'raster',
    'source': 'upper_KP',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("ahp_kp").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "upper_KP",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //lower kp_ahp------------------------------------------------------------------------------------------------------
  map1.addSource("Lower_KP", {
    'type': 'raster',
    'tiles': [
      `http://${mamHimael}:8080/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Lower_KP&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });
  map1.addLayer({
    'id': 'Lower_KP',
    'type': 'raster',
    'source': 'Lower_KP',
    'layout': { 'visibility': 'none' }
  });

  document.getElementById("ahp_kp").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "Lower_KP",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  map1.loadImage("https://i.ibb.co/QvGCF1Dw/flood.png", (error, image) => {
    if (error) throw error;
    map1.addImage("Flood", image);
  });

  ///urban flooding KP points
  map1.addSource("kpk_urban", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:kpk_urban@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "kpk_urban",
    type: "circle",
    source: "kpk_urban",
    "source-layer": "kpk_urban",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": 'transparent',
      "circle-radius": 10,
      "circle-stroke-color": "red",
      "circle-stroke-width": 3


    }
  });

  document.getElementById("urbanFloodingKpk").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "kpk_urban",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // === ADD POPUP ON CLICK ===
  map1.on("click", "kpk_urban", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["kpk_urban"] });
    if (!features.length) return;

    const feature = features[0];
    // Be sure the property names match what's in your data!
    const name = feature.properties.NAME || "N/A";
    const district = feature.properties.District || "N/A";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(
        `<div style="color:black;">
          <strong>Name:</strong> ${name}<br>
          <strong>District:</strong> ${district}
        </div>`
      )
      .addTo(map1);
  });

  // OPTIONAL: Change cursor on hover for better UX
  map1.on('mouseenter', 'kpk_urban', () => {
    map1.getCanvas().style.cursor = 'pointer';
  });
  map1.on('mouseleave', 'kpk_urban', () => {
    map1.getCanvas().style.cursor = '';
  });

  ///Breaching Points
  map1.addSource("breach_points", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:breachpoints@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });
  map1.addLayer({
    id: "breach_points",
    type: "circle",
    source: "breach_points",
    "source-layer": "breachpoints",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "purple",
      "circle-radius": 6,
    }
  });
  // 3. Toggle visibility on checkbox change
  document.getElementById("breach").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "breach_points",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });
  map1.on("click", "breach_points", function (e) {
    // Get clicked features
    const features = map1.queryRenderedFeatures(e.point, { layers: ["breach_points"] });
    if (!features.length) return;
    const feature = features[0];

    // Helper to format property
    const formatProp = (label, value) => {
      return `<div class="discharge-item"><span class="discharge-label">${label}:</span><span class="discharge-value">${value || 'N/A'}</span></div>`;
    };

    // Build styled popup HTML (card style, similar to your existing popup)
    const popupHTML = `
    <div class="ffd-popup-container">
      <div class="popup-header" style="border-left: 4px solid #8B008B;">
        <div class="station-info">
          <h3 class="station-name">${feature.properties["Breaching"] || 'Unknown Breach Point'}</h3>
          <div class="status-badge" style="background-color: #8B008B;">
            <i class="fas fa-exclamation-triangle"></i>
            ${feature.properties["River"] || 'Unknown River'}
          </div>
        </div>
      </div>
      <div class="popup-content">
        <div class="discharge-section">
          <div class="discharge-grid">
            ${formatProp('Location', `${feature.properties["Lat"]?.toFixed(5) || 'N/A'}, ${feature.properties["Long"]?.toFixed(5) || 'N/A'}`)}
            ${formatProp('River System', feature.properties["River"])}
            ${formatProp('Breach Type', feature.properties["Breaching"])}
          </div>
        </div>
      </div>
    </div>
    <style>
      .ffd-popup-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        width: 280px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        overflow: hidden;
        border: 2px solid #8B008B;
        position: relative;
      }
      .popup-header {
        background: #f8f9fa;
        padding: 8px 12px;
        border-bottom: 2px solid #f3e5f5;
      }
      .station-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .station-name {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        line-height: 1.2;
        flex: 1;
      }
      .status-badge {
        color: white;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        white-space: nowrap;
      }
      .popup-content {
        padding: 8px 12px 12px;
      }
      .discharge-section {
        margin-bottom: 8px;
      }
      .discharge-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .discharge-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #f3e5f5;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .discharge-label {
        font-size: 13px;
        font-weight: 500;
        color: #495057;
      }
      .discharge-value {
        font-size: 14px;
        font-weight: 700;
        color: #212529;
      }
      .mapboxgl-popup-close-button { display: none !important; }
      .mapboxgl-popup-content { padding: 0 !important; border-radius: 8px !important; }
      .mapboxgl-popup-tip { border-top-color: #ffffff !important; }
    </style>
  `;

    new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: '300px',
      className: 'ffd-enhanced-popup'
    })
      .setLngLat(e.lngLat)
      .setHTML(popupHTML)
      .addTo(map1);
  });
  map1.on('mouseenter', 'breach_points', () => {
    map1.getCanvas().style.cursor = 'pointer';
  });

  map1.on('mouseleave', 'breach_points', () => {
    map1.getCanvas().style.cursor = '';
  });
  ///Telemetric Stations
  map1.addSource("telemetric_stations", {
    type: "geojson",
    data: telemetries // your GeoJSON variable
  });

  map1.addLayer({
    id: "telemetric_stations",
    type: "circle",
    source: "telemetric_stations",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#FF1493",
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });

  // Toggle visibility on checkbox change
  document.getElementById("telemetric").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "telemetric_stations",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  map1.on("click", "telemetric_stations", function (e) {
    // Get clicked features
    const features = map1.queryRenderedFeatures(e.point, { layers: ["telemetric_stations"] });
    if (!features.length) return;
    const feature = features[0];

    // Helper to format property
    const formatProp = (label, value) => {
      return `<div class="discharge-item"><span class="discharge-label">${label}:</span><span class="discharge-value">${value || 'N/A'}</span></div>`;
    };

    // Build styled popup HTML (card style, similar to your existing popup)
    const popupHTML = `
    <div class="ffd-popup-container">
      <div class="popup-header" style="border-left: 4px solid #FF1493;">
        <div class="station-info">
          <h3 class="station-name">${feature.properties["Site_Name"] || 'Unknown Station'}</h3>
          <div class="status-badge" style="background-color: #FF1493;">
            <i class="fas fa-satellite-dish"></i>
            Telemetric Station
          </div>
        </div>
      </div>
      <div class="popup-content">
        <div class="discharge-section">
          <div class="discharge-grid">
            ${formatProp('Location', `${feature.geometry.coordinates[1]?.toFixed(5) || 'N/A'}, ${feature.geometry.coordinates[0]?.toFixed(5) || 'N/A'}`)}
            ${formatProp('River System', feature.properties["River"])}
            ${formatProp('Province', feature.properties["Province"])}
            ${formatProp('District', feature.properties["District"])}
          </div>
        </div>
      </div>
    </div>
    <style>
      .ffd-popup-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        width: 280px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        overflow: hidden;
        border: 2px solid #FF1493;
        position: relative;
      }
      .popup-header {
        background: #f8f9fa;
        padding: 8px 12px;
        border-bottom: 2px solid #fce4ec;
      }
      .station-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .station-name {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        line-height: 1.2;
        flex: 1;
      }
      .status-badge {
        color: white;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        white-space: nowrap;
      }
      .popup-content {
        padding: 8px 12px 12px;
      }
      .discharge-section {
        margin-bottom: 8px;
      }
      .discharge-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .discharge-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #fce4ec;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .discharge-label {
        font-size: 13px;
        font-weight: 500;
        color: #495057;
      }
      .discharge-value {
        font-size: 14px;
        font-weight: 700;
        color: #212529;
      }
      .mapboxgl-popup-close-button { display: none !important; }
      .mapboxgl-popup-content { padding: 0 !important; border-radius: 8px !important; }
      .mapboxgl-popup-tip { border-top-color: #ffffff !important; }
    </style>
  `;

    new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: '300px',
      className: 'ffd-enhanced-popup'
    })
      .setLngLat(e.lngLat)
      .setHTML(popupHTML)
      .addTo(map1);
  });

  map1.on('mouseenter', 'telemetric_stations', () => {
    map1.getCanvas().style.cursor = 'pointer';
  });

  map1.on('mouseleave', 'telemetric_stations', () => {
    map1.getCanvas().style.cursor = '';
  });


  if (!map1.getSource("indian")) {
    map1.addSource("indian", {
      type: "vector",
      scheme: "tms",
      tiles: [`http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:indian_structure@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  if (!map1.getLayer("indian")) {
    map1.addLayer({
      id: "indian",
      type: "circle",
      source: "indian",
      "source-layer": "indian_structure",
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-color": "red",
        "circle-radius": 4,
      }
    });
  }
  // 3. Toggle visibility on checkbox change
  document.getElementById("india").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "indian",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  map1.on("click", "indian", function (e) {
    // Get clicked features
    const features = map1.queryRenderedFeatures(e.point, { layers: ["indian"] });
    if (!features.length) return;
    const feature = features[0];

    // Helper to format property
    const formatProp = (label, value) => {
      return `<div class="discharge-item"><span class="discharge-label">${label}:</span><span class="discharge-value">${value || 'N/A'}</span></div>`;
    };

    // Build styled popup HTML (card style, similar to ffd_point)
    const popupHTML = `
    <div class="ffd-popup-container">
      <div class="popup-header" style="border-left: 4px solid #007bff;">
        <div class="station-info">
          <h3 class="station-name">${feature.properties["Name"] || 'Unknown Dam'}</h3>
          <div class="status-badge" style="background-color: #007bff;">
            <i class="fas fa-water"></i>
            ${feature.properties["River Name"] || 'Unknown River'}
          </div>
        </div>
      </div>
      <div class="popup-content">
        <div class="discharge-section">
          <div class="discharge-grid">
            ${formatProp('Max Discharge', feature.properties["Max Dis Cs"])}
            ${formatProp('Storage Capacity (AF)', feature.properties["Stg Cap AF"])}
            ${formatProp('Power (MW)', feature.properties["Power MW"])}
          </div>
        </div>
      </div>
    </div>
    <style>
      .ffd-popup-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        width: 280px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        overflow: hidden;
        border: 2px solid #2196f3;
        position: relative;
      }
      .popup-header {
        background: #f8f9fa;
        padding: 8px 12px;
        border-bottom: 2px solid #e3f2fd;
      }
      .station-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .station-name {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        line-height: 1.2;
        flex: 1;
      }
      .status-badge {
        color: white;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        white-space: nowrap;
      }
      .popup-content {
        padding: 8px 12px 12px;
      }
      .discharge-section {
        margin-bottom: 8px;
      }
      .discharge-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .discharge-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #e3f2fd;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .discharge-label {
        font-size: 13px;
        font-weight: 500;
        color: #495057;
      }
      .discharge-value {
        font-size: 14px;
        font-weight: 700;
        color: #212529;
      }
      .mapboxgl-popup-close-button { display: none !important; }
      .mapboxgl-popup-content { padding: 0 !important; border-radius: 8px !important; }
      .mapboxgl-popup-tip { border-top-color: #ffffff !important; }
    </style>
  `;

    new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: '300px',
      className: 'ffd-enhanced-popup'
    })
      .setLngLat(e.lngLat)
      .setHTML(popupHTML)
      .addTo(map1);

    // Show fluid meter if special Indian dam
    const indianDamData = {
      'BHAKRA DAM': {
        percentage: fillPercentage_Bhakra,
        level: val_Bhakra,
        country: 'India',
        region: 'Bilaspur, HP',
        fullCapacity: 1680,
        fillLastYear: fillPercentage_Bhakra_last_year,
        fillNormal: fillPercentage_Bhakra_normal
      },
      'PONG DAM': {
        percentage: fillPercentage_Pong,
        level: val_Pong,
        country: 'India',
        region: 'Kangra, HP',
        fullCapacity: 1390,
        fillLastYear: fillPercentage_Pong_last_year,
        fillNormal: fillPercentage_Pong_normal
      },
      'THEIN DAM': {
        percentage: fillPercentage_Thein,
        level: val_Thein,
        country: 'India',
        region: 'Pathankot, PB',
        fullCapacity: 1730,
        fillLastYear: fillPercentage_Thein_last_year,
        fillNormal: fillPercentage_Thein_normal
      }
    };
    const damName = feature.properties.Name;
    if (indianDamData.hasOwnProperty(damName)) {
      const dam = indianDamData[damName];
      showDamFluidMeter(damName, dam.percentage, dam.level, dam);
    }
  });

  // 3. Move the cursor event handlers OUTSIDE the click handler (add these separately):
  map1.on('mouseenter', 'indian', () => {
    map1.getCanvas().style.cursor = 'pointer';
  });

  map1.on('mouseleave', 'indian', () => {
    map1.getCanvas().style.cursor = '';
  });

  ///Flood Events 15 Aug

  map1.addSource("flood_events", {
    type: "geojson",
    data: flood_events // your GeoJSON variable
  });

  // 2. Add circle layer (remove source-layer)
  map1.addLayer({
    id: "flood_events",
    type: "circle",
    source: "flood_events",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "red",
      "circle-radius": 4,
    }
  });

  // 3. Toggle visibility on checkbox change
  document.getElementById("FE").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "flood_events",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  map1.on("click", "flood_events", function (e) {
    if (!e.features || !e.features.length) return;

    const feature = e.features[0];
    const name = feature.properties.Name;

    new mapboxgl.Popup()
      .setLngLat(feature.geometry.coordinates)
      .setHTML(`<div style="color: black;"><strong>${name}</strong></div>`)
      .addTo(map1);
  });

  // Optional: Change cursor to pointer on hover
  map1.on("mouseenter", "flood_events", function () {
    map1.getCanvas().style.cursor = "pointer";
  });
  map1.on("mouseleave", "flood_events", function () {
    map1.getCanvas().style.cursor = "";
  });






  //Urban Flooding Punjab points

  // 1. Add GeoJSON source instead of vector tile
  map1.addSource("urban_punjab", {
    type: "geojson",
    data: punjab // your GeoJSON variable
  });

  // 2. Add circle layer (remove source-layer)
  map1.addLayer({
    id: "urban_punjab",
    type: "circle",
    source: "urban_punjab",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "transparent",
      "circle-radius": 10,
      "circle-stroke-color": "red",
      "circle-stroke-width": 3
    }
  });

  // 3. Toggle visibility on checkbox change
  document.getElementById("urbanFloodingPunjab").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "urban_punjab",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // 4. Show popup on click
  map1.on("click", "urban_punjab", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["urban_punjab"] });
    if (!features.length) return;

    const feature = features[0];
    const city = feature.properties.City || "N/A";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
      <div style="color:black;">
        <strong>City:</strong> ${city}<br>
      </div>
    `)
      .addTo(map1);
  });

  // 5. Change cursor on hover
  map1.on('mouseenter', 'urban_punjab', () => {
    map1.getCanvas().style.cursor = 'pointer';
  });
  map1.on('mouseleave', 'urban_punjab', () => {
    map1.getCanvas().style.cursor = '';
  });

  //Urban flooding sindh
  map1.addSource("urban_sindh", {
    type: "geojson",
    data: sindh_points // your GeoJSON variable
  });

  // 2. Add circle layer (remove source-layer)
  map1.addLayer({
    id: "urban_sindh",
    type: "circle",
    source: "urban_sindh",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "transparent",
      "circle-radius": 10,
      "circle-stroke-color": "red",
      "circle-stroke-width": 3
    }
  });

  // 3. Toggle visibility on checkbox change
  document.getElementById("urbanFloodingSindh").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "urban_sindh",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  //     //Towers
  // map1.addSource("towers", {
  //   type: "geojson",
  //   data: towers // your GeoJSON variable
  // });

  // // Load the tower image first
  // map1.loadImage("https://i.ibb.co/bRKrYrdq/tower.png", (error, image) => {
  //   if (error) throw error;

  //   // Add the image to the map style
  //   map1.addImage("tower-icon", image);

  //   // Add symbol layer
  //   map1.addLayer({
  //     id: "towers",
  //     type: "symbol",
  //     source: "towers",
  //     layout: {
  //       "icon-image": "tower-icon",
  //       "icon-size": 0.03, // Adjust size as needed (0.5 = 50% of original size)
  //       "icon-allow-overlap": false, // Allow icons to overlap
  //       "icon-ignore-placement": false, // Don't hide icons due to collisions
  //       visibility: "none"
  //     }
  //   });
  // });

  // // Toggle visibility on checkbox change
  // document.getElementById("towers_c").addEventListener("change", function () {
  //   const isVisible = this.checked;
  //   map1.setLayoutProperty(
  //     "towers",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });


  // //Mosques

  // //Mosques - Symbol Layer with Image
  // map1.addSource("mosques", {
  //   type: "geojson",
  //   data: mosques // your GeoJSON variable for mosques
  // });

  // // Load the mosque image
  // map1.loadImage("https://i.ibb.co/xKXgDWLN/mosque-1.png", (error, image) => {
  //   if (error) throw error;

  //   // Add the image to the map style
  //   map1.addImage("mosque-icon", image);

  //   // Add symbol layer for mosques
  //   map1.addLayer({
  //     id: "mosques",
  //     type: "symbol",
  //     source: "mosques",
  //     layout: {
  //       "icon-image": "mosque-icon",
  //       "icon-size": 0.10, // Adjust size as needed (0.5 = 50% of original size)
  //       "icon-allow-overlap": true, // Allow icons to overlap
  //       "icon-ignore-placement": false, // Don't hide icons due to collisions
  //       visibility: "none"
  //     }
  //   });
  // });

  // // Toggle visibility on checkbox change for mosques
  // document.getElementById("mosques_c").addEventListener("change", function () {
  //   const isVisible = this.checked;
  //   map1.setLayoutProperty(
  //     "mosques",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });


  ///images for Dams sections
  // Load image symbols for the map layers (only if not already loaded)
  if (!map1.hasImage("Future")) {
    map1.loadImage("https://i.ibb.co/Z1K2yzgy/future.png", (error, image) => {
      if (error) throw error;
      map1.addImage("Future", image); // Matches "icon-image" in layer below
    });
  }

  if (!map1.hasImage("Ready_for_Construction")) {
    map1.loadImage("https://i.ibb.co/Ng5xTcDj/ready.png", (error, image) => {
      if (error) throw error;
      map1.addImage("Ready_for_Construction", image); // Matches "icon-image" in layer below
    });
  }

  if (!map1.hasImage("Ongoing")) {
    map1.loadImage("https://i.ibb.co/mFz0Cy5Y/ongoing.png", (error, image) => {
      if (error) throw error;
      map1.addImage("Ongoing", image); // Matches "icon-image" in layer below
    });
  }

  if (!map1.hasImage("Under_construction")) {
    map1.loadImage("https://i.ibb.co/67cPx8nv/under.png", (error, image) => {
      if (error) throw error;
      map1.addImage("Under_construction", image); // Matches "icon-image" in layer below
    });
  }





  // Future structures
  if (!map1.getSource("Future")) {
    map1.addSource("Future", {
      type: "vector",
      scheme: "tms",
      tiles: [`http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/ne:Future@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  //Ready for construction
  if (!map1.getSource("Ready_for_Construction")) {
    map1.addSource("Ready_for_Construction", {
      type: "vector",
      scheme: "tms",
      tiles: [`http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/ne:Ready_for_Construction@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  //ongoing structures
  if (!map1.getSource("Ongoing")) {
    map1.addSource("Ongoing", {
      type: "vector",
      scheme: "tms",
      tiles: [`http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/ne:Ongoing@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  //under constructoiom
  if (!map1.getSource("Under_construction")) {
    map1.addSource("Under_construction", {
      type: "vector",
      scheme: "tms",
      tiles: [`http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:under_construction_dams@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  // Add layers using the corresponding sources and image icons
  if (!map1.getLayer("Future")) {
    map1.addLayer({
      id: "Future",
      type: "symbol",
      source: "Future",
      "source-layer": "Future", // Matches the actual layer name in vector tiles
      layout: {
        visibility: "none",
        "icon-image": "Future", // Matches the loaded image ID
        "icon-size": 0.05
      }
    });
  }


  document.getElementById("futureDams").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Future",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  if (!map1.getLayer("Ready_for_Construction")) {
    map1.addLayer({
      id: "Ready_for_Construction",
      type: "symbol",
      source: "Ready_for_Construction",
      "source-layer": "Ready_for_Construction", // Matches the actual layer name in vector tiles
      layout: {
        visibility: "none",
        "icon-image": "Ready_for_Construction", // Matches the loaded image ID
        "icon-size": 0.07
      }
    });
  }

  document.getElementById("readyDams").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Ready_for_Construction",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  if (!map1.getLayer("Ongoing")) {
    map1.addLayer({
      id: "Ongoing",
      type: "symbol",
      source: "Ongoing",
      "source-layer": "Ongoing", // Matches the actual layer name in vector tiles
      layout: {
        visibility: "none",
        "icon-image": "Ongoing", // Matches the loaded image ID
        "icon-size": 0.07
      }
    });
  }

  document.getElementById("ongoingDams").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Ongoing",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  if (!map1.getLayer("Under_construction")) {
    map1.addLayer({
      id: "Under_construction",
      type: "symbol",
      source: "Under_construction",
      "source-layer": "under_construction_dams", // Matches the actual layer name in vector tiles
      layout: {
        visibility: "none",
        "icon-image": "Under_construction", // Matches the loaded image ID
        "icon-size": 0.07
      }
    });
  }

  document.getElementById("underDams").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Under_construction",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Popup functionality
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true
  });

  // Add click interactions for all layers
  ['Future', 'Ready_for_Construction', 'Ongoing', 'Under_construction'].forEach(layerId => {
    map1.on('click', layerId, function (e) {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const properties = e.features[0].properties;

      const projectNa = properties.Project_Na || properties.project_na || 'N/A';
      // const liveStora = properties.Live_Stora || 'N/A';
      // const grossStor = properties.Gross_Stor || 'N/A';
      const popupContent = `
      <div class="card border-0 shadow" style="width: 14rem; border-radius: 12px; background: linear-gradient(135deg, #4facfe, #00f2fe); padding: 15px; color: #000000; text-align: left; font-family: Arial, sans-serif;">
          <div class="card-body" style="padding: 10px;">
              <h5 class="card-title" style="font-size: 1.2rem; font-weight: bold; margin-bottom: 8px; color: #222222; text-shadow: 0 1px 1px rgba(255, 255, 255, 0.7);">
                  ${projectNa}
              </h5>

          </div>
      </div>
    `;

      //     <p class="card-text" style="font-size: 0.95rem; line-height: 1.4; margin: 0; color: #111111;">
      //     <span style="font-weight: 600; color: #000000;">Live Storage:</span> ${liveStora} <br>
      //     <span style="font-weight: 600; color: #000000;">Gross Storage:</span> ${grossStor}
      // </p>

      // Ensure the popup appears above the point clicked
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // Set and show the popup
      popup.setLngLat(coordinates).setHTML(popupContent).addTo(map1);
    });
  });

  // Add hover effects for interactive cursors
  ['Future', 'Ready_for_Construction', 'Ongoing', 'Under_construction'].forEach(layerId => {
    map1.on('mouseenter', layerId, () => map1.getCanvas().style.cursor = 'pointer');
    map1.on('mouseleave', layerId, () => map1.getCanvas().style.cursor = '');
  });







  //STREAM LAYERS both east and west on zoom
  // map1.addSource("STREAM_412_5_9", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     "http://172.18.1.56:8080/geoserver/gwc/service/tms/1.0.0/ne:STREAM_412_5_9@EPSG:900913@pbf/{z}/{x}/{y}.pbf",
  //   ],
  // });

  // Add Pakistan Rivers layer with filter based on zoom
  // map1.addLayer({
  //   id: "STREAM_412_5_9",
  //   type: "line",
  //   source: "STREAM_412_5_9",
  //   "source-layer": "STREAM_412_5_9",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "line-opacity": 0.7,
  //     "line-color": "blue",
  //     "line-width": 1.5
  //   },
  //   // Initial filter for zoom level 4.5
  //   filter: ["in", "strmOrder", 7, 8, 9]
  // });

  // // Event listener for checkbox
  // document.getElementById("stream1").addEventListener("change", function () {
  //   const isVisible = this.checked;
  //   map1.setLayoutProperty(
  //     "STREAM_412_5_9",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });

  // Add Stream2 layers
  // map1.addSource("STREAM_218_5_9_Pk", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     "http://172.18.1.56:8080/geoserver/gwc/service/tms/1.0.0/ne:STREAM_218_5_9_Pk@EPSG:900913@pbf/{z}/{x}/{y}.pbf",
  //   ],
  // });

  // map1.addLayer({
  //   id: "STREAM_218_5_9_Pk",
  //   type: "line",
  //   source: "STREAM_218_5_9_Pk",
  //   "source-layer": "STREAM_218_5_9_Pk",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "line-opacity": 0.7,
  //     "line-color": "blue",
  //     "line-width": 1.5
  //   },
  //   // Initial filter for zoom level 4.5
  //   filter: ["in", "strmOrder", 7, 8, 9]
  // });

  // // Event listener for checkbox
  // document.getElementById("stream2").addEventListener("change", function () {
  //   const isVisible = this.checked;
  //   map1.setLayoutProperty(
  //     "STREAM_218_5_9_Pk",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });

  // // Add zoom change event listener to update filters
  // map1.on('zoom', function () {
  //   const currentZoom = map1.getZoom();

  //   // If zoom level is greater than 4.5, show all stream orders
  //   // Otherwise show only stream orders 7, 8, 9
  //   if (currentZoom > 4.5) {
  //     // Show all stream orders (5-9)
  //     map1.setFilter("STREAM_412_5_9", [">=", "strmOrder", 5]);
  //     map1.setFilter("STREAM_218_5_9_Pk", [">=", "strmOrder", 5]);
  //   } else {
  //     // Show only stream orders 7, 8, 9
  //     map1.setFilter("STREAM_412_5_9", ["in", "strmOrder", 7, 8, 9]);
  //     map1.setFilter("STREAM_218_5_9_Pk", ["in", "strmOrder", 7, 8, 9]);
  //   }
  // });

  //Met layers
  map1.addSource("AccRainEGE", {
    type: "raster",
    tiles: [
      `https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=AccRainEGE&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`,
    ],
  });

  map1.addLayer({
    id: "AccRainEGE",
    type: "raster",
    source: "AccRainEGE",
    layout: { visibility: "none" },
  });

  document.getElementById("accumulatedPrecip").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "AccRainEGE",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Add Precipitation Probability 50mm layer
  map1.addSource("EGE_probRgt50", {
    type: "raster",
    tiles: [
      `https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=EGE_probRgt50&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`,
    ],
  });

  map1.addLayer({
    id: "EGE_probRgt50",
    type: "raster",
    source: "EGE_probRgt50",
    layout: { visibility: "none" },
  });

  document.getElementById("prob50").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "EGE_probRgt50",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  map1.addSource("EGE_probRgt150", {
    type: "raster",
    tiles: [
      `https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=EGE_probRgt150&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`,
    ],
  });

  map1.addLayer({
    id: "EGE_probRgt150",
    type: "raster",
    source: "EGE_probRgt150",
    layout: { visibility: "none" },
  });

  document.getElementById("prob150").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "EGE_probRgt150",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Add Precipitation Probability 300mm layer
  map1.addSource("EGE_probRgt300", {
    type: "raster",
    tiles: [
      `https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=EGE_probRgt300&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`,
    ],
  });

  map1.addLayer({
    id: "EGE_probRgt300",
    type: "raster",
    source: "EGE_probRgt300",
    layout: { visibility: "none" },
  });

  document.getElementById("prob300").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "EGE_probRgt300",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  // Note: 2026 Precipitation Layer is now handled by the slider implementation in script.js
  // The 12-month layers are added dynamically when the checkbox is toggled

  //met layer flood summary
  map1.addSource("FloodSummary1_30", {
    type: "raster",
    scheme: "tms",
    tiles: [
      `https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=FloodSummary1_30&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`,
    ],
  });

  map1.addLayer({
    id: "FloodSummary1_30",
    type: "raster",
    source: "FloodSummary1_30",
    layout: {
      visibility: "none",
    },
  });

  // Event listener for checkbox
  document.getElementById("sum1_30").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "FloodSummary1_30",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  map1.addSource("FloodSummary1_3", {
    type: "raster",
    scheme: "tms",
    tiles: [
      `https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=sumAL41EGE&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`,
    ],
  });

  map1.addLayer({
    id: "FloodSummary1_3",
    type: "raster",
    source: "FloodSummary1_3",
    layout: {
      visibility: "none",
    },
  });


  // Event listener for checkbox
  document.getElementById("sum1_3").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "FloodSummary1_3",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  map1.addSource('sumAL42EGE', {
    type: 'raster',
    tiles: [`https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=sumAL42EGE&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`],
  });
  map1.addLayer({
    id: 'sumAL42EGE',
    type: 'raster',
    source: 'sumAL42EGE',
    layout: { visibility: 'none' }
  });

  // Event listener for checkbox
  document.getElementById("sum4_10").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "sumAL42EGE",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  // Add Flood Summary (11-30 Days) layer
  map1.addSource('sumAL43EGE', {
    type: 'raster',
    tiles: [`https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&LAYERS=sumAL43EGE&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`],
  });
  map1.addLayer({
    id: 'sumAL43EGE',
    type: 'raster',
    source: 'sumAL43EGE',
    layout: { visibility: 'none' }
  });

  // Event listener for checkbox
  document.getElementById("sum11_30").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "sumAL43EGE",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  /******************* TIME-ENABLED LAYER SUPPORT (v2) *******************
   * Changes:
   *  - First toggle loads current (clamped) date automatically (no modal shown).
   *  - New bottom-right map control button opens modal for selecting a date.
   *  - Modal contains a dropdown of ACTIVE time-enabled layers and a single Today button.
   *  - Adds &timeDimensionExtent=START/END/PT24H param and validates date inside extent.
   */
  const timeEnabledConfig = {
    AccRainEGE: { layerName: 'AccRainEGE', wmsParamLayer: 'AccRainEGE', checkboxId: 'accumulatedPrecip' },
    EGE_probRgt50: { layerName: 'EGE_probRgt50', wmsParamLayer: 'EGE_probRgt50', checkboxId: 'prob50' },
    EGE_probRgt150: { layerName: 'EGE_probRgt150', wmsParamLayer: 'EGE_probRgt150', checkboxId: 'prob150' },
    EGE_probRgt300: { layerName: 'EGE_probRgt300', wmsParamLayer: 'EGE_probRgt300', checkboxId: 'prob300' },
    FloodSummary1_3: { layerName: 'sumAL41EGE', wmsParamLayer: 'sumAL41EGE', checkboxId: 'sum1_3' },
    FloodSummary1_30: { layerName: 'FloodSummary1_30', wmsParamLayer: 'FloodSummary1_30', checkboxId: 'sum1_30' },
    sumAL42EGE: { layerName: 'sumAL42EGE', wmsParamLayer: 'sumAL42EGE', checkboxId: 'sum4_10' },
    sumAL43EGE: { layerName: 'sumAL43EGE', wmsParamLayer: 'sumAL43EGE', checkboxId: 'sum11_30' }
  };
  const timeLayerState = {}; // layerId -> YYYY-MM-DD
  const timeModal = document.getElementById('timeLayerModal');
  const timeModalClose = document.getElementById('timeLayerModalClose');
  const timeModalDateInput = document.getElementById('timeLayerDateInput');
  const timeModalApply = document.getElementById('timeLayerApplyBtn');
  const timeModalCancel = document.getElementById('timeLayerCancelBtn');
  const timeModalError = document.getElementById('timeLayerModalError');
  const timeModalLayerSelect = document.getElementById('timeLayerLayerSelect');

  function validateDate(dateStr) {
    if (!dateStr) return 'Please pick a date.';
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStr)) return 'Invalid date format.';
    return null;
  }
  // Build WMS URL using the exact pattern you provided (fixed WIDTH/HEIGHT and DPI params)
  function buildWmsUrl(base, layerName, date) {
    const encodedLayer = encodeURIComponent(layerName);
    const core = `${base}LAYERS=${encodedLayer}&STYLES=&FORMAT=image/png&DPI=96&MAP_RESOLUTION=96&FORMAT_OPTIONS=dpi:96&TRANSPARENT=TRUE`;
    // TIME is optional: only append if a date has been explicitly selected (date argument provided)
    const timeParam = date ? `&TIME=${date}T00:00:00.000Z` : '';
    return `${core}${timeParam}`;
  }
  function rebuildRasterSource(layerId, date) {
    const cfg = timeEnabledConfig[layerId]; if (!cfg) return;
    // Base includes required fixed BBOX template & sizing pattern
    const wmsBase = 'https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=1439&HEIGHT=602&';
    const tilesUrl = buildWmsUrl(wmsBase, cfg.wmsParamLayer, date);
    const existingSource = map1.getSource(layerId);
    if (existingSource) { if (map1.getLayer(layerId)) map1.removeLayer(layerId); map1.removeSource(layerId); }
    map1.addSource(layerId, { type: 'raster', tiles: [tilesUrl] });
    map1.addLayer({ id: layerId, type: 'raster', source: layerId, layout: { visibility: 'visible' } });
    // After adding (or rebuilding) ensure this raster sits at the bottom below other thematic layers.
    scheduleTimeLayerReorder();
  }
  // --- Layer ordering helpers (place time-enabled rasters directly BELOW nationalBoundary) ---
  const NATIONAL_BOUNDARY_ID = 'nationalBoundary';
  function moveTimeLayerBelowNational(layerId) {
    if (!map1.getLayer(layerId)) return;
    if (!map1.getLayer(NATIONAL_BOUNDARY_ID)) { return; } // wait until national boundary exists
    try {
      // We want the time layer to appear UNDER the national boundary outlines, so we move
      // the boundary layer ABOVE it by inserting the time layer just before the boundary.
      map1.moveLayer(layerId, NATIONAL_BOUNDARY_ID); // inserts layerId immediately below nationalBoundary
    } catch (e) { /* ignore move errors */ }
  }
  function moveAllTimeLayersBelowNational() {
    Object.keys(timeEnabledConfig).forEach(id => moveTimeLayerBelowNational(id));
  }
  let reorderScheduled = false;
  function scheduleTimeLayerReorder() {
    if (reorderScheduled) return;
    reorderScheduled = true;
    // Defer to next frame so style has incorporated new layer fully
    requestAnimationFrame(() => { moveAllTimeLayersBelowNational(); reorderScheduled = false; });
  }
  // Also attempt a reorder whenever style reloads (e.g., style change or sprite refresh)
  map1.on('styledata', () => scheduleTimeLayerReorder());
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  // Checkbox behavior: load current date immediately
  Object.entries(timeEnabledConfig).forEach(([layerId, cfg]) => {
    const cb = document.getElementById(cfg.checkboxId); if (!cb) return;
    cb.addEventListener('change', function () {
      if (!this.checked) { if (map1.getLayer(layerId)) map1.setLayoutProperty(layerId, 'visibility', 'none'); return; }
      // First toggle: load WITHOUT TIME (default server latest). Subsequent date set via modal will add TIME.
      const alreadyHadDate = !!timeLayerState[layerId];
      const dateToUse = alreadyHadDate ? timeLayerState[layerId] : null;
      if (!alreadyHadDate) { timeLayerState[layerId] = null; }
      rebuildRasterSource(layerId, dateToUse);
    });
  });
  // Modal functions
  function populateLayerSelect() {
    const active = Object.entries(timeEnabledConfig).filter(([id, cfg]) => {
      const cb = document.getElementById(cfg.checkboxId); return cb && cb.checked;
    }).map(([id, cfg]) => ({ id, label: cfg.layerName }));
    timeModalLayerSelect.innerHTML = '';
    if (active.length === 0) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'No active time layers';
      timeModalLayerSelect.appendChild(opt); timeModalLayerSelect.disabled = true; timeModalApply.disabled = true; return;
    }
    timeModalLayerSelect.disabled = false; timeModalApply.disabled = false;
    active.forEach(l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; timeModalLayerSelect.appendChild(o); });
    setModalDateForLayer(active[0].id);
  }
  function setModalDateForLayer(layerId) {
    const cfg = timeEnabledConfig[layerId]; if (!cfg) return; // no min/max constraints now
    timeModalDateInput.removeAttribute('min');
    timeModalDateInput.removeAttribute('max');
    const stored = timeLayerState[layerId];
    const dateVal = stored || todayISO();
    timeModalDateInput.value = dateVal;
  }
  function openTimeModal() { populateLayerSelect(); timeModalError.textContent = ''; timeModal.classList.remove('hidden'); timeModal.setAttribute('aria-hidden', 'false'); }
  function closeTimeModal() { timeModal.classList.add('hidden'); timeModal.setAttribute('aria-hidden', 'true'); }
  timeModalLayerSelect?.addEventListener('change', () => { setModalDateForLayer(timeModalLayerSelect.value); });
  timeModalApply?.addEventListener('click', () => { const layerId = timeModalLayerSelect.value; if (!timeEnabledConfig[layerId]) { closeTimeModal(); return; } const dateStr = timeModalDateInput.value; const err = validateDate(dateStr); if (err) { timeModalError.textContent = err; return; } timeLayerState[layerId] = dateStr; rebuildRasterSource(layerId, dateStr); closeTimeModal(); });
  timeModalClose?.addEventListener('click', closeTimeModal);
  timeModalCancel?.addEventListener('click', closeTimeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !timeModal.classList.contains('hidden')) closeTimeModal(); });
  // Public helper
  window.__updateTimeLayerDate = function (layerId, dateStr) { if (!timeEnabledConfig[layerId]) return console.warn('Layer not time-enabled:', layerId); const err = validateDate(dateStr); if (err) { console.error(err); return; } timeLayerState[layerId] = dateStr; rebuildRasterSource(layerId, dateStr); };
  // Map control (added after other default controls). Mapbox stacks later-added controls beneath earlier ones in the same corner.
  // Ensure this is called AFTER the 3D visualization/other controls so it appears just below them.
  class TimeLayerControl {
    onAdd(map) {
      this._map = map;
      this._btn = document.createElement('button');
      this._btn.type = 'button';
      this._btn.className = 'mapboxgl-ctrl-icon time-layer-control-btn';
      this._btn.title = 'Select date for active time layers';
      this._btn.innerHTML = '<img src="media/UI/controlicons/activetimelayer.webp" alt="Time layers" />';
      this._btn.addEventListener('click', openTimeModal);
      const c = document.createElement('div');
      c.className = 'mapboxgl-ctrl-group mapboxgl-ctrl';
      c.appendChild(this._btn);
      return c;
    }
    onRemove() {
      if (this._btn) this._btn.remove();
      this._map = null;
    }
  }
  // Prevent duplicate control if script re-runs or style is swap   e path executes again.
  if (!window.__timeLayerControlAdded) {
    map1.addControl(new TimeLayerControl(), 'top-right');
    window.__timeLayerControlAdded = true;
  }
  if (!window.__layerReorderControlAdded) {
    map1.addControl(new LayerReorderControl(), 'top-right');
    window.__layerReorderControlAdded = true;
  }
  /******************* END TIME-ENABLED LAYER SUPPORT (v2) *******************/


  //Reservoir layer
  if (!map1.getSource("Dams_Water_Bodies")) {
    map1.addSource("Dams_Water_Bodies", {
      type: "vector",
      scheme: "tms",
      tiles: [
        `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:reserviors@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
      ],
    });
  }

  if (!map1.getLayer("Dams_Water_Bodies")) {
    map1.addLayer({
      id: "Dams_Water_Bodies",
      type: "fill",
      source: "Dams_Water_Bodies",
      "source-layer": "reserviors",
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-opacity": 0.7,
        "fill-color": "blue",
      },
    });
  }
  // Event listener for checkbox
  document.getElementById("Reservoirs").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Dams_Water_Bodies",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });
  ////Minor Rivers
  // Add Minor Rivers source
  map1.addSource("minor_rivers", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:minnor_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add Minor Rivers outline layer
  map1.addLayer({
    id: "minor_rivers_outline",
    type: "line",
    source: "minor_rivers",
    "source-layer": "minnor_rivers",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 1,
      "line-color": "blue",
      "line-width": 1,
    },
  });

  // Add Minor Rivers label layer
  map1.addLayer({
    id: "minor_rivers_label",
    type: "symbol",
    source: "minor_rivers",
    "source-layer": "minnor_rivers",
    minzoom: 8.5,
    layout: {
      visibility: "none",
      "text-field": "{name}",
      "text-size": 14,
      "text-offset": [-1, 0],
    },
    paint: {
      "text-color": "blue",
      "text-halo-color": "white",
      "text-halo-width": 1,
    },
  });

  // Event listener for Minor Rivers checkbox
  document.getElementById("minorRivers").addEventListener("change", function () {
    const isVisible = this.checked;
    const visibility = isVisible ? "visible" : "none";

    // Toggle both outline and label layers
    map1.setLayoutProperty("minor_rivers_outline", "visibility", visibility);
    map1.setLayoutProperty("minor_rivers_label", "visibility", visibility);
  });

  // PAK RIVERS 
  map1.addSource("Pakistan_Rivers", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:pakistan_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add Pakistan Rivers layer
  map1.addLayer({
    id: "Pakistan_Rivers",
    type: "line",
    source: "Pakistan_Rivers",
    "source-layer": "pakistan_rivers",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.7,
      "line-color": "blue",
      "line-width": 2
    },
  });

  // Event listener for checkbox
  document.getElementById("PakRivers").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Pakistan_Rivers",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///KP Rivers
  map1.addSource("KP_RIVERS", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:kp_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });


  map1.addLayer({
    id: "KP_RIVERS",
    type: "line",
    source: "KP_RIVERS",
    "source-layer": "kp_rivers",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.7,
      "line-color": "blue",
      "line-width": 2
    },
  });

  // Event listener for checkbox
  document.getElementById("kp_Rivers").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "KP_RIVERS",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  //Flood Extent Layers 
  //2010 FLOOD EXTENT 
  map1.addSource("G15_Flood_Inundation_2010_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Humza:G15_Flood_Inundation_2010_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "G15_Flood_Inundation_2010_SUPARCO",
    type: "fill",
    source: "G15_Flood_Inundation_2010_SUPARCO",
    "source-layer": "G15_Flood_Inundation_2010_SUPARCO",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#4682B4",
    },
  });
  document.getElementById("flood2010").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "G15_Flood_Inundation_2010_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  //2011 FLOOD EXTENT 
  map1.addSource("G16_Flood_Inundation_2011_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:G16_Flood_Inundation_2011_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "G16_Flood_Inundation_2011_SUPARCO",
    type: "fill",
    source: "G16_Flood_Inundation_2011_SUPARCO",
    "source-layer": "G16_Flood_Inundation_2011_SUPARCO",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#CCCCFF",
    },
  });
  document.getElementById("flood2011").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "G16_Flood_Inundation_2011_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });



  //2012 FLOOD EXTENT
  map1.addSource("G17_Flood_Inundation_2012_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/GCC:G17_Flood_Inundation_2012_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "G17_Flood_Inundation_2012_SUPARCO",
    type: "fill",
    source: "G17_Flood_Inundation_2012_SUPARCO",
    "source-layer": "G17_Flood_Inundation_2012_SUPARCO",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "green",
    },
  });
  document.getElementById("flood2012").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "G17_Flood_Inundation_2012_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  //2013 FLOOD EXTENT
  map1.addSource("G18_Flood_Inundation_2013_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:G18_Flood_Inundation_2013_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "G18_Flood_Inundation_2013_SUPARCO",
    type: "fill",
    source: "G18_Flood_Inundation_2013_SUPARCO",
    "source-layer": "G18_Flood_Inundation_2013_SUPARCO",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "orange",
    },
  });
  document.getElementById("flood2013").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "G18_Flood_Inundation_2013_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //2014 Flood Extent

  map1.addSource("G19_Flood_Inundation_2014_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:G19_Flood_Inundation_2014_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "G19_Flood_Inundation_2014_SUPARCO",
    type: "fill",
    source: "G19_Flood_Inundation_2014_SUPARCO",
    "source-layer": "G19_Flood_Inundation_2014_SUPARCO",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#5D3FD3",
    },
  });
  document.getElementById("flood2014").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "G19_Flood_Inundation_2014_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //2015 FLOOD EXTENT 
  map1.addSource("G20_Flood_Inundation_2015_NDMA_GIS_Team", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:G20_Flood_Inundation_2015_NDMA_GIS_Team@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "G20_Flood_Inundation_2015_NDMA_GIS_Team",
    type: "fill",
    source: "G20_Flood_Inundation_2015_NDMA_GIS_Team",
    "source-layer": "G20_Flood_Inundation_2015_NDMA_GIS_Team",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#00FFFF",
    },
  });
  document.getElementById("flood2015").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "G20_Flood_Inundation_2015_NDMA_GIS_Team",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });
  ////2022 flood extent
   map1.addSource("river_2022", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/Flood_Insight:river_2022@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "river_2022",
    type: "fill",
    source: "river_2022",
    "source-layer": "river_2022",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#0b6408",
    },
  });
  document.getElementById("flood2022").addEventListener("change", function () {
    const isVisible = this.checked;
    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "river_2022",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  }); 
  //2023 FLOOD EXTENT 
  map1.addSource("VIIRS_20230726_20230730_FloodExtent_PAK", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/	ne:VIIRS_20230726_20230730_FloodExtent_PAK@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "VIIRS_20230726_20230730_FloodExtent_PAK",
    type: "fill",
    source: "VIIRS_20230726_20230730_FloodExtent_PAK",
    "source-layer": "VIIRS_20230726_20230730_FloodExtent_PAK",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#006A71",
    },
  });
  document.getElementById("flood2023").addEventListener("change", function () {
    const isVisible = this.checked;
    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "VIIRS_20230726_20230730_FloodExtent_PAK",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  ///FLOOD EXTENT HOTSPOTS

  map1.addSource("HOTSPOTS", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.4:8080/geoserver/gwc/service/tms/1.0.0/abdul_sattar:flood_Hotspot_Area@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map1.addLayer({
    id: "HOTSPOTS",
    type: "line",
    source: "HOTSPOTS",
    "source-layer": "flood_Hotspot_Area",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 1,
      "line-color": "red",
      "line-width": 3,
    },
  });

  document.getElementById("hotspots").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "HOTSPOTS",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );

    // restoreLayerVisibility(map2, map2Layers);

  });

  //BLINK HOTSPOT FUNCTIONALITY
  let hotspotBlinkInterval = null;
  const HOTSPOTS_OPACITY = 1; // main opacity

  document.getElementById("hotspots").addEventListener("change", function () {
    const isVisible = this.checked;

    // Set the layer's visibility right away
    map1.setLayoutProperty("HOTSPOTS", "visibility", isVisible ? "visible" : "none");

    // Set opacity immediately for toggle on/off
    map1.setPaintProperty("HOTSPOTS", "line-opacity", isVisible ? HOTSPOTS_OPACITY : 0);

    if (hotspotBlinkInterval) {
      clearInterval(hotspotBlinkInterval);
      hotspotBlinkInterval = null;
    }

    if (isVisible) {
      // Wait 1s, then start the periodic blink
      hotspotBlinkInterval = setInterval(() => {
        // Animate fade out (opacity to 0)
        map1.setPaintProperty("HOTSPOTS", "line-opacity", 0);

        // After a short timeout, restore to full opacity
        setTimeout(() => {
          map1.setPaintProperty("HOTSPOTS", "line-opacity", HOTSPOTS_OPACITY);
        }, 200); // opacity is 0 for 0.2s
      }, 1000); // fires every 1s
    }
  });

  // 2024 AUGUST FLOOD EXTENT
  map1.addSource("VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan",
    type: "fill",
    source: "VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan",
    "source-layer": "VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.9,
      "fill-color": "#0096FF",
    },
  });
  document.getElementById("flood2024").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map1.setLayoutProperty(
      "VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );

    // restoreLayerVisibility(map2, map2Layers);

  });

  // 2024 SEPTEMBER FLOOD EXTENT
  map1.addSource("VIIRS_20240910_20240924_MaximumFloodExtent_PAK", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${ibrahim}:8080/geoserver/gwc/service/tms/1.0.0/Boundaries:2024 sept@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "VIIRS_20240910_20240924_MaximumFloodExtent_PAK",
    type: "fill",
    source: "VIIRS_20240910_20240924_MaximumFloodExtent_PAK",
    "source-layer": "2024 sept",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.7,
      "fill-color": "red",
    },
  });
  document.getElementById("flood2024sep").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "VIIRS_20240910_20240924_MaximumFloodExtent_PAK",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  ///FLOOD EXTENT 2025

  // // Add raster source from WMS
  // map1.addSource("fLOOD_Extent", {
  //   type: "raster",
  //   tiles: [
  //     `http://${ahad}:8080/geoserver/monsoon/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=monsoon:fLOOD_Extent&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=256&HEIGHT=256&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`,
  //   ],
  //   tileSize: 256,
  // });

  // // Add raster layer
  // map1.addLayer({
  //   id: "fLOOD_Extent",
  //   type: "raster",
  //   source: "fLOOD_Extent",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "raster-opacity": 0.9,
  //   },
  // });

  // // Checkbox toggle for flood layer
  // document.getElementById("flood2025").addEventListener("change", function () {
  //   const isVisible = this.checked;

  //   map1.setLayoutProperty(
  //     "fLOOD_Extent",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });


  ///Protection Bands
  // Add Protection Band Source
  map1.addSource("protection_band", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/	gcop:protection_bands@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Line Layer for Protection Band
  map1.addLayer({
    id: "protection_band_line",
    type: "line",
    source: "protection_band",
    "source-layer": "protection_bands", // must match the layer name inside the PBF
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.9,
      "line-color": "black",
      "line-width": 2,
    },
  });

  // Label Layer for Description
  map1.addLayer({
    id: "protection_band_label",
    type: "symbol",
    source: "protection_band",
    "source-layer": "protection_bands", // must match
    minzoom: 10, // show labels only after zoom level 10
    layout: {
      "text-field": ["get", "descrption"], // field from attributes
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 10,
      "text-anchor": "center",
      visibility: "none",
    },
    paint: {
      "text-color": "#000000",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  });

  // Checkbox toggle for Protection Band
  document.getElementById("protectionBand").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "protection_band_line",
      "visibility",
      isVisible ? "visible" : "none"
    );
    map1.setLayoutProperty(
      "protection_band_label",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  // Settlements layer
  map1.addSource("settlements", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:settlements@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "settlements",
    type: "circle",
    source: "settlements",
    "source-layer": "settlements",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#FF9800",
      "circle-radius": 6,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });
  document.getElementById("settlements").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty("settlements", "visibility", isVisible ? "visible" : "none");
  });

  // Settlements layer click popup
  map1.on("click", "settlements", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["settlements"] });
    if (!features.length) return;
    const feature = features[0];
    const popupHTML = createFeaturePopup(feature, 'Settlement', '#FF9800', ['name']);
    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', className: 'ffd-enhanced-popup' })
      .setLngLat(e.lngLat).setHTML(popupHTML).addTo(map1);
  });
  map1.on('mouseenter', 'settlements', () => { map1.getCanvas().style.cursor = 'pointer'; });
  map1.on('mouseleave', 'settlements', () => { map1.getCanvas().style.cursor = ''; });

  // Schools layer
  map1.addSource("schools", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:schools@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "schools",
    type: "circle",
    source: "schools",
    "source-layer": "schools",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#2196F3",
      "circle-radius": 6,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });
  document.getElementById("schools").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty("schools", "visibility", isVisible ? "visible" : "none");
  });

  // Schools layer click popup
  map1.on("click", "schools", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["schools"] });
    if (!features.length) return;
    const feature = features[0];
    const popupHTML = createFeaturePopup(feature, 'School', '#2196F3', ['name']);
    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', className: 'ffd-enhanced-popup' })
      .setLngLat(e.lngLat).setHTML(popupHTML).addTo(map1);
  });
  map1.on('mouseenter', 'schools', () => { map1.getCanvas().style.cursor = 'pointer'; });
  map1.on('mouseleave', 'schools', () => { map1.getCanvas().style.cursor = ''; });

  // Railway Stations layer
  map1.addSource("railway_stations", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:railway_stations@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "railway_stations",
    type: "circle",
    source: "railway_stations",
    "source-layer": "railway_stations",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#9C27B0",
      "circle-radius": 6,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });
  document.getElementById("railwayStations").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty("railway_stations", "visibility", isVisible ? "visible" : "none");
  });

  // Railway Stations layer click popup
  map1.on("click", "railway_stations", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["railway_stations"] });
    if (!features.length) return;
    const feature = features[0];
    const popupHTML = createFeaturePopup(feature, 'Railway Station', '#9C27B0', ['name', 'tehsil']);
    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', className: 'ffd-enhanced-popup' })
      .setLngLat(e.lngLat).setHTML(popupHTML).addTo(map1);
  });
  map1.on('mouseenter', 'railway_stations', () => { map1.getCanvas().style.cursor = 'pointer'; });
  map1.on('mouseleave', 'railway_stations', () => { map1.getCanvas().style.cursor = ''; });

  // Airports layer
  map1.addSource("airports", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:airports@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "airports",
    type: "circle",
    source: "airports",
    "source-layer": "airports",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#4CAF50",
      "circle-radius": 6,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });
  document.getElementById("airports").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty("airports", "visibility", isVisible ? "visible" : "none");
  });

  // Airports layer click popup
  map1.on("click", "airports", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["airports"] });
    if (!features.length) return;
    const feature = features[0];
    const popupHTML = createFeaturePopup(feature, 'Airport', '#4CAF50', ['name']);
    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', className: 'ffd-enhanced-popup' })
      .setLngLat(e.lngLat).setHTML(popupHTML).addTo(map1);
  });
  map1.on('mouseenter', 'airports', () => { map1.getCanvas().style.cursor = 'pointer'; });
  map1.on('mouseleave', 'airports', () => { map1.getCanvas().style.cursor = ''; });

  // Bridges layer
  map1.addSource("BridgesL", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:BridgesL@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "BridgesL",
    type: "circle",
    source: "BridgesL",
    "source-layer": "BridgesL",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#F44336",
      "circle-radius": 6,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });
  document.getElementById("bridges").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty("BridgesL", "visibility", isVisible ? "visible" : "none");
  });

  // Bridges layer click popup
  map1.on("click", "BridgesL", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["BridgesL"] });
    if (!features.length) return;
    const feature = features[0];
    const popupHTML = createFeaturePopup(feature, 'Bridge', '#F44336', ['name']);
    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', className: 'ffd-enhanced-popup' })
      .setLngLat(e.lngLat).setHTML(popupHTML).addTo(map1);
  });
  map1.on('mouseenter', 'BridgesL', () => { map1.getCanvas().style.cursor = 'pointer'; });
  map1.on('mouseleave', 'BridgesL', () => { map1.getCanvas().style.cursor = ''; });

  // Health Facilities (Hospitals) layer
  map1.addSource("health_facilities", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:health_facilities@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "health_facilities",
    type: "circle",
    source: "health_facilities",
    "source-layer": "health_facilities",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "#00BCD4",
      "circle-radius": 6,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });
  document.getElementById("healthFacilities").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty("health_facilities", "visibility", isVisible ? "visible" : "none");
  });

  // Health Facilities (Hospitals) layer click popup
  map1.on("click", "health_facilities", function (e) {
    const features = map1.queryRenderedFeatures(e.point, { layers: ["health_facilities"] });
    if (!features.length) return;
    const feature = features[0];
    const popupHTML = createFeaturePopup(feature, 'Hospital', '#00BCD4', ['hf_name', 'hf_type']);
    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', className: 'ffd-enhanced-popup' })
      .setLngLat(e.lngLat).setHTML(popupHTML).addTo(map1);
  });
  map1.on('mouseenter', 'health_facilities', () => { map1.getCanvas().style.cursor = 'pointer'; });
  map1.on('mouseleave', 'health_facilities', () => { map1.getCanvas().style.cursor = ''; });








  ///Inundation 27 aug Extent
  map1.addSource("Flood_extent_27-28Aug", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_extent_27-28Aug@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood_extent_27-28Aug",
    type: "fill",
    source: "Flood_extent_27-28Aug",
    "source-layer": "Flood_extent_27-28Aug",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation27").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood_extent_27-28Aug",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });





  ///Inundation 1 sept Extent
  map1.addSource("Flood_Extent_1-2sep", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_Extent_1-2sep@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood_Extent_1-2sep",
    type: "fill",
    source: "Flood_Extent_1-2sep",
    "source-layer": "Flood_Extent_1-2sep",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation1").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood_Extent_1-2sep",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });







  ///Inundation 5 sept Extent
  map1.addSource("Flood05Sep25", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood05Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood05Sep25",
    type: "fill",
    source: "Flood05Sep25",
    "source-layer": "Flood05Sep25",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation5").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood05Sep25",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });






  ///Inundation 6 sept Extent
  map1.addSource("Flood06Sep25", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood06Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood06Sep25",
    type: "fill",
    source: "Flood06Sep25",
    "source-layer": "Flood06Sep25",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation6").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood06Sep25",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });




  ///Inundation 7 sept Extent
  map1.addSource("Flood07Sep25", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood07Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood07Sep25",
    type: "fill",
    source: "Flood07Sep25",
    "source-layer": "Flood07Sep25",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation7").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood07Sep25",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });





  ///Inundation 9 sept Extent
  map1.addSource("Flood09Sep25", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood09Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood09Sep25",
    type: "fill",
    source: "Flood09Sep25",
    "source-layer": "Flood09Sep25",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation9").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood09Sep25",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });




  ///Inundation 13 sept Extent
  map1.addSource("Flood13Sep25", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood13Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood13Sep25",
    type: "fill",
    source: "Flood13Sep25",
    "source-layer": "Flood13Sep25",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation13").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood13Sep25",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });




  ///Inundation 16 Extent
  map1.addSource("Extent16-09-2025", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Extent16-09-2025@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Extent16-09-2025",
    type: "fill",
    source: "Extent16-09-2025",
    "source-layer": "Extent16-09-2025",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation16").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Extent16-09-2025",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });





  ///Inundation 19 Extent
  map1.addSource("Flood_Extant_19-09-2025", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_Extant_19-09-2025@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood_Extant_19-09-2025",
    type: "fill",
    source: "Flood_Extant_19-09-2025",
    "source-layer": "Flood_Extant_19-09-2025",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation19").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood_Extant_19-09-2025",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///Inundation 21 Extent
  map1.addSource("Flood_extant_21sep", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_extant_21sep@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood_extant_21sep",
    type: "fill",
    source: "Flood_extant_21sep",
    "source-layer": "Flood_extant_21sep",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundation21").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood_extant_21sep",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///Buner floods
  map1.addSource("bunerflood", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:buner_hill_torrents@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "bunerflood",
    type: "fill",
    source: "bunerflood",
    "source-layer": "buner_hill_torrents",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("buner").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "bunerflood",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///Inundation Comulated 14 Sept to 21 Extent
  map1.addSource("FloodExtents_CummTill14Sep25Dis", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:FloodExtents_CummTill14Sep25Dis@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "FloodExtents_CummTill14Sep25Dis",
    type: "fill",
    source: "FloodExtents_CummTill14Sep25Dis",
    "source-layer": "FloodExtents_CummTill14Sep25Dis",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundationCom14to21").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "FloodExtents_CummTill14Sep25Dis",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ///Inundation Comulated 5 to 21 Extent
  map1.addSource("Flood_Extent_Comulated_5to21f", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_Extent_Comulated_5to21f@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Flood_Extent_Comulated_5to21f",
    type: "fill",
    source: "Flood_Extent_Comulated_5to21f",
    "source-layer": "Flood_Extent_Comulated_5to21f",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("inundationCom5to21").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Flood_Extent_Comulated_5to21f",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  /////Pond Sites
  map1.addSource("Pond_Sites", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Pond_Sites@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "Pond_Sites",
    type: "circle",
    source: "Pond_Sites",
    "source-layer": "Pond_Sites",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "brown",          // solid cyan fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }

  });

  document.getElementById("pondSites").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Pond_Sites",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  /////KP DAMS
  map1.addSource("KP_Dams", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:KP_Dams@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "KP_Dams",
    type: "circle",
    source: "KP_Dams",
    "source-layer": "KP_Dams",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "red",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("kpDams").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "KP_Dams",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  ////GB
  map1.addSource("GB", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:GB@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "GB",
    type: "circle",
    source: "GB",
    "source-layer": "GB",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "black",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("gb").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "GB",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });


  ///Retention Reservoirs
  map1.addSource("Retention_Reserviors", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Retention_Reserviors@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "Retention_Reserviors",
    type: "circle",
    source: "Retention_Reserviors",
    "source-layer": "Retention_Reserviors",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "purple",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("retentionReservoirs").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Retention_Reserviors",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  ////Retention Ponds
  map1.addSource("Retention_Pond", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Retention_Pond@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "Retention_Pond",
    type: "circle",
    source: "Retention_Pond",
    "source-layer": "Retention_Pond",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "green",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("retentionPonds").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Retention_Pond",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });
  ////DGKHAN
  map1.addSource("DGK", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:DGK@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "DGK",
    type: "circle",
    source: "DGK",
    "source-layer": "DGK",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "MAGENTA",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("dgKhan").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "DGK",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ////bALOCHISTAN
  map1.addSource("balochistan", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:balochistan@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "balochistan",
    type: "circle",
    source: "balochistan",
    "source-layer": "balochistan",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "Green",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("balochistan").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "balochistan",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });



  ////Dams
  map1.addSource("Dams", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Dams@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ]
  });

  map1.addLayer({
    id: "Dams",
    type: "circle",
    source: "Dams",
    "source-layer": "Dams",
    layout: {
      visibility: "none",

    },
    paint: {
      "circle-color": "orange",          // solid brown fill
      "circle-radius": 5,             // dot size
      "circle-stroke-color": "white",  // white outline
      "circle-stroke-width": 2         // outline thickness
    }
  });

  document.getElementById("dams1").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Dams",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  /////Rention Ponds
  map1.addSource("Retention_PondImp", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Retention_PondImp@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Retention_PondImp",
    type: "fill",
    source: "Retention_PondImp",
    "source-layer": "Retention_PondImp",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.7,
      "fill-color": "blue",
    },
  });

  // 3) Toggle via checkbox
  document.getElementById("rtimp").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Retention_PondImp",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });

  //////Canal system Punjab Layers 

  // Add Punjab Canal Network (Hydromet workspace) — 4 line layers with checkbox toggles and styled popups
  // Sources: Hydromet:Main_Canals, Hydromet:Branch_Canals, Hydromet:Link_Canals, Hydromet:Distributories
  // Layer IDs: main_canals_line, branch_canals_line, link_canals_line, distributories_line
  // Checkbox IDs: mainCanal, branchCanal, linkCanals, distributaries

  try {
    // Helper: initial visibility from checkbox state
    const initialVisibility = (id) => {
      const cb = document.getElementById(id);
      return cb && cb.checked ? "visible" : "none";
    };

    // 1) Add sources (if not exist)
    if (!map1.getSource('main_canals_src')) {
      map1.addSource('main_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:Main_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('branch_canals_src')) {
      map1.addSource('branch_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:Branch_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('link_canals_src')) {
      map1.addSource('link_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:Link_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('distributories_src')) {
      map1.addSource('distributories_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:Distributories@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }

    // 2) Add line layers (if not exist). Width hierarchy: Main > Branch > Link > Distributories
    if (!map1.getLayer('main_canals_line')) {
      map1.addLayer({
        id: 'main_canals_line',
        type: 'line',
        source: 'main_canals_src',
        'source-layer': 'Main_Canals',
        layout: { visibility: initialVisibility('mainCanal') },
        paint: {
          'line-color': '#0d47a1', // deep blue
          'line-width': 4.0,
          'line-opacity': 0.95
        }
      });
    }
    if (!map1.getLayer('branch_canals_line')) {
      map1.addLayer({
        id: 'branch_canals_line',
        type: 'line',
        source: 'branch_canals_src',
        'source-layer': 'Branch_Canals',
        layout: { visibility: initialVisibility('branchCanal') },
        paint: {
          'line-color': '#1976d2', // bright blue
          'line-width': 3.0,
          'line-opacity': 0.95
        }
      });
    }
    if (!map1.getLayer('link_canals_line')) {
      map1.addLayer({
        id: 'link_canals_line',
        type: 'line',
        source: 'link_canals_src',
        'source-layer': 'Link_Canals',
        layout: { visibility: initialVisibility('linkCanals') },
        paint: {
          'line-color': '#26a69a', // teal
          'line-width': 2.5,
          'line-opacity': 0.95
        }
      });
    }
    if (!map1.getLayer('distributories_line')) {
      map1.addLayer({
        id: 'distributories_line',
        type: 'line',
        source: 'distributories_src',
        'source-layer': 'Distributories',
        layout: { visibility: initialVisibility('distributaries') },
        paint: {
          'line-color': '#4dd0e1', // light cyan
          'line-width': 2.0,
          'line-opacity': 0.95
        }
      });
    }

    // 2b) Label layers (symbol) with black text, show on zoom
    if (!map1.getLayer('main_canals_label')) {
      map1.addLayer({
        id: 'main_canals_label',
        type: 'symbol',
        source: 'main_canals_src',
        'source-layer': 'Main_Canals',
        minzoom: 10,
        layout: {
          visibility: initialVisibility('mainCanal'),
          'text-field': ['coalesce', ['get', 'NAME'], ['get', 'name']],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2
        }
      });
    }
    if (!map1.getLayer('branch_canals_label')) {
      map1.addLayer({
        id: 'branch_canals_label',
        type: 'symbol',
        source: 'branch_canals_src',
        'source-layer': 'Branch_Canals',
        minzoom: 10,
        layout: {
          visibility: initialVisibility('branchCanal'),
          'text-field': ['coalesce', ['get', 'NAME'], ['get', 'name']],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2
        }
      });
    }
    if (!map1.getLayer('link_canals_label')) {
      map1.addLayer({
        id: 'link_canals_label',
        type: 'symbol',
        source: 'link_canals_src',
        'source-layer': 'Link_Canals',
        minzoom: 10,
        layout: {
          visibility: initialVisibility('linkCanals'),
          'text-field': ['coalesce', ['get', 'NAME'], ['get', 'name']],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2
        }
      });
    }
    if (!map1.getLayer('distributories_label')) {
      map1.addLayer({
        id: 'distributories_label',
        type: 'symbol',
        source: 'distributories_src',
        'source-layer': 'Distributories',
        minzoom: 10,
        layout: {
          visibility: initialVisibility('distributaries'),
          'text-field': ['coalesce', ['get', 'NAME'], ['get', 'name']],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2
        }
      });
    }

    // 3) Checkbox toggles — guard to avoid duplicate bindings on style switches
    if (!map1._canalToggleBound) {
      map1._canalToggleBound = true;
      const bindToggle = (checkboxId, layerId) => {
        const el = document.getElementById(checkboxId);
        if (!el) return;
        el.addEventListener('change', function () {
          if (map1.getLayer(layerId)) {
            map1.setLayoutProperty(layerId, 'visibility', this.checked ? 'visible' : 'none');
          }
        });
      };
      bindToggle('mainCanal', 'main_canals_line');
      bindToggle('mainCanal', 'main_canals_label');
      bindToggle('branchCanal', 'branch_canals_line');
      bindToggle('branchCanal', 'branch_canals_label');
      bindToggle('linkCanals', 'link_canals_line');
      bindToggle('linkCanals', 'link_canals_label');
      bindToggle('distributaries', 'distributories_line');
      bindToggle('distributaries', 'distributories_label');
    }

    // 4) Popups on click — styled similar to FFD popup
    if (!map1._canalPopupBound) {
      map1._canalPopupBound = true;

      const popupHTML = (name, parent_ch) => `
        <div class="ffd-popup-container">
          <div class="popup-content">
            <h3 class="section-title"><i class="fas fa-water"></i> Canal Segment</h3>
            <div class="discharge-item"><span class="discharge-label">Name:</span><span class="discharge-value">${name || 'N/A'}</span></div>
            <div class="discharge-item"><span class="discharge-label">Parent Channel:</span><span class="discharge-value">${parent_ch || 'N/A'}</span></div>
          </div>
        </div>
        <style>
          .ffd-popup-container { font-family: 'Oxygen', 'Raleway', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#0f172a; }
          .popup-content { background: #ffffff; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); padding: 12px 14px; min-width: 240px; }
          .section-title { font-size: 14px; font-weight: 700; color: #0d47a1; display:flex; align-items:center; gap:8px; margin: 4px 0 10px; }
          .section-title i{ color:#0d47a1; }
          .discharge-item{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; border-radius:8px; background: #f8fafc; margin-bottom:6px; }
          .discharge-label{ color:#334155; font-weight:600; font-size:12px; }
          .discharge-value{ color:#0f172a; font-weight:700; font-size:12px; }
          .mapboxgl-popup-content { padding:0; border-radius:12px; overflow:hidden; }
        </style>
      `;

      const bindPopup = (layerId) => {
        map1.on('click', layerId, (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const props = f.properties || {};
          const name = props.NAME || props.name || '';
          const parent = props.parent_ch || props.PARENT || '';

          new mapboxgl.Popup({ closeOnClick: true, maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(popupHTML(name, parent))
            .addTo(map1);
        });
        map1.on('mouseenter', layerId, () => { map1.getCanvas().style.cursor = 'pointer'; });
        map1.on('mouseleave', layerId, () => { map1.getCanvas().style.cursor = ''; });
      };

      bindPopup('main_canals_line');
      bindPopup('branch_canals_line');
      bindPopup('link_canals_line');
      bindPopup('distributories_line');
    }
  } catch (e) {
    console.warn('Canal network setup error:', e);
  }



  add3DBuildingsLayer(map1);
  //WATER SHED LAYER
  if (!map1.getSource("Combined")) {
    map1.addSource("Combined", {
      type: "vector",
      scheme: "tms",
      tiles: [
        `http://${geoserverUrl}:8080/geoserver/gwc/service/tms/1.0.0/gcop:water_shed@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
      ],
    });
  }

  if (!map1.getLayer("Combined")) {
    map1.addLayer(
      {
        id: "Combined",
        type: "fill",
        source: "Combined", // Updated to match the source created above
        "source-layer": "water_shed",
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-opacity": 0.5,
          "fill-color": [
            "match",
            ["get", "name"], // Get the 'name' property of the feature
            "Sutlej Catchment", "#FC0FC0",            // Assign pink color for "Sutlej Catchment"
            "Ravi Catchment", "chartreuse",        // Assign parrot green color for "Ravi Catchment"
            "Chenab Catchment", "purple",          // Assign purple color for "Chenab Catchment"
            "Mangla Catchment", "darkblue",        // Assign dark blue color for "Mangla Catchment"
            "Tarbela Catchment", "yellow",         // Assign yellow color for "Tarbela Catchment"
            "Kabul Catchment", "orange",           // Assign orange color for "Kabul Catchment"
            "red"                                  // Default color when no match
          ]
        },
      },

    );
  }

  if (!map1.getLayer("Combined_label")) {
    map1.addLayer({
      id: "Combined_label",
      type: "symbol",
      source: "Combined",
      "source-layer": "water_shed",
      layout: {
        visibility: "none",
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-letter-spacing": 0.1,
        "text-size": 12,
        "text-offset": [0, 0],
        "text-anchor": "center",
      },
      paint: {
        "text-color": "black",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1,
      },
    });
  }


  document.getElementById("watershed").addEventListener("change", function () {
    const isVisible = this.checked;
    ["Combined", "Combined_label"].forEach((layerId) => {
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
      }
    });
  });
}

function ensureWaterLayerForSatellite(map) {
  if (!pendingStyleIsSatellite) return;
  if (!map.getLayer('water')) {
    map.addLayer({
      id: 'water',
      type: 'background',
      paint: {
        'background-opacity': 0
      }
    });
  }
}

function runStyleLoadPipeline() {
  if (!map1) return;

  ensureWaterLayerForSatellite(map1);
  map1._hydrometLayersAdded = false;

  addBoundaryLayers(map1);
  addHydrometLayersToMap(map1);

  if (typeof window.addLightningForecastLayers === 'function') {
    window.addLightningForecastLayers();
  }
  if (typeof window.addWeeklyAccumulationLayers === 'function') {
    window.addWeeklyAccumulationLayers();
  }
  if (typeof window.addPrecip2026Layers === 'function') {
    window.addPrecip2026Layers();
  }

  if (weatherController) {
    weatherController.hourlyLayersAdded = false;
    weatherController.weeklyLayersAdded = false;
  }

  const hourlyToggle = document.getElementById('hrs-precip-toggle');
  if (hourlyToggle?.checked && typeof toggleHourlyRainfall === 'function') {
    toggleHourlyRainfall(hourlyToggle);
  }

  const weeklyToggle = document.getElementById('wky-precip-toggle');
  if (weeklyToggle?.checked && typeof toggleWeeklyRainfall === 'function') {
    toggleWeeklyRainfall(weeklyToggle);
  }

  const lightningToggle = document.getElementById('ltw');
  const lightningControls = document.querySelector('.mt-4.space-y-2');
  if (lightningToggle?.checked) {
    idSuffixes.forEach(suffix => {
      const layerId = `forecast_${suffix}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    });
    const ltwSlider = document.getElementById('ltw-slider');
    const ltwIndex = ltwSlider ? parseInt(ltwSlider.value, 10) : 0;
    if (typeof window.setLightningIndex === 'function') {
      window.setLightningIndex(Number.isNaN(ltwIndex) ? 0 : ltwIndex);
    }
    lightningControls?.classList.remove('hidden');
  } else {
    idSuffixes.forEach(suffix => {
      const layerId = `forecast_${suffix}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', 'none');
      }
    });
    lightningControls?.classList.add('hidden');
  }

  const wpaToggle = document.getElementById('wpa');
  const wpaControls = document.querySelector('.wpa-controls');
  const wpaSlider = document.getElementById('wpa-slider');
  if (wpaToggle?.checked) {
    const totalWPAIndex = 10;
    for (let index = 0; index < totalWPAIndex; index++) {
      const layerId = `Convective_precipitation_weekly_kgm2_forecast_${index + 1}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    }
    const wpaIndex = wpaSlider ? parseInt(wpaSlider.value, 10) : 0;
    if (typeof window.setWeeklyAccumulationIndex === 'function') {
      window.setWeeklyAccumulationIndex(Number.isNaN(wpaIndex) ? 0 : wpaIndex);
    }
    wpaControls?.classList.remove('hidden');
  } else {
    const totalWPAIndex = 10;
    for (let index = 0; index < totalWPAIndex; index++) {
      const layerId = `Convective_precipitation_weekly_kgm2_forecast_${index + 1}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', 'none');
      }
    }
    wpaControls?.classList.add('hidden');
  }

  const precipToggle = document.getElementById('precip2026');
  const precipControls = document.querySelector('.precip2026-controls');
  const precipSlider = document.getElementById('precip2026-slider');
  if (precipToggle?.checked) {
    const totalMonths = 12;
    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    }
    const precipIndex = precipSlider ? parseInt(precipSlider.value, 10) : 0;
    if (typeof window.setPrecip2026Index === 'function') {
      window.setPrecip2026Index(Number.isNaN(precipIndex) ? 0 : precipIndex);
    }
    precipControls?.classList.remove('hidden');
  } else {
    const totalMonths = 12;
    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', 'none');
      }
    }
    precipControls?.classList.add('hidden');
  }

  if (typeof window.ensureBoundaryLayersAndSync === 'function') {
    window.ensureBoundaryLayersAndSync();
  }

  const tslBoundary = document.getElementById('tslBoundary');
  if (tslBoundary) {
    handleTslBoundary(tslBoundary);
  }
  const dstBoundary = document.getElementById('dstBoundary');
  if (dstBoundary) {
    handleDisBoundary(dstBoundary);
  }

  const visibilityState = getMap1VisibilityStates();
  applyMap1VisibilityStates(map1, visibilityState);
  setTimeout(() => moveAllLabelsToTop(map1), 1000);

  if (pendingCheckboxRestore) {
    pendingCheckboxRestore = false;
    setTimeout(() => {
      restoreCheckboxStates();
    }, 800);
  }

  refreshKarachiLightPreset(map1);
  applyPendingBasemapConfig(map1);
  restoreImpactOnStyleLoad();

  pendingStyleIsSatellite = false;
}

let hydroStyleLoadPipelineScheduled = false;
function scheduleHydroStyleLoadPipeline() {
  if (hydroStyleLoadPipelineScheduled) return;
  hydroStyleLoadPipelineScheduled = true;
  setTimeout(() => {
    hydroStyleLoadPipelineScheduled = false;
    runStyleLoadPipeline();
  }, 0);
}

map1.on('style.load', () => {
  map1.__hydroStyleReadyForLayers = true;
  map1.__hydroStyleReadyStyle = map1.style;
  scheduleHydroStyleLoadPipeline();
});
whenHydroMapStyleReady(map1, scheduleHydroStyleLoadPipeline);
//-----------------------------------------------------Mapbox gl js BasemapSwitcher COntrol Start-----------------------------------------------------------------------------------------------//
class MapboxStyleSwitcherControl {
  getVisibleLayers() {
    const visibleLayers = [];
    const layers = this.map.getStyle().layers;
    layers.forEach((layer) => {
      if (layer.layout && layer.layout.visibility === "visible") {
        visibleLayers.push(layer.id);
      }
    });
    return visibleLayers;
  }

  setVisibleLayers(layers) {
    layers.forEach((layerId) => {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, "visibility", "visible");
      }
    });
  }

  // Store all custom sources and layers before style change
  preserveCustomLayers() {
    try {
      const style = this.map.getStyle();
      const customSources = {};
      const customLayers = [];
      const layerVisibility = {};
      const customImages = {};

      // Preserve custom images (like dam icons) - but handle errors gracefully
      const imageNames = ['Future', 'Ready_for_Construction', 'Ongoing', 'Under_construction'];
      imageNames.forEach(imageName => {
        try {
          if (this.map.hasImage(imageName)) {
            // For images, we'll just store that they exist and reload them later
            customImages[imageName] = true;
          }
        } catch (e) {
          console.warn(`Error preserving image ${imageName}:`, e);
        }
      });

      // Get all sources that are not from the base style
      Object.keys(style.sources).forEach(sourceId => {
        // Preserve sources that contain geoserver, geojson, or custom data
        const source = style.sources[sourceId];
        if (source.type === 'geojson' ||
          (source.tiles && source.tiles.some(tile => tile.includes('geoserver'))) ||
          sourceId.includes('ffd') || sourceId.includes('glofas') ||
          sourceId.includes('impact') ||
          sourceId.includes('Swat') || sourceId.includes('Panjgora') ||
          sourceId.includes('Future') || sourceId.includes('Ready_for_Construction') ||
          sourceId.includes('Ongoing') || sourceId.includes('Under_construction') ||
          sourceId.includes('Dams_Water_Bodies')) {
          customSources[sourceId] = source;
        }
      });

      // Get all layers that use custom sources
      style.layers.forEach(layer => {
        if (customSources[layer.source] || layer.id.includes('ffd') || layer.id.includes('glofas') ||
          layer.id.includes('impact') ||
          layer.id.includes('Future') || layer.id.includes('Ready_for_Construction') ||
          layer.id.includes('Ongoing') || layer.id.includes('Under_construction') ||
          layer.id.includes('Dams_Water_Bodies')) {
          customLayers.push(layer);
          // Store visibility state
          layerVisibility[layer.id] = layer.layout && layer.layout.visibility ? layer.layout.visibility : 'visible';
        }
      });

      return { customSources, customLayers, layerVisibility, customImages };
    } catch (error) {
      console.error('Error in preserveCustomLayers:', error);
      return { customSources: {}, customLayers: [], layerVisibility: {}, customImages: {} };
    }
  }

  // Restore custom layers after style change
  restoreCustomLayers(preserved) {
    try {
      const { customSources, customLayers, layerVisibility, customImages } = preserved;

      // We'll let addHydrometLayersToMap handle image reloading since it has the URLs
      // Just ensure the addHydrometLayersToMap function will run

      // Re-add custom sources
      Object.keys(customSources).forEach(sourceId => {
        try {
          if (!this.map.getSource(sourceId)) {
            this.map.addSource(sourceId, customSources[sourceId]);
          }
        } catch (e) {
          console.warn(`Error restoring source ${sourceId}:`, e);
        }
      });

      // Re-add custom layers
      customLayers.forEach(layer => {
        try {
          if (!this.map.getLayer(layer.id)) {
            this.map.addLayer({
              ...layer,
              layout: {
                ...layer.layout,
                visibility: layerVisibility[layer.id] || 'none'
              }
            });
          }
        } catch (e) {
          console.warn(`Error restoring layer ${layer.id}:`, e);
        }
      });
    } catch (error) {
      console.error('Error in restoreCustomLayers:', error);
    }
  }

  constructor(styles) {
    this.styles = styles || MapboxStyleSwitcherControl.DEFAULT_STYLES;
  }

  getDefaultPosition() {
    return "top-right";
  }

  onAdd(map) {
    this.map = map;
    this.controlContainer = document.createElement("div");
    this.controlContainer.classList.add("mapboxgl-ctrl");
    this.controlContainer.classList.add("mapboxgl-ctrl-group");
    const mapStyleContainer = document.createElement("div");
    const styleButton = document.createElement("button");
    mapStyleContainer.classList.add("mapboxgl-style-list");

    for (const style of this.styles) {
      const styleElement = document.createElement("button");
      styleElement.innerText = style.title;
      styleElement.classList.add(style.title.replace(/[^a-z0-9-]/gi, "_"));
      styleElement.dataset.uri = JSON.stringify(style.uri);
      styleElement.addEventListener("click", (event) => {
        const srcElement = event.target || event.srcElement;

        try {
          // Save current checkbox states before style change
          saveCheckboxStates();

          // Change the basemap style
          const newStyleUri = JSON.parse(srcElement.dataset.uri);
          pendingStyleIsSatellite = newStyleUri.includes('satellite');
          pendingCheckboxRestore = true;
          pendingBasemapConfig = style.config ? { ...style.config } : null;
          map.setStyle(newStyleUri);

          // Update UI
          mapStyleContainer.style.display = "none";
          styleButton.style.display = "block";
          const elms = mapStyleContainer.getElementsByClassName("active");
          while (elms[0]) {
            elms[0].classList.remove("active");
          }
          srcElement.classList.add("active");

        } catch (error) {
          console.error('Error changing basemap:', error);
        }
      });
      if (style.title === MapboxStyleSwitcherControl.DEFAULT_STYLE) {
        styleElement.classList.add("active");
      }
      mapStyleContainer.appendChild(styleElement);
    }
    styleButton.classList.add("mapboxgl-ctrl-icon");
    styleButton.classList.add("mapboxgl-style-switcher");
    styleButton.addEventListener("click", () => {
      styleButton.style.display = "none";
      mapStyleContainer.style.display = "block";
    });
    document.addEventListener("click", (event) => {
      if (!this.controlContainer.contains(event.target)) {
        mapStyleContainer.style.display = "none";
        styleButton.style.display = "block";
      }
    });
    this.controlContainer.appendChild(styleButton);
    this.controlContainer.appendChild(mapStyleContainer);
    return this.controlContainer;
  }

  onRemove() {
    this.controlContainer.parentNode.removeChild(this.controlContainer);
    this.map = undefined;
  }
}
MapboxStyleSwitcherControl.DEFAULT_STYLE = "Standard";
MapboxStyleSwitcherControl.DEFAULT_STYLES = [
  { title: "Navigation Night", uri: "mapbox://styles/mapbox/navigation-night-v1" },
  { title: "Light", uri: "mapbox://styles/mapbox/light-v11" },
  { title: "Monochrome", uri: "mapbox://styles/daudi97/ckcouhqzd0l1f1io3zw42a9s7" },
  { title: "Pencil", uri: "mapbox://styles/daudi97/ckdudgjow12jd19prca4m3p1a" },
  { title: "Dark", uri: "mapbox://styles/mapbox/dark-v11" },
  { title: "Outdoors", uri: "mapbox://styles/mapbox/outdoors-v12" },
  { title: "Traffic Day", uri: "mapbox://styles/mapbox/traffic-day-v2" },
  { title: "Green", uri: "mapbox://styles/linodev/ckw951ybo54sb15ocs835d13d" },
  { title: "Standard", uri: "mapbox://styles/mapbox/standard" },
  { title: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12" },
  { title: "Faded", uri: "mapbox://styles/mapbox/standard", config: { theme: "faded" } },
  { title: "Satellite Latest", uri: "mapbox://styles/mapbox/standard-satellite" },
];
map1.addControl(new mapboxgl.FullscreenControl());
map1.addControl(new MapboxStyleSwitcherControl());
refreshKarachiLightPreset(map1);
setInterval(() => refreshKarachiLightPreset(map1), 5 * 60 * 1000);
//-----------------------------------------------------Mapbox gl js BasemapSwitcher COntrol END-----------------------------------------------------------------------------------------------//

// restoreLayerVisibility(map1, map1Layers);


//-----------------------------------------------------Mapbox gl js 3D Control END-----------------------------------------------------------------------------------------------//
//-----------------------------------------------------Mapbox gl js Rain Control START-----------------------------------------------------------------------------------------------//
class RainToggleControl {
  onAdd(map) {
    this._map = map;
    const container = document.createElement("div");
    container.className = "mapboxgl-ctrl mapboxgl-ctrl-group"; // Important for control alignment

    const button = document.createElement("button");
    button.className = "rain-toggle-btn";
    button.innerHTML = '<img src="media/UI/controlicons/raineffect.webp" alt="Rain effect" />';
    button.title = "Toggle Rain Effect";

    button.onclick = () => {
      this.rainOn = !this.rainOn;

      if (this.rainOn) {
        map.setRain({
          density: ['interpolate', ['linear'], ['zoom'], 11, 0.0, 13, 0.5],
          intensity: 1.0,
          opacity: 0.7,
          color: '#a8adbc',
          vignette: ['interpolate', ['linear'], ['zoom'], 11, 0.0, 13, 1.0],
          'vignette-color': '#464646',
          direction: [0, 80],
        });
        button.classList.add("active");
      } else {
        map.setRain({
          density: 0,
          intensity: 0,
          opacity: 0,
        });
        button.classList.remove("active");
      }
    };

    container.appendChild(button);
    this._container = container;
    return container;
  }
  onRemove() {
    this._container.remove();
    this._map = undefined;
  }
}
//-----------------------------------------------------Mapbox gl js Rain Control END-----------------------------------------------------------------------------------------------//
//-----------------------------------------------------Mapbox gl js Layer Reorder Control START-----------------------------------------------------------------------------------------//
class LayerReorderControl {
  constructor() {
    this._map = null;
    this._container = null;
    this._panel = null;
    this._list = null;
    this._empty = null;
    this._isOpen = false;
    this._isDragging = false;
    this._draggingItem = null;
    this._lastIds = [];
    this._updateScheduled = false;
  }

  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'mapboxgl-ctrl layer-reorder-control';

    const group = document.createElement('div');
    group.className = 'mapboxgl-ctrl-group';

    const button = document.createElement('button');
    button.className = 'mapboxgl-ctrl-icon layer-reorder-btn';
    button.type = 'button';
    button.title = 'Reorder active layers';
    button.innerHTML = '<img src="media/UI/controlicons/reorder.webp" alt="Reorder layers" />';

    const panel = document.createElement('div');
    panel.className = 'layer-reorder-panel';

    const header = document.createElement('div');
    header.className = 'layer-reorder-header';
    const title = document.createElement('span');
    title.textContent = 'Active Layers';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'layer-reorder-close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const list = document.createElement('ul');
    list.className = 'layer-reorder-list';

    const empty = document.createElement('div');
    empty.className = 'layer-reorder-empty';
    empty.textContent = 'No active layers';

    panel.appendChild(header);
    panel.appendChild(empty);
    panel.appendChild(list);

    group.appendChild(button);
    container.appendChild(group);
    container.appendChild(panel);

    this._container = container;
    this._panel = panel;
    this._list = list;
    this._empty = empty;

    const togglePanel = () => {
      this._isOpen = !this._isOpen;
      panel.classList.toggle('is-open', this._isOpen);
      if (this._isOpen) this._scheduleUpdate();
    };

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._isOpen = false;
      panel.classList.remove('is-open');
    });

    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target)) {
        this._isOpen = false;
        panel.classList.remove('is-open');
      }
    });

    list.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.layer-reorder-remove');
      if (!removeBtn) return;
      const item = removeBtn.closest('.layer-reorder-item');
      const layerId = item?.dataset.layerId;
      if (!layerId) return;
      this._hideLayer(layerId);
    });

    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.layer-reorder-item');
      if (!item) return;
      this._isDragging = true;
      this._draggingItem = item;
      item.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.layerId || '');
      }
    });

    list.addEventListener('dragover', (e) => {
      if (!this._draggingItem) return;
      e.preventDefault();
      const target = e.target.closest('.layer-reorder-item');
      if (!target || target === this._draggingItem) return;
      const rect = target.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      list.insertBefore(this._draggingItem, before ? target : target.nextSibling);
    });

    list.addEventListener('dragend', () => {
      if (!this._draggingItem) return;
      this._draggingItem.classList.remove('is-dragging');
      this._draggingItem = null;
      this._isDragging = false;
      this._applyOrderFromList();
    });

    this._scheduleUpdate = () => {
      if (this._updateScheduled || this._isDragging) return;
      this._updateScheduled = true;
      requestAnimationFrame(() => {
        this._updateScheduled = false;
        if (!this._isDragging) this._render();
      });
    };

    requestLayerReorderUpdate = this._scheduleUpdate;
    map.on('idle', this._scheduleUpdate);
    map.on('styledata', this._scheduleUpdate);

    return container;
  }

  onRemove() {
    if (this._container) this._container.remove();
    if (this._map && this._scheduleUpdate) {
      this._map.off('idle', this._scheduleUpdate);
      this._map.off('styledata', this._scheduleUpdate);
    }
    this._map = null;
    requestLayerReorderUpdate = () => {};
  }

  _render() {
    if (!this._map || !this._list) return;
    const activeIds = this._getActiveLayerIds();
    if (activeIds.join('|') === this._lastIds.join('|')) return;
    this._lastIds = activeIds.slice();

    this._list.innerHTML = '';
    if (activeIds.length === 0) {
      this._empty?.classList.add('is-visible');
      return;
    }
    this._empty?.classList.remove('is-visible');

    activeIds.forEach(layerId => {
      const item = document.createElement('li');
      item.className = 'layer-reorder-item';
      item.draggable = true;
      item.dataset.layerId = layerId;

      const handle = document.createElement('span');
      handle.className = 'layer-reorder-handle';
      handle.innerHTML = '&#x2630;';

      const name = document.createElement('span');
      name.className = 'layer-reorder-name';
      name.textContent = layerId;

      const remove = document.createElement('button');
      remove.className = 'layer-reorder-remove';
      remove.type = 'button';
      remove.title = 'Hide layer';
      remove.innerHTML = '&times;';

      item.appendChild(handle);
      item.appendChild(name);
      item.appendChild(remove);
      this._list.appendChild(item);
    });
  }

  _getActiveLayerIds() {
    const style = this._map.getStyle();
    if (!style || !Array.isArray(style.layers)) return [];

    const visible = style.layers.filter(layer => {
      if (!customLayerRegistry.has(layer.id)) return false;
      const visibility = layer.layout?.visibility || 'visible';
      if (visibility === 'none') return false;
      return !this._isLayerTransparent(layer);
    });

    // Mapbox style layers are bottom->top. We want top-first for UI.
    return visible.map(l => l.id).reverse();
  }

  _isLayerTransparent(layer) {
    const layerId = layer.id;
    const type = layer.type;
    const paint = (prop) => this._map.getPaintProperty(layerId, prop);
    const isZero = (value) => typeof value === 'number' && value <= 0;

    if (type === 'symbol') {
      const iconOpacity = paint('icon-opacity');
      const textOpacity = paint('text-opacity');
      if (isZero(iconOpacity) && isZero(textOpacity)) return true;
      return false;
    }

    const opacityProp = {
      fill: 'fill-opacity',
      line: 'line-opacity',
      circle: 'circle-opacity',
      raster: 'raster-opacity',
      heatmap: 'heatmap-opacity'
    }[type];

    if (opacityProp && isZero(paint(opacityProp))) return true;

    if (type === 'fill') {
      const color = paint('fill-color');
      if (typeof color === 'string') {
        if (color.toLowerCase() === 'transparent') return true;
        if (/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)/i.test(color)) return true;
      }
    }

    return false;
  }

  _applyOrderFromList() {
    if (!this._map || !this._list) return;
    const ids = Array.from(this._list.querySelectorAll('.layer-reorder-item'))
      .map(item => item.dataset.layerId)
      .filter(Boolean);
    // List is top->bottom. Move from bottom->top so order matches list.
    for (let i = ids.length - 1; i >= 0; i--) {
      if (this._map.getLayer(ids[i])) {
        try {
          this._map.moveLayer(ids[i]);
        } catch (e) {
          // ignore move errors
        }
      }
    }
    this._lastIds = ids;
  }

  _hideLayer(layerId) {
    if (this._map.getLayer(layerId)) {
      try {
        this._map.setLayoutProperty(layerId, 'visibility', 'none');
      } catch (e) {
        // ignore
      }
    }

    const checkbox = document.getElementById(layerId);
    if (checkbox && checkbox.type === 'checkbox') {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    this._scheduleUpdate();
  }
}
//-----------------------------------------------------Mapbox gl js Layer Reorder Control END-------------------------------------------------------------------------------------------//
//-----------------------------------------------------GEOGLOWS CHART MODEL-----------------------------------------------------------------------------------------------//
// Track chart visibility
// let isGeoglowsChartVisible = false;
let geoglowsChartInstance = null;
let forecastStatsChartInstance = null;
// Select DOM elements
const chartCloseBtn = document.getElementById('chart-close-btn');
const chartContainer = document.getElementById('chart-container-geoglows');
const loader = document.getElementById('chart-loader');
const forecastStatsBtn = document.getElementById('forecastStatsBtn');
const ctx = document.getElementById('chart-canvas-geoglows').getContext('2d');
let selectedLat = null;
let selectedLon = null;
let marker = null; // Global marker variable
let dayOffset = 1; // Number of days to offset from the current date
function toggleElementVisibility(element, isVisible) {
  element.style.display = isVisible ? 'block' : 'none';
};
// Get yesterday's date in YYYYMMDD format
function getYesterdayDate() {
  const today = new Date();
  today.setDate(today.getDate() - dayOffset);
  return today.toISOString().split('T')[0].replace(/-/g, '');
};
// Fetch JSON data from API
async function fetchData(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('Error fetching data:', error);
    alert('Failed to fetch data.');
    return null;
  }
};
// function to fill the empty values in the api result 
function fillEmptyValues(data) {
  for (let i = 0; i < data.length; i++) {
    if (data[i] === "") {
      // Find the next valid value
      let prev = i - 1;
      let next = i + 1;

      // Check if previous value is available and not empty
      while (prev >= 0 && data[prev] === "") {
        prev--;
      }
      // Check if next value is available and not empty
      while (next < data.length && data[next] === "") {
        next++;
      }

      // If the previous valid value exists and is closer to the current index
      if (prev >= 0 && (next >= data.length || Math.abs(i - prev) <= Math.abs(i - next))) {
        data[i] = data[prev];
      }
      // If the next valid value exists and is closer to the current index
      else if (next < data.length) {
        data[i] = data[next];
      }
    }
  }
  return data;
};
// Function to update chart
function updateChart(chartInstance, ctx, labels, datasets) {
  if (chartInstance) {
    chartInstance.destroy();
  }
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'white' },
          title: {
            display: true,
            text: 'Flow (m³/s)',
            color: 'white',
            font: { size: 16 }
          }
        },
        x: {
          ticks: {
            maxTicksLimit: 8,
            color: 'white',
            callback: (value, index, values) => {
              const date = new Date(labels[index]);
              return [`${date.getHours() % 12 || 12} ${date.getHours() < 12 ? 'am' : 'pm'}, ${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })}`];
            }
          },
          title: {
            display: true,
            text: 'Time',
            color: 'white',
            font: { size: 16 }
          }
        }
      },
      plugins: {
        legend: { labels: { color: 'white' } }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutBounce'
      }
    }
  });
};
// Function to add marker
function addMarker(lat, lon) {
  if (marker) {
    marker.remove(); // Remove previous marker if exists
  }
  marker = new mapboxgl.Marker({ color: "red" }) // Create a new marker
    .setLngLat([lon, lat])
    .addTo(map1);
};

// Function to remove marker
function removeMarker() {
  if (marker) {
    marker.remove();
    marker = null;
  }
};

// Function to fetch and display GEOGLOWS flood model chart
async function showGeoglowsChart(lat, lon) {
  if (!controlStates.geoglowsForecastControl) return;

  selectedLat = lat;
  selectedLon = lon;
  addMarker(lat, lon); // Add marker to clicked location
  console.log(lat, lon)

  const riverId = await fetchRiverIdWithRetry(lat, lon);
  if (!riverId) {
    console.error("Failed to fetch River ID.");
    alert("Failed to fetch River ID.");
    return;
  }
  console.log(riverId)

  toggleElementVisibility(loader, true);
  const data = await fetchData(`https://geoglows.ecmwf.int/api/v2/forecast/${riverId}?&format=json&date=${getYesterdayDate()}`);
  toggleElementVisibility(loader, false);

  if (!data || !data.datetime || !data.flow_median.length) {
    alert("No forecast data available. Trying an earlier date, please click on map again");
    dayOffset++; // Try an earlier date
    return;
  }

  if (forecastStatsChartInstance) {
    forecastStatsChartInstance.destroy();
  }

  geoglowsChartInstance = updateChart(
    geoglowsChartInstance,
    ctx,
    data.datetime,
    [
      { label: 'Median Flow (m³/s)', data: data.flow_median, borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2, fill: false },
      { label: 'Flow Uncertainty Upper (m³/s)', data: data.flow_uncertainty_upper, borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1, borderDash: [5, 5], fill: false },
      { label: 'Flow Uncertainty Lower (m³/s)', data: data.flow_uncertainty_lower, borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1, borderDash: [5, 5], fill: false }
    ]
  );
};

// Function to retry fetching river ID
async function fetchRiverIdWithRetry(lat, lon, retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Fetching River ID...`);
      const response = await fetchData(`https://geoglows.ecmwf.int/api/v2/getriverid?lat=${lat}&lon=${lon}`);

      if (response?.river_id) {
        console.log("✅ River ID Retrieved:", response.river_id);
        return response.river_id; // Return valid river ID
      }

      console.warn(`⚠️ Attempt ${attempt}: Invalid response, retrying...`);
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:, error`);
    }

    await new Promise(res => setTimeout(res, delay)); // Wait before retrying
  }

  console.error(`❌ All retry attempts failed.`);
  alert("Failed to fetch river ID after multiple attempts.");
  return null; // Return null if all retries fail
};
// Fetch and display Forecast Statistics chart
// Fetch and display Forecast Statistics chart
async function showForecastStatsChart(lat, lon) {
  const riverId = await fetchRiverIdWithRetry(lat, lon);
  if (!riverId) {
    console.error("Failed to fetch River ID.");
    alert("Failed to fetch River ID.");
    return;
  }

  console.log("🌊 Using River ID:", riverId);

  toggleElementVisibility(loader, true);
  const data = await fetchData(`https://geoglows.ecmwf.int/api/v2/forecaststats/${riverId}?format=json&date=${getYesterdayDate()}`);
  toggleElementVisibility(loader, false);

  if (!data || !data.datetime) {
    console.error("Invalid forecast stats response:", data);
    alert('No forecast statistics available.');
    dayOffset++; // Try an earlier date
    return;
  }

  console.log("📊 Forecast Stats Data:", data);

  // Destroy the previous chart instance if it exists
  if (geoglowsChartInstance) {
    geoglowsChartInstance.destroy();  // Properly destroy the old chart before creating a new one
  }

  // Create a new chart
  forecastStatsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.datetime.map(dt => new Date(dt).toLocaleString()),
      datasets: [
        {
          label: '25th Percentile Flow',
          data: fillEmptyValues([...data.flow_25p]),
          borderColor: 'rgba(255, 206, 86, 1)',
          borderWidth: 2,
          fill: false
        },
        { label: 'Average Flow', data: fillEmptyValues([...data.flow_avg]), borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2, fill: false },
        { label: '75th Percentile Flow', data: fillEmptyValues([...data.flow_75p]), borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 2, fill: false },
        { label: 'Maximum Flow', data: fillEmptyValues([...data.flow_max]), borderColor: 'rgb(255, 0, 0)', borderWidth: 2, fill: false },
        { label: 'Minimum Flow', data: fillEmptyValues([...data.flow_min]), borderColor: 'rgba(0, 255, 34, 0.56)', borderWidth: 2, fill: false },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: 'white' } },
        x: { ticks: { maxTicksLimit: 8, color: 'white' } }
      },
      plugins: { legend: { labels: { color: 'white' } } },
      animation: { duration: 1000, easing: 'easeOutBounce' }
    }
  });
};
// Map click event listener
let isGeoglowsChartVisible = false;

function toggleGeoglowsModal() {
  const container = document.getElementById('chart-container-geoglows');
  isGeoglowsChartVisible = !isGeoglowsChartVisible;
  toggleElementVisibility(container, isGeoglowsChartVisible);
}

map1.on('click', e => {
  if (controlStates.geoglowsForecastControl) {
    selectedLat = e.lngLat.lat;
    selectedLon = e.lngLat.lng;
    showGeoglowsChart(selectedLat, selectedLon);
    // Show modal/chart
    toggleElementVisibility(chartContainer, true);
    map1.getCanvas().classList.remove("geoglows-pointer-mode");
    controlStates.geoglowsForecastControl = false;
  }
});

// Close button event
chartCloseBtn.addEventListener('click', () => {
  toggleElementVisibility(chartContainer, false);
  removeMarker();
  // Optionally, you can re-enable selection mode if you want repeat
  // controlStates.geoglowsForecastControl = false;
});

// Forecast Statistics button event
document.getElementById("geoglowsForecastBtn").addEventListener("click", () => {
  if (selectedLat !== null && selectedLon !== null) {
    showGeoglowsChart(selectedLat, selectedLon);
  } else {
    alert("Please click on the map to select a location first.");
  }
});
document.getElementById("forecastStatsBtn").addEventListener("click", () => {
  if (selectedLat !== null && selectedLon !== null) {
    showForecastStatsChart(selectedLat, selectedLon);
  } else {
    alert("Please click on the map to select a location first.");
  }
});


//Geoglows control
class GeoglowsChartControl {
  onAdd(map) {
    this._map = map;
    this._btn = document.createElement('button');
    this._btn.className = 'mapboxgl-ctrl-icon geoglows-toggle-btn';
    this._btn.innerHTML = '<img src="media/UI/controlicons/geoglows.webp" alt="GEOGLOWS" />';
    this._btn.title = 'Enable GEOGLOWS Chart Selection';
    this._btn.onclick = () => {
      controlStates.geoglowsForecastControl = true;
      map1.getCanvas().classList.add("geoglows-pointer-mode");
      alert("Click the map to select a location for a GEOGLOWS chart");
      addMarker();
      // Hide modal/chart if open
      toggleElementVisibility(chartContainer, false);
      removeMarker();
    };
    const container = document.createElement('div');
    container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    container.appendChild(this._btn);
    return container;
  }

  onRemove() {
    this._btn.parentNode.removeChild(this._btn);
    this._map = undefined;
  }
}
// Add to map1
map1.addControl(new GeoglowsChartControl(), 'top-right');
//-----------------------------------------------------GEOGLOWS CHART MODEL END-----------------------------------------------------------------------------------------------//
// Utility function to show/hide elements
// Add the control to the map1
map1.addControl(new RainToggleControl(), "top-right");


// Show fullscreen image
function showFullscreen(imageSrc) {
  const overlay = document.getElementById('fullscreen-overlay');
  const img = document.getElementById('fullscreen-image');

  img.src = imageSrc;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

///3d control
function add3DControl(map) {
  class ThreeDControl {
    constructor() {
      this._button = null;
      this._is3DActive = false;
      this._defaultPitch = 0;
      this._defaultBearing = 0;
    }

    onAdd(map) {
      const tooltipText = "For 3D visualization click here";

      const div = document.createElement("div");
      div.className = "mapboxgl-ctrl mapboxgl-ctrl-group";

      // Create button with tooltip and icon
      this._button = document.createElement("button");
      this._button.className = 'mapboxgl-ctrl-icon threed-toggle-btn';
      this._button.innerHTML = '<img src="media/UI/controlicons/3d.webp" alt="3D" />';
      this._button.title = tooltipText;

      // Add event listener to toggle 3D terrain and adjust pitch and bearing
      this._button.addEventListener("click", () => {
        this._is3DActive = !this._is3DActive;
        if (this._is3DActive) {
          map.addSource('mapbox-dem', {
            'type': 'raster-dem',
            'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
            'tileSize': 512,
            'maxzoom': 14
          });
          map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 3.5 });
          map.easeTo({
            pitch: 80,
            bearing: 41,
            duration: 1000 // Adjust duration as needed
          });
          this._button.classList.add("active");
          this._button.style.backgroundColor = "#007bff"; // Highlight the icon in blue
        } else {
          map.removeSource('mapbox-dem');
          map.setTerrain(null);
          map.easeTo({
            pitch: this._defaultPitch,
            bearing: this._defaultBearing,
            duration: 1000 // Adjust duration as needed
          });
          this._button.classList.remove("active");
          this._button.style.backgroundColor = "#ffffff"; // Un-highlight the icon
        }
      });
      div.appendChild(this._button);
      return div;
    }
  }
  const threeDControl = new ThreeDControl();
  map1.addControl(threeDControl, "top-right");
  // Store default pitch and bearing values
  map1.once('load', () => {
    threeDControl._defaultPitch = map.getPitch();
    threeDControl._defaultBearing = map.getBearing();
  });
}
add3DControl(map1);



//FFD legends code  
// FFD Legend Implementation
function createFfdLegend() {
  // Check if legend already exists
  if (document.getElementById('ffdLegend')) {
    return;
  }

  // Create legend container
  const legendDiv = document.createElement('div');
  legendDiv.id = 'ffdLegend';
  legendDiv.style.cssText = `
    position: fixed;
    bottom: 191px;
    right: 22px;
    z-index: 1000;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 184px;
    display: none;
    font-family: Arial, sans-serif;
  `;

  // Create legend title
  const titleDiv = document.createElement('div');
  titleDiv.textContent = 'Flow Levels';
  titleDiv.style.cssText = `
    font-size: 14px;
    font-weight: bold;
    color: #2c3e50;
    margin-bottom: 8px;
    text-align: center;
    border-bottom: 1px solid #ddd;
    padding-bottom: 6px;
  `;

  // Legend items data
  const legendItems = [
    { color: 'green', label: 'Normal' },
    { color: '#00FFFF', label: 'Low' },
    { color: '#0000FF', label: 'Medium' },
    { color: '#FFA500', label: 'High' },
    { color: '#A52A2A', label: 'Very High' },
    { color: '#FF0000', label: 'Exceptionally High' }
  ];

  // Add title to legend
  legendDiv.appendChild(titleDiv);

  // Create legend items
  legendItems.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: ${index === legendItems.length - 1 ? '0' : '6px'};
      font-size: 12px;
    `;

    const colorDiv = document.createElement('div');
    colorDiv.style.cssText = `
      width: 14px;
      height: 14px;
      border-radius: 50%;
      margin-right: 8px;
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
      background-color: ${item.color};
    `;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    labelSpan.style.cssText = `
      color: #333;
      font-weight: 500;
    `;

    itemDiv.appendChild(colorDiv);
    itemDiv.appendChild(labelSpan);
    legendDiv.appendChild(itemDiv);
  });

  // Add legend to body
  document.body.appendChild(legendDiv);
}

// Function to toggle FFD legend visibility
function ffdLegend() {
  const legend = document.getElementById('ffdLegend');
  const checkbox = document.getElementById('ffd');

  if (legend && checkbox) {
    if (checkbox.checked) {
      legend.style.display = 'block';
    } else {
      legend.style.display = 'none';
    }
  }
}

// function addJhelumFloodLayers(map) {
//   while (true) {
//       for (let i = 1; i <= 19; i++) {
//           const layerName = `Jhelum_${i}_${Math.random()}`;
//           const sourceId = `jhelum-${i}-${Math.random()}`;
//           map.addSource(sourceId, {
//               type: "vector",
//               scheme: "tms",
//               tiles: [
//                   `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/Flood_simu:Jhelum_${i}@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
//               ]
//           });
//           map.addLayer({
//               id: layerName,
//               type: "fill",
//               source: sourceId,
//               "source-layer": `Jhelum_${i}`,
//               layout: {
//                   visibility: "none"
//               },
//               paint: {
//                   "fill-outline-color": "red",
//                   "fill-opacity": 0.45,
//                   "fill-color": "blue"
//               }
//           }, 'water');
//       }
//   }
// }

// Helper to get current layer visibility state from checkboxes (copied from script.js)
function getMap1VisibilityStates() {
  // List of checkbox IDs and their corresponding map1 layer IDs
  const boundaryToggles = [
    { checkboxId: 'natBoundary', layers: ['nationalBoundary'] },
    { checkboxId: 'prvBoundary', layers: ['provincialBoundary'] },
    { checkboxId: 'dstBoundary', layers: ['districtBoundary', 'districtBoundary_label', 'DistrictBoundary'] },
    { checkboxId: 'tslBoundary', layers: ['TehsilBoundary', 'TehsilBoundaryLine', 'tehsilBoundary_label'] },
    { checkboxId: 'uncBoundary', layers: ['Union_Council', 'unionBoundary_label'] },
    { checkboxId: 'PakRivers', layers: ['Pakistan_Rivers'] },
    { checkboxId: 'kp_Rivers', layers: ['KP_RIVERS'] },
    { checkboxId: 'Reservoirs', layers: ['Dams_Water_Bodies'] },
    { checkboxId: 'india', layers: ['indian'] },
    { checkboxId: 'Glofas', layers: ['glofas'] },
    { checkboxId: 'gmrcWapda', layers: ['gmrc_wapda_stations'] },
    { checkboxId: 'pmdStations', layers: ['pmd_stations'] },
    { checkboxId: 'damagedPmdStations', layers: ['damaged_pmd_stations'] },
    { checkboxId: 'Barrages', layers: ['Barrages'] },
    { checkboxId: 'watershed', layers: ['Combined', 'Combined_label'] },
    { checkboxId: 'minorRivers', layers: ['minor_rivers_outline', 'minor_rivers_label'] },
    // Canal network Punjab
    { checkboxId: 'mainCanal', layers: ['main_canals_line'] },
    { checkboxId: 'branchCanal', layers: ['branch_canals_line'] },
    { checkboxId: 'linkCanals', layers: ['link_canals_line'] },
    { checkboxId: 'distributaries', layers: ['distributories_line'] },
    // Canal labels
    { checkboxId: 'mainCanal', layers: ['main_canals_label'] },
    { checkboxId: 'branchCanal', layers: ['branch_canals_label'] },
    { checkboxId: 'linkCanals', layers: ['link_canals_label'] },
    { checkboxId: 'distributaries', layers: ['distributories_label'] },
    // { checkboxId: 'stream1', layers: ['STREAM_412_5_9'] },
    // { checkboxId: 'stream2', layers: ['STREAM_218_5_9_Pk'] },
    { checkboxId: 'slider', layers: [] }, // slider handled separately

  ];
  const state = {};
  boundaryToggles.forEach(toggle => {
    const checkbox = document.getElementById(toggle.checkboxId);
    if (checkbox) {
      toggle.layers.forEach(layerId => {
        state[layerId] = checkbox.checked ? 'visible' : 'none';
      });
    }
  });
  return state;
}

function applyMap1VisibilityStates(map, visibilityState) {
  for (const [layerId, visibility] of Object.entries(visibilityState)) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  }
}


// Utility: Move all symbol (label) layers above all other layers
function moveAllLabelsToTop(map) {
  if (!map || !map.getStyle) return;
  const style = map.getStyle();
  if (!style || !style.layers) return;
  // Find all symbol layers (labels)
  const labelLayers = style.layers.filter(l => l.type === 'symbol');
  // Move each label layer to the top in order
  labelLayers.forEach(layer => {
    if (map.getLayer(layer.id)) {
      map.moveLayer(layer.id);
    }
  });
}

// Restore layer visibility after style switch and move labels to top

// Also move labels to top after adding hydromet layers (for initial load and after style switch)
const _origAddHydrometLayersToMap = addHydrometLayersToMap;
addHydrometLayersToMap = function (map) {
  _origAddHydrometLayersToMap(map);
  setTimeout(() => moveAllLabelsToTop(map), 1000);
};


////Fluid Gauge Animation Logic
// Enhanced Fluid Gauge Animation Logic with Draggable Functionality
let currentFluidMeter = null;
let isDragging = false;
let currentX = 0;
let currentY = 0;
let initialX = 0;
let initialY = 0;
let xOffset = 0;
let yOffset = 0;
let isDraggableSetup = false;
let isFluidMeterDockObserverSetup = false;
let isFluidMeterFeatureCloseBound = false;

const FLUID_METER_SUPPORTED_DAM_NAMES = new Set([
  'mangla',
  'mangla dam',
  'tarbela',
  'tarbella',
  'tarbela dam',
  'tarbella dam',
  'chashma',
  'chashma barrage',
  'bhakra dam',
  'pong dam',
  'thein dam'
]);

function normalizeDamFeatureName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getFeatureNameForFluidMeter(feature) {
  const properties = feature?.properties || {};
  return properties.name || properties.Name || properties.NAME || properties.damName || properties.DamName || '';
}

function isFluidMeterSupportedDamFeature(feature) {
  return FLUID_METER_SUPPORTED_DAM_NAMES.has(normalizeDamFeatureName(getFeatureNameForFluidMeter(feature)));
}

function bindFluidMeterFeatureCloseHandler() {
  if (isFluidMeterFeatureCloseBound || typeof map1 === 'undefined' || !map1) return;

  map1.on('click', (event) => {
    const container = document.getElementById('fluidMeterContainer');
    if (!container || container.style.display !== 'block') return;

    const features = map1.queryRenderedFeatures(event.point);
    if (!features.length) return;
    if (features.some(isFluidMeterSupportedDamFeature)) return;

    closeFluidMeter();
  });

  isFluidMeterFeatureCloseBound = true;
}

bindFluidMeterFeatureCloseHandler();

function getMapDockContainer() {
  return document.getElementById('map1');
}

function getDockPanelWidth() {
  const mapContainer = getMapDockContainer();
  const mapWidth = mapContainer ? mapContainer.clientWidth : window.innerWidth;
  const maxAllowed = Math.max(180, mapWidth - 8);

  if (window.innerWidth <= 768) {
    return Math.min(Math.max(180, mapWidth - 16), Math.min(330, maxAllowed));
  }
  if (window.innerWidth <= 1100) {
    return Math.min(Math.max(200, mapWidth - 24), Math.min(360, maxAllowed));
  }
  return Math.min(Math.max(220, mapWidth - 20), Math.min(400, maxAllowed));
}

function getFFDHistoryDockWidth() {
  const mapContainer = getMapDockContainer();
  const mapWidth = mapContainer ? mapContainer.clientWidth : window.innerWidth;
  const maxAllowed = Math.max(300, mapWidth - 20);

  if (window.innerWidth <= 768) {
    return Math.min(Math.max(300, mapWidth - 16), maxAllowed);
  }
  if (window.innerWidth <= 1100) {
    return Math.min(Math.max(560, mapWidth - 24), Math.min(720, maxAllowed));
  }
  return Math.min(Math.max(680, mapWidth - 24), Math.min(820, maxAllowed));
}

function getFluidMeterDockMetrics() {
  const compactView = window.innerWidth <= 1100;
  const baseTop = compactView ? 12 : 14;
  const mapContainer = getMapDockContainer();
  const mapRect = mapContainer ? mapContainer.getBoundingClientRect() : null;
  const mapHeight = mapContainer ? mapContainer.clientHeight : window.innerHeight;
  const dockWidth = getDockPanelWidth();
  const metrics = {
    top: `${baseTop}px`,
    right: '16px',
    width: `${dockWidth}px`,
    maxHeight: `${Math.max(220, Math.floor(mapHeight - baseTop - 16))}px`
  };

  const historyPanel = document.getElementById('ffd-history-panel');
  if (!historyPanel || !historyPanel.classList.contains('open') || compactView) {
    return metrics;
  }

  const panelRect = historyPanel.getBoundingClientRect();
  if (!Number.isFinite(panelRect.top) || !mapRect || !Number.isFinite(mapRect.top)) {
    return metrics;
  }

  const gap = 10;
  const availableHeight = Math.floor(panelRect.top - mapRect.top - baseTop - gap);

  if (availableHeight > 180) {
    metrics.maxHeight = `${availableHeight}px`;
  }

  return metrics;
}

function alignFFDHistoryPanelToFluidMeter() {
  const historyPanel = document.getElementById('ffd-history-panel');
  const fluidContainer = document.getElementById('fluidMeterContainer');

  if (!historyPanel || !historyPanel.classList.contains('open')) return;
  if (historyPanel.classList.contains('dragging') || historyPanel.dataset.dragged === 'true') return;

  const sharedWidth = `${Math.round(getFFDHistoryDockWidth())}px`;

  if (!fluidContainer || fluidContainer.style.display !== 'block') {
    historyPanel.style.width = sharedWidth;
    historyPanel.style.right = '16px';
    historyPanel.style.left = 'auto';
    historyPanel.style.top = 'auto';
    historyPanel.style.bottom = '16px';
    return;
  }

  const fluidRect = fluidContainer.getBoundingClientRect();
  const mapContainer = getMapDockContainer();
  const mapRect = mapContainer ? mapContainer.getBoundingClientRect() : null;
  const measuredRight = mapRect && Number.isFinite(fluidRect.right)
    ? Math.max(16, Math.round(mapRect.right - fluidRect.right))
    : 16;
  const rightOffset = fluidContainer.style.right && fluidContainer.style.right !== 'auto' ? fluidContainer.style.right : `${measuredRight}px`;

  historyPanel.style.width = sharedWidth;
  historyPanel.style.right = rightOffset;
  historyPanel.style.left = 'auto';
  historyPanel.style.top = 'auto';
  historyPanel.style.bottom = '16px';
}

function dockFluidMeter(container) {
  if (!container) return;

  const metrics = getFluidMeterDockMetrics();

  container.style.position = 'absolute';
  container.style.left = 'auto';
  container.style.top = metrics.top;
  container.style.right = metrics.right;
  container.style.width = metrics.width;
  container.style.maxHeight = metrics.maxHeight;
  container.style.transform = 'none';

  container.setAttribute('data-original-top', container.style.top);
  container.setAttribute('data-original-right', container.style.right);
  container.setAttribute('data-original-transform', 'none');

  alignFFDHistoryPanelToFluidMeter();
}

function setupFluidMeterDockObserver() {
  if (isFluidMeterDockObserverSetup) return;

  const updateDock = () => {
    alignFFDHistoryPanelToFluidMeter();
    const container = document.getElementById('fluidMeterContainer');
    if (!container || container.style.display !== 'block' || isDragging) return;
    dockFluidMeter(container);
  };

  const historyPanel = document.getElementById('ffd-history-panel');
  if (historyPanel) {
    const observer = new MutationObserver(updateDock);
    observer.observe(historyPanel, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('resize', updateDock);
  document.addEventListener('fullscreenchange', updateDock);
  isFluidMeterDockObserverSetup = true;
}

// Make the fluid meter container draggable
function makeDraggable() {
  const container = document.getElementById('fluidMeterContainer');
  if (!container || isDraggableSetup) return;

  // Add draggable cursor style
  container.style.cursor = 'move';

  // Store original CSS values for reset
  const computedStyle = window.getComputedStyle(container);
  const originalTop = container.style.top || computedStyle.top || '86px';
  const originalRight = container.style.right || computedStyle.right || '86px';
  const originalTransform = container.style.transform || computedStyle.transform || 'none';

  // Store these as data attributes for later restoration
  container.setAttribute('data-original-top', originalTop);
  container.setAttribute('data-original-right', originalRight);
  container.setAttribute('data-original-transform', originalTransform === 'none' ? 'none' : originalTransform);

  // Mouse events
  container.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Touch events for mobile support
  container.addEventListener('touchstart', dragStart, { passive: false });
  document.addEventListener('touchmove', drag, { passive: false });
  document.addEventListener('touchend', dragEnd);

  isDraggableSetup = true;
}

function dragStart(e) {
  const container = document.getElementById('fluidMeterContainer');
  if (!container) return;

  // Prevent dragging if clicking on the close button or fluid meter canvas
  if (e.target.classList.contains('close-btn') ||
    e.target.tagName === 'CANVAS' ||
    e.target.closest('#fluid-meter')) {
    return;
  }

  // Get current position when drag starts
  const rect = container.getBoundingClientRect();

  if (e.type === "touchstart") {
    initialX = e.touches[0].clientX - rect.left;
    initialY = e.touches[0].clientY - rect.top;
  } else {
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
  }

  if (e.target === container || container.contains(e.target)) {
    isDragging = true;
    container.style.cursor = 'grabbing';

    // Switch to absolute positioning for dragging
    container.style.top = rect.top + 'px';
    container.style.left = rect.left + 'px';
    container.style.right = 'auto';
    container.style.transform = 'none';
  }
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();

    const container = document.getElementById('fluidMeterContainer');
    if (!container) return;

    let clientX, clientY;

    if (e.type === "touchmove") {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Calculate new position
    currentX = clientX - initialX;
    currentY = clientY - initialY;

    // Keep the container within viewport bounds
    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;

    // Calculate boundaries
    const minX = 0;
    const minY = 0;
    const maxX = window.innerWidth - containerWidth;
    const maxY = window.innerHeight - containerHeight;

    // Constrain position within bounds
    currentX = Math.max(minX, Math.min(currentX, maxX));
    currentY = Math.max(minY, Math.min(currentY, maxY));

    // Apply new position
    container.style.left = currentX + 'px';
    container.style.top = currentY + 'px';
  }
}

function dragEnd(e) {
  initialX = currentX;
  initialY = currentY;
  isDragging = false;

  const container = document.getElementById('fluidMeterContainer');
  if (container) {
    container.style.cursor = 'move';
  }
}

// Helper functions with error checking and draggable functionality
function toNumericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value, decimals = 2, suffix = '') {
  const num = toNumericOrNull(value);
  if (num === null) return 'N/A';
  return `${num.toFixed(decimals)}${suffix}`;
}

function formatDeltaValue(value, decimals = 2, suffix = '') {
  const num = toNumericOrNull(value);
  if (num === null) return 'N/A';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}${suffix}`;
}

function formatSignedPercent(value, decimals = 1) {
  return formatDeltaValue(value, decimals, '%');
}

function formatSignedPointDelta(value, decimals = 1) {
  const num = toNumericOrNull(value);
  if (num === null) return 'N/A';
  return `${Math.abs(num).toFixed(decimals)}%`;
}

function formatSignedFeet(value, decimals = 0) {
  const num = toNumericOrNull(value);
  if (num === null) return 'N/A';
  return `${Math.abs(num).toFixed(decimals)} ft`;
}

function formatSignedIntValue(value) {
  const num = toNumericOrNull(value);
  if (num === null) return 'N/A';
  const sign = num > 0 ? '+' : '';
  return `${sign}${Math.round(num)}`;
}

function escapeHtmlValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getToneByValue(value) {
  const num = toNumericOrNull(value);
  if (num === null || num === 0) return 'neutral';
  return num > 0 ? 'up' : 'down';
}

function getArrowByValue(value) {
  const num = toNumericOrNull(value);
  if (num === null || num === 0) return '▶';
  return num > 0 ? '▲' : '▼';
}

function getPercentOfCapacity(level, fullCapacity) {
  const lvl = toNumericOrNull(level);
  const cap = toNumericOrNull(fullCapacity);
  if (lvl === null || cap === null || cap <= 0) return null;
  return (lvl / cap) * 100;
}

function getRelativeDeltaPercent(currentValue, baselineValue) {
  const current = toNumericOrNull(currentValue);
  const baseline = toNumericOrNull(baselineValue);
  if (current === null || baseline === null || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function getPanelTimestamp() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = now.getFullYear();
  const time = now.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${month} ${year} · ${time}`;
}

function renderDamInsights(damName, percentage, details = {}) {
  const insightsRoot = document.getElementById('damInsights');
  const insightsStrip = document.getElementById('damInsightsStrip');
  const insightsChart = document.getElementById('damInsightsChart');
  const barsTitle = document.getElementById('damBarsTitle');

  if (!insightsRoot || !insightsStrip || !insightsChart || !barsTitle) {
    return;
  }

  insightsRoot.style.display = 'block';

  // Legacy strip/title are hidden; metric cards are rendered in damInsightsChart.
  insightsStrip.style.display = 'none';
  insightsStrip.innerHTML = '';
  barsTitle.style.display = 'none';
  barsTitle.textContent = '';

  const country = details.country === 'India' ? 'India' : (details.country === 'Pakistan' ? 'Pakistan' : 'Live');
  const cards = [];

  const currentFill = toNumericOrNull(percentage);
  const fullCapacity = toNumericOrNull(details.fullCapacity);

  const getChangeLabel = (deltaValue) => {
    const delta = toNumericOrNull(deltaValue);
    if (delta === null) {
      return { arrow: '', value: 'N/A', tone: 'neutral' };
    }
    const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '▶');
    return {
      arrow,
      value: `${Math.abs(delta).toFixed(1)}%`,
      tone: delta > 0 ? 'up' : (delta < 0 ? 'down' : 'neutral')
    };
  };

  const addMetricCard = (title, filledValue, deltaValue) => {
    const change = getChangeLabel(deltaValue);
    cards.push({
      title,
      filled: formatValue(filledValue, 2, '%'),
      changeArrow: change.arrow,
      changeValue: change.value,
      changeTone: change.tone
    });
  };

  if (country === 'India') {
    const lastYearFill = toNumericOrNull(details.fillLastYear);
    const normalFill = toNumericOrNull(details.fillNormal);
    const deltaLastYear = currentFill !== null && lastYearFill !== null ? currentFill - lastYearFill : null;
    const deltaNormal = currentFill !== null && normalFill !== null ? currentFill - normalFill : null;

    addMetricCard('Last Year', lastYearFill, deltaLastYear);
    addMetricCard('5-Year Avg', normalFill, deltaNormal);
  } else if (country === 'Pakistan') {
    const lastYearFill = toNumericOrNull(details.lastYearLevel);
    const avg5YearFill = toNumericOrNull(details.avg5YearLevel);
    const deltaLastYearFill = currentFill !== null && lastYearFill !== null ? currentFill - lastYearFill : null;
    const deltaAvg5Fill = currentFill !== null && avg5YearFill !== null ? currentFill - avg5YearFill : null;

    addMetricCard('Last Year', lastYearFill, deltaLastYearFill);
    addMetricCard('5-Year Avg', avg5YearFill, deltaAvg5Fill);
  } else {
    addMetricCard('Current Fill', currentFill, 0);
    addMetricCard('Capacity', fullCapacity, null);
  }

  insightsChart.innerHTML = `
    <div class="dam-metric-cards">
      ${cards.map((card) => `
        <div class="dam-metric-card">
          <div class="dam-metric-title">${escapeHtmlValue(card.title)}</div>
          <div class="dam-metric-row">
            <span class="dam-metric-label">% Filled</span>
            <span class="dam-metric-value dam-metric-value-filled">${escapeHtmlValue(card.filled)}</span>
          </div>
          <div class="dam-metric-row">
            <span class="dam-metric-label">% Change</span>
            <span class="dam-metric-value dam-metric-value-change ${escapeHtmlValue(card.changeTone)}">
              <span class="dam-change-arrow">${escapeHtmlValue(card.changeArrow)}</span>
              <span class="dam-change-text">${escapeHtmlValue(card.changeValue)}</span>
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function showDamFluidMeter(damName, percentage, reservoirLevel, details = {}) {
  const container = document.getElementById('fluidMeterContainer');
  const title = document.getElementById('meterTitle');
  const meta = document.getElementById('meterMeta');
  const liveBadge = document.getElementById('meterLive');
  const meterDiv = document.getElementById('fluid-meter');
  const reservoirValue = document.getElementById('reservoirValue');

  // Check if elements exist before setting properties
  if (!container || !title || !meta || !liveBadge || !meterDiv || !reservoirValue) {
    console.error('Fluid meter HTML elements not found. Make sure you added the HTML container.');
    return;
  }

  // Set dam name and reservoir level
  title.textContent = damName;
  const country = details.country ? String(details.country).toUpperCase() : 'LIVE';
  const region = details.region ? String(details.region).toUpperCase() : '';
  meta.textContent = region ? `${country} · ${region}` : country;
  liveBadge.textContent = 'LIVE';

  const numericLevel = toNumericOrNull(reservoirLevel);
  const capacity = toNumericOrNull(details.fullCapacity);

  const currentText = numericLevel === null ? 'N/A' : numericLevel.toFixed(0);
  const totalText = capacity === null ? 'N/A' : capacity.toFixed(0);
  reservoirValue.innerHTML = `
    <div class="reservoir-level-grid">
      <div class="reservoir-level-row reservoir-level-row-current">
        <span class="reservoir-level-number reservoir-level-number-current">${escapeHtmlValue(currentText)}</span>
        <span class="reservoir-level-pill reservoir-level-pill-current">Current</span>
      </div>
      <span class="reservoir-level-divider" aria-hidden="true"></span>
      <div class="reservoir-level-row reservoir-level-row-total">
        <span class="reservoir-level-number reservoir-level-number-total">${escapeHtmlValue(totalText)}</span>
        <span class="reservoir-level-pill reservoir-level-pill-total">Total</span>
      </div>
    </div>
  `;

  // Clear previous meter
  meterDiv.innerHTML = '';

  // Show container and dock it before enabling drag behavior
  container.style.display = 'block';
  setupFluidMeterDockObserver();
  dockFluidMeter(container);

  renderDamInsights(damName, percentage, {
    ...details,
    level: reservoirLevel
  });

  // Create new fluid meter
  try {
    currentFluidMeter = new FluidMeter();
    currentFluidMeter.init({
      targetContainer: meterDiv,
      fillPercentage: percentage,
      options: {
        fontFamily: "Oxygen",
        fontSize: "22px",
        drawPercentageSign: true,
        drawBubbles: true,
        size: 150,
        borderWidth: 3,
        backgroundColor: "#262626",
        foregroundColor: "white",
        foregroundFluidLayer: {
          fillStyle: "#0096FF",
          angularSpeed: 90,
          maxAmplitude: 11,
          frequency: 25,
          horizontalSpeed: -200
        },
        backgroundFluidLayer: {
          fillStyle: "#89CFF0",
          angularSpeed: 100,
          maxAmplitude: 13,
          frequency: 23,
          horizontalSpeed: 230
        }
      }
    });
  } catch (error) {
    console.error('Error creating fluid meter:', error);
  }
}

function closeFluidMeter() {
  const container = document.getElementById('fluidMeterContainer');
  if (container) {
    container.style.display = 'none';

    // Restore original CSS positioning using stored data attributes
    const originalTop = container.getAttribute('data-original-top') || '14px';
    const originalRight = container.getAttribute('data-original-right') || '16px';
    const originalTransform = container.getAttribute('data-original-transform') || 'none';

    container.style.top = originalTop;
    container.style.right = originalRight;
    container.style.left = 'auto';
    container.style.transform = originalTransform;

    // Reset drag variables
    xOffset = 0;
    yOffset = 0;
    currentX = 0;
    currentY = 0;
    isDragging = false;

    // Clear the meter
    const meterDiv = document.getElementById('fluid-meter');
    if (meterDiv) {
      meterDiv.innerHTML = '';
    }
    currentFluidMeter = null;

    // Remove event listeners to prevent memory leaks
    if (isDraggableSetup) {
      container.removeEventListener('mousedown', dragStart);
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', dragEnd);
      container.removeEventListener('touchstart', dragStart);
      document.removeEventListener('touchmove', drag);
      document.removeEventListener('touchend', dragEnd);
      isDraggableSetup = false;
    }
  }
}

// FluidMeter Library (Complete Implementation)
function FluidMeter() {
  var context;
  var targetContainer;
  var time = null;
  var dt = null;

  var options = {
    drawShadow: true,
    drawText: true,
    drawPercentageSign: true,
    drawBubbles: true,
    fontSize: "70px",
    fontFamily: "Arial",
    fontFillStyle: "white",
    size: 300,
    borderWidth: 25,
    backgroundColor: "#e2e2e2",
    foregroundColor: "#fafafa"
  };

  var currentFillPercentage = 0;
  var fillPercentage = 0;

  var foregroundFluidLayer = {
    fillStyle: "purple",
    angle: 0,
    horizontalPosition: 0,
    angularSpeed: 0,
    maxAmplitude: 9,
    frequency: 30,
    horizontalSpeed: -150,
    initialHeight: 0
  };

  var backgroundFluidLayer = {
    fillStyle: "pink",
    angle: 0,
    horizontalPosition: 0,
    angularSpeed: 140,
    maxAmplitude: 12,
    frequency: 40,
    horizontalSpeed: 150,
    initialHeight: 0
  };

  var bubblesLayer = {
    bubbles: [],
    amount: 12,
    speed: 20,
    current: 0,
    swing: 0,
    size: 2,
    reset: function (bubble) {
      var meterBottom = (options.size - (options.size - getMeterRadius()) / 2) - options.borderWidth;
      var fluidAmount = currentFillPercentage * (getMeterRadius() - options.borderWidth * 2) / 100;
      bubble.r = random(this.size, this.size * 2) / 2;
      bubble.x = random(0, options.size);
      bubble.y = random(meterBottom, meterBottom - fluidAmount);
      bubble.velX = 0;
      bubble.velY = random(this.speed, this.speed * 2);
      bubble.swing = random(0, 2 * Math.PI);
    },
    init() {
      for (var i = 0; i < this.amount; i++) {
        var meterBottom = (options.size - (options.size - getMeterRadius()) / 2) - options.borderWidth;
        var fluidAmount = currentFillPercentage * (getMeterRadius() - options.borderWidth * 2) / 100;
        this.bubbles.push({
          x: random(0, options.size),
          y: random(meterBottom, meterBottom - fluidAmount),
          r: random(this.size, this.size * 2) / 2,
          velX: 0,
          velY: random(this.speed, this.speed * 2)
        });
      }
    }
  }

  function setupCanvas() {
    var canvas = document.createElement('canvas');
    canvas.width = options.size;
    canvas.height = options.size;
    canvas.imageSmoothingEnabled = true;
    context = canvas.getContext("2d");
    targetContainer.appendChild(canvas);

    if (options.drawShadow) {
      context.save();
      context.beginPath();
      context.filter = "drop-shadow(0px 4px 6px rgba(0,0,0,0.1))";
      context.arc(options.size / 2, options.size / 2, getMeterRadius() / 2, 0, 2 * Math.PI);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function draw() {
    var now = new Date().getTime();
    dt = (now - (time || now)) / 1000;
    time = now;

    requestAnimationFrame(draw);
    context.clearRect(0, 0, options.size, options.size);
    drawMeterBackground();
    drawFluid(dt);
    if (options.drawText) {
      drawText();
    }
    drawMeterForeground();
  }

  function drawMeterBackground() {
    context.save();
    context.fillStyle = options.backgroundColor;
    context.beginPath();
    context.arc(options.size / 2, options.size / 2, getMeterRadius() / 2 - options.borderWidth, 0, 2 * Math.PI);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawMeterForeground() {
    context.save();
    context.lineWidth = options.borderWidth;
    context.strokeStyle = options.foregroundColor;
    context.beginPath();
    context.arc(options.size / 2, options.size / 2, getMeterRadius() / 2 - options.borderWidth / 2, 0, 2 * Math.PI);
    context.closePath();
    context.stroke();
    context.restore();
  }

  function drawFluid(dt) {
    context.save();
    context.arc(options.size / 2, options.size / 2, getMeterRadius() / 2 - options.borderWidth, 0, Math.PI * 2);
    context.clip();
    drawFluidLayer(backgroundFluidLayer, dt);
    drawFluidLayer(foregroundFluidLayer, dt);
    if (options.drawBubbles) {
      drawFluidMask(foregroundFluidLayer, dt);
      drawBubblesLayer(dt);
    }
    context.restore();
  } 

  function drawFluidLayer(layer, dt) {
    if (layer.angularSpeed > 0) {
      layer.angle += layer.angularSpeed * dt;
      layer.angle = layer.angle < 0 ? layer.angle + 360 : layer.angle;
    }

    layer.horizontalPosition += layer.horizontalSpeed * dt;
    if (layer.horizontalSpeed > 0) {
      layer.horizontalPosition > Math.pow(2, 53) ? 0 : layer.horizontalPosition;
    }
    else if (layer.horizontalPosition < 0) {
      layer.horizontalPosition < -1 * Math.pow(2, 53) ? 0 : layer.horizontalPosition;
    }

    var x = 0;
    var y = 0;
    var amplitude = layer.maxAmplitude * Math.sin(layer.angle * Math.PI / 180);

    var meterBottom = (options.size - (options.size - getMeterRadius()) / 2) - options.borderWidth;
    var fluidAmount = currentFillPercentage * (getMeterRadius() - options.borderWidth * 2) / 100;

    if (currentFillPercentage < fillPercentage) {
      currentFillPercentage += 15 * dt;
    } else if (currentFillPercentage > fillPercentage) {
      currentFillPercentage -= 15 * dt;
    }

    layer.initialHeight = meterBottom - fluidAmount;

    context.save();
    context.beginPath();
    context.lineTo(0, layer.initialHeight);

    while (x < options.size) {
      y = layer.initialHeight + amplitude * Math.sin((x + layer.horizontalPosition) / layer.frequency);
      context.lineTo(x, y);
      x++;
    }

    context.lineTo(x, options.size);
    context.lineTo(0, options.size);
    context.closePath();
    context.fillStyle = layer.fillStyle;
    context.fill();
    context.restore();
  }

  function drawFluidMask(layer) {
    var x = 0;
    var y = 0;
    var amplitude = layer.maxAmplitude * Math.sin(layer.angle * Math.PI / 180);

    context.beginPath();
    context.lineTo(0, layer.initialHeight);

    while (x < options.size) {
      y = layer.initialHeight + amplitude * Math.sin((x + layer.horizontalPosition) / layer.frequency);
      context.lineTo(x, y);
      x++;
    }
    context.lineTo(x, options.size);
    context.lineTo(0, options.size);
    context.closePath();
    context.clip();
  }

  function drawBubblesLayer(dt) {
    context.save();
    for (var i = 0; i < bubblesLayer.bubbles.length; i++) {
      var bubble = bubblesLayer.bubbles[i];

      context.beginPath();
      context.strokeStyle = 'white';
      context.arc(bubble.x, bubble.y, bubble.r, 2 * Math.PI, false);
      context.stroke();
      context.closePath();

      var currentSpeed = bubblesLayer.current * dt;
      bubble.velX = Math.abs(bubble.velX) < Math.abs(bubblesLayer.current) ? bubble.velX + currentSpeed : bubblesLayer.current;
      bubble.y = bubble.y - bubble.velY * dt;
      bubble.x = bubble.x + (bubblesLayer.swing ? 0.4 * Math.cos(bubblesLayer.swing += 0.03) * bubblesLayer.swing : 0) + bubble.velX * 0.5;

      var meterBottom = (options.size - (options.size - getMeterRadius()) / 2) - options.borderWidth;
      var fluidAmount = currentFillPercentage * (getMeterRadius() - options.borderWidth * 2) / 100;

      if (bubble.y <= meterBottom - fluidAmount) {
        bubblesLayer.reset(bubble);
      }
    }
    context.restore();
  }

  function drawText() {
    var text = options.drawPercentageSign ?
      currentFillPercentage.toFixed(0) + "%" : currentFillPercentage.toFixed(0);

    context.save();
    context.font = getFontSize();
    context.fillStyle = options.fontFillStyle;
    context.textAlign = "center";
    context.textBaseline = 'middle';
    context.filter = "drop-shadow(0px 0px 5px rgba(0,0,0  ,0.4))"
    context.fillText(text, options.size / 2, options.size / 2);
    context.restore();
  }

  function clamp(number, min, max) {
    return Math.min(Math.max(number, min), max);
  };

  function getMeterRadius() {
    return options.size * 0.9;
  }

  function random(min, max) {
    var delta = max - min;
    return max === min ? min : Math.random() * delta + min;
  }

  function getFontSize() {
    return options.fontSize + " " + options.fontFamily;
  }

  return {
    init: function (env) {
      if (!env.targetContainer)
        throw "empty or invalid container";

      targetContainer = env.targetContainer;
      fillPercentage = clamp(env.fillPercentage, 0, 100);

      if (env.options) {
        options.drawShadow = env.options.drawShadow === false ? false : true;
        options.size = env.options.size || options.size;
        options.drawBubbles = env.options.drawBubbles === false ? false : true;
        options.borderWidth = env.options.borderWidth || options.borderWidth;
        options.backgroundColor = env.options.backgroundColor || options.backgroundColor;
        options.foregroundColor = env.options.foregroundColor || options.foregroundColor;
        options.drawText = env.options.drawText === false ? false : true;
        options.drawPercentageSign = env.options.drawPercentageSign === false ? false : true;
        options.fontSize = env.options.fontSize || options.fontSize;
        options.fontFamily = env.options.fontFamily || options.fontFamily;
        options.fontFillStyle = env.options.fontFillStyle || options.fontFillStyle;

        if (env.options.foregroundFluidLayer) {
          foregroundFluidLayer.fillStyle = env.options.foregroundFluidLayer.fillStyle || foregroundFluidLayer.fillStyle;
          foregroundFluidLayer.angularSpeed = env.options.foregroundFluidLayer.angularSpeed || foregroundFluidLayer.angularSpeed;
          foregroundFluidLayer.maxAmplitude = env.options.foregroundFluidLayer.maxAmplitude || foregroundFluidLayer.maxAmplitude;
          foregroundFluidLayer.frequency = env.options.foregroundFluidLayer.frequency || foregroundFluidLayer.frequency;
          foregroundFluidLayer.horizontalSpeed = env.options.foregroundFluidLayer.horizontalSpeed || foregroundFluidLayer.horizontalSpeed;
        }

        if (env.options.backgroundFluidLayer) {
          backgroundFluidLayer.fillStyle = env.options.backgroundFluidLayer.fillStyle || backgroundFluidLayer.fillStyle;
          backgroundFluidLayer.angularSpeed = env.options.backgroundFluidLayer.angularSpeed || backgroundFluidLayer.angularSpeed;
          backgroundFluidLayer.maxAmplitude = env.options.backgroundFluidLayer.maxAmplitude || backgroundFluidLayer.maxAmplitude;
          backgroundFluidLayer.frequency = env.options.backgroundFluidLayer.frequency || backgroundFluidLayer.frequency;
          backgroundFluidLayer.horizontalSpeed = env.options.backgroundFluidLayer.horizontalSpeed || backgroundFluidLayer.horizontalSpeed;
        }
      }

      bubblesLayer.init();
      setupCanvas();
      draw();
    },
    setPercentage(percentage) {
      fillPercentage = clamp(percentage, 0, 100);
    }
  }
}

// ─── DEW Exposure ─────────────────────────────────────────────────────────────
let exposuresLoadPromiseLegacy = null;
const exposureDistrictsLegacy = new Set();
const DEW_EXPOSURE_API_URL_LEGACY = "http://172.18.1.108:8000/get-exposures/";

function setExposureDropdownMessage(msg) {
  const el = document.getElementById('dew-exposure-status');
  if (el) el.textContent = msg;
}

function getDewMap() {
  return typeof map1 !== 'undefined' ? map1 : null;
}

function normalizeExposureList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.exposures)) return payload.exposures;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeExposureFeatureCollection(payload) {
  if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return payload;
  }
  if (payload?.data?.type === 'FeatureCollection' && Array.isArray(payload.data.features)) {
    return payload.data;
  }
  if (Array.isArray(payload?.features)) {
    return { type: 'FeatureCollection', features: payload.features };
  }
  return { type: 'FeatureCollection', features: [] };
}

function waitForDewMapStyle(map) {
  if (!map) return Promise.reject(new Error('Map is not available.'));
  return waitForHydroMapStyleReady(map, 45000).then(() => undefined);
}

function bindExposureControls() {
  const dropdown = document.getElementById('exposure-dropdown');
  if (!dropdown || dropdown._dewBound) return;
  dropdown._dewBound = true;
  dropdown.addEventListener('change', (e) => {
    if (e.target.value) fetchExposureDetails(e.target.value);
  });
}

function toggleDewExposurePanel() {
  const panel = document.getElementById('dew-exposure-panel');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) fetchExposuresLegacy();
}

function closeDewExposurePanel() {
  const panel = document.getElementById('dew-exposure-panel');
  if (panel) panel.style.display = 'none';
}

const fetchExposures = async () => {
  const exposureDropdown = document.getElementById("exposure-dropdown");
  if (!exposureDropdown) return;
  if (exposuresLoadPromise) return exposuresLoadPromise;

  setExposureDropdownMessage("Loading exposures...");
  bindExposureControls();

  exposuresLoadPromiseLegacy = (async () => {
    try {
      const response = await fetch(DEW_EXPOSURE_API_URL_LEGACY);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const exposures = normalizeExposureList(await response.json());
      const fragment = document.createDocumentFragment();
      fragment.appendChild(new Option("Select an exposure", ""));

      if (!exposures.length) {
        fragment.appendChild(new Option("No exposures available", ""));
        exposureDropdown.replaceChildren(fragment);
        setExposureDropdownMessage("No exposures available");
        return;
      }

      for (const exposure of exposures) {
        const id = exposure?.id ?? exposure?.exposure_id ?? exposure?.ID;
        if (id === undefined || id === null || id === "") continue;
        const remarks = exposure?.remarks ?? exposure?.name ?? exposure?.title ?? "No remarks";
        fragment.appendChild(new Option(`${id} - ${remarks}`, String(id)));
      }
      exposureDropdown.replaceChildren(fragment);
      setExposureDropdownMessage(`Loaded ${exposureDropdown.options.length - 1} exposures`);
    } catch (error) {
      exposuresLoadPromiseLegacy = null;
      console.warn(`[DEW Exposures] Service unavailable. ${error?.message || "Request failed."}`);
      setExposureDropdownMessage("Exposure service unavailable");
    }
  })();

  return exposuresLoadPromiseLegacy;
};

const fetchExposureDetailsLegacy = async (exposureId) => {
  const url = `${DEW_EXPOSURE_API_URL_LEGACY}?exposure_id=${encodeURIComponent(exposureId)}`;
  const dewMap = getDewMap();

  try {
    await waitForDewMapStyle(dewMap);
    setExposureDropdownMessage("Loading exposure details...");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const featureCollection = normalizeExposureFeatureCollection(await response.json());
    const { features } = featureCollection;
    if (!features.length) throw new Error("No exposure features returned.");

    const layerId = "dewpolygon";

    if (dewMap.getSource(layerId)) {
      dewMap.getSource(layerId).setData(featureCollection);
    } else {
      dewMap.addSource(layerId, { type: "geojson", data: featureCollection });
    }

    if (!dewMap.getLayer(`${layerId}_fill`)) {
      dewMap.addLayer({
        id: `${layerId}_fill`, type: "fill", source: layerId,
        layout: { visibility: "visible" },
        paint: { "fill-color": "#FF0000", "fill-opacity": 0.3, "fill-outline-color": "#FF0000" }
      });
    }
    if (!dewMap.getLayer(`${layerId}_outline`)) {
      dewMap.addLayer({
        id: `${layerId}_outline`, type: "line", source: layerId,
        layout: { visibility: "visible" },
        paint: { "line-color": "#FF0000", "line-opacity": 1, "line-width": 1.5 }
      });
    }

    dewMap.setLayoutProperty(`${layerId}_fill`, "visibility", "visible");
    dewMap.setLayoutProperty(`${layerId}_outline`, "visibility", "visible");

    exposureDistricts.clear();
    for (const feature of features) {
      if (feature.properties?.exposure_feature_assessment) {
        for (const province of Object.values(feature.properties.exposure_feature_assessment)) {
          if (!province || typeof province !== "object") continue;
          for (const district of Object.keys(province)) {
            exposureDistricts.add(district);
          }
        }
      }
    }

    if (dewMap.getLayer("DistrictBoundaryHighlight") && exposureDistricts.size) {
      dewMap.setFilter("DistrictBoundaryHighlight", ["in", "name", ...exposureDistricts]);
    }

    setExposureDropdownMessage(`Loaded ${features.length} exposure feature${features.length === 1 ? "" : "s"}`);
  } catch (error) {
    console.error("Error fetching exposure details:", error);
    setExposureDropdownMessage("Error loading exposure details");
  }
};

function initDewExposureControls() {
  bindExposureControls();
  const dropdown = document.getElementById("exposure-dropdown");
  if (!dropdown || dropdown._dewLazyLoadBound) return;
  dropdown._dewLazyLoadBound = true;
  dropdown.addEventListener("focus", fetchExposuresLegacy);
  dropdown.addEventListener("mousedown", fetchExposuresLegacy);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDewExposureControls);
} else {
  initDewExposureControls();
}
