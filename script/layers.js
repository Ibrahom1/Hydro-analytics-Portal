// Global GeoServer IP variables
const _hostname = window.location.hostname;
const isLocalNetwork = _hostname === 'localhost' || _hostname === '127.0.0.1' || _hostname.startsWith('192.168.') || _hostname.startsWith('172.') || _hostname.startsWith('10.') || _hostname.startsWith('100.');
const isProxied = (!isLocalNetwork && window.location.protocol !== 'file:') || window.location.port === '8000';
const proxyBase = window.location.origin;

const geoserverUrl = isProxied ? `${proxyBase}/proxy_main` : 'http://172.18.7.35:8080';
const mamAyman = isProxied ? `${proxyBase}/proxy_ayman` : "http://172.18.1.167:8080"; 
const mamHimael = "http://172.18.1.147:8080"; // Not proxied per request
const ibrahim  = isProxied ? `${proxyBase}/proxy_ibrahim` : "http://172.18.1.115:8080";
const mustafa = isProxied ? `${proxyBase}/proxy_mustafa` : "http://172.18.1.45:8080"; 
const ahad = isProxied ? `${proxyBase}/proxy_ahad` : "http://172.18.1.68:8080";

const geo_1_4 = isProxied ? `${proxyBase}/proxy_1_4` : 'http://172.18.1.4:8080';
const geo_1_43 = isProxied ? `${proxyBase}/proxy_1_43` : 'http://172.18.1.43:8080';
const geo_1_56 = isProxied ? `${proxyBase}/proxy_1_56` : 'http://172.18.1.56:8080';

const apiImpactHost = isProxied ? `${proxyBase}/proxy_api_impact` : 'http://172.18.1.45:5009';
const apiDewHost = isProxied ? `${proxyBase}/proxy_api_dew` : 'http://172.18.1.108:8000';

const _host = window.location.protocol === 'file:' ? 'localhost' : (window.location.hostname || 'localhost');
const apiDailyHost = isProxied ? `${proxyBase}/proxy_api_daily` : `http://${_host}:5000`;
const apiMeteoblueHost = isProxied ? `${proxyBase}/proxy_api_meteoblue` : `http://${_host}:8000/proxy_api_meteoblue`;
const ffdRiversHost = isProxied ? `${proxyBase}/proxy_ffd_rivers` : 'http://172.18.7.21';

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
const DEW_EXPOSURE_API_URL = "${apiDewHost}/get-exposures/";

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
  // Fit the bounds of the entire country of Pakistan to guarantee that the 
  // tehsil boundary vector tiles are fully loaded on all screen sizes,
  // preventing calculation failure on mobile/tablet viewports.
  map.fitBounds([[60.872, 23.639], [77.837, 37.084]], {
    padding: { top: 30, bottom: 30, left: 30, right: 30 },
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
let isBlinkSelectionActive = false;

function updateBlinkBtnUI() {
  const btn = document.getElementById("blinkLayersBtn");
  if (!btn) return;
  const label = btn.querySelector("span");
  
  const tehsilCheckbox = document.getElementById('tslBoundary');
  const districtCheckbox = document.getElementById('dstBoundary');

  let activeType = "Districts";
  if (tehsilCheckbox?.checked && !districtCheckbox?.checked) {
    activeType = "Tehsils";
  } else if (tehsilCheckbox?.checked && districtCheckbox?.checked) {
    activeType = "Regions";
  }

  const totalSelected = (selectedDistrict?.length || 0) + (selectedTehsils?.length || 0);

  if (blinkInterval) {
    if (label) label.textContent = "Stop Blinking";
    btn.className = "flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-700 text-white rounded shadow-lg hover:from-rose-600 hover:to-red-800 transition font-semibold animate-pulse";
  } else if (isBlinkSelectionActive) {
    if (totalSelected > 0) {
      if (label) label.textContent = `Start Blinking (${totalSelected} Selected)`;
      btn.className = "flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded shadow-lg hover:from-emerald-500 hover:to-teal-800 transition font-semibold ring-2 ring-emerald-300 animate-bounce";
    } else {
      if (label) label.textContent = `Click Map to Select ${activeType}`;
      btn.className = "flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded shadow-lg hover:from-amber-600 hover:to-orange-700 transition font-semibold ring-2 ring-amber-300";
    }
  } else {
    if (label) label.textContent = `Blink ${activeType}`;
    btn.className = "flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded shadow-lg hover:from-blue-500 hover:to-indigo-800 transition font-semibold";
  }
}

//This is for blink button Tehsils & Districts
function updateBlinkLayersButtonVisibility() {
  const btn = document.getElementById('blinkLayersBtn');
  if (!btn) return;
  const tehsilCheckbox = document.getElementById('tslBoundary');
  const districtCheckbox = document.getElementById('dstBoundary');
  const shouldShow = Boolean(tehsilCheckbox?.checked || districtCheckbox?.checked);
  btn.style.display = shouldShow ? 'flex' : 'none';
  if (!shouldShow) {
    if (blinkInterval) {
      clearInterval(blinkInterval);
      blinkInterval = null;
    }
    isBlinkSelectionActive = false;
    selectedDistrict = [];
    selectedTehsils = [];
    if (typeof map1 !== 'undefined' && map1) {
      if (map1.getLayer("DistrictBoundaryHighlight")) map1.setFilter("DistrictBoundaryHighlight", ["in", "name", ""]);
      if (map1.getLayer("TehsilBoundaryHighlight")) map1.setFilter("TehsilBoundaryHighlight", ["in", "name", ""]);
    }
    updateBlinkBtnUI();
  }
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

function formatShortDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = parts[2];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const month = monthNames[monthIdx] || '';
  return `${day} ${month}`;
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:national_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:provincial_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:district_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:tehsil_boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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

      if (!isBlinkSelectionActive || blinkInterval) {
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
        updateBlinkBtnUI();
      }
    });

    map.on("mouseenter", "DistrictBoundary", () => {
      if (isBlinkSelectionActive && !blinkInterval) {
        map.getCanvas().style.cursor = "pointer";
      }
    });

    map.on("mouseleave", "DistrictBoundary", () => {
      map.getCanvas().style.cursor = "";
    });

    // Add click event listener for Tehsils
    map.on("click", "TehsilBoundary", (e) => {
      const visibility = map.getLayoutProperty("tehsilBoundary_label", "visibility");
      if (visibility !== "visible") return;

      if (!isBlinkSelectionActive || blinkInterval) {
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
        updateBlinkBtnUI();
      }
    });

    map.on("mouseenter", "TehsilBoundary", () => {
      if (isBlinkSelectionActive && !blinkInterval) {
        map.getCanvas().style.cursor = "pointer";
      }
    });

    map.on("mouseleave", "TehsilBoundary", () => {
      map.getCanvas().style.cursor = "";
    });
  }


  safeAddSource("Union_Council", {
    type: "geojson",
    data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Union_Council&outputFormat=application/json&srsName=EPSG:3857`,
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
    if (isProxied && checkbox.checked) {
      checkbox.checked = false;
      alert("High-resolution videos have been disabled to conserve bandwidth while accessing via the internet proxy.");
      return;
    }
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

  if (checkbox.id === 'FE') {
    const isVisible = checkbox.checked;
    if (typeof map1 !== 'undefined' && map1 && map1.getLayer('flood_events')) {
      map1.setLayoutProperty('flood_events', 'visibility', isVisible ? 'visible' : 'none');
    }
  }

  if (checkbox.id === 'unfoldedEvent') {
    const isVisible = checkbox.checked;
    if (typeof map1 !== 'undefined' && map1 && map1.getLayer('unfolded_event_points')) {
      map1.setLayoutProperty('unfolded_event_points', 'visibility', isVisible ? 'visible' : 'none');
    }
  }

  if (['ffd', 'kp_flood_cell', 'gb_stations', 'other_gauges'].includes(checkbox.id)) {
    if (typeof ffdLegend === 'function') {
      ffdLegend();
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
    this.weeklyDates = []; // Dynamic list of available GeoJSON dates
    
    // Initialize controller configurations
    this.initializeControllers();
    
    // Fetch dates asynchronously from the API and store the promise
    this.weeklyDatesPromise = this.loadWeeklyDates();
  }

  async loadWeeklyDates() {
    try {
      const url = `${apiMeteoblueHost}/weekly/dates`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data && data.precip && data.precip.length > 0) {
        this.weeklyDates = data.precip;
        console.log("Successfully fetched weekly precipitation dates from proxy:", this.weeklyDates);
        
        // Re-initialize weekly controller config with the new count and layer IDs
        const wkyController = this.controllers.get('wky');
        if (wkyController) {
          wkyController.config.layerCount = this.weeklyDates.length;
          wkyController.layerIds = this.weeklyDates.map((_, i) => `meteoblue_geojson_precipitation_forecast_${i}`);
          
          // Update the slider's max value in DOM
          const sliderEl = document.getElementById(wkyController.config.sliderId);
          if (sliderEl) {
            sliderEl.max = this.weeklyDates.length - 1;
          }
          
          // Re-render the time markers / calendar labels
          const timestampsEl = document.getElementById(wkyController.config.timestampsId);
          if (timestampsEl) {
            const lastIndex = Math.max(1, this.weeklyDates.length - 1);
            timestampsEl.innerHTML = this.weeklyDates.map((date, index) => {
              const left = (index / lastIndex) * 100;
              const time = formatShortDate(date);
              return `<span class="time-marker text-center cursor-pointer hover:bg-gray-600 p-1 rounded ${index === 0 ? 'active' : ''}"
                     style="left: ${left}%;"
                     onclick="weatherController.updateLayer('wky', ${index})">${time}</span>`;
            }).join('');
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch weekly dates from proxy, using fallback local dates:", e);
      // Fallback: populate weeklyDates with 7 days starting today
      this.weeklyDates = Array.from({ length: 7 }, (_, i) => getNextNDays(i));
    }
  }

  // Use existing global functions for time formatting
  getNextNHoursWithTime(offset = 0) {
    const currentDate = new Date();
    currentDate.setMinutes(0, 0, 0); // Zero out minutes, seconds, milliseconds to round to top of the hour
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

  // Add Meteoblue hourly precipitation layers to the map (vector tiles via cached proxy)
  addMeteoblueHourlyLayers() {
    if (this.hourlyLayersAdded) return;
   
    const model = "NEMSIN";
   
    for (let hourOffset = 0; hourOffset < 11; hourOffset++) {
      const time = this.getNextNHoursWithTime(hourOffset);
      const sourceId = `meteoblue_nems_cloudprecipitation_hourly_forecast_${hourOffset}`;
      const baseUrl = `${apiMeteoblueHost}/v1/map/vector/${model}/${time}/cloudsLow~73~low cld lay~hourly~none~contourSteps~20.0~40.0~60.0~80.0~95.0_cloudsMid~74~mid cld lay~hourly~none~contourSteps~20.0~40.0~60.0~80.0~95.0_precip~61~sfc~hourly~none~contourSteps~0.1~0.25~0.5~1.0~1.5~2.0~3.0~5.0~7.0~10.0~15.0~20.0~30.0_snow~679~sfc~hourly~none~contourSteps~0.2/{z}/{x}/{y}`;
     
      // Add source if it doesn't exist
      if (!this.sourceExists(sourceId)) {
        try {
          map1.addSource(sourceId, {
            type: "vector",
            tiles: [baseUrl],
            bounds: [58.0, 5.0, 105.0, 42.0]
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

  // Add weekly precipitation layers as GeoJSON
  async addMeteoblueWeeklyLayers() {
    if (this.weeklyLayersAdded) return;

    // Wait for the dates list to be resolved first
    if (this.weeklyDatesPromise) {
      await this.weeklyDatesPromise;
    }
    
    // Ensure we have weeklyDates populated
    if (!this.weeklyDates || this.weeklyDates.length === 0) {
      this.weeklyDates = Array.from({ length: 7 }, (_, i) => getNextNDays(i));
    }

    console.log("Adding weekly precipitation vector tile layers for dates:", this.weeklyDates);

    const model = "NEMSIN";

    // Add vector tile source+layer for each daily date
    for (let index = 0; index < this.weeklyDates.length; index++) {
      const date = this.weeklyDates[index];
      const time = `${date}T00:00:00Z`;
      const sourceId = `meteoblue_geojson_source_${index}`;
      const layerId = `meteoblue_geojson_precipitation_forecast_${index}`;

      // Use same vector tile proxy as hourly, but with daily aggregation
      const baseUrl = `${apiMeteoblueHost}/v1/map/vector/${model}/${time}/precip~61~sfc~daily~none~contourSteps~1.0~2.0~3.0~4.0~5.0~6.0~8.0~10.0~12.0~16.0~18.0~20.0~25.0~30.0~35.0~40.0~50.0~60.0~70.0~80.0~90.0~100.0~125.0~150.0/{z}/{x}/{y}`;

      // Add source
      if (!this.sourceExists(sourceId)) {
        try {
          map1.addSource(sourceId, {
            type: "vector",
            tiles: [baseUrl],
            bounds: [58.0, 5.0, 105.0, 42.0]
          });
        } catch (error) {
          console.warn(`Failed to add vector tile source ${sourceId}:`, error);
          continue;
        }
      }

      // Add layer
      if (!this.layerExists(layerId)) {
        try {
          map1.addLayer({
            id: layerId,
            type: "fill",
            source: sourceId,
            "source-layer": "precip",
            paint: {
              "fill-antialias": false,
              "fill-opacity": 0,
              "fill-opacity-transition": { duration: 300 },
              // Standard precipitation colors using minValue property from vector tiles
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
            },
            layout: { visibility: "none" }
          }, 'nationalBoundary');
        } catch (error) {
          console.warn(`Failed to add weekly vector tile layer ${layerId}:`, error);
        }
      }
    }

    this.weeklyLayersAdded = true;
    console.log('Weekly precipitation vector tile layers added successfully');
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
      layerType: 'geojson',
      forecast: 'forecast',
      layerCount: 8,
      layerIds: Array.from({ length: 8 }, (_, i) =>
        `meteoblue_geojson_precipitation_forecast_${i}`),
      toggleId: 'wky-precip-toggle',
      sliderId: 'wky-precip-slider',
      controlsId: 'wky-precip-controls',
      timestampsId: 'wky-precip-calendar',
      playbackId: 'wky-precip-playback',
      opacitySliderId: 'wky-opacity-slider', // Add opacity slider ID
      opacityValueId: 'wky-opacity-value', // Add opacity value display ID
      timeFunction: (i) => {
        if (this.weeklyDates && this.weeklyDates[i]) {
          return formatShortDate(this.weeklyDates[i]);
        }
        return getNextNDays(i, 'short');
      },
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
      // --- AUTO-CLOSE SIDEBAR FOR ALL SCREENS <= 1440px ---
      if (window.innerWidth <= 1440) {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar && !sidebar.classList.contains('is-closed')) {
          const closeBtn = document.getElementById('sidebar-close');
          const toggleBtn = document.getElementById('sidebar-toggle');
          
          sidebar.classList.add('is-closed');
          
          if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.classList.remove('is-hidden');
          }
          if (closeBtn) {
            closeBtn.setAttribute('aria-expanded', 'false');
            closeBtn.style.display = 'none';
          }
        }
      }
      // ----------------------------------------------------

      // Add layers if not already added
      if (controllerId === 'hrs' && !this.hourlyLayersAdded) {
        await this.waitForMapStyle();
        this.addMeteoblueHourlyLayers();
      } else if (controllerId === 'wky' && !this.weeklyLayersAdded) {
        await this.waitForMapStyle();
        await this.addMeteoblueWeeklyLayers();
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
            await this.addMeteoblueWeeklyLayers();
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

function toggleControlBoxDrag(containerId, buttonEl) {
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) return;

  if (!container.__dragState) {
    container.__dragState = {
      enabled: false,
      isDragging: false,
      startX: 0,
      startY: 0,
      initialLeft: 0,
      initialTop: 0
    };
  }
  const state = container.__dragState;
  state.enabled = !state.enabled;

  if (state.enabled) {
    container.classList.add('is-draggable');
    if (buttonEl) {
      buttonEl.classList.add('is-active');
      buttonEl.title = 'Disable dragging';
    }
  } else {
    container.classList.remove('is-draggable', 'is-dragging');
    if (buttonEl) {
      buttonEl.classList.remove('is-active');
      buttonEl.title = 'Enable dragging';
    }
    return;
  }

  if (container.__dragListenersBound) return;
  container.__dragListenersBound = true;

  const onMouseDown = (e) => {
    if (!state.enabled) return;
    // Prevent drag when interacting with controls inside box
    if (e.target.closest('input, button, label, a, .precip-legend-text')) return;

    state.isDragging = true;
    container.classList.add('is-dragging');
    state.startX = e.clientX;
    state.startY = e.clientY;

    const rect = container.getBoundingClientRect();
    state.initialLeft = rect.left;
    state.initialTop = rect.top;

    // Lock exact width so size remains 100% identical when dragging!
    container.style.width = `${rect.width}px`;
    container.style.position = 'fixed';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.transform = 'none';
    container.style.margin = '0';

    const onMouseMove = (moveEvt) => {
      if (!state.enabled || !state.isDragging) return;
      const dx = moveEvt.clientX - state.startX;
      const dy = moveEvt.clientY - state.startY;

      let newLeft = state.initialLeft + dx;
      let newTop = state.initialTop + dy;

      const maxX = window.innerWidth - container.offsetWidth;
      const maxY = window.innerHeight - container.offsetHeight;
      newLeft = Math.max(0, Math.min(newLeft, maxX));
      newTop = Math.max(0, Math.min(newTop, maxY));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      state.isDragging = false;
      container.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };

  container.addEventListener('mousedown', onMouseDown);
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
            `${ahad}/geoserver/Precipitation_2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Precipitation_2026:${month}&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
if (blinkBtn) {
  blinkBtn.addEventListener("click", function () {
    const totalSelected = (selectedDistrict?.length || 0) + (selectedTehsils?.length || 0);

    // 1. If currently blinking -> STOP BLINKING & RESET
    if (blinkInterval) {
      clearInterval(blinkInterval);
      blinkInterval = null;
      isBlinkSelectionActive = false;
      selectedDistrict = [];
      selectedTehsils = [];
      if (typeof map1 !== 'undefined' && map1) {
        if (map1.getLayer("TehsilBoundaryHighlight")) {
          map1.setPaintProperty("TehsilBoundaryHighlight", "fill-opacity", 0.3);
          map1.setFilter("TehsilBoundaryHighlight", ["in", "name", ""]);
        }
        if (map1.getLayer("DistrictBoundaryHighlight")) {
          map1.setPaintProperty("DistrictBoundaryHighlight", "fill-opacity", 0.3);
          map1.setFilter("DistrictBoundaryHighlight", ["in", "name", ""]);
        }
      }
      updateBlinkBtnUI();
      console.log("Blinking stopped - district selection reset");
      return;
    }

    // 2. If selection mode is NOT active -> ACTIVATE SELECTION MODE
    if (!isBlinkSelectionActive) {
      isBlinkSelectionActive = true;
      updateBlinkBtnUI();
      console.log("Selection mode activated - click map districts to select");
      return;
    }

    // 3. If selection mode IS active and features ARE selected -> START BLINKING!
    if (isBlinkSelectionActive && totalSelected > 0) {
      isBlinkSelectionActive = false; // Lock selection mode while blinking
      let isVisible = true;
      blinkInterval = setInterval(() => {
        if (typeof map1 !== 'undefined' && map1) {
          if (map1.getLayer("TehsilBoundaryHighlight")) map1.setPaintProperty("TehsilBoundaryHighlight", "fill-opacity", isVisible ? 0 : 0.3);
          if (map1.getLayer("DistrictBoundaryHighlight")) map1.setPaintProperty("DistrictBoundaryHighlight", "fill-opacity", isVisible ? 0 : 0.3);
        }
        isVisible = !isVisible;
      }, 500);
      updateBlinkBtnUI();
      console.log("Blinking started for selected features");
      return;
    }

    // 4. If user clicks button again while in selection mode with 0 features selected -> Cancel selection mode
    isBlinkSelectionActive = false;
    updateBlinkBtnUI();
  });
}


function handleHECRASVideo(checkbox, file) {
  if (!checkbox.checked) return;
  
  if (isProxied) {
    checkbox.checked = false;
    alert("High-resolution videos have been disabled to conserve bandwidth while accessing via the internet proxy.");
    return;
  }

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

  const isMobileLegend = window.innerWidth <= 480;
  const floodLevels = [
    { color: 'purple', label: 'Ex.High Flood', short: 'Ex.High' },
    { color: 'brown', label: 'Very High Flood', short: 'V.High' },
    { color: '#F72D24', label: 'High Flood', short: 'High' },
    { color: '#FBAB12', label: 'Medium Flood', short: 'Med' },
    { color: '#2C9326', label: 'Low Flood', short: 'Low' }
    
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
    label.textContent = isMobileLegend ? level.short : level.label;
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
  if (typeof repositionFFDLegend === 'function') {
    requestAnimationFrame(() => repositionFFDLegend());
  }
}

// Function to hide the legend
function hideFloodLegend() {
  const existingLegend = document.getElementById('floodLegend');
  if (existingLegend) {
    existingLegend.remove();
  }
  if (typeof repositionFFDLegend === 'function') {
    requestAnimationFrame(() => repositionFFDLegend());
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
  if (isProxied) {
    alert("High-resolution media has been disabled to conserve bandwidth while accessing via the internet proxy.");
    return;
  }
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
  "ffd_point", "ffd_label", "ffd_forecast_square", "DI_Khan_HT", "DG khan HT", "Pir_Panjal_HT",
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
  bounds: [[60.872, 23.639], [77.837, 37.084]],
  fitBoundsOptions: { padding: 20 },
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
    summaryTitle: document.getElementById('impact-summary-title'),
    summaryGrid: document.getElementById('impact-summary-grid'),
    summaryClose: document.getElementById('impact-summary-close'),
    viewToggleBtn: document.getElementById('impact-view-toggle'),
    iconListView: document.getElementById('icon-list-view'),
    iconGridView: document.getElementById('icon-grid-view'),
    exposureView: document.getElementById('impact-exposure-view')
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

function deriveImpactLevelFromColor(rawColor) {
  const c = String(rawColor ?? '').trim().toLowerCase();
  if (c === 'purple' || c === '#a855f7') return 'Very High';
  if (c === 'red' || c === '#ef4444') return 'High';
  if (c === 'yellow' || c === 'orange' || c === '#f59e0b' || c === '#f97316') return 'Medium';
  if (c === 'green' || c === '#22c55e') return 'Low';
  if (c === 'blue' || c === '#3b82f6') return 'Low';
  return 'High'; // default fallback
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
  const refs = getImpactUiRefs();
  if (refs.summaryDate) {
    refs.summaryDate.textContent = '-';
  }
  if (refs.summaryGrid) {
    refs.summaryGrid.innerHTML = `<div class="impact-summary-empty">${escapeImpactHtml(message)}</div>`;
  }
  
  // Reset view to summary
  currentImpactView = 'exposure'; // Set to opposite to trigger the toggle back to summary
  toggleImpactView();
  
  if (refs.viewToggleBtn) {
    refs.viewToggleBtn.style.display = 'none';
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
        level: deriveImpactLevelFromColor(row?.color),
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
          impact_level: row.level,
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
    clearExposureReport();
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
    const impactResponse = await fetch(`${apiImpactHost}/api/impact?date=${encodeURIComponent(dateValue)}`, {
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
    const geometryResponse = await fetch(`${apiImpactHost}/api/gis/gloric?ids=${encodeURIComponent(ids.join(','))}`, {
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

    triggerExposureReportAnalysis(joinedFeatureCollection, dateValue);

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

// ============================== Exposure Report (Tehsil Intersection) ==============================

let exposureReportOpen = false;
let exposureReportData = null;

function getLevelPriority(level) {
  const l = String(level ?? '').toLowerCase();
  if (l.includes('very high')) return 4;
  if (l.includes('high')) return 3;
  if (l.includes('medium')) return 2;
  if (l.includes('low')) return 1;
  return 0;
}

function computeExposedTehsilsAsync(joinedFeatureCollection) {
  const features = joinedFeatureCollection?.features || [];
  if (!features.length) return Promise.resolve(null);

  // Build buffered exposure polygons from each feature for intersection testing
  const exposurePolygons = [];
  for (const feature of features) {
    const geomType = feature?.geometry?.type;
    if (!geomType) continue;

    try {
      let poly = null;
      if (geomType === 'LineString' || geomType === 'MultiLineString') {
        // Buffer lines by ~0.5km to create a testable polygon
        poly = turf.buffer(feature, 0.5, { units: 'kilometers' });
      } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        poly = feature;
      } else if (geomType === 'Point' || geomType === 'MultiPoint') {
        poly = turf.buffer(feature, 1, { units: 'kilometers' });
      }
      if (poly) {
        exposurePolygons.push({
          polygon: poly,
          color: feature.properties?.impact_color || '#ef4444',
          level: feature.properties?.impact_level || 'Unknown'
        });
      }
    } catch (err) {
      console.warn('Turf buffer failed for feature:', err);
    }
  }

  if (!exposurePolygons.length) return Promise.resolve(null);

  // Query tehsil boundary polygons from the loaded vector tiles
  let tehsilFeatures = [];
  try {
    tehsilFeatures = map1.querySourceFeatures('tehsilBoundary', {
      sourceLayer: 'tehsil_boundary'
    });
  } catch (err) {
    console.warn('Failed to query tehsil boundaries:', err);
    return Promise.resolve(null);
  }

  if (!tehsilFeatures.length) {
    console.warn('No tehsil features returned from querySourceFeatures');
    return Promise.resolve(null);
  }

  // Deduplicate tehsil features by name (vector tiles can return duplicates across tiles)
  const uniqueTehsils = new Map();
  for (const tf of tehsilFeatures) {
    const name = tf.properties?.name || tf.properties?.Name || tf.properties?.NAME;
    if (!name) continue;
    // Keep the first complete geometry for each name
    if (!uniqueTehsils.has(name)) {
      uniqueTehsils.set(name, tf);
    }
  }

  // Intersect each tehsil with exposure polygons asynchronously
  return new Promise((resolve) => {
    const tehsilResults = new Map(); // name -> { name, district, province, color, level, priority }
    const uniqueTehsilArray = Array.from(uniqueTehsils.entries());
    let currentIndex = 0;

    function processChunk() {
      const startTime = performance.now();
      
      // Process chunks for up to 25ms to maintain ~40fps UI responsiveness
      while (currentIndex < uniqueTehsilArray.length && (performance.now() - startTime) < 25) {
        const [tehsilName, tehsilFeature] = uniqueTehsilArray[currentIndex];
        const tehsilGeom = tehsilFeature.geometry;
        
        if (tehsilGeom) {
          for (const exposure of exposurePolygons) {
            try {
              const intersects = turf.booleanIntersects(exposure.polygon, tehsilFeature);
              if (intersects) {
                const existing = tehsilResults.get(tehsilName);
                const priority = getLevelPriority(exposure.level);

                if (!existing || priority > existing.priority) {
                  tehsilResults.set(tehsilName, {
                    name: tehsilName,
                    district: tehsilFeature.properties?.district || tehsilFeature.properties?.District || tehsilFeature.properties?.DISTRICT || 'Unknown',
                    province: tehsilFeature.properties?.province || tehsilFeature.properties?.Province || tehsilFeature.properties?.PROVINCE || 'Unknown',
                    color: exposure.color,
                    level: exposure.level,
                    priority: priority
                  });
                }
              }
            } catch (err) {
              // Geometry might be invalid — skip silently
            }
          }
        }
        currentIndex++;
      }

      if (currentIndex < uniqueTehsilArray.length) {
        // Yield to the browser main thread
        setTimeout(processChunk, 0);
      } else {
        // Finished all intersections, format data and resolve
        if (tehsilResults.size === 0) {
          resolve(null);
          return;
        }

        const grouped = {};
        for (const res of tehsilResults.values()) {
          const prov = res.province;
          const dist = res.district;
          if (!grouped[prov]) grouped[prov] = {};
          if (!grouped[prov][dist]) grouped[prov][dist] = [];
          grouped[prov][dist].push(res);
        }

        for (const prov of Object.keys(grouped)) {
          for (const dist of Object.keys(grouped[prov])) {
            grouped[prov][dist].sort((a, b) => {
              if (a.priority !== b.priority) return b.priority - a.priority;
              return a.name.localeCompare(b.name);
            });
          }
        }

        resolve({
          totalTehsils: tehsilResults.size,
          grouped: grouped
        });
      }
    }

    // Start processing chunks
    processChunk();
  });
}

function renderExposureReport(data, dateStr) {
  const refs = getImpactUiRefs();
  const viewContainer = refs.exposureView;
  if (!viewContainer) return;

  if (!data || !data.totalTehsils) {
    viewContainer.innerHTML = `
      <div class="exposure-report-empty">No tehsil intersections found for this exposure data.</div>
    `;
    exposureReportData = null;
    return;
  }

  exposureReportData = data;

  // Build province sections
  let provinceSectionsHtml = '';
  let cardIndex = 0;
  const sortedProvinces = Object.keys(data.grouped).sort();

  for (const provinceName of sortedProvinces) {
    const districts = data.grouped[provinceName];
    const districtCount = Object.keys(districts).length;

    let allCardsHtml = '';
    const sortedDistricts = Object.keys(districts).sort();

    for (const districtName of sortedDistricts) {
      const tehsils = districts[districtName];
      for (const tehsil of tehsils) {
        const delay = Math.min(cardIndex * 30, 500);
        allCardsHtml += `
          <div class="xr-card" style="border-left-color: ${escapeImpactHtml(tehsil.color)}; animation-delay: ${delay}ms;" title="${escapeImpactHtml(tehsil.name)} — ${escapeImpactHtml(districtName)}">
            <span class="xr-card-name">${escapeImpactHtml(tehsil.name)}</span>
            <span class="xr-card-district">District ${escapeImpactHtml(districtName)}</span>
            <span class="xr-card-level-pill">${escapeImpactHtml(tehsil.level)} Risk</span>
          </div>
        `;
        cardIndex++;
      }
    }

    let tehsilCount = 0;
    for (const d of Object.values(districts)) tehsilCount += d.length;

    provinceSectionsHtml += `
      <div class="xr-province">
        <div class="xr-province-head" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="xr-province-title">
            <svg class="xr-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <span class="xr-province-name">${escapeImpactHtml(provinceName)}</span>
          </div>
          <span class="xr-province-meta">${districtCount} Dist · ${tehsilCount} Tehsil${tehsilCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="xr-cards-collapse-wrapper">
          <div class="xr-cards-flow">${allCardsHtml}</div>
        </div>
      </div>
    `;
  }

  viewContainer.innerHTML = `
    <div class="xr-summary-bar">
      <span class="xr-summary-count">${data.totalTehsils}</span>
      <span class="xr-summary-label">Tehsils Exposed</span>
    </div>
    <div class="exposure-report-body">
      ${provinceSectionsHtml}
    </div>
  `;

  // Make toggle button visible now that data is ready
  if (refs.viewToggleBtn) {
    refs.viewToggleBtn.style.display = 'flex';
  }
}

function showExposureReportLoading(dateStr) {
  const refs = getImpactUiRefs();
  const viewContainer = refs.exposureView;
  if (!viewContainer) return;

  viewContainer.innerHTML = `
    <div class="exposure-report-loading">
      <div class="exposure-report-loading-spinner"></div>
      <span>Analyzing tehsil intersections...</span>
    </div>
  `;

  // Hide the toggle button while loading
  if (refs.viewToggleBtn) {
    refs.viewToggleBtn.style.display = 'none';
  }
}

function clearExposureReport() {
  exposureReportData = null;
  const refs = getImpactUiRefs();
  const viewContainer = refs.exposureView;
  if (viewContainer) {
    viewContainer.innerHTML = '';
  }
  if (refs.viewToggleBtn) {
    refs.viewToggleBtn.style.display = 'none';
  }
}

function triggerExposureReportAnalysis(joinedFeatureCollection, dateStr) {
  // Close the sidebar automatically
  const sidebar = document.getElementById('app-sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (sidebar && !sidebar.classList.contains('is-closed')) {
    sidebar.classList.add('is-closed');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.classList.add('is-hidden');
      toggleBtn.classList.remove('is-hidden');
    }
  }

  // Show loading state
  showExposureReportLoading(dateStr);

  const runAnalysis = async () => {
    try {
      const result = await computeExposedTehsilsAsync(joinedFeatureCollection);
      renderExposureReport(result, dateStr);
    } catch (err) {
      console.error('Exposure report analysis failed:', err);
      renderExposureReport(null, dateStr);
    }
  };

  // The map might never reach 'idle' if there are animated layers (e.g., radar, pulse).
  // Polling for source features is much safer.
  let attempts = 0;
  const maxAttempts = 10; // 10 * 400ms = 4 seconds max wait
  
  const checkTilesAndRun = () => {
    attempts++;
    let hasFeatures = false;
    try {
      const features = map1.querySourceFeatures('tehsilBoundary', { sourceLayer: 'tehsil_boundary' });
      if (features && features.length > 0) {
        hasFeatures = true;
      }
    } catch (e) {
      // Source might not be ready yet
    }

    if (hasFeatures || attempts >= maxAttempts) {
      runAnalysis();
    } else {
      setTimeout(checkTilesAndRun, 400);
    }
  };

  // Start polling
  setTimeout(checkTilesAndRun, 400);
}

// ============================== End Exposure Report ==============================

let currentImpactView = 'summary'; // 'summary' or 'exposure'

function toggleImpactView() {
  const refs = getImpactUiRefs();
  if (!refs.summaryGrid || !refs.exposureView || !refs.iconListView || !refs.iconGridView || !refs.summaryTitle) return;

  if (currentImpactView === 'summary') {
    // Switch to Exposure Report
    currentImpactView = 'exposure';
    refs.summaryGrid.style.display = 'none';
    refs.exposureView.style.display = 'block';
    refs.iconListView.style.display = 'none';
    refs.iconGridView.style.display = 'block';
    refs.summaryTitle.textContent = 'Exposure Report';
  } else {
    // Switch to Summary Grid
    currentImpactView = 'summary';
    refs.summaryGrid.style.display = 'grid'; // will be styled as grid or flex
    refs.exposureView.style.display = 'none';
    refs.iconListView.style.display = 'block';
    refs.iconGridView.style.display = 'none';
    refs.summaryTitle.textContent = 'Total exposed summary';
  }
}

function setupImpactPanelDraggable() {
  const panel = document.getElementById('impact-summary-panel');
  const header = panel.querySelector('.impact-summary-header');
  
  if (!panel || !header) return;

  header.style.cursor = 'move';
  
  let isDragging = false;

  const onMouseMove = (e) => {
    if (!isDragging) return;
    
    // Convert to absolute positioning based on current offset
    const currentLeft = panel.offsetLeft;
    const currentTop = panel.offsetTop;
    
    panel.style.left = `${currentLeft + e.movementX}px`;
    panel.style.top = `${currentTop + e.movementY}px`;
    panel.style.right = 'auto'; // Remove right anchor
    panel.style.bottom = 'auto';
  };

  const onMouseUp = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  header.addEventListener('mousedown', (e) => {
    // Ignore clicks on buttons/icons
    if (e.target.closest('button, svg, path, .impact-action-btn')) return;
    
    isDragging = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function initImpactControls() {
  if (impactControlsInitialized) return;

  const refs = getImpactUiRefs();
  if (!refs.openBtn || !refs.modal || !refs.loadBtn || !refs.dateInput) return;

  impactControlsInitialized = true;
  ensureImpactDefaultDate();
  clearImpactSummaryPanel();
  setupImpactPanelDraggable();

  refs.openBtn.addEventListener('click', openImpactModal);
  refs.closeBtn?.addEventListener('click', closeImpactModal);
  refs.cancelBtn?.addEventListener('click', closeImpactModal);
  refs.summaryClose?.addEventListener('click', closeImpactSummaryPanel);
  refs.viewToggleBtn?.addEventListener('click', toggleImpactView);

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
//             'Mangla Dam': { percentage: fillPercentage_Mangla, level: res_lvl_value_Mangla },
//             'Chashma': { percentage: fillPercentage_Chashma, level: res_lvl_value_Chashma },
//             'Tarbela Dam': { percentage: fillPercentage_Tarbela, level: res_lvl_value_Tarbela }
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

// ============================================================================
// FLOOD LIMITS OF RIVERS & NULLAHS (Standard FFD Thresholds)
// All river values in Lakh Cusecs (1 Lakh = 100,000 cusecs); Nullahs in Cusecs
// ============================================================================
const FLOOD_LIMITS_DATA = {
  // Indus River (Unit: Lakh Cusecs)
  "Tarbela": { river: "Indus River", unit: "lakh_cusecs", design: 15.0, low: 2.5, medium: 3.75, high: 5.0, veryHigh: 6.5, exceptional: 8.0 },
  "Tarbela Dam": { river: "Indus River", unit: "lakh_cusecs", design: 15.0, low: 2.5, medium: 3.75, high: 5.0, veryHigh: 6.5, exceptional: 8.0 },
  "Attock": { river: "Indus River", unit: "lakh_cusecs", design: null, low: 2.5, medium: 3.75, high: 5.0, veryHigh: 6.5, exceptional: 8.0 },
  "Kalabagh": { river: "Indus River", unit: "lakh_cusecs", design: 9.5, low: 2.5, medium: 3.75, high: 5.0, veryHigh: 6.5, exceptional: 8.0 },
  "Chashma": { river: "Indus River", unit: "lakh_cusecs", design: 9.5, low: 2.5, medium: 3.75, high: 5.0, veryHigh: 6.5, exceptional: 8.0 },
  "Taunsa": { river: "Indus River", unit: "lakh_cusecs", design: 10.0, low: 2.5, medium: 3.75, high: 5.0, veryHigh: 6.5, exceptional: 8.0 },
  "Guddu": { river: "Indus River", unit: "lakh_cusecs", design: 12.0, low: 2.0, medium: 3.5, high: 5.0, veryHigh: 7.0, exceptional: 9.0 },
  "Sukkur": { river: "Indus River", unit: "lakh_cusecs", design: 9.0, low: 2.0, medium: 3.5, high: 5.0, veryHigh: 7.0, exceptional: 9.0 },
  "Kotri": { river: "Indus River", unit: "lakh_cusecs", design: 8.75, low: 2.0, medium: 3.0, high: 4.5, veryHigh: 6.5, exceptional: 8.0 },

  // Kabul River (Unit: Lakh Cusecs)
  "WARSAK": { river: "Kabul River", unit: "lakh_cusecs", design: 5.4, low: 0.4, medium: 0.6, high: 1.0, veryHigh: 1.5, exceptional: null },
  "Warsak": { river: "Kabul River", unit: "lakh_cusecs", design: 5.4, low: 0.4, medium: 0.6, high: 1.0, veryHigh: 1.5, exceptional: null },
  "NOWSHERA": { river: "Kabul River", unit: "lakh_cusecs", design: null, low: 0.6, medium: 0.9, high: 1.4, veryHigh: 2.0, exceptional: null },
  "Nowshera": { river: "Kabul River", unit: "lakh_cusecs", design: null, low: 0.6, medium: 0.9, high: 1.4, veryHigh: 2.0, exceptional: null },
  "Kabul": { river: "Kabul River", unit: "lakh_cusecs", design: null, low: 0.6, medium: 0.9, high: 1.4, veryHigh: 2.0, exceptional: null },
  "KABUL": { river: "Kabul River", unit: "lakh_cusecs", design: null, low: 0.6, medium: 0.9, high: 1.4, veryHigh: 2.0, exceptional: null },
  "Kabul River": { river: "Kabul River", unit: "lakh_cusecs", design: null, low: 0.6, medium: 0.9, high: 1.4, veryHigh: 2.0, exceptional: null },

  // Jhelum River (Unit: Lakh Cusecs)
  "Kohala": { river: "Jhelum River", unit: "lakh_cusecs", design: null, low: 1.0, medium: 1.5, high: 2.0, veryHigh: 3.0, exceptional: 4.0 },
  "Mangla": { river: "Jhelum River", unit: "lakh_cusecs", design: 10.6, low: 0.75, medium: 1.1, high: 1.5, veryHigh: 2.25, exceptional: 3.0 },
  "Mangla Dam": { river: "Jhelum River", unit: "lakh_cusecs", design: 10.6, low: 0.75, medium: 1.1, high: 1.5, veryHigh: 2.25, exceptional: 3.0 },
  "Rasul": { river: "Jhelum River", unit: "lakh_cusecs", design: 8.5, low: 0.75, medium: 1.1, high: 1.5, veryHigh: 2.25, exceptional: 3.0 },

  // Chenab River (Unit: Lakh Cusecs)
  "Jammu Tawi": { river: "Chenab River", unit: "lakh_cusecs", design: null, low: 0.2, medium: 0.7, high: 0.83, veryHigh: 1.7, exceptional: null },
  "Akhnur": { river: "Chenab River", unit: "lakh_cusecs", design: null, low: 0.75, medium: 1.97, high: 2.97, veryHigh: 3.5, exceptional: null },
  "Akhnoor": { river: "Chenab River", unit: "lakh_cusecs", design: null, low: 0.75, medium: 1.97, high: 2.97, veryHigh: 3.5, exceptional: null },
  "Marala": { river: "Chenab River", unit: "lakh_cusecs", design: 11.0, low: 1.0, medium: 1.5, high: 2.0, veryHigh: 4.0, exceptional: 6.0 },
  "Khanki": { river: "Chenab River", unit: "lakh_cusecs", design: 11.0, low: 1.0, medium: 1.5, high: 2.0, veryHigh: 4.0, exceptional: 6.0 },
  "Qadirabad": { river: "Chenab River", unit: "lakh_cusecs", design: 9.0, low: 1.0, medium: 1.5, high: 2.0, veryHigh: 4.0, exceptional: 6.0 },
  "Q.Abad": { river: "Chenab River", unit: "lakh_cusecs", design: 9.0, low: 1.0, medium: 1.5, high: 2.0, veryHigh: 4.0, exceptional: 6.0 },
  "Chiniot Bridge": { river: "Chenab River", unit: "lakh_cusecs", design: 8.07, low: 1.0, medium: 1.5, high: 2.0, veryHigh: 4.0, exceptional: 6.0 },
  "Trimmu": { river: "Chenab River", unit: "lakh_cusecs", design: 8.75, low: 1.5, medium: 2.0, high: 3.0, veryHigh: 4.5, exceptional: 6.0 },
  "Panjnad": { river: "Chenab River", unit: "lakh_cusecs", design: 8.65, low: 1.5, medium: 2.5, high: 4.0, veryHigh: 5.5, exceptional: 7.0 },

  // Ravi River (Unit: Lakh Cusecs)
  "Jassar": { river: "Ravi River", unit: "lakh_cusecs", design: 2.75, low: 0.5, medium: 0.75, high: 1.0, veryHigh: 1.5, exceptional: 2.0 },
  "Syphon": { river: "Ravi River", unit: "lakh_cusecs", design: 4.5, low: 0.4, medium: 0.65, high: 0.9, veryHigh: 1.35, exceptional: 1.8 },
  "Shahdara": { river: "Ravi River", unit: "lakh_cusecs", design: 2.5, low: 0.4, medium: 0.65, high: 0.9, veryHigh: 1.35, exceptional: 1.8 },
  "Balloki": { river: "Ravi River", unit: "lakh_cusecs", design: 3.8, low: 0.4, medium: 0.65, high: 0.9, veryHigh: 1.35, exceptional: 1.8 },
  "Sidhnai": { river: "Ravi River", unit: "lakh_cusecs", design: 1.5, low: 0.3, medium: 0.46, high: 0.6, veryHigh: 0.9, exceptional: 1.3 },

  // Sutlej River (Unit: Lakh Cusecs)
  "Suleimanki": { river: "Sutlej River", unit: "lakh_cusecs", design: 3.25, low: 0.5, medium: 0.8, high: 1.2, veryHigh: 1.75, exceptional: 2.25 },
  "Islam": { river: "Sutlej River", unit: "lakh_cusecs", design: 3.0, low: 0.5, medium: 0.8, high: 1.2, veryHigh: 1.75, exceptional: 2.25 },
  "G.S. Wala": { river: "Sutlej River", unit: "lakh_cusecs", design: null, low: 0.5, medium: 0.8, high: 1.2, veryHigh: 1.75, exceptional: 2.25 },
  "Ganda Singh Wala": { river: "Sutlej River", unit: "lakh_cusecs", design: null, low: 0.5, medium: 0.8, high: 1.2, veryHigh: 1.75, exceptional: 2.25 },

  // Nullahs (Unit: Cusecs directly)
  "Bein (Chak Amru)": { river: "Nullahs", unit: "cusecs", design: null, low: 1300, medium: 7000, high: 20000, veryHigh: 30000, exceptional: 35000 },
  "Bein (Shakargarh)": { river: "Nullahs", unit: "cusecs", design: null, low: 1600, medium: 3000, high: 24000, veryHigh: 26000, exceptional: 43000 },
  "Aik (Ura)": { river: "Nullahs", unit: "cusecs", design: null, low: 2000, medium: 9000, high: 13000, veryHigh: 16000, exceptional: 33000 },
  "Basantar (Jassar)": { river: "Nullahs", unit: "cusecs", design: null, low: 4100, medium: 4700, high: 7500, veryHigh: 11600, exceptional: 17800 },
  "Deg (Kingra Bridge)": { river: "Nullahs", unit: "cusecs", design: null, low: 10000, medium: 15000, high: 22000, veryHigh: 30000, exceptional: null },
  "Palku (Wazirabad)": { river: "Nullahs", unit: "cusecs", design: null, low: 2500, medium: 3100, high: 5000, veryHigh: 25000, exceptional: 26000 }
};

window.FLOOD_LIMITS_DATA = FLOOD_LIMITS_DATA;

window.getStationFloodLimits = function(stationName) {
  if (!stationName) return null;
  const norm = stationName.toLowerCase().trim();
  let key = Object.keys(FLOOD_LIMITS_DATA).find(
    k => k.toLowerCase().trim() === norm
  );
  if (!key) {
    key = Object.keys(FLOOD_LIMITS_DATA).find(
      k => norm.includes(k.toLowerCase().trim()) || k.toLowerCase().trim().includes(norm)
    );
  }
  return key ? FLOOD_LIMITS_DATA[key] : null;
};

window.calculateFloodCategoryByDischarge = function(stationName, cusecs) {
  const limits = window.getStationFloodLimits(stationName);
  if (!limits || cusecs === null || cusecs === undefined || isNaN(cusecs)) return "NORMAL_FLOW";
  
  const multiplier = limits.unit === "lakh_cusecs" ? 100000 : 1;
  const low = limits.low !== null ? limits.low * multiplier : Infinity;
  const medium = limits.medium !== null ? limits.medium * multiplier : Infinity;
  const high = limits.high !== null ? limits.high * multiplier : Infinity;
  const veryHigh = limits.veryHigh !== null ? limits.veryHigh * multiplier : Infinity;
  const exceptional = limits.exceptional !== null ? limits.exceptional * multiplier : Infinity;

  if (cusecs >= exceptional && limits.exceptional !== null) return "EXCEPTIONALLY_HIGH_FLOOD";
  if (cusecs >= veryHigh && limits.veryHigh !== null) return "VERY_HIGH_FLOOD";
  if (cusecs >= high && limits.high !== null) return "HIGH_FLOOD";
  if (cusecs >= medium && limits.medium !== null) return "MEDIUM_FLOOD";
  if (cusecs >= low && limits.low !== null) return "LOW_FLOOD";
  return "NORMAL_FLOW";
};

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
        "forecast_status": location.forecast_status || "",
        "forecast_qual": location.forecast_qual || "",
        "forecast_quant": location.forecast_quant || "",
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

        // Normalize forecast status for consistent map styling
        const rawForecast = String(feature.properties.forecast_status || '').trim();
        feature.properties.forecast_status_upper = rawForecast.toUpperCase().replace(/\s+/g, '_');
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
            ['coalesce', ['get', 'status_upper'], ['get', 'status'], ''],
            'NORMAL', '#288846',
            'Normal', '#288846',
            'NORMAL_FLOW', '#288846',
            'LOW', '#2c65bd',
            'Low', '#2c65bd',
            'LOW_FLOOD', '#2c65bd',
            'MEDIUM', '#f6c445',
            'Medium', '#f6c445',
            'MEDIUM_FLOOD', '#f6c445',
            'HIGH', '#f78339',
            'High', '#f78339',
            'HIGH_FLOOD', '#f78339',
            'VERY_HIGH', '#ef3742',
            'Very High', '#ef3742',
            'VERY_HIGH_FLOOD', '#ef3742',
            'EX_HIGH', '#a51f2b',
            'EXCEPTIONALLY_HIGH', '#a51f2b',
            'Exceptionally High', '#a51f2b',
            'EXCEPTIONALLY_HIGH_FLOOD', '#a51f2b',
            '#808080'                     // Default gray
          ],
          'circle-radius': 7,
          'circle-opacity': 1,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });

      // Generate colored square outline images for forecast status markers
      const squareSize = 22;
      const createForecastSquare = (borderColor) => {
        const canvas = document.createElement('canvas');
        canvas.width = squareSize;
        canvas.height = squareSize;
        const ctx = canvas.getContext('2d');
        // Transparent background
        ctx.clearRect(0, 0, squareSize, squareSize);
        // Colored border outline only (no fill)
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, squareSize - 3, squareSize - 3);
        return { width: squareSize, height: squareSize, data: ctx.getImageData(0, 0, squareSize, squareSize).data };
      };

      const forecastSquareMap = {
        'forecast-sq-normal': '#288846',
        'forecast-sq-low': '#2c65bd',
        'forecast-sq-medium': '#f6c445',
        'forecast-sq-high': '#f78339',
        'forecast-sq-very-high': '#ef3742',
        'forecast-sq-ex-high': '#a51f2b',
        'forecast-sq-default': '#808080'
      };

      Object.entries(forecastSquareMap).forEach(([name, color]) => {
        if (!map1.hasImage(name)) {
          map1.addImage(name, createForecastSquare(color));
        }
      });

      // Add forecast status square layer (centered on circle point)
      map1.addLayer({
        id: 'ffd_forecast_square',
        type: 'symbol',
        source: 'ffd',
        filter: ['!=', ['get', 'forecast_status_upper'], ''],
        layout: {
          'visibility': initialVisibility,
          'icon-image': [
            'match',
            ['coalesce', ['get', 'forecast_status_upper'], ''],
            'NORMAL', 'forecast-sq-normal',
            'NORMAL_FLOW', 'forecast-sq-normal',
            'LOW', 'forecast-sq-low',
            'LOW_FLOOD', 'forecast-sq-low',
            'MEDIUM', 'forecast-sq-medium',
            'MEDIUM_FLOOD', 'forecast-sq-medium',
            'HIGH', 'forecast-sq-high',
            'HIGH_FLOOD', 'forecast-sq-high',
            'VERY_HIGH', 'forecast-sq-very-high',
            'VERY_HIGH_FLOOD', 'forecast-sq-very-high',
            'EX_HIGH', 'forecast-sq-ex-high',
            'EXCEPTIONALLY_HIGH', 'forecast-sq-ex-high',
            'EXCEPTIONALLY_HIGH_FLOOD', 'forecast-sq-ex-high',
            'forecast-sq-default'
          ],
          'icon-size': 1,
          'icon-offset': [0, 0],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
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
        if (port === 5000) return apiDailyHost;
        const _host = window.location.protocol === 'file:' ? 'localhost' : (window.location.hostname || 'localhost');
        return `http://${_host}:${port}`;
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

      // Storage tab state
      let ffdHistoryActiveTab = 'discharge'; // 'discharge' | 'storage' | 'maf'
      let ffdStorageChart = null;
      let ffdStorageFullscreenChart = null;
      let ffdStorageLastData = null;
      let ffdStorageDays = 7;

      // MAF tab state (River volume for Kotri)
      let ffdMAFChart = null;
      let ffdMAFFullscreenChart = null;
      let ffdMAFLastData = null;
      let ffdMAFSelection = 'monsoon-2026';

      const formatStorageCardDate = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const year = parts[0];
        const monthNum = parseInt(parts[1], 10);
        const dayNum = parseInt(parts[2], 10);
        const months = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];
        const monthName = months[monthNum - 1] || '';
        let suffix = 'th';
        if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
        else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
        else if (dayNum === 3 || dayNum === 23) suffix = 'rd';
        return `${dayNum}${suffix} ${monthName} ${year}`;
      };

      const getLastYearDateStr = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const year = parseInt(parts[0], 10) - 1;
        return `${year}-${parts[1]}-${parts[2]}`;
      };

      const formatStorageDayMonth = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const monthNum = parseInt(parts[1], 10);
        const dayNum = parseInt(parts[2], 10);
        const months = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];
        const monthName = months[monthNum - 1] || '';
        let suffix = 'th';
        if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
        else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
        else if (dayNum === 3 || dayNum === 23) suffix = 'rd';
        return `${dayNum}${suffix} ${monthName}`;
      };

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
        const selectEl = document.getElementById('ffd-history-status');
        const customOpt = document.getElementById('ffd-history-status-custom');
        
        if (selectEl && selectEl.tagName === 'SELECT') {
          if (text.startsWith('Showing: Last') && text.includes('days')) {
            const match = text.match(/Last (\d+) days/);
            if (match) {
              selectEl.value = match[1];
              if (customOpt) customOpt.style.display = 'none';
            }
          } else {
            if (customOpt) {
              customOpt.textContent = text;
              customOpt.value = 'custom';
              customOpt.style.display = 'block';
              selectEl.value = 'custom';
            }
          }
        } else if (selectEl) {
          selectEl.textContent = text;
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
        const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = shortMonths[dateObj.getMonth()];
        const year = String(dateObj.getFullYear()).slice(-2);
        return `${day}-${month}-${year}`;
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

      const renderFFDHistorySummary = (bundle, dailySituation = null) => {
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

        let cards = hasComparison ? [
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

        // Query daily situation data from SQLite if available and add to panel
        if (dailySituation) {
          const normName = ffdHistoryName.toLowerCase();
          const isDam = normName.includes('tarbela') || normName.includes('mangla') || normName.includes('chashma');
          
          if (!isDam) {
            let rows = [];
            if (dailySituation.barrages_discharge && dailySituation.barrages_discharge.length > 0) {
              rows = dailySituation.barrages_discharge;
            } else if (dailySituation.river_inflows && dailySituation.river_inflows.length > 0) {
              rows = dailySituation.river_inflows;
            } else if (dailySituation.reservoir_levels && dailySituation.reservoir_levels.length > 0) {
              rows = dailySituation.reservoir_levels;
            }

            if (rows.length > 0) {
              const latestData = rows.find(r => r.recorded_date === dailySituation.latest_date);
              if (latestData) {
                const isLvl = (dailySituation.reservoir_levels && dailySituation.reservoir_levels.length > 0);
                const unit = isLvl ? "ft" : "cusecs";
                
                let avg5Val = latestData.avg_last_5_years;
                let avg10Val = latestData.avg_last_10_years;

                if (!isLvl) {
                  if (avg5Val !== null && avg5Val !== undefined) avg5Val = avg5Val * 1000;
                  if (avg10Val !== null && avg10Val !== undefined) avg10Val = avg10Val * 1000;
                }

                const formatVal = (v) => (v !== null && v !== undefined) ? `${parseFloat(v).toLocaleString()} ${unit}` : 'N/A';

                const getTrendStyle = (val) => {
                  if (val === null || val === undefined) return { arrow: '', tone: 'neutral' };
                  const num = parseFloat(val);
                  if (num > 0) return { arrow: '▲', tone: 'up' };
                  if (num < 0) return { arrow: '▼', tone: 'down' };
                  return { arrow: '▶', tone: 'neutral' };
                };

                const curVal = latestData.today;

                const dbAvg5 = latestData.avg_last_5_years;
                const deltaAvg5 = (curVal && dbAvg5) ? ((curVal - dbAvg5) / dbAvg5) * 100 : null;
                const avg5Trend = getTrendStyle(deltaAvg5);

                const dbAvg10 = latestData.avg_last_10_years;
                const deltaAvg10 = (curVal && dbAvg10) ? ((curVal - dbAvg10) / dbAvg10) * 100 : null;
                const avg10Trend = getTrendStyle(deltaAvg10);

                cards.push({
                  label: '5-Year Average',
                  value: formatVal(avg5Val),
                  meta: deltaAvg5 !== null ? `${avg5Trend.arrow} ${Math.abs(deltaAvg5).toFixed(1)}%` : '',
                  tone: 'compare-inflow',
                  metaTone: avg5Trend.tone
                });

                cards.push({
                  label: '10-Year Average',
                  value: formatVal(avg10Val),
                  meta: deltaAvg10 !== null ? `${avg10Trend.arrow} ${Math.abs(deltaAvg10).toFixed(1)}%` : '',
                  tone: 'compare-outflow',
                  metaTone: avg10Trend.tone
                });
              }
            }
          }
        }

        summaryEl.innerHTML = cards.map(card => `
          <div class="ffd-history-card ${card.tone}">
            <span>${escapeFFDHistoryHTML(card.label)}</span>
            <strong>${escapeFFDHistoryHTML(card.value)}</strong>
            ${card.meta ? `<small class="${card.metaTone || ''}" ${card.metaTone ? 'style="font-weight: bold;"' : ''}>${escapeFFDHistoryHTML(card.meta)}</small>` : ''}
          </div>
        `).join('');

        summaryEl.style.gridTemplateColumns = `repeat(${cards.length}, 1fr)`;
      };

      // ================== STORAGE HISTORY FUNCTIONS ==================

      const fetchFFDStorageHistory = async (name, days, startDate, endDate) => {
        let url = `${ffdHistoryConfig.apiBase}/api/storage-history?name=${encodeURIComponent(name)}`;
        if (startDate && endDate) {
          url += `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
        } else {
          url += `&days=${days}`;
        }
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Storage API HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Storage API error');
        return data;
      };

      const renderFFDStorageSummary = (data) => {
        const summaryEl = document.getElementById('ffd-history-summary');
        if (!summaryEl || !data || !data.series || !data.series.length) return;

        const series = data.series;
        const latest = series[series.length - 1];
        const oldest = series[0];

        const fmtMaf = (v) => v != null ? `${Number(v).toFixed(2)} MAF` : 'N/A';

        // Change calculation
        const changeLabel = ffdStorageDays <= 7 ? 'Weekly Change' : ffdStorageDays <= 14 ? '14-Day Change' : 'Monthly Change';
        let changePct = null;
        if (oldest && latest && oldest.today != null && latest.today != null && oldest.today !== 0) {
          changePct = ((latest.today - oldest.today) / Math.abs(oldest.today)) * 100;
        }

        const changeArrow = changePct == null ? '▶' : changePct > 0 ? '▲' : changePct < 0 ? '▼' : '▶';
        const changeTone = changePct == null ? 'ffd-change-flat' : changePct > 0 ? 'ffd-change-up' : changePct < 0 ? 'ffd-change-down' : 'ffd-change-flat';
        const changeCard_tone = changePct != null && changePct < 0 ? 'storage-change negative' : 'storage-change';

        const changeVal = changePct != null
          ? `<span class="${changeTone}">${changeArrow} ${Math.abs(changePct).toFixed(1)}%</span>`
          : '<span class="ffd-change-flat">▶ —</span>';

        // Helper to format day-month for card ranges (e.g., 15th Jun)
        const formatDayMonth = (dateStr) => {
          if (!dateStr) return '';
          const parts = dateStr.split('-');
          if (parts.length !== 3) return dateStr;
          const monthNum = parseInt(parts[1], 10);
          const dayNum = parseInt(parts[2], 10);
          const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];
          const monthName = months[monthNum - 1] || '';
          let suffix = 'th';
          if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
          else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
          else if (dayNum === 3 || dayNum === 23) suffix = 'rd';
          return `${dayNum}${suffix} ${monthName}`;
        };

        const getWeekChangeCard = (label, startIndex, endIndex, toneClass) => {
          const len = series.length;
          if (startIndex < 0) startIndex = 0;
          if (endIndex >= len) endIndex = len - 1;
          if (startIndex >= endIndex) return null;

          const startVal = series[startIndex].today;
          const endVal = series[endIndex].today;

          if (startVal != null && endVal != null && startVal !== 0) {
            const pct = ((endVal - startVal) / Math.abs(startVal)) * 100;
            const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '▶';
            const tone = pct > 0 ? 'ffd-change-up' : pct < 0 ? 'ffd-change-down' : 'ffd-change-flat';
            const cardTone = pct < 0 ? `${toneClass} negative` : toneClass;
            const startLabelDate = formatDayMonth(series[startIndex].date);
            const endLabelDate = formatDayMonth(series[endIndex].date);
            return {
              tone: cardTone,
              label: label,
              valueHtml: `<span class="${tone}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`,
              meta: `${startLabelDate} to ${endLabelDate}`
            };
          }
          return null;
        };

        // Conditional Weekly Change card for 14-day view
        let weeklyCard = null;
        if (ffdStorageDays === 14 && series.length >= 8) {
          const wkOldest = series[series.length - 8];
          if (wkOldest && wkOldest.today != null && latest.today != null && wkOldest.today !== 0) {
            const wkPct = ((latest.today - wkOldest.today) / Math.abs(wkOldest.today)) * 100;
            const wkArrow = wkPct > 0 ? '▲' : wkPct < 0 ? '▼' : '▶';
            const wkTone = wkPct > 0 ? 'ffd-change-up' : wkPct < 0 ? 'ffd-change-down' : 'ffd-change-flat';
            const wkCardTone = wkPct < 0 ? 'storage-change negative' : 'storage-change';
            weeklyCard = {
              tone: wkCardTone,
              label: 'Last Week Change',
              valueHtml: `<span class="${wkTone}">${wkArrow} ${Math.abs(wkPct).toFixed(1)}%</span>`,
              meta: `${formatDayMonth(wkOldest.date)} to ${formatDayMonth(latest.date)}`
            };
          }
        }

        const cards = [];

        if (ffdStorageDays === 30) {
          // Add Week 1-4 Change cards instead of today/comparison
          const wk1Card = getWeekChangeCard('Week 1 Change', series.length - 30, series.length - 23, 'storage-week1');
          const wk2Card = getWeekChangeCard('Week 2 Change', series.length - 23, series.length - 16, 'storage-week2');
          const wk3Card = getWeekChangeCard('Week 3 Change', series.length - 16, series.length - 9, 'storage-week3');
          const wk4Card = getWeekChangeCard('Week 4 Change', series.length - 9, series.length - 1, 'storage-week4');

          if (wk1Card) cards.push(wk1Card);
          if (wk2Card) cards.push(wk2Card);
          if (wk3Card) cards.push(wk3Card);
          if (wk4Card) cards.push(wk4Card);
        } else {
          // Standard Today + Comparison cards
          cards.push(
            { tone: 'storage-today',    label: `Today (${formatStorageCardDate(latest.date)})`, value: fmtMaf(latest.today),              meta: '' },
            { tone: 'storage-lastyear', label: `Last Year (${formatStorageCardDate(getLastYearDateStr(latest.date))})`, value: fmtMaf(latest.last_year),          meta: '' },
            { tone: 'storage-avg5',     label: `Avg 5 Years (on ${formatStorageDayMonth(latest.date)})`,             value: fmtMaf(latest.avg_last_5_years),   meta: '' },
            { tone: 'storage-avg10',    label: `Avg 10 Years (on ${formatStorageDayMonth(latest.date)})`,            value: fmtMaf(latest.avg_last_10_years),  meta: '' }
          );

          if (weeklyCard) {
            cards.push(weeklyCard);
          }
        }

        cards.push({
          tone: changeCard_tone,
          label: changeLabel,
          valueHtml: changeVal,
          meta: `${series.length} days`
        });

        summaryEl.innerHTML = cards.map(card => `
          <div class="ffd-history-card ${card.tone}">
            <span>${escapeFFDHistoryHTML(card.label)}</span>
            <strong>${card.valueHtml || escapeFFDHistoryHTML(card.value || '')}</strong>
            ${card.meta ? `<small>${escapeFFDHistoryHTML(card.meta)}</small>` : ''}
          </div>
        `).join('');

        // Responsive columns: 2-col on mobile, 3-col on tablet, N-col on desktop
        const colCount = window.innerWidth <= 768 ? 2 : (window.innerWidth <= 1100 ? 3 : cards.length);
        summaryEl.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;
      };

      const renderFFDStorageChart = (canvasId, data, isFullscreen = false) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart || !data || !data.series || !data.series.length) return;

        // Destroy previous
        if (isFullscreen) {
          if (ffdStorageFullscreenChart) { ffdStorageFullscreenChart.destroy(); ffdStorageFullscreenChart = null; }
        } else {
          if (ffdStorageChart) { ffdStorageChart.destroy(); ffdStorageChart = null; }
        }

        const series = data.series;
        const labels = series.map(p => p.date);
        const todayData = series.map(p => p.today);
        const lastYearData = series.map(p => p.last_year);
        const avg5Data = series.map(p => p.avg_last_5_years);
        const avg10Data = series.map(p => p.avg_last_10_years);
        const maxMaf = data.max_maf;
        const capacityData = series.map(() => maxMaf);

        // Custom plugin: draw value labels above each visible circle point
        const pointLabelPlugin = {
          id: 'storagePointLabels',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.font = `bold ${isFullscreen ? 11 : 9}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            // Target datasets: Today (0), Last Year (1), Avg 5y (2), Avg 10y (3)
            const targetIndices = [0, 1, 2, 3];
            const colors = ['#e0f2fe', '#fef3c7', '#f3e8ff', '#fce7f3'];

            targetIndices.forEach((dsIndex) => {
              const ds = chart.data.datasets[dsIndex];
              if (!ds) return;
              const meta = chart.getDatasetMeta(dsIndex);
              // Only draw if the dataset is visible (not hidden) in the chart
              if (!chart.isDatasetVisible(dsIndex)) return;

              ctx.fillStyle = colors[dsIndex] || '#e2e8f0';

              meta.data.forEach((pt, i) => {
                const val = ds.data[i];
                if (val == null) return;
                // Ensure the point coordinates are valid numbers and not NaN/uncomputed
                if (!pt || pt.x == null || pt.y == null || isNaN(pt.x) || isNaN(pt.y)) return;
                const formatted = Number(val).toFixed(2);
                ctx.fillText(formatted, pt.x, pt.y - 5);
              });
            });

            ctx.restore();
          }
        };

        // Gradient fill for today's storage
        const ctx2d = canvas.getContext('2d');
        const gradient = ctx2d.createLinearGradient(0, 0, 0, canvas.offsetHeight || 200);
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
        gradient.addColorStop(0.6, 'rgba(6, 182, 212, 0.12)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0.02)');

        const datasets = [
          {
            label: `Storage (Today)`,
            data: todayData,
            borderColor: '#06b6d4',
            backgroundColor: gradient,
            fill: 'origin',
            tension: 0.38,
            spanGaps: true,
            pointRadius: isFullscreen ? 5 : 4,
            pointHoverRadius: isFullscreen ? 7 : 6,
            pointBackgroundColor: '#0c1825',
            pointBorderColor: '#06b6d4',
            pointBorderWidth: 2,
            borderWidth: isFullscreen ? 3 : 2.5,
            order: 1,
          },
          {
            label: 'Last Year',
            data: lastYearData,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.06)',
            fill: false,
            tension: 0.38,
            spanGaps: true,
            pointRadius: isFullscreen ? 3 : 2,
            pointHoverRadius: isFullscreen ? 5 : 4,
            borderWidth: isFullscreen ? 2 : 1.8,
            borderDash: [6, 4],
            hidden: true,
            order: 2,
          },
          {
            label: 'Avg 5 Years',
            data: avg5Data,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.06)',
            fill: false,
            tension: 0.38,
            spanGaps: true,
            pointRadius: isFullscreen ? 3 : 2,
            pointHoverRadius: isFullscreen ? 5 : 4,
            borderWidth: isFullscreen ? 2 : 1.8,
            borderDash: [4, 4],
            hidden: true,
            order: 3,
          },
          {
            label: 'Avg 10 Years',
            data: avg10Data,
            borderColor: '#ec4899',
            backgroundColor: 'rgba(236, 72, 153, 0.06)',
            fill: false,
            tension: 0.38,
            spanGaps: true,
            pointRadius: isFullscreen ? 3 : 2,
            pointHoverRadius: isFullscreen ? 5 : 4,
            borderWidth: isFullscreen ? 2 : 1.8,
            borderDash: [3, 5],
            hidden: true,
            order: 4,
          }
        ];

        if (maxMaf != null) {
          datasets.push({
            label: `Capacity (${maxMaf} MAF)`,
            data: capacityData,
            borderColor: '#ef4444',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0,
            spanGaps: true,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: isFullscreen ? 2.5 : 2,
            borderDash: [8, 5],
            hidden: true,
            order: 5,
          });
        }

        const chartInstance = new Chart(canvas, {
          type: 'line',
          plugins: [pointLabelPlugin],
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 800,
              easing: 'easeInOutCubic',
            },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: {
                labels: {
                  color: '#e2e8f0',
                  boxWidth: 14,
                  usePointStyle: true,
                  font: { size: isFullscreen ? 12 : 10 }
                },
                onClick(e, legendItem, legend) {
                  const index = legendItem.datasetIndex;
                  const meta = legend.chart.getDatasetMeta(index);
                  meta.hidden = !meta.hidden;
                  legend.chart.update();
                }
              },
              tooltip: {
                callbacks: {
                  title: (items) => items[0]?.label ? items[0].label : '',
                  label: (ctx) => {
                    if (ctx.parsed.y == null) return null;
                    const val = Number(ctx.parsed.y);
                    const label = ctx.dataset.label || '';
                    const isToday = label.includes('Today');
                    const mainLine = `${label}: ${val.toFixed(2)} MAF`;

                    if (!isToday || !ctx.dataset.data || ctx.dataIndex <= 0) {
                      return mainLine;
                    }

                    let prevVal = null;
                    for (let k = ctx.dataIndex - 1; k >= 0; k--) {
                      const v = ctx.dataset.data[k];
                      if (v != null && !isNaN(v)) {
                        prevVal = Number(v);
                        break;
                      }
                    }

                    if (prevVal != null && prevVal > 0) {
                      const pct = ((val - prevVal) / prevVal) * 100;
                      if (!isNaN(pct)) {
                        const sign = pct > 0 ? '+' : '';
                        return [
                          mainLine,
                          `%change yesterday: ${sign}${pct.toFixed(1)}%`
                        ];
                      }
                    }

                    return mainLine;
                  }
                },
                backgroundColor: 'rgba(6, 24, 44, 0.95)',
                borderColor: 'rgba(6, 182, 212, 0.4)',
                borderWidth: 1,
                titleColor: '#22d3ee',
                bodyColor: '#f8fafc',
                padding: 10,
                boxPadding: 4,
              },
              zoom: isFullscreen ? {
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                pan: { enabled: true, mode: 'x' }
              } : false
            },
            scales: {
              x: {
                ticks: {
                  color: '#94a3b8',
                  maxTicksLimit: isFullscreen ? 14 : (window.innerWidth <= 480 ? 5 : 8),
                  autoSkip: true,
                  minRotation: 0,
                  maxRotation: 0,
                  font: { size: isFullscreen ? 11 : 9 },
                  callback: (val, idx) => {
                    const lbl = labels[val];
                    if (!lbl) return '';
                    const d = new Date(lbl);
                    return isNaN(d.getTime()) ? lbl : `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
                  }
                },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              },
              y: {
                ticks: {
                  color: '#94a3b8',
                  font: { size: isFullscreen ? 11 : 9 },
                  callback: (v) => `${Number(v).toFixed(1)} MAF`
                },
                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                title: { display: isFullscreen, text: 'Storage (MAF)', color: '#94a3b8', font: { size: 12 } }
              }
            }
          }
        });

        if (isFullscreen) ffdStorageFullscreenChart = chartInstance;
        else ffdStorageChart = chartInstance;
      };

      const loadFFDStorageData = async () => {
        if (!ffdHistoryName) return;
        const summaryEl = document.getElementById('ffd-history-summary');
        const chartEl = document.querySelector('.ffd-history-chart');
        if (summaryEl) summaryEl.innerHTML = '<div class="ffd-history-empty">Loading storage data…</div>';

        try {
          const data = await fetchFFDStorageHistory(ffdHistoryName, ffdStorageDays);
          ffdStorageLastData = data;

          if (!data.series || !data.series.length) {
            if (summaryEl) summaryEl.innerHTML = '<div class="ffd-history-empty">No storage data available.</div>';
            return;
          }

          // Add storage-mode class to chart container
          if (chartEl) chartEl.classList.add('storage-mode');

          renderFFDStorageSummary(data);
          renderFFDStorageChart('ffd-history-canvas', data);
        } catch (err) {
          console.warn('Storage history fetch failed:', err);
          if (summaryEl) summaryEl.innerHTML = '<div class="ffd-history-empty">Storage data unavailable.</div>';
        }
      };

      // ================== END STORAGE HISTORY FUNCTIONS ==================

      // ================== MAF (RIVER VOLUME) FUNCTIONS ==================

      const MAF_CUBIC_FEET_DIVISOR = 43560000000; // 1 MAF = 43,560,000,000 cu ft
      const CUSECS_PER_DAY_TO_MAF = 86400 / 43560000000; // ≈ 1.983471e-6 MAF per cusec-day

      const getMAFRangeForOption = (optionValue) => {
        const now = new Date();
        const currentYear = now.getFullYear();

        if (optionValue && optionValue.startsWith('monsoon-')) {
          const year = parseInt(optionValue.split('-')[1], 10);
          const start = new Date(year, 5, 1); // 1st June (0-indexed month 5)
          let end = new Date(year, 8, 30, 23, 59, 59); // 30th September
          if (year === currentYear && now < end) {
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          }
          return { start, end, groupBy: 'month', label: `Monsoon ${year}`, isMonsoon: true, monsoonYear: year };
        }

        if (optionValue === '7') {
          const start = new Date(now.getTime() - 7 * 86400000);
          return { start, end: now, groupBy: 'day', label: 'Last 7 days' };
        }
        if (optionValue === '14') {
          const start = new Date(now.getTime() - 14 * 86400000);
          return { start, end: now, groupBy: 'day', label: 'Last 14 days' };
        }
        if (optionValue === '30') {
          const start = new Date(now.getTime() - 30 * 86400000);
          return { start, end: now, groupBy: 'day', label: 'Last 30 days' };
        }
        if (optionValue === 'month') {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          return { start, end, groupBy: 'day', label: 'Last month' };
        }
        if (optionValue === 'year') {
          const start = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          const end = now;
          return { start, end, groupBy: 'month', label: 'Last year' };
        }

        return { start: new Date(2026, 5, 1), end: now, groupBy: 'month', label: 'Monsoon 2026', isMonsoon: true, monsoonYear: 2026 };
      };

      const populateMAFDropdownOptions = () => {
        const selectEl = document.getElementById('ffd-history-status');
        if (!selectEl) return;

        const options = [
          { value: 'monsoon-2026', text: 'Showing: Monsoon 2026' },
          { value: '7', text: 'Showing: Last 7 days' },
          { value: '14', text: 'Showing: Last 14 days' },
          { value: '30', text: 'Showing: Last 30 days' },
          { value: 'month', text: 'Showing: Last month' },
          { value: 'year', text: 'Showing: Last year' },
        ];

        for (let y = 2025; y >= 2014; y--) {
          options.push({ value: `monsoon-${y}`, text: `Showing: Monsoon ${y}` });
        }

        selectEl.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('') +
          '<option value="custom" id="ffd-history-status-custom" style="display: none;"></option>';

        selectEl.value = ffdMAFSelection || 'monsoon-2026';
      };

      const restoreStandardDropdownOptions = () => {
        const selectEl = document.getElementById('ffd-history-status');
        if (!selectEl) return;

        selectEl.innerHTML = `
          <option value="7">Showing: Last 7 days</option>
          <option value="14">Showing: Last 14 days</option>
          <option value="30">Showing: Last 30 days</option>
          <option value="custom" id="ffd-history-status-custom" style="display: none;"></option>
        `;
        selectEl.value = String(ffdHistoryConfig.defaultDays || '7');
      };

      const computeMAFData = (outflowPoints, rangeInfo) => {
        if (!Array.isArray(outflowPoints) || outflowPoints.length === 0) {
          return { labels: [], values: [], totalMaf: 0, peakMaf: 0, peakLabel: '', meanDailyMaf: 0, count: 0, daysWithData: 0, barMeta: [], rangeInfo };
        }

        const groupBy = rangeInfo.groupBy || 'month';
        const isMonsoon = rangeInfo.isMonsoon || false;
        const monsoonYear = rangeInfo.monsoonYear || 2026;

        // Group points by day (YYYY-MM-DD key)
        const dailyBuckets = new Map();

        outflowPoints.forEach(pt => {
          if (!pt.date || isNaN(pt.date.getTime()) || pt.y === null || pt.y === undefined || isNaN(pt.y)) return;
          const y = pt.date.getFullYear();
          const m = String(pt.date.getMonth() + 1).padStart(2, '0');
          const d = String(pt.date.getDate()).padStart(2, '0');
          const key = `${y}-${m}-${d}`;

          if (!dailyBuckets.has(key)) {
            dailyBuckets.set(key, { date: pt.date, readings: [] });
          }
          dailyBuckets.get(key).readings.push(pt.y);
        });

        // Compute daily MAF for each day with readings
        const dailyMafs = new Map();
        dailyBuckets.forEach((bucket, dateKey) => {
          const avgQ = bucket.readings.reduce((sum, v) => sum + v, 0) / bucket.readings.length;
          const maf = avgQ * CUSECS_PER_DAY_TO_MAF;
          dailyMafs.set(dateKey, { avgQ, maf, date: bucket.date, count: bucket.readings.length });
        });

        const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        let labels = [];
        let values = [];
        let barMeta = [];

        if (groupBy === 'month' && isMonsoon) {
          // Exactly 4 bars: June, July, August, September
          const monsoonMonths = [5, 6, 7, 8]; // 0-indexed: Jun, Jul, Aug, Sep
          const monthTitles = ['June', 'July', 'August', 'September'];

          monsoonMonths.forEach((mIdx, i) => {
            let monthMafTotal = 0;
            let monthReadingsCount = 0;
            let totalQSum = 0;
            let daysWithData = 0;

            dailyMafs.forEach((val, dateKey) => {
              const [yr, mo] = dateKey.split('-').map(n => parseInt(n, 10));
              if (yr === monsoonYear && mo === mIdx + 1) {
                monthMafTotal += val.maf;
                totalQSum += val.avgQ;
                daysWithData++;
                monthReadingsCount += val.count;
              }
            });

            labels.push(monthTitles[i]);
            values.push(monthMafTotal);
            barMeta.push({
              avgQ: daysWithData > 0 ? totalQSum / daysWithData : 0,
              daysCount: daysWithData,
              recordsCount: monthReadingsCount,
              label: `${monthTitles[i]} ${monsoonYear}`
            });
          });
        } else if (groupBy === 'month') {
          // Monthly aggregation across the range
          const monthsMap = new Map();

          dailyMafs.forEach((val, dateKey) => {
            const [yr, mo] = dateKey.split('-').map(n => parseInt(n, 10));
            const mKey = `${yr}-${String(mo).padStart(2, '0')}`;
            if (!monthsMap.has(mKey)) {
              monthsMap.set(mKey, { yr, mo, mafTotal: 0, totalQ: 0, daysCount: 0, records: 0 });
            }
            const mObj = monthsMap.get(mKey);
            mObj.mafTotal += val.maf;
            mObj.totalQ += val.avgQ;
            mObj.daysCount += 1;
            mObj.records += val.count;
          });

          const sortedMonths = Array.from(monthsMap.keys()).sort();
          sortedMonths.forEach(mKey => {
            const mObj = monthsMap.get(mKey);
            const labelStr = `${shortMonthNames[mObj.mo - 1]} ${mObj.yr}`;
            labels.push(labelStr);
            values.push(mObj.mafTotal);
            barMeta.push({
              avgQ: mObj.daysCount > 0 ? mObj.totalQ / mObj.daysCount : 0,
              daysCount: mObj.daysCount,
              recordsCount: mObj.records,
              label: labelStr
            });
          });
        } else {
          // Daily aggregation
          const sortedDays = Array.from(dailyMafs.keys()).sort();
          sortedDays.forEach(dateKey => {
            const dObj = dailyMafs.get(dateKey);
            const dt = dObj.date;
            const labelStr = `${dt.getDate()} ${shortMonthNames[dt.getMonth()]}`;
            labels.push(labelStr);
            values.push(dObj.maf);
            barMeta.push({
              avgQ: dObj.avgQ,
              daysCount: 1,
              recordsCount: dObj.count,
              label: `${dt.getDate()} ${shortMonthNames[dt.getMonth()]} ${dt.getFullYear()}`
            });
          });
        }

        const totalMaf = values.reduce((sum, v) => sum + v, 0);
        let peakMaf = 0;
        let peakLabel = '';
        values.forEach((v, i) => {
          if (v > peakMaf) {
            peakMaf = v;
            peakLabel = barMeta[i]?.label || labels[i] || '';
          }
        });

        const totalDays = dailyMafs.size || 1;
        const meanDailyMaf = totalMaf / totalDays;

        return {
          labels,
          values,
          totalMaf,
          peakMaf,
          peakLabel,
          meanDailyMaf,
          count: outflowPoints.length,
          daysWithData: totalDays,
          barMeta,
          rangeInfo
        };
      };

      const renderMAFSummary = (data) => {
        const summaryEl = document.getElementById('ffd-history-summary');
        if (!summaryEl || !data) return;

        const fmtMaf = (v) => {
          if (v == null || isNaN(v)) return '0.00 MAF';
          if (v >= 10) return `${Number(v).toFixed(1)} MAF`;
          if (v >= 1) return `${Number(v).toFixed(2)} MAF`;
          if (v >= 0.01) return `${Number(v).toFixed(3)} MAF`;
          return `${Number(v).toFixed(4)} MAF`;
        };

        const cards = [
          {
            tone: 'maf-total',
            label: 'Total Volume',
            value: fmtMaf(data.totalMaf),
            meta: data.rangeInfo?.label || ''
          },
          {
            tone: 'maf-peak',
            label: 'Peak Volume',
            value: fmtMaf(data.peakMaf),
            meta: data.peakLabel ? `${data.peakLabel}` : ''
          },
          {
            tone: 'maf-mean',
            label: 'Daily Mean',
            value: fmtMaf(data.meanDailyMaf),
            meta: `Over ${data.daysWithData || 0} active days`
          },
          {
            tone: 'maf-records',
            label: 'Telemetry Records',
            value: `${(data.count || 0).toLocaleString()}`,
            meta: 'Outflow discharge data'
          }
        ];

        summaryEl.innerHTML = cards.map(card => `
          <div class="ffd-history-card ${card.tone}">
            <span>${escapeFFDHistoryHTML(card.label)}</span>
            <strong>${card.valueHtml || escapeFFDHistoryHTML(card.value || '')}</strong>
            ${card.meta ? `<small>${escapeFFDHistoryHTML(card.meta)}</small>` : ''}
          </div>
        `).join('');

        const colCount = window.innerWidth <= 768 ? 2 : (window.innerWidth <= 1100 ? 2 : cards.length);
        summaryEl.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;
      };

      const renderMAFBarChart = (canvasId, mafData, isFullscreen = false) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart || !mafData) return;

        if (isFullscreen) {
          if (ffdMAFFullscreenChart) { ffdMAFFullscreenChart.destroy(); ffdMAFFullscreenChart = null; }
        } else {
          if (ffdMAFChart) { ffdMAFChart.destroy(); ffdMAFChart = null; }
        }

        const labels = mafData.labels || [];
        const values = mafData.values || [];
        const maxVal = Math.max(...values, 0);

        // Custom plugin to draw MAF values on top of bars with strict collision prevention
        const mafBarLabelPlugin = {
          id: 'mafBarLabels',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.font = `bold ${isFullscreen ? 11 : 9}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#f8fafc';

            const meta = chart.getDatasetMeta(0);
            if (!meta || !chart.isDatasetVisible(0)) {
              ctx.restore();
              return;
            }

            let lastDrawnRightX = -Infinity;

            meta.data.forEach((bar, index) => {
              const val = chart.data.datasets[0].data[index];
              if (val === null || val === undefined || isNaN(val)) return;
              if (!bar || bar.x === null || bar.y === null || isNaN(bar.x) || isNaN(bar.y)) return;

              let formatted;
              if (val === 0) formatted = '0.00';
              else if (val >= 10) formatted = Number(val).toFixed(1);
              else if (val >= 1) formatted = Number(val).toFixed(2);
              else if (val >= 0.01) formatted = Number(val).toFixed(3);
              else formatted = Number(val).toFixed(4);

              // Don't draw text if value is 0 or near-0 and there are many bars (> 10)
              if (val <= 0.0001 && labels.length > 10) return;

              // Collision Detection: measure text width to prevent overlapping/jumbling
              const textWidth = ctx.measureText(formatted).width;
              const leftEdge = bar.x - textWidth / 2;
              const rightEdge = bar.x + textWidth / 2;

              // Only draw if there is at least 8px space from the previous label, or if it's the peak bar
              const isPeak = val === maxVal && val > 0;
              if (!isPeak && leftEdge < lastDrawnRightX + 8) {
                return; // Skip overlapping label
              }

              const yPos = Math.min(bar.y - 4, chart.chartArea.bottom - 12);
              ctx.fillText(formatted, bar.x, yPos);
              lastDrawnRightX = rightEdge;
            });

            ctx.restore();
          }
        };

        const chartInstance = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Volume (MAF)',
                data: values,
                backgroundColor: (context) => {
                  const chart = context.chart;
                  const { ctx, chartArea } = chart;
                  if (!chartArea) return 'rgba(56, 189, 248, 0.85)';
                  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                  gradient.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
                  gradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.85)');
                  gradient.addColorStop(1, 'rgba(125, 211, 252, 1)');
                  return gradient;
                },
                hoverBackgroundColor: (context) => {
                  const chart = context.chart;
                  const { ctx, chartArea } = chart;
                  if (!chartArea) return 'rgba(125, 211, 252, 1)';
                  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.6)');
                  gradient.addColorStop(1, 'rgba(186, 230, 253, 1)');
                  return gradient;
                },
                borderColor: '#38bdf8',
                borderWidth: { top: 2, left: 1, right: 1, bottom: 0 },
                borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: 'bottom',
                barPercentage: labels.length > 20 ? 0.9 : (labels.length > 10 ? 0.75 : 0.55),
                categoryPercentage: 0.85,
                minBarLength: 12 // Keeps small / near-zero values visibly scaled and readable
              }
            ]
          },
          plugins: [mafBarLabelPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 900,
              easing: 'easeOutQuart'
            },
            interaction: {
              intersect: false,
              mode: 'index'
            },
            plugins: {
              legend: {
                display: true,
                labels: {
                  color: '#e2e8f0',
                  boxWidth: 14,
                  usePointStyle: true,
                  font: { size: isFullscreen ? 12 : 11 }
                }
              },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    if (!items || !items.length) return '';
                    const idx = items[0].dataIndex;
                    return mafData.barMeta?.[idx]?.label || items[0].label || '';
                  },
                  label: (context) => {
                    const val = Number(context.parsed.y);
                    let formatted = val >= 1 ? val.toFixed(3) : val.toFixed(4);
                    return `Volume: ${formatted} MAF`;
                  },
                  afterLabel: (context) => {
                    const idx = context.dataIndex;
                    const meta = mafData.barMeta?.[idx];
                    if (!meta) return '';
                    const parts = [];
                    if (meta.avgQ) parts.push(`Avg Discharge: ${Math.round(meta.avgQ).toLocaleString()} cusecs`);
                    if (meta.daysCount && meta.daysCount > 1) parts.push(`Active Days: ${meta.daysCount}`);
                    if (meta.recordsCount) parts.push(`Telemetry Readings: ${meta.recordsCount}`);
                    return parts.join('\n');
                  }
                },
                backgroundColor: 'rgba(6, 24, 44, 0.95)',
                borderColor: 'rgba(56, 189, 248, 0.5)',
                borderWidth: 1,
                titleColor: '#38bdf8',
                bodyColor: '#f8fafc',
                padding: 10,
                boxPadding: 4,
              },
              zoom: isFullscreen ? {
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                pan: { enabled: true, mode: 'x' }
              } : false
            },
            scales: {
              x: {
                ticks: {
                  color: '#cbd5f5',
                  font: { size: isFullscreen ? 11 : (labels.length > 15 ? 8 : 10), weight: '600' },
                  maxRotation: labels.length > 15 ? 45 : 0,
                  minRotation: 0,
                  autoSkip: false
                },
                grid: { display: false }
              },
              y: {
                beginAtZero: true,
                suggestedMax: maxVal > 0 ? maxVal * 1.18 : 0.05,
                ticks: {
                  color: '#cbd5f5',
                  font: { size: isFullscreen ? 11 : 9 },
                  callback: (v) => {
                    const num = Number(v);
                    if (maxVal < 0.1) return `${num.toFixed(3)} MAF`;
                    if (maxVal < 1) return `${num.toFixed(2)} MAF`;
                    return `${num.toFixed(1)} MAF`;
                  }
                },
                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                title: {
                  display: isFullscreen,
                  text: 'Volume (Million Acre-Feet)',
                  color: '#94a3b8',
                  font: { size: 12 }
                }
              }
            }
          }
        });

        if (isFullscreen) ffdMAFFullscreenChart = chartInstance;
        else ffdMAFChart = chartInstance;
      };

      const loadMAFData = async (isCustomDateRange = false) => {
        if (!ffdHistoryName) return;
        const summaryEl = document.getElementById('ffd-history-summary');
        const chartEl = document.querySelector('.ffd-history-chart');
        if (summaryEl) summaryEl.innerHTML = '<div class="ffd-history-empty">Computing MAF volume…</div>';

        try {
          let rangeInfo;
          const startInput = document.getElementById('ffd-history-start');
          const endInput = document.getElementById('ffd-history-end');

          if (isCustomDateRange && startInput && endInput && startInput.value && endInput.value) {
            const start = new Date(startInput.value);
            const end = new Date(endInput.value);
            end.setHours(23, 59, 59, 999);
            const diffDays = Math.ceil((end - start) / 86400000);
            const groupBy = diffDays > 60 ? 'month' : 'day';
            rangeInfo = {
              start,
              end,
              groupBy,
              label: `${formatFFDHistoryDateInput(start)} to ${formatFFDHistoryDateInput(end)}`
            };
            setFFDHistoryStatus(`Showing: ${rangeInfo.label}`);
          } else {
            rangeInfo = getMAFRangeForOption(ffdMAFSelection);
          }

          const series = await fetchFFDHistorySeries({
            name: ffdHistoryName,
            range: { start: rangeInfo.start, end: rangeInfo.end }
          });

          const outflowPoints = series.outflow || [];
          const mafData = computeMAFData(outflowPoints, rangeInfo);
          ffdMAFLastData = mafData;

          if (chartEl) chartEl.classList.add('maf-mode');

          renderMAFSummary(mafData);
          renderMAFBarChart('ffd-history-canvas', mafData);
        } catch (err) {
          console.warn('MAF computation failed:', err);
          if (summaryEl) summaryEl.innerHTML = '<div class="ffd-history-empty">MAF data unavailable.</div>';
        }
      };

      // ================== END MAF FUNCTIONS ==================

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
                    const val = Number(context.parsed.y);
                    const label = context.dataset.label || '';
                    const detail = context.dataset.historyTooltips?.[context.dataIndex];
                    const suffix = detail ? ` (${detail})` : '';
                    return `${label}: ${val.toLocaleString()} cusecs${suffix}`;
                  }
                },
                backgroundColor: 'rgba(6, 24, 44, 0.95)',
                borderColor: 'rgba(56, 189, 248, 0.4)',
                borderWidth: 1,
                titleColor: '#38bdf8',
                bodyColor: '#f8fafc',
                padding: 10,
                boxPadding: 4,
              },
              zoom: isFullscreen ? {
                zoom: {
                  wheel: {
                    enabled: true,
                  },
                  pinch: {
                    enabled: true
                  },
                  mode: 'x',
                },
                pan: {
                  enabled: true,
                  mode: 'x',
                }
              } : false
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

          let dailySituation = null;
          try {
            dailySituation = await fetchDailySituation(ffdHistoryName);
          } catch (e) {
            console.warn('SQLite daily situation fetch failed:', e);
          }

          renderFFDHistoryChart('ffd-history-canvas', chartBundle);
          renderFFDHistorySummary(chartBundle, dailySituation);
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
        const storageToggleBtn = document.getElementById('ffd-storage-toggle');
        let mafToggleBtn = document.getElementById('ffd-maf-toggle');
        if (!mafToggleBtn && panel) {
          const headerActions = panel.querySelector('.ffd-history-header-actions');
          const dateToggle = document.getElementById('ffd-history-date-toggle');
          if (headerActions) {
            mafToggleBtn = document.createElement('button');
            mafToggleBtn.id = 'ffd-maf-toggle';
            mafToggleBtn.className = 'ffd-maf-toggle';
            mafToggleBtn.title = 'River MAF (Million Acre-Feet) View';
            mafToggleBtn.style.display = 'none';
            mafToggleBtn.textContent = 'R';
            if (dateToggle) {
              headerActions.insertBefore(mafToggleBtn, dateToggle);
            } else {
              headerActions.appendChild(mafToggleBtn);
            }
          }
        }

        // ---- Tab switching logic ----
        const switchToDischargeTab = async () => {
          ffdHistoryActiveTab = 'discharge';
          panel.classList.remove('storage-mode', 'maf-mode');
          if (storageToggleBtn) storageToggleBtn.classList.remove('active');
          if (mafToggleBtn) mafToggleBtn.classList.remove('active');

          const compareContainer = panel.querySelector('.ffd-history-compare');
          if (compareContainer) compareContainer.style.display = '';

          const chartEl = panel.querySelector('.ffd-history-chart');
          if (chartEl) chartEl.classList.remove('storage-mode', 'maf-mode');

          // destroy other charts
          if (ffdStorageChart) { ffdStorageChart.destroy(); ffdStorageChart = null; }
          if (ffdMAFChart) { ffdMAFChart.destroy(); ffdMAFChart = null; }

          restoreStandardDropdownOptions();
          await loadFFDHistoryData();
        };

        const switchToStorageTab = async () => {
          ffdHistoryActiveTab = 'storage';
          panel.classList.remove('maf-mode');
          panel.classList.add('storage-mode');
          if (mafToggleBtn) mafToggleBtn.classList.remove('active');
          if (storageToggleBtn) storageToggleBtn.classList.add('active');

          const compareContainer = panel.querySelector('.ffd-history-compare');
          if (compareContainer) compareContainer.style.display = 'none';

          const chartEl = panel.querySelector('.ffd-history-chart');
          if (chartEl) {
            chartEl.classList.remove('maf-mode');
            chartEl.classList.add('storage-mode');
          }

          // destroy other charts
          if (ffdHistoryChart) { ffdHistoryChart.destroy(); ffdHistoryChart = null; }
          if (ffdMAFChart) { ffdMAFChart.destroy(); ffdMAFChart = null; }

          restoreStandardDropdownOptions();
          ffdStorageDays = 7;
          const statusSelectEl = document.getElementById('ffd-history-status');
          if (statusSelectEl) statusSelectEl.value = '7';
          await loadFFDStorageData();
        };

        const switchToMAFTab = async () => {
          ffdHistoryActiveTab = 'maf';
          panel.classList.remove('storage-mode');
          panel.classList.add('maf-mode');
          if (storageToggleBtn) storageToggleBtn.classList.remove('active');
          if (mafToggleBtn) mafToggleBtn.classList.add('active');

          const compareContainer = panel.querySelector('.ffd-history-compare');
          if (compareContainer) compareContainer.style.display = 'none';

          const chartEl = panel.querySelector('.ffd-history-chart');
          if (chartEl) {
            chartEl.classList.remove('storage-mode');
            chartEl.classList.add('maf-mode');
          }

          // destroy other charts
          if (ffdHistoryChart) { ffdHistoryChart.destroy(); ffdHistoryChart = null; }
          if (ffdStorageChart) { ffdStorageChart.destroy(); ffdStorageChart = null; }

          ffdMAFSelection = 'monsoon-2026';
          populateMAFDropdownOptions();
          await loadMAFData();
        };

        if (storageToggleBtn) {
          storageToggleBtn.addEventListener('click', async () => {
            if (ffdHistoryActiveTab === 'storage') {
              await switchToDischargeTab();
            } else {
              await switchToStorageTab();
            }
          });
        }

        if (mafToggleBtn) {
          mafToggleBtn.addEventListener('click', async () => {
            if (ffdHistoryActiveTab === 'maf') {
              await switchToDischargeTab();
            } else {
              await switchToMAFTab();
            }
          });
        }

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
          if (ffdStorageChart) {
            requestAnimationFrame(() => {
              ffdStorageChart.resize();
            });
          }
          if (ffdMAFChart) {
            requestAnimationFrame(() => {
              ffdMAFChart.resize();
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
        
        const statusSelectEl = document.getElementById('ffd-history-status');
        if (statusSelectEl && statusSelectEl.tagName === 'SELECT') {
          bindStopEvents(statusSelectEl);
          statusSelectEl.addEventListener('change', async (e) => {
            if (e.target.value === 'custom') return;
            if (ffdHistoryActiveTab === 'maf') {
              ffdMAFSelection = e.target.value;
              if (startInput) startInput.value = '';
              if (endInput) endInput.value = '';
              const customOpt = document.getElementById('ffd-history-status-custom');
              if (customOpt) customOpt.style.display = 'none';
              await loadMAFData();
            } else if (ffdHistoryActiveTab === 'storage') {
              const days = parseInt(e.target.value, 10);
              if (!isNaN(days)) {
                ffdStorageDays = days;
                await loadFFDStorageData();
              }
            } else {
              const days = parseInt(e.target.value, 10);
              if (!isNaN(days)) {
                ffdHistoryConfig.defaultDays = days;
                if (startInput) startInput.value = '';
                if (endInput) endInput.value = '';
                const customOpt = document.getElementById('ffd-history-status-custom');
                if (customOpt) customOpt.style.display = 'none';
                await loadFFDHistoryData();
              }
            }
          });
        }

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
          if (ffdStorageFullscreenChart) {
            ffdStorageFullscreenChart.destroy();
            ffdStorageFullscreenChart = null;
          }
          if (ffdMAFFullscreenChart) {
            ffdMAFFullscreenChart.destroy();
            ffdMAFFullscreenChart = null;
          }
        };

        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            panel.classList.remove('open');
            closeFullscreen();
            if (typeof ffdLegend === 'function') ffdLegend();
          });
        }

        // Observer to automatically sync ffdLegend visibility whenever history panel opens or closes
        if (!panel._ffdLegendObserverAdded) {
          const legendObserver = new MutationObserver(() => {
            if (typeof ffdLegend === 'function') ffdLegend();
          });
          legendObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
          panel._ffdLegendObserverAdded = true;
        }

        if (fullscreenBtn && fullscreenPanel) {
          fullscreenBtn.addEventListener('click', () => {
            const fullscreenTitle = document.querySelector('.ffd-history-fullscreen-title');

            if (ffdHistoryActiveTab === 'maf') {
              if (!ffdMAFLastData) {
                setFFDHistoryStatus('Load MAF data before fullscreen');
                return;
              }
              if (fullscreenTitle) {
                fullscreenTitle.textContent = `${ffdHistoryName || 'Kotri'} - MAF Volume Fullscreen`;
              }
              fullscreenPanel.classList.add('open');
              renderMAFBarChart('ffd-history-canvas-full', ffdMAFLastData, true);
            } else if (ffdHistoryActiveTab === 'storage') {
              if (!ffdStorageLastData) {
                return;
              }
              if (fullscreenTitle) {
                fullscreenTitle.textContent = `${ffdHistoryName || 'FFD'} - Storage Fullscreen`;
              }
              fullscreenPanel.classList.add('open');
              renderFFDStorageChart('ffd-history-canvas-full', ffdStorageLastData, true);
            } else {
              if (!ffdHistoryLastSeries) {
                setFFDHistoryStatus('Load history before fullscreen');
                return;
              }
              if (fullscreenTitle) {
                fullscreenTitle.textContent = `${ffdHistoryName || 'FFD'} - Fullscreen History`;
              }
              fullscreenPanel.classList.add('open');
              renderFFDHistoryChart('ffd-history-canvas-full', ffdHistoryLastSeries, true);
            }
          });
        }

        if (fullscreenClose) {
          fullscreenClose.addEventListener('click', () => {
            if (!fullscreenPanel) return;
            fullscreenPanel.classList.remove('open');
            if (ffdHistoryFullscreenChart) { ffdHistoryFullscreenChart.destroy(); ffdHistoryFullscreenChart = null; }
            if (ffdStorageFullscreenChart) { ffdStorageFullscreenChart.destroy(); ffdStorageFullscreenChart = null; }
            if (ffdMAFFullscreenChart) { ffdMAFFullscreenChart.destroy(); ffdMAFFullscreenChart = null; }
          });
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
            if (ffdHistoryActiveTab === 'maf') {
              await loadMAFData(true);
            } else {
              await loadFFDHistoryData();
            }
          });
        }

        if (resetBtn) {
          resetBtn.addEventListener('click', async () => {
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
            if (ffdHistoryActiveTab === 'maf') {
              ffdMAFSelection = 'monsoon-2026';
              const selectEl = document.getElementById('ffd-history-status');
              if (selectEl) selectEl.value = 'monsoon-2026';
              await loadMAFData();
            } else {
              await loadFFDHistoryData();
            }
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
            // Keep at least 60px of the panel header visible on screen
            const maxTop = Math.max(8, window.innerHeight - 60);

            panel.style.left = `${clamp(newLeft, 8, maxLeft)}px`;
            panel.style.top = `${clamp(newTop, 8, maxTop)}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            // Height is already frozen from pointerdown — don't touch it here
            event.preventDefault();
          };

          const onPointerUp = (event) => {
            if (!isDragging) return;
            if (pointerId !== null && event && event.pointerId !== undefined && event.pointerId !== pointerId) return;

            if (hasMoved) {
              panel.dataset.dragged = 'true';
            }
            // Clear ALL inline height/maxHeight — let CSS handle sizing
            panel.style.height = '';
            panel.style.maxHeight = '';
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
            panelHeight = Math.round(rect.height);
            // Freeze the panel at its exact current content height during drag
            // Using rounded integer to prevent sub-pixel accumulation across drags
            panel.style.height = panelHeight + 'px';
            panel.style.maxHeight = panelHeight + 'px';
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

        // Show/hide S storage toggle based on whether this is a reservoir dam
        const normName = String(name || props?.Name || props?.name || props?.station_name || props?.station || '').toLowerCase();
        const isReservoirDam = normName.includes('tarbela') || normName.includes('mangla') || normName.includes('chashma');
        const isKotri = normName.includes('kotri');

        const storageToggleBtn = document.getElementById('ffd-storage-toggle');
        if (storageToggleBtn) {
          storageToggleBtn.style.display = isReservoirDam ? 'inline-flex' : 'none';
        }

        let mafToggleBtn = document.getElementById('ffd-maf-toggle');
        if (!mafToggleBtn && panel) {
          const headerActions = panel.querySelector('.ffd-history-header-actions');
          const dateToggle = document.getElementById('ffd-history-date-toggle');
          if (headerActions) {
            mafToggleBtn = document.createElement('button');
            mafToggleBtn.id = 'ffd-maf-toggle';
            mafToggleBtn.className = 'ffd-maf-toggle';
            mafToggleBtn.title = 'River MAF (Million Acre-Feet) View';
            mafToggleBtn.textContent = 'R';
            if (dateToggle) {
              headerActions.insertBefore(mafToggleBtn, dateToggle);
            } else {
              headerActions.appendChild(mafToggleBtn);
            }
          }
        }
        if (mafToggleBtn) {
          mafToggleBtn.style.display = isKotri ? 'inline-flex' : 'none';
        }

        // Always reset to discharge tab when opening a new station
        if (ffdHistoryActiveTab === 'storage' || ffdHistoryActiveTab === 'maf') {
          ffdHistoryActiveTab = 'discharge';
          panel.classList.remove('storage-mode', 'maf-mode');
          if (storageToggleBtn) storageToggleBtn.classList.remove('active');
          if (mafToggleBtn) mafToggleBtn.classList.remove('active');
          const compareContainer = panel.querySelector('.ffd-history-compare');
          if (compareContainer) compareContainer.style.display = '';
          const chartEl = panel.querySelector('.ffd-history-chart');
          if (chartEl) chartEl.classList.remove('storage-mode', 'maf-mode');
          if (ffdStorageChart) { ffdStorageChart.destroy(); ffdStorageChart = null; }
          if (ffdMAFChart) { ffdMAFChart.destroy(); ffdMAFChart = null; }
          restoreStandardDropdownOptions();
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
        if (typeof ffdLegend === 'function') ffdLegend();

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
        // --- MOBILE/TABLET/LAPTOP SIDEBAR AUTO-CLOSE LOGIC ---
        if (window.innerWidth <= 1440) {
          const sidebar = document.getElementById('app-sidebar');
          if (sidebar && !sidebar.classList.contains('is-closed')) {
            const closeBtn = document.getElementById('sidebar-close');
            const toggleBtn = document.getElementById('sidebar-toggle');
            
            sidebar.classList.add('is-closed');
            
            if (toggleBtn) {
              toggleBtn.setAttribute('aria-expanded', 'false');
              toggleBtn.classList.remove('is-hidden');
            }
            if (closeBtn) {
              closeBtn.setAttribute('aria-expanded', 'false');
              closeBtn.style.display = 'none';
            }
          }
        }
        // ----------------------------------------  // ----------------------------------------

        const props = e.features[0].properties;

        // Format the From and Lag Hours information using flood routing data
        let fromAndLagHTML = '';
        
        let fromArray = [];
        let lagArray = [];
        
        // Manual overrides based on user mapping
        if (props.name && (props.name.toUpperCase() === 'KABUL' || props.name.toUpperCase() === 'NOWSHERA')) {
            fromArray = ['Charsadda', 'Warsak'];
            lagArray = ['6', '10'];
        } else if (props.from && props.lag_hours) {
          try {
            fromArray = Array.isArray(props.from) ? props.from : JSON.parse(props.from);
            lagArray = Array.isArray(props.lag_hours) ? props.lag_hours : JSON.parse(props.lag_hours);
          } catch (error) {
            console.warn('Error parsing from/lag_hours:', error);
            if (props.from && props.from.length > 0) {
              fromArray = [props.from];
              lagArray = [props.lag_hours || ''];
            }
          }
        }

        if (fromArray.length > 0) {
          fromAndLagHTML = `
                            <div class="upstream-section">
                                <h4 class="section-title">
                                    <i class="fas fa-arrow-up"></i> UPSTREAM STATIONS
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

        // Get status color for consistent theming
        const statusColor = getStatusColor(props.status);

        // Last update info removed per request
        const lastUpdateInfo = '';

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

        // Forecast (24h) section
        const forecastColor = getStatusColor(props.forecast_status);
        const formatForecastQuant = (quant) => {
          if (!quant) return '';
          return String(quant).replace(/\b\d+\b/g, (match) => {
            const num = parseFloat(match);
            return !isNaN(num) ? num.toLocaleString() : match;
          });
        };

        const forecastHTML = (props.forecast_status && props.forecast_status.trim() !== '' && props.forecast_status.toLowerCase() !== 'n/a') ? `
                            <div class="forecast-section">
                                <div class="forecast-grid">
                                    <div class="forecast-row">
                                        <span class="popup-meta-label">Forecast (24h):</span>
                                        <span class="forecast-badge" style="background-color: ${forecastColor};">
                                            ${escapePopupText(props.forecast_qual || props.forecast_status)}
                                        </span>
                                    </div>
                                    ${props.forecast_quant ? `
                                    <div class="forecast-quant-row">
                                        <span class="popup-meta-label">Est. Range:</span>
                                        <span class="forecast-quant-value">${escapePopupText(formatForecastQuant(props.forecast_quant))}</span>
                                    </div>` : ''}
                                </div>
                            </div>` : '';

        // Flood Limits
        const limits = window.getStationFloodLimits(props.name);
        const formatLimitVal = (val, unit) => {
            if (val === null || val === undefined) return '—';
            if (unit === 'lakh_cusecs') return `${val}L`;
            return val >= 1000 ? `${(val/1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : `${val}`;
        };

        const floodLimitsHTML = limits ? `
                            <div class="flood-limits-section">
                                <div class="flood-limits-header">
                                    <span class="limits-title"><i class="fas fa-shield-alt"></i> FLOOD LIMITS</span>
                                    <span class="limits-unit">${limits.unit === 'lakh_cusecs' ? '(L=Lakh Cusecs)' : '(Cusecs)'}</span>
                                </div>
                                <div class="flood-limits-grid">
                                    <div class="limit-pill limit-low" title="Low Flood">
                                        <span class="limit-tag">LOW</span>
                                        <span class="limit-val">${formatLimitVal(limits.low, limits.unit)}</span>
                                    </div>
                                    <div class="limit-pill limit-med" title="Medium Flood">
                                        <span class="limit-tag">MED</span>
                                        <span class="limit-val">${formatLimitVal(limits.medium, limits.unit)}</span>
                                    </div>
                                    <div class="limit-pill limit-high" title="High Flood">
                                        <span class="limit-tag">HIGH</span>
                                        <span class="limit-val">${formatLimitVal(limits.high, limits.unit)}</span>
                                    </div>
                                    <div class="limit-pill limit-vhigh" title="Very High Flood">
                                        <span class="limit-tag">V.HIGH</span>
                                        <span class="limit-val">${formatLimitVal(limits.veryHigh, limits.unit)}</span>
                                    </div>
                                    <div class="limit-pill limit-exhigh" title="Exceptionally High Flood">
                                        <span class="limit-tag">EX.HIGH</span>
                                        <span class="limit-val">${formatLimitVal(limits.exceptional, limits.unit)}</span>
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
                            ${props.recording_time ? `
                            <div class="header-time-pill">
                                <i class="far fa-clock"></i> ${escapePopupText(props.recording_time)}
                            </div>` : ''}
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

                            <!-- Flood Limits Threshold Grid -->
                            ${floodLimitsHTML}

                            <!-- Forecast (24h) -->
                            ${forecastHTML}

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

                        .header-time-pill {
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            font-size: 10.5px;
                            font-weight: 600;
                            color: #475569;
                            background: #e2e8f0;
                            padding: 2px 8px;
                            border-radius: 10px;
                            margin-top: 5px;
                            border: 1px solid #cbd5e1;
                        }

                        .header-time-pill i {
                            color: #0284c7;
                            font-size: 10px;
                        }

                        .flood-limits-section {
                            margin-bottom: 8px;
                            background: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 6px 8px;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                        }

                        .flood-limits-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 5px;
                        }

                        .limits-title {
                            font-size: 10px;
                            font-weight: 700;
                            color: #475569;
                            letter-spacing: 0.4px;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                        }

                        .limits-title i {
                            color: #0284c7;
                        }

                        .limits-unit {
                            font-size: 9.5px;
                            color: #64748b;
                            font-weight: 600;
                        }

                        .flood-limits-grid {
                            display: grid;
                            grid-template-columns: repeat(5, minmax(0, 1fr));
                            gap: 3px;
                        }

                        .limit-pill {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            padding: 3px 2px;
                            border-radius: 5px;
                            border: 1px solid rgba(0, 0, 0, 0.08);
                            text-align: center;
                            background: #ffffff;
                        }

                        .limit-tag {
                            font-size: 8.5px;
                            font-weight: 700;
                            line-height: 1;
                            margin-bottom: 2px;
                        }

                        .limit-val {
                            font-size: 10px;
                            font-weight: 800;
                            line-height: 1.1;
                            color: #0f172a;
                        }

                        .limit-low .limit-tag { color: #2563eb; }
                        .limit-low { border-left: 2px solid #2563eb; background: #eff6ff; }

                        .limit-med .limit-tag { color: #d97706; }
                        .limit-med { border-left: 2px solid #d97706; background: #fffbeb; }

                        .limit-high .limit-tag { color: #ea580c; }
                        .limit-high { border-left: 2px solid #ea580c; background: #fff7ed; }

                        .limit-vhigh .limit-tag { color: #dc2626; }
                        .limit-vhigh { border-left: 2px solid #dc2626; background: #fef2f2; }

                        .limit-exhigh .limit-tag { color: #991b1b; }
                        .limit-exhigh { border-left: 2px solid #991b1b; background: #fdf2f2; }

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

                        .discharge-section, .trend-section, .popup-meta-section, .peak-section, .forecast-section {
                            margin-bottom: 8px;
                        }

                        .discharge-grid, .trend-grid, .popup-meta-grid, .peak-grid, .forecast-grid {
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                        }

                        .forecast-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 4px 8px;
                            background: #f8f9fa;
                            border-radius: 6px;
                            border: 1px solid #e3f2fd;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
                        }

                        .forecast-badge {
                            color: #fff;
                            padding: 3px 8px;
                            border-radius: 4px;
                            font-size: 10px;
                            font-weight: 700;
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                            white-space: nowrap;
                            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
                        }

                        .forecast-quant-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 4px 8px;
                            background: #f8f9fa;
                            border-radius: 6px;
                            border: 1px solid #e3f2fd;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
                        }

                        .forecast-quant-value {
                            font-size: 13px;
                            font-weight: 700;
                            color: #212529;
                            font-style: normal;
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

                        @media (max-width: 768px) {
                            .ffd-popup-container {
                                width: 230px !important;
                            }
                            .popup-header {
                                padding: 5px 8px !important;
                            }
                            .station-name {
                                font-size: 13px !important;
                            }
                            .status-badge {
                                padding: 2px 5px !important;
                                font-size: 9px !important;
                            }
                            .popup-content {
                                padding: 5px 8px 8px !important;
                            }
                            .discharge-grid, .trend-grid {
                                flex-direction: row !important;
                                gap: 4px !important;
                            }
                            .discharge-item, .trend-item {
                                flex: 1 !important;
                                flex-direction: column !important;
                                align-items: flex-start !important;
                                padding: 3px 5px !important;
                                gap: 1px !important;
                            }
                            .discharge-label, .trend-label {
                                font-size: 9px !important;
                            }
                            .discharge-value, .trend-value {
                                font-size: 11px !important;
                                text-align: left !important;
                            }
                            .inflow-highlight, .outflow-bold {
                                font-size: 11px !important;
                            }
                            .trend-section, .discharge-section, .popup-meta-section, .peak-section, .timestamp-section {
                                margin-bottom: 5px !important;
                            }
                            .timestamp-section, .update-info {
                                font-size: 9px !important;
                                padding-top: 5px !important;
                                margin-top: 5px !important;
                            }
                            .upstream-section {
                                margin-top: 5px !important;
                                padding-top: 5px !important;
                            }
                            .upstream-list {
                                flex-direction: row !important;
                                gap: 4px !important;
                            }
                            .upstream-item {
                                flex: 1 !important;
                                flex-direction: column !important;
                                align-items: flex-start !important;
                                padding: 3px 5px !important;
                            }
                            .upstream-item .station-name {
                                font-size: 9px !important;
                            }
                            .lag-time {
                                font-size: 8px !important;
                                padding: 1px 3px !important;
                                margin-top: 2px !important;
                            }
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
            level: res_lvl_value_Mangla,
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
            level: res_lvl_value_Chashma,
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
            level: res_lvl_value_Tarbela,
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

        if (props.name === 'Skardu') {
          fetchDailySituation('Skardu').then(data => {
            if (data && data.skardu_temp && data.skardu_temp.length > 0) {
              showSkarduTemperature(data);
            }
          });
        } else if (damData.hasOwnProperty(props.name)) {
          const dam = damData[props.name];
          fetchDailySituation(props.name).then(data => {
            if (data && data.reservoir_levels && data.reservoir_levels.length > 0) {
              const latestLevel = data.reservoir_levels.find(r => r.recorded_date === data.latest_date);
              if (latestLevel) {
                const yesterdayLevel = data.reservoir_levels.find(r => r.recorded_date === data.yesterday_date);
                const latestStorage = data.reservoir_storages ? data.reservoir_storages.find(r => r.recorded_date === data.latest_date) : null;
                const yesterdayStorage = data.reservoir_storages ? data.reservoir_storages.find(r => r.recorded_date === data.yesterday_date) : null;

                const mol = latestLevel.mol_ft || 0;
                const mcl = latestLevel.mcl_ft || dam.fullCapacity;
                const currentVal = latestLevel.today;
                
                const maxMaf = latestStorage ? latestStorage.max_maf : (dam.fullCapacity || 1);
                
                let pct = 0;
                if (latestStorage && maxMaf > 0) {
                  pct = (latestStorage.today / maxMaf) * 100;
                } else if (mcl > mol) {
                  pct = ((currentVal - mol) / (mcl - mol)) * 100;
                }
                pct = Math.max(0, Math.min(100, pct));
                
                const mergedDam = {
                  ...dam,
                  level: currentVal,
                  percentage: pct,
                  yesterdayLevel: yesterdayLevel ? yesterdayLevel.today : null,
                  lastYearLevel: latestLevel.last_year,
                  avg5YearLevel: latestLevel.avg_last_5_years,
                  avg10YearLevel: latestLevel.avg_last_10_years,
                  variationPercent: latestLevel.variation_percent,
                  variationTrend: latestLevel.variation_trend,
                  
                  todayStorage: latestStorage ? latestStorage.today : null,
                  yesterdayStorage: yesterdayStorage ? yesterdayStorage.today : null,
                  lastYearStorage: latestStorage ? latestStorage.last_year : null,
                  avg5YearStorage: latestStorage ? latestStorage.avg_last_5_years : null,
                  avg10YearStorage: latestStorage ? latestStorage.avg_last_10_years : null,
                  maxStorage: maxMaf
                };
                
                showDamFluidMeter(props.name, pct, currentVal, mergedDam);
              } else {
                showDamFluidMeter(props.name, dam.percentage, dam.level, dam);
              }
            } else {
              showDamFluidMeter(props.name, dam.percentage, dam.level, dam);
            }
          });
        }

        if (props.name) {
          openFFDHistoryPanel(props.name, props);
        }
      });

      // Helper function to get status color (keeping your existing function)
      function getStatusColor(status) {
        const normalizedStatus = status ? status.toUpperCase().trim() : '';

        switch (normalizedStatus) {
          case 'NORMAL':
          case 'NORMAL FLOW':
          case 'NORMAL_FLOW':
            return '#288846';  // Green - Normal Flow
          case 'LOW':
          case 'LOW FLOOD':
          case 'LOW_FLOOD':
            return '#2c65bd';  // Blue - Low Flood
          case 'MEDIUM':
          case 'MEDIUM FLOOD':
          case 'MEDIUM_FLOOD':
            return '#f6c445';  // Yellow - Medium Flood
          case 'HIGH':
          case 'HIGH FLOOD':
          case 'HIGH_FLOOD':
            return '#f78339';  // Orange - High Flood
          case 'VERY_HIGH':
          case 'VERY HIGH':
          case 'VERY HIGH FLOOD':
          case 'VERY_HIGH_FLOOD':
            return '#ef3742';  // Red - Very High Flood
          case 'EX_HIGH':
          case 'EXCEPTIONALLY_HIGH':
          case 'EXCEPTIONALLY HIGH':
          case 'EXCEPTIONALLY HIGH FLOOD':
          case 'EXCEPTIONALLY_HIGH_FLOOD':
            return '#a51f2b';  // Dark Red / Maroon - Exceptionally High
          default:
            return '#808080';  // Default gray
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
  addFFDLayers().then(() => {
    // ffdLegend(); // Commented out per request: do not show FFD legend on toggle
  });

  // Toggle visibility based on checkbox (only add listener once)
  if (!document.getElementById("ffd")._ffdListenerAdded) {
    document.getElementById("ffd").addEventListener("change", function () {
      const isVisible = this.checked;
      ffdLegend();

      // Function to apply visibility once layers are available
      const applyFFDVisibility = () => {
        // Toggle FFD point layer
        if (map1.getLayer("ffd_point")) {
          map1.setLayoutProperty("ffd_point", "visibility", isVisible ? "visible" : "none");
        }

        // Toggle FFD forecast square layer
        if (map1.getLayer("ffd_forecast_square")) {
          map1.setLayoutProperty("ffd_forecast_square", "visibility", isVisible ? "visible" : "none");
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

  // FFD Rivers Layer Integration
  const addFFDRiversLayer = async () => {
    try {
      if (map1.getSource('ffd_rivers')) {
        return;
      }

      console.log('Fetching FFD Rivers data...');
      const response = await fetch(`${ffdRiversHost}/get-ffd-rivers/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const geojson = await response.json();
      if (geojson && Array.isArray(geojson.features)) {
        geojson.features.forEach(f => {
          if (f && f.properties && typeof f.properties.color === 'string') {
            let col = f.properties.color.trim();
            if (col && !col.startsWith('#')) {
              f.properties.color = '#' + col;
            }
          }
        });
      }

      map1.addSource('ffd_rivers', {
        type: 'geojson',
        data: geojson
      });

      // Add fill layer styled using feature raw color and opacity
      map1.addLayer({
        id: 'ffd_rivers_layer',
        type: 'fill',
        source: 'ffd_rivers',
        layout: {
          'visibility': document.getElementById('ffd_rivers')?.checked ? 'visible' : 'none'
        },
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], '#017321'],
          'fill-opacity': ['coalesce', ['get', 'opacity'], 0.6]
        }
      });

      // Add line layer for outline/stroke using feature raw color
      map1.addLayer({
        id: 'ffd_rivers_outline',
        type: 'line',
        source: 'ffd_rivers',
        layout: {
          'visibility': document.getElementById('ffd_rivers')?.checked ? 'visible' : 'none'
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#017321'],
          'line-width': 1.5,
          'line-opacity': ['coalesce', ['get', 'opacity'], 0.8]
        }
      });

      console.log('FFD Rivers layer added successfully');
    } catch (err) {
      console.error('Failed to load FFD Rivers layer:', err);
    }
  };

  // Toggle visibility based on checkbox change
  if (document.getElementById("ffd_rivers") && !document.getElementById("ffd_rivers")._ffdRiversListenerAdded) {
    document.getElementById("ffd_rivers").addEventListener("change", async function () {
      const isVisible = this.checked;
      if (!map1.getSource('ffd_rivers')) {
        await addFFDRiversLayer();
      } else {
        if (map1.getLayer("ffd_rivers_layer")) {
          map1.setLayoutProperty("ffd_rivers_layer", "visibility", isVisible ? "visible" : "none");
        }
        if (map1.getLayer("ffd_rivers_outline")) {
          map1.setLayoutProperty("ffd_rivers_outline", "visibility", isVisible ? "visible" : "none");
        }
      }
    });
    document.getElementById("ffd_rivers")._ffdRiversListenerAdded = true;
  }

  // Toggle visibility for KP flood cell irrigation department
  if (document.getElementById("kp_flood_cell") && !document.getElementById("kp_flood_cell")._kpFloodCellListenerAdded) {
    document.getElementById("kp_flood_cell").addEventListener("change", async function () {
      const isVisible = this.checked;
      
      if (isVisible && !map1.getSource('kp_flood_cell')) {
        try {
          // Fetch dynamic data from SQLite via proxy API
          // Fetch dynamic data from SQLite via proxy API
          let kpDataMap = {};
          let kpCompositeMap = {};
          try {
            const apiRes = await fetch(`${proxyBase}/api/kp-stations`);
            if (apiRes.ok) {
              const resJson = await apiRes.json();
              if (resJson.data) {
                resJson.data.forEach(row => {
                  let normLoc = (row.location || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  let normRiv = (row.river || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  let normSno = String(row.s_no || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  
                  kpDataMap[normLoc] = row;
                  if (normRiv && normLoc) {
                    kpCompositeMap[normRiv + '_' + normLoc] = row;
                  }
                  if (normSno && normLoc) {
                    kpCompositeMap[normSno + '_' + normLoc] = row;
                  }
                });
              }
            }
          } catch(e) {
            console.error("Failed to fetch KP stations data", e);
          }
          window.kpDataMap = kpDataMap;
          window.kpCompositeMap = kpCompositeMap;

          // Fetch GeoJSON points from GeoServer
          const geoUrl = `${proxyBase}/proxy_ahad/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026:Gauges_pdma_kp&outputFormat=application/json`;
          const geoRes = await fetch(geoUrl);
          const geoJson = await geoRes.json();
          
          // Helper function for fuzzy matching location strings
          const getEditDistance = (a, b) => {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            const matrix = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
              for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) == a.charAt(j - 1)) {
                  matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                  matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
              }
            }
            return matrix[b.length][a.length];
          };
          
          const findBestMatch = (loc, dataMap) => {
            if (!dataMap) return null;
            let normLoc = (loc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (dataMap[normLoc]) return normLoc; // Exact match
            
            let bestKey = null;
            let bestDist = Infinity;
            for (let key in dataMap) {
              let dist = getEditDistance(normLoc, key);
              if (dist < bestDist) {
                bestDist = dist;
                bestKey = key;
              }
            }
            if (bestDist <= 4) return bestKey; // Allow up to 4 typos
            
            for (let key in dataMap) {
                if (normLoc.includes(key) || key.includes(normLoc)) return key;
            }
            return null;
          };

          const findBestRowForFeature = (f) => {
            if (!f || !f.properties) return null;
            const props = f.properties;
            const loc = props.LOCATION || props.location || '';
            const riv = props.RIVER || props.river || '';
            const sno = props.SNO || props.s_no || '';

            const normLoc = loc.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normRiv = riv.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normSno = String(sno).toLowerCase().replace(/[^a-z0-9]/g, '');

            if (normRiv && normLoc && window.kpCompositeMap[normRiv + '_' + normLoc]) {
              return window.kpCompositeMap[normRiv + '_' + normLoc];
            }
            if (normSno && normLoc && window.kpCompositeMap[normSno + '_' + normLoc]) {
              return window.kpCompositeMap[normSno + '_' + normLoc];
            }
            for (let key in window.kpCompositeMap) {
              if (key.includes(normLoc) && (key.includes(normRiv) || normRiv.includes(key.split('_')[0]))) {
                return window.kpCompositeMap[key];
              }
            }
            const matchKey = findBestMatch(loc, window.kpDataMap);
            if (matchKey && window.kpDataMap[matchKey]) {
              return window.kpDataMap[matchKey];
            }
            return null;
          };
          window.findBestRowForFeature = findBestRowForFeature;

          // Merge dynamic data into GeoJSON properties
          if (geoJson.features) {
            geoJson.features.forEach(f => {
              let matchedRow = findBestRowForFeature(f);
              if (matchedRow) {
                f.properties.flow_status = matchedRow.flow_status;
                f.properties.discharge = matchedRow.discharge;
                if (matchedRow.river) f.properties.RIVER = matchedRow.river;
              } else {
                f.properties.flow_status = "Normal";
                f.properties.discharge = "N/A";
              }
            });
          }
          
          map1.addSource('kp_flood_cell', {
            type: 'geojson',
            data: geoJson
          });

          map1.addLayer({
            id: 'kp_flood_cell_point',
            type: 'circle',
            source: 'kp_flood_cell',
            paint: {
              'circle-color': [
                'match',
                ['coalesce', ['get', 'flow_status'], ''],
                'NORMAL', '#288846',
                'Normal', '#288846',
                'LOW', '#2c65bd',
                'Low', '#2c65bd',
                'LOW FLOOD', '#2c65bd',
                'Low Flood', '#2c65bd',
                'MEDIUM', '#f6c445',
                'Medium', '#f6c445',
                'MEDIUM FLOOD', '#f6c445',
                'Medium Flood', '#f6c445',
                'HIGH', '#f78339',
                'High', '#f78339',
                'HIGH FLOOD', '#f78339',
                'High Flood', '#f78339',
                'VERY HIGH', '#ef3742',
                'Very High', '#ef3742',
                'VERY HIGH FLOOD', '#ef3742',
                'Very High Flood', '#ef3742',
                'EX HIGH', '#a51f2b',
                'EXCEPTIONALLY HIGH', '#a51f2b',
                'Exceptionally High', '#a51f2b',
                'EXCEPTIONALLY HIGH FLOOD', '#a51f2b',
                '#808080'
              ],
              'circle-radius': 7,
              'circle-opacity': 1,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2
            }
          });
          
          map1.addLayer({
            id: 'kp_flood_cell_label',
            type: 'symbol',
            source: 'kp_flood_cell',
            layout: {
              'visibility': 'visible',
              'text-field': ['concat', ['get', 'LOCATION'], '\n', ['to-string', ['get', 'discharge']]],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 12,
              'text-offset': [0, 1.5],
              'text-anchor': 'top'
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1
            }
          });
          
          // Click event for popups
          map1.on('click', 'kp_flood_cell_point', (e) => {
             const feature = e.features[0];
             const matchedRow = window.findBestRowForFeature(feature);

             const loc = feature.properties.LOCATION;
             let riv = matchedRow?.river || feature.properties.RIVER;
             const discharge = matchedRow?.discharge || feature.properties.discharge;
             const flowStatus = matchedRow?.flow_status || feature.properties.flow_status;
             const recordDate = matchedRow?.date || '';
             const recordTime = matchedRow?.time || '';
             
             const lagTimes = {
               'Amandara': 'Lag from Khawaza Khela: 12 Hours',
               'Munda': 'Lag from Amandara: 9 Hours',
               'Charsadda Road': 'Lag from Munda: 6.5 Hours',
               'Nowshera': 'Lag from Charsadda: 6 Hours & Warsak: 10 Hours',
               'Kabul': 'Lag from Charsadda: 6 Hours & Warsak: 10 Hours'
             };
             let lagHtmlText = '';
             for (let key in lagTimes) {
               if (loc && loc.includes(key)) {
                 lagHtmlText = lagTimes[key];
                 break;
               }
             }

             const getKpStatusColor = (status) => {
               const norm = (status || '').toUpperCase().trim();
               if (norm === 'HIGH' || norm === 'HIGH FLOOD') return '#f78339';
               if (norm === 'MEDIUM' || norm === 'MEDIUM FLOOD') return '#f6c445';
               if (norm === 'LOW' || norm === 'LOW FLOOD') return '#2c65bd';
               if (norm === 'VERY HIGH' || norm === 'VERY HIGH FLOOD') return '#ef3742';
               if (norm.includes('EX') || norm.includes('EXCEPTIONALLY')) return '#a51f2b';
               return '#288846'; // Default Normal
             };
             
             const statusColor = getKpStatusColor(flowStatus);
             
             const formatDischarge = (value, label, isInflow = false) => {
               if (!value || value === 'N/A' || String(value).toLowerCase() === 'n/a' || String(value).trim() === '') {
                 return `
                                 <div class="discharge-item">
                                     <span class="discharge-label">${label}:</span>
                                     <span class="discharge-value no-data">N/A</span>
                                 </div>`;
               }
               const numericValue = parseFloat(value);
               const formattedValue = !isNaN(numericValue) ? numericValue.toLocaleString() : value;
               return `
                             <div class="discharge-item">
                                 <span class="discharge-label">${label}:</span>
                                 <span class="discharge-value ${isInflow ? 'inflow-highlight' : 'outflow-bold'}">
                                     ${formattedValue} cusecs
                                 </span>
                             </div>`;
             };

             const html = `
                    <div class="ffd-popup-container">
                        <!-- Header Section -->
                        <div class="popup-header" style="border-left: 4px solid ${statusColor};">
                            <div class="station-info">
                                <h3 class="station-name">${loc}</h3>
                                <div class="status-badge" style="background-color: ${statusColor};">
                                    <i class="fas fa-water"></i>
                                    ${flowStatus}
                                </div>
                            </div>
                        </div>

                        <!-- Main Content -->
                        <div class="popup-content">
                            <!-- River Metadata -->
                            <div class="popup-meta-section">
                                <div class="popup-meta-grid">
                                    <div class="popup-meta-item">
                                        <span class="popup-meta-label">River:</span>
                                        <span class="popup-meta-value">${riv}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Discharge Information -->
                            <div class="discharge-section">
                                <div class="discharge-grid">
                                    ${formatDischarge(discharge, 'Discharge', true)}
                                </div>
                            </div>

                            ${(recordDate || recordTime) ? `
                            <div class="timestamp-section">
                                <div class="timestamp-item">
                                    <i class="fas fa-clock"></i>
                                    <span class="timestamp-value">Last Updated: ${recordDate} ${recordTime}</span>
                                </div>
                            </div>
                            ` : ''}

                            ${lagHtmlText ? `
                            <div class="upstream-section">
                                <h4 class="section-title">
                                    <i class="fas fa-arrow-up"></i> UPSTREAM STATIONS
                                </h4>
                                <div class="upstream-item">
                                    <span class="station-name"><strong>${lagHtmlText.split(':')[0].replace('Lag from ', '')}</strong></span>
                                    <span class="lag-time"><strong>Lag: ${lagHtmlText.split(':')[1].trim()}</strong></span>
                                </div>
                            </div>
                            ` : ''}
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
                      .popup-meta-section, .discharge-section, .timestamp-section, .upstream-section {
                        margin-bottom: 8px;
                      }
                      .popup-meta-grid, .discharge-grid {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                      }
                      .popup-meta-item, .discharge-item, .upstream-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 4px 8px;
                        background: #f8f9fa;
                        border-radius: 6px;
                        border: 1px solid #e3f2fd;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                      }
                      .popup-meta-label, .discharge-label, .section-title {
                        font-size: 13px;
                        font-weight: 500;
                        color: #495057;
                      }
                      .section-title {
                        margin: 4px 0 8px 0;
                        text-transform: uppercase;
                        font-size: 11px;
                        letter-spacing: 0.5px;
                      }
                      .popup-meta-value, .discharge-value {
                        font-size: 14px;
                        font-weight: 700;
                        color: #212529;
                      }
                      .inflow-highlight { color: #1976d2; }
                      .timestamp-item {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        justify-content: flex-end;
                        font-size: 11px;
                        color: #6c757d;
                        margin-top: 4px;
                      }
                      .lag-time {
                        background: #e3f2fd;
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        color: #1976d2;
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
               .setHTML(html)
               .addTo(map1);
          });
          map1.on('mouseenter', 'kp_flood_cell_point', () => { map1.getCanvas().style.cursor = 'pointer'; });
          map1.on('mouseleave', 'kp_flood_cell_point', () => { map1.getCanvas().style.cursor = ''; });

        } catch (e) {
          console.error("Failed to load KP flood cell layer:", e);
        }
      }

      ['kp_flood_cell_layer', 'kp_flood_cell_point', 'kp_flood_cell_label', 'kp_flood_cell_outline'].forEach(layerId => {
        if (map1.getLayer(layerId)) {
          map1.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
        }
      });
      if (typeof ffdLegend === 'function') ffdLegend();
    });
    document.getElementById("kp_flood_cell")._kpFloodCellListenerAdded = true;
  }

  // ── GB Stations (SWHP) Toggle ─────────────────────────────────────────
  if (document.getElementById("gb_stations") && !document.getElementById("gb_stations")._gbStationsListenerAdded) {
    document.getElementById("gb_stations").addEventListener("change", async function () {
      const isVisible = this.checked;
      
      if (isVisible && !map1.getSource('gb_stations')) {
        try {
          // Canonical definitions for all 10 GB stations matching the SWHP PDF exactly
          const GB_STATION_DEFS = [
            {
              id: 'kharmang',
              pattern: /kharmang|kharmong/i,
              displayName: 'Kharmong',
              river: 'Indus River',
              pdfName: 'Indus at Kharmong'
            },
            {
              id: 'chowar',
              pattern: /chowar/i,
              displayName: 'Chowar',
              river: 'Shyoke River',
              pdfName: 'Shyoke River at Chowar'
            },
            {
              id: 'yogu',
              pattern: /yogu/i,
              displayName: 'Yogu',
              river: 'Shyoke River',
              pdfName: 'Shyoke River at Yogu'
            },
            {
              id: 'danyor',
              pattern: /danyor|hunza/i,
              displayName: 'Danyor',
              river: 'Hunza River',
              pdfName: 'Hunza River at Danyor'
            },
            {
              id: 'alam_bridge',
              pattern: /alam\s*bridge/i,
              displayName: 'Alam Bridge',
              river: 'Gilgit River',
              pdfName: 'Gilgit River at Alam Bridge'
            },
            {
              id: 'doian',
              pattern: /doian|doiyan|astore/i,
              displayName: 'Doiyan',
              river: 'Astore River',
              pdfName: 'Astore River at Doiyan'
            },
            {
              id: 'gilgit_at_gilgit',
              pattern: /gilgit/i,
              displayName: 'Gilgit',
              river: 'Gilgit River',
              pdfName: 'Gilgit River at Gilgit'
            },
            {
              id: 'chitral',
              pattern: /chitral/i,
              displayName: 'Chitral',
              river: 'Chitral River',
              pdfName: 'Chitral River at Chitral'
            },
            {
              id: 'neelum',
              pattern: /neelum|karimabad/i,
              displayName: 'Karimabad',
              river: 'Neelum River',
              pdfName: 'Neelum River at Karimabad'
            },
            {
              id: 'jhelum',
              pattern: /jhelum|chakothi/i,
              displayName: 'Chakothi',
              river: 'Jhelum River',
              pdfName: 'Jhelum River at Chakothi'
            }
          ];

          const resolveCanonicalStation = (rawName) => {
            const name = String(rawName || '').trim();
            if (/alam\s*bridge/i.test(name)) {
              return GB_STATION_DEFS.find(d => d.id === 'alam_bridge');
            }
            for (const def of GB_STATION_DEFS) {
              if (def.id !== 'alam_bridge' && def.pattern.test(name)) {
                return def;
              }
            }
            return {
              id: 'unknown',
              displayName: name,
              river: 'Indus River',
              pdfName: name
            };
          };

          // Fetch dynamic data from SQLite via proxy API
          let gbDataMap = {};
          let gbRecordDate = '';
          let gbRecordTime = '';
          try {
            const apiRes = await fetch(`${proxyBase}/api/gb-stations`);
            if (apiRes.ok) {
              const resJson = await apiRes.json();
              if (resJson.data && resJson.data.length > 0) {
                gbRecordDate = resJson.data[0].recorded_date || '';
                gbRecordTime = resJson.data[0].time || '';
                resJson.data.forEach(row => {
                  const canon = resolveCanonicalStation(row.station_name);
                  if (canon && canon.id) {
                    gbDataMap[canon.id] = row;
                  }
                  if (canon && canon.displayName) {
                    gbDataMap[canon.displayName.toLowerCase()] = row;
                  }
                  const normName = (row.station_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (normName) {
                    gbDataMap[normName] = row;
                  }
                });
              }
            }
          } catch(e) {
            console.error("Failed to fetch GB stations data", e);
          }
          window.gbDataMap = gbDataMap;

          // Fetch GeoJSON points from GeoServer
          const geoUrl = `${proxyBase}/proxy_ahad/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026:GB_stations&outputFormat=application/json`;
          const geoRes = await fetch(geoUrl);
          const geoJson = await geoRes.json();

          // Merge dynamic data into GeoJSON properties
          if (geoJson.features) {
            geoJson.features.forEach(f => {
              const rawName = f.properties.Name || f.properties.name || '';
              const canon = resolveCanonicalStation(rawName);

              f.properties.station_name_display = canon.displayName;
              f.properties.river = canon.river;

              const matchedRow = gbDataMap[canon.id] || 
                                 gbDataMap[canon.displayName.toLowerCase()] || 
                                 gbDataMap[(canon.pdfName || '').toLowerCase().replace(/[^a-z0-9]/g, '')];

              if (matchedRow) {
                f.properties.discharge_in_cusecs = matchedRow.discharge_in_cusecs || 'N/A';
                if (matchedRow.river) f.properties.river = matchedRow.river;
                f.properties.recorded_date = matchedRow.recorded_date || gbRecordDate;
                f.properties.record_time = matchedRow.time || gbRecordTime;
              } else {
                f.properties.discharge_in_cusecs = 'N/A';
                f.properties.recorded_date = gbRecordDate;
                f.properties.record_time = gbRecordTime;
              }
            });
          }

          map1.addSource('gb_stations', {
            type: 'geojson',
            data: geoJson
          });

          // Circle layer — all NORMAL green
          map1.addLayer({
            id: 'gb_stations_point',
            type: 'circle',
            source: 'gb_stations',
            paint: {
              'circle-color': '#288846',
              'circle-radius': 7,
              'circle-opacity': 1,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2
            }
          });

          // Label layer — displays Short Station Name on Line 1, Discharge on Line 2
          map1.addLayer({
            id: 'gb_stations_label',
            type: 'symbol',
            source: 'gb_stations',
            layout: {
              'visibility': 'visible',
              'text-field': ['concat', ['coalesce', ['get', 'station_name_display'], ['get', 'Name'], ['get', 'name']], '\n', ['to-string', ['coalesce', ['get', 'discharge_in_cusecs'], 'N/A']]],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 12,
              'text-offset': [0, 1.5],
              'text-anchor': 'top'
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1
            }
          });

          // Click event for popups — styled 1:1 with KP/FFD
          map1.on('click', 'gb_stations_point', (e) => {
            const feature = e.features[0];
            const stationName = feature.properties.station_name_display || feature.properties.Name || feature.properties.name || '';
            const riverName = feature.properties.river || 'Indus River';
            const discharge = feature.properties.discharge_in_cusecs || 'N/A';
            const recordDate = feature.properties.recorded_date || gbRecordDate || '';
            const recordTime = feature.properties.record_time || gbRecordTime || '';

            const formatDischarge = (value) => {
              const strVal = String(value || '').trim();
              if (!strVal || strVal === 'N/A' || strVal.toLowerCase() === 'n/a') {
                return `
                  <div class="discharge-item">
                    <span class="discharge-label">Discharge:</span>
                    <span class="discharge-value no-data">N/A</span>
                  </div>`;
              }
              if (strVal.toUpperCase() === 'N.R' || strVal.toUpperCase() === 'NR') {
                return `
                  <div class="discharge-item">
                    <span class="discharge-label">Discharge:</span>
                    <span class="discharge-value no-data">N.R (Not Received)</span>
                  </div>`;
              }
              const numericValue = parseFloat(strVal.replace(/,/g, ''));
              const formattedValue = !isNaN(numericValue) ? numericValue.toLocaleString() : strVal;
              return `
                <div class="discharge-item">
                  <span class="discharge-label">Discharge:</span>
                  <span class="discharge-value inflow-highlight">${formattedValue} cusecs</span>
                </div>`;
            };

            const html = `
              <div class="ffd-popup-container">
                <div class="popup-header" style="border-left: 4px solid #288846;">
                  <div class="station-info">
                    <h3 class="station-name">${stationName}</h3>
                    <div class="status-badge" style="background-color: #288846;">
                      <i class="fas fa-water"></i>
                      NORMAL
                    </div>
                  </div>
                </div>
                <div class="popup-content">
                  <div class="popup-meta-section">
                    <div class="popup-meta-grid">
                      <div class="popup-meta-item">
                        <span class="popup-meta-label">River:</span>
                        <span class="popup-meta-value">${riverName}</span>
                      </div>
                    </div>
                  </div>
                  <div class="discharge-section">
                    <div class="discharge-grid">
                      ${formatDischarge(discharge)}
                    </div>
                  </div>
                  ${(recordDate || recordTime) ? `
                  <div class="timestamp-section">
                    <div class="timestamp-item">
                      <i class="fas fa-clock"></i>
                      <span class="timestamp-value">Last Updated: ${recordDate} ${recordTime}</span>
                    </div>
                  </div>
                  ` : ''}
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
                .popup-meta-section, .discharge-section, .timestamp-section {
                  margin-bottom: 8px;
                }
                .popup-meta-grid, .discharge-grid {
                  display: flex;
                  flex-direction: column;
                  gap: 4px;
                }
                .popup-meta-item, .discharge-item {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 4px 8px;
                  background: #f8f9fa;
                  border-radius: 6px;
                  border: 1px solid #e3f2fd;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                }
                .popup-meta-label, .discharge-label {
                  font-size: 13px;
                  font-weight: 500;
                  color: #495057;
                }
                .popup-meta-value, .discharge-value {
                  font-size: 14px;
                  font-weight: 700;
                  color: #212529;
                }
                .inflow-highlight { color: #1976d2; }
                .no-data { color: #6c757d; font-style: italic; }
                .timestamp-item {
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  justify-content: flex-end;
                  font-size: 11px;
                  color: #6c757d;
                  margin-top: 4px;
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
              .setHTML(html)
              .addTo(map1);
          });
          map1.on('mouseenter', 'gb_stations_point', () => { map1.getCanvas().style.cursor = 'pointer'; });
          map1.on('mouseleave', 'gb_stations_point', () => { map1.getCanvas().style.cursor = ''; });

        } catch (e) {
          console.error("Failed to load GB stations layer:", e);
        }
      }

      ['gb_stations_point', 'gb_stations_label'].forEach(layerId => {
        if (map1.getLayer(layerId)) {
          map1.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
        }
      });
      if (typeof ffdLegend === 'function') ffdLegend();
    });
    document.getElementById("gb_stations")._gbStationsListenerAdded = true;
  }

  // ── Other Gauges (FFD) Toggle ───────────────────────────────────────────
  const initOtherGaugesToggle = () => {
    const checkbox = document.getElementById("other_gauges");
    if (!checkbox || checkbox._otherGaugesListenerAdded) return;

    const formatDischargeVal = (val) => {
      if (val === null || val === undefined || val === 'null' || val === 'N/A' || String(val).trim() === '') return 'N/A';
      const num = parseFloat(String(val).replace(/,/g, ''));
      return !isNaN(num) ? num.toLocaleString() : String(val);
    };

    const formatTrendInfo = (trend) => {
      if (!trend) return { text: 'N/A', cssClass: 'trend-steady' };
      const t = String(trend).toLowerCase().trim();
      if (t === 'rising' || t === 'up') return { text: '↑ Rising', cssClass: 'trend-rising' };
      if (t === 'falling' || t === 'down') return { text: '↓ Falling', cssClass: 'trend-falling' };
      if (t === 'steady' || t === 'stable' || t === 'same') return { text: '→ Steady', cssClass: 'trend-steady' };
      return { text: trend, cssClass: 'trend-steady' };
    };

    const loadAndRenderOtherGauges = async () => {
      if (!map1.getSource('other_gauges')) {
        try {
          let json = null;
          const proxyUrl = (typeof proxyBase !== 'undefined' && proxyBase) ? `${proxyBase}/api/other-gauges` : '/api/other-gauges';
          try {
            const resp = await fetch(proxyUrl);
            if (resp.ok) json = await resp.json();
          } catch (fetchErr) {
            console.warn('Proxy API fetch for other-gauges failed, trying direct JSON fallback:', fetchErr);
          }

          if (!json) {
            try {
              const respFallback = await fetch('FFD_other_gauge_fetch/latest_all_gauges.json');
              if (respFallback.ok) json = await respFallback.json();
            } catch (fallbackErr) {
              console.error('Failed to fetch latest_all_gauges.json fallback:', fallbackErr);
            }
          }

          const stations = (json && json.data && Array.isArray(json.data.stations))
            ? json.data.stations
            : (json && Array.isArray(json.stations) ? json.stations : null);

          if (!stations) {
            console.error('Other Gauges returned invalid or empty station data:', json);
            return;
          }

          const features = stations
            .filter(s => s && s.latitude != null && s.longitude != null)
            .map(s => {
              const outflowFormatted = formatDischargeVal(s.outflow != null ? s.outflow : s.discharge);
              const forecastUpper = (s.forecast_status || s.forecast_qual || '').toUpperCase().trim();
              const cypDateStr = s.cyp_date ? ` (${s.cyp_date})` : '';
              const maxPeakFormatted = formatDischargeVal(s.max_peak || s.cyp_discharge || 'N/A') + (s.max_peak && s.max_peak !== 'N/A' ? cypDateStr : '');

              return {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [parseFloat(s.longitude), parseFloat(s.latitude)]
                },
                properties: {
                  name: s.name || '',
                  name_ur: s.name_ur || '',
                  river: s.river || s.area_name || '',
                  kind: s.kind || '',
                  status: (s.status || 'NORMAL').toUpperCase().trim(),
                  outflow: s.outflow,
                  inflow: s.inflow,
                  outflow_text: outflowFormatted,
                  outflow_trend: s.outflow_trend || '',
                  inflow_trend: s.inflow_trend || '',
                  recording_time: s.recording_time || '',
                  height: s.height || 'N/A',
                  max_peak: maxPeakFormatted,
                  cyp_status: s.cyp_status || '',
                  cyp_date: s.cyp_date || '',
                  forecast_status: s.forecast_status || s.forecast_qual || '',
                  forecast_status_upper: forecastUpper,
                  forecast_quant: s.forecast_quant || '',
                  high_threshold: s.high_threshold ? formatDischargeVal(s.high_threshold) + ' cusecs' : '',
                  area_name: s.area_name || ''
                }
              };
            });

          const geojson = {
            type: 'FeatureCollection',
            features: features
          };

          map1.addSource('other_gauges', {
            type: 'geojson',
            data: geojson
          });

          // Add forecast status square layer (centered on circle point)
          map1.addLayer({
            id: 'other_gauges_forecast_square',
            type: 'symbol',
            source: 'other_gauges',
            filter: ['!=', ['get', 'forecast_status_upper'], ''],
            layout: {
              'visibility': 'visible',
              'icon-image': [
                'match',
                ['coalesce', ['get', 'forecast_status_upper'], ''],
                'NORMAL', 'forecast-sq-normal',
                'NORMAL_FLOW', 'forecast-sq-normal',
                'LOW', 'forecast-sq-low',
                'LOW_FLOOD', 'forecast-sq-low',
                'MEDIUM', 'forecast-sq-medium',
                'MEDIUM_FLOOD', 'forecast-sq-medium',
                'HIGH', 'forecast-sq-high',
                'HIGH_FLOOD', 'forecast-sq-high',
                'VERY_HIGH', 'forecast-sq-very-high',
                'VERY_HIGH_FLOOD', 'forecast-sq-very-high',
                'EX_HIGH', 'forecast-sq-ex-high',
                'EXCEPTIONALLY_HIGH', 'forecast-sq-ex-high',
                'EXCEPTIONALLY_HIGH_FLOOD', 'forecast-sq-ex-high',
                'forecast-sq-default'
              ],
              'icon-size': 1,
              'icon-offset': [0, 0],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true
            }
          });

          map1.addLayer({
            id: 'other_gauges_point',
            type: 'circle',
            source: 'other_gauges',
            layout: {
              'visibility': 'visible'
            },
            paint: {
              'circle-color': [
                'match',
                ['coalesce', ['get', 'status'], ''],
                'NORMAL', '#288846',
                'Normal', '#288846',
                'NORMAL_FLOW', '#288846',
                'LOW', '#2c65bd',
                'Low', '#2c65bd',
                'LOW_FLOOD', '#2c65bd',
                'MEDIUM', '#f6c445',
                'Medium', '#f6c445',
                'MEDIUM_FLOOD', '#f6c445',
                'HIGH', '#f78339',
                'High', '#f78339',
                'HIGH_FLOOD', '#f78339',
                'VERY_HIGH', '#ef3742',
                'Very High', '#ef3742',
                'VERY_HIGH_FLOOD', '#ef3742',
                'EX_HIGH', '#a51f2b',
                'EXCEPTIONALLY_HIGH', '#a51f2b',
                'Exceptionally High', '#a51f2b',
                'EXCEPTIONALLY_HIGH_FLOOD', '#a51f2b',
                '#288846'
              ],
              'circle-radius': 7,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': 0.95
            }
          });

          map1.addLayer({
            id: 'other_gauges_label',
            type: 'symbol',
            source: 'other_gauges',
            layout: {
              'visibility': 'visible',
              'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'outflow_text']]],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 12,
              'text-offset': [0, 1.5],
              'text-anchor': 'top'
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1
            }
          });

          try {
            if (map1.getLayer('other_gauges_forecast_square')) map1.moveLayer('other_gauges_forecast_square');
            if (map1.getLayer('other_gauges_point')) map1.moveLayer('other_gauges_point');
            if (map1.getLayer('other_gauges_label')) map1.moveLayer('other_gauges_label');
          } catch(e) {}

          // Popup on click matching 1:1 with target design
          map1.on('click', 'other_gauges_point', (e) => {
            const props = e.features[0].properties;

            const getStatusColor = (status) => {
              const norm = (status || '').toUpperCase().trim();
              if (norm === 'NORMAL' || norm === 'NORMAL_FLOW') return '#288846';
              if (norm === 'LOW' || norm === 'LOW_FLOOD') return '#2c65bd';
              if (norm === 'MEDIUM' || norm === 'MEDIUM_FLOOD') return '#f6c445';
              if (norm === 'HIGH' || norm === 'HIGH_FLOOD') return '#f78339';
              if (norm === 'VERY_HIGH' || norm === 'VERY HIGH' || norm === 'VERY_HIGH_FLOOD') return '#ef3742';
              if (norm.includes('EX') || norm.includes('EXCEPTIONALLY')) return '#a51f2b';
              return '#288846';
            };

            const statusColor = getStatusColor(props.status);
            const inTrend = formatTrendInfo(props.inflow_trend);
            const outTrend = formatTrendInfo(props.outflow_trend);

            const inflowStr = props.inflow != null && props.inflow !== 'N/A' && props.inflow !== 'null'
              ? `${formatDischargeVal(props.inflow)} ft³/s`
              : 'N/A';
            const outflowStr = props.outflow != null && props.outflow !== 'N/A' && props.outflow !== 'null'
              ? `${formatDischargeVal(props.outflow)} ft³/s`
              : 'N/A';

            const urduNameHtml = (props.name_ur && props.name_ur !== props.name)
              ? `<div class="st-name-ur">${props.name_ur}</div>`
              : '';

            const kindPillHtml = props.kind
              ? `<span class="st-kind-badge">${props.kind}</span>`
              : '';

            const forecastHtml = props.forecast_status
              ? `
                <div class="card-row-item">
                  <span class="card-row-label">Forecast Status:</span>
                  <span class="card-row-val dark" style="color: ${getStatusColor(props.forecast_status)}; font-weight:800;">${props.forecast_status}</span>
                </div>
              ` : '';

            const forecastQuantHtml = props.forecast_quant
              ? `
                <div class="card-row-item">
                  <span class="card-row-label">Forecast Range:</span>
                  <span class="card-row-val blue">${props.forecast_quant} (in '000 cusecs)</span>
                </div>
              ` : '';

            const highThresholdHtml = props.high_threshold
              ? `
                <div class="card-row-item">
                  <span class="card-row-label">High Threshold:</span>
                  <span class="card-row-val dark">${props.high_threshold}</span>
                </div>
              ` : '';

            const html = `
              <div class="ffd-exact-popup-card" style="border-left: 5px solid ${statusColor};">
                <div class="popup-top-header">
                  <div class="title-time-col">
                    <div class="st-name">${props.name} ${kindPillHtml}</div>
                    ${urduNameHtml}
                    ${props.recording_time ? `<div class="st-time-pill"><i class="far fa-clock"></i> ${props.recording_time}</div>` : ''}
                  </div>
                  <div class="st-status-pill" style="background-color: ${statusColor};">
                    <i class="fas fa-water"></i> ${props.status}
                  </div>
                </div>

                <div class="popup-cards-list">
                  <div class="card-row-item">
                    <span class="card-row-label">River / Area:</span>
                    <span class="card-row-val dark">${props.river || props.area_name || 'N/A'}</span>
                  </div>

                  <div class="card-row-item">
                    <span class="card-row-label">Station Height:</span>
                    <span class="card-row-val dark">${props.height || 'N/A'}</span>
                  </div>

                  <div class="card-row-item">
                    <span class="card-row-label">Inflow:</span>
                    <span class="card-row-val blue">${inflowStr}</span>
                  </div>

                  <div class="card-row-item">
                    <span class="card-row-label">Outflow:</span>
                    <span class="card-row-val dark">${outflowStr}</span>
                  </div>

                  <div class="card-row-item">
                    <span class="card-row-label">Inflow Trend:</span>
                    <span class="card-row-val ${inTrend.cssClass}">${inTrend.text}</span>
                  </div>

                  <div class="card-row-item">
                    <span class="card-row-label">Outflow Trend:</span>
                    <span class="card-row-val ${outTrend.cssClass}">${outTrend.text}</span>
                  </div>

                  <div class="card-row-item">
                    <span class="card-row-label">Max. Peak:</span>
                    <span class="card-row-val dark">${props.max_peak || 'N/A'}</span>
                  </div>

                  ${forecastHtml}
                  ${forecastQuantHtml}
                  ${highThresholdHtml}
                </div>
              </div>

              <style>
                .ffd-exact-popup-card {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  width: 300px;
                  background: #ffffff;
                  border-radius: 12px;
                  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                  border: 1.5px solid #60a5fa;
                  overflow: hidden;
                  color: #1e293b;
                }
                .popup-top-header {
                  padding: 12px 14px 8px 14px;
                  display: flex;
                  justify-content: space-between;
                  align-items: flex-start;
                  gap: 8px;
                  background: #ffffff;
                }
                .title-time-col {
                  display: flex;
                  flex-direction: column;
                  align-items: flex-start;
                }
                .st-name {
                  font-size: 17px;
                  font-weight: 800;
                  color: #0f172a;
                  line-height: 1.25;
                  margin: 0;
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  flex-wrap: wrap;
                }
                .st-name-ur {
                  font-size: 13px;
                  font-weight: 600;
                  color: #475569;
                  margin-top: 2px;
                  direction: rtl;
                }
                .st-kind-badge {
                  font-size: 10px;
                  font-weight: 700;
                  color: #2563eb;
                  background: #eff6ff;
                  border: 1px solid #bfdbfe;
                  padding: 1px 6px;
                  border-radius: 6px;
                  text-transform: uppercase;
                }
                .st-time-pill {
                  background: #eef2f6;
                  color: #475569;
                  padding: 3px 9px;
                  border-radius: 10px;
                  font-size: 11px;
                  font-weight: 600;
                  margin-top: 6px;
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                }
                .st-status-pill {
                  color: #ffffff;
                  padding: 4px 10px;
                  border-radius: 16px;
                  font-size: 11px;
                  font-weight: 700;
                  text-transform: uppercase;
                  letter-spacing: 0.4px;
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  white-space: nowrap;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.12);
                }
                .popup-cards-list {
                  padding: 4px 12px 12px 12px;
                  display: flex;
                  flex-direction: column;
                  gap: 5px;
                }
                .card-row-item {
                  background: #f8fafc;
                  border: 1px solid #e2e8f0;
                  border-radius: 8px;
                  padding: 6px 10px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .card-row-label {
                  font-size: 13px;
                  font-weight: 600;
                  color: #475569;
                }
                .card-row-val {
                  font-size: 14px;
                  font-weight: 700;
                }
                .card-row-val.dark {
                  color: #0f172a;
                }
                .card-row-val.blue {
                  color: #2563eb;
                  font-weight: 800;
                }
                .card-row-val.trend-rising {
                  color: #dc2626;
                  font-weight: 700;
                }
                .card-row-val.trend-falling {
                  color: #16a34a;
                  font-weight: 700;
                }
                .card-row-val.trend-steady {
                  color: #64748b;
                  font-weight: 600;
                }
                .mapboxgl-popup-close-button { display: none !important; }
                .mapboxgl-popup-content { padding: 0 !important; border-radius: 12px !important; background: transparent !important; box-shadow: none !important; }
                .mapboxgl-popup-tip { border-top-color: #ffffff !important; }
              </style>
            `;

            new mapboxgl.Popup({
              closeButton: false,
              closeOnClick: true,
              maxWidth: '320px',
              className: 'ffd-exact-popup-wrapper'
            })
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map1);
          });

          map1.on('mouseenter', 'other_gauges_point', () => { map1.getCanvas().style.cursor = 'pointer'; });
          map1.on('mouseleave', 'other_gauges_point', () => { map1.getCanvas().style.cursor = ''; });

          console.log(`Other Gauges layer added with ${features.length} station points.`);
        } catch (e) {
          console.error("Failed to load Other Gauges layer:", e);
        }
      }

      ['other_gauges_forecast_square', 'other_gauges_point', 'other_gauges_label'].forEach(layerId => {
        if (map1.getLayer(layerId)) {
          map1.setLayoutProperty(layerId, "visibility", checkbox.checked ? "visible" : "none");
          if (checkbox.checked) {
            try { map1.moveLayer(layerId); } catch(err) {}
          }
        }
      });
      if (typeof ffdLegend === 'function') ffdLegend();
    };

    checkbox.addEventListener("change", loadAndRenderOtherGauges);
    checkbox._otherGaugesListenerAdded = true;

    if (checkbox.checked) {
      loadAndRenderOtherGauges();
    }
  };

  initOtherGaugesToggle();






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
        data: `${ahad}/geoserver/GLOF/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(geoserverLayer)}&outputFormat=application/json&srsName=EPSG:4326`
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
    data: `${ahad}/geoserver/monsoon/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=monsoon:Extremly%20high&maxFeatures=50&outputFormat=application/json`
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
    data: `${ahad}/geoserver/monsoon/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=monsoon:Very_high&maxFeatures=50&outputFormat=application/json`
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
        `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:Swat_rivert@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:Panjgora_river@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
  data: `${ahad}/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3ADI_Khan_HT&outputFormat=application%2Fjson`,
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
    data: `${ahad}/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3ADG%20khan%20HT&outputFormat=application%2Fjson`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Pir_Panjal_HT@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
    data: `${ahad}/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3AHyderabad_arc&outputFormat=application%2Fjson`,
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
    data: `${ahad}/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3Ajhal_magsi_arc_Complete&outputFormat=application%2Fjson`,
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
  //     `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:jhal_magsi_arc_full@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:KIRTHAR_RANGE@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:bajaur_hill_torrents@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      data: `${ahad}/geoserver/monsoon/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=monsoon:Buner_inundation_filtered&outputFormat=application/json&srsName=EPSG:4326`
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Mardan_inundation_filter&outputFormat=application/json&srsName=EPSG:4326`
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:kech%26panjgur_50mm_filter&outputFormat=application/json&srsName=EPSG:4326`
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:kech%26panjgaur_100mm_filter&outputFormat=application/json&srsName=EPSG:4326`
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:chakwal_hill_torrents@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:pulkhu_75mm_filter&outputFormat=application/json&srsName=EPSG:4326`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:pulkhu_150_filter&outputFormat=application/json&srsName=EPSG:4326`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:pulkhu_300_filter&outputFormat=application/json&srsName=EPSG:4326`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Baein%26Basantar_150mm&outputFormat=application/json&srsName=EPSG:4326`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:Baein%26Basantar_350mm&outputFormat=application/json&srsName=EPSG:4326`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:munawar_tawi_60mm_filter&outputFormat=application/json&srsName=EPSG:4326`,
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
      data: `${geoserverUrl}/geoserver/gcop/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gcop:munawar_150mm_filter&outputFormat=application/json&srsName=EPSG:4326`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:lower_indus_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:lower_indus_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:lower_indus_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:upper_indus_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:upper_indus_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:upper_indus_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:chenab_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:chenab_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:chenab_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:kabul_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:kabul_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:kabul_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:jhelum_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
    data: `${mamAyman}/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Ajmfex&outputFormat=application%2Fjson`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:jhelum_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:swat_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:swat_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:swat_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Muzafferabad_arc@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${ahad}/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Depth_Max_Terrain_DEM_AJK1&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
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
        data: `${ahad}/geoserver/HydroAnalytics2026/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=HydroAnalytics2026%3A${geoserverLayerName}&outputFormat=application%2Fjson`
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
      `${ahad}/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Terrain_Jhal_Depth&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
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
            `${ahad}/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Terrain_Jhal_Depth&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
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
      `${ahad}/geoserver/global/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=Terrain_hyd&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Jamshoro flooding@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:ravi_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:ravi_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/	gcop:ravi_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:sutlej_high_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:sutlej_medium_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:sutlej_low_outlook_2026@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:barrages_v1@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/ne/wms?service=WMS&version=1.1.0&request=GetMap&layers=KPKDrainage_Density&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=P_panjal_Cl&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Depth (Max).Terrain.sargodha&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Depth (Max).Terrain.Rawalpindi&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Depth (Max).Terrain.dem_faislabad&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${ahad}/geoserver/HydroAnalytics2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Nowshera_Depth&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${ahad}/geoserver/HydroAnalytics2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Charsadda_Depth&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Sindh&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Kirthar_Cl&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=DG khan&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=DIKHAN_CL&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Gujranwala&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=upper_KP&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mamHimael}/geoserver/Hydromet/wms?service=WMS&version=1.1.0&request=GetMap&layers=Lower_KP&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:kpk_urban@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:breachpoints@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      tiles: [`${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:indian_structure@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
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
        "circle-radius": 6,
      }
    });
  }
  if (!map1.getLayer("gis-existing-indian-label")) {
    map1.addLayer({
      id: "gis-existing-indian-label",
      type: "symbol",
      source: "indian",
      "source-layer": "indian_structure",
      layout: {
        visibility: "none",
        "text-field": ["coalesce", ["get", "Name"], ["get", "name"], ""],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 1.2],
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1
      }
    });
  }
  // 3. Toggle visibility on checkbox change
  document.getElementById("india").addEventListener("change", function () {
    const isVisible = this.checked;
    if (map1.getLayer("indian")) {
      map1.setLayoutProperty("indian", "visibility", isVisible ? "visible" : "none");
    }
    if (map1.getLayer("gis-existing-indian-label")) {
      map1.setLayoutProperty("gis-existing-indian-label", "visibility", isVisible ? "visible" : "none");
    }
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
        level: res_lvl_value_Bhakra,
        country: 'India',
        region: 'Bilaspur, HP',
        fullCapacity: 1680,
        fillLastYear: fillPercentage_Bhakra_last_year,
        fillNormal: fillPercentage_Bhakra_5year_normal
      },
      'PONG DAM': {
        percentage: fillPercentage_Pong,
        level: res_lvl_value_Pong,
        country: 'India',
        region: 'Kangra, HP',
        fullCapacity: 1390,
        fillLastYear: fillPercentage_Pong_last_year,
        fillNormal: fillPercentage_Pong_5year_normal
      },
      'THEIN DAM': {
        percentage: fillPercentage_Thein,
        level: res_lvl_value_Thein,
        country: 'India',
        region: 'Pathankot, PB',
        fullCapacity: 1732,
        fillLastYear: fillPercentage_Thein_last_year,
        fillNormal: fillPercentage_Thein_5year_normal
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

  const unfoldedEventPoints = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Budni Nullah' },
        geometry: { type: 'Point', coordinates: [71.57950227913663, 34.0411623990512] }
      },
      {
        type: 'Feature',
        properties: { name: 'Kalpani Nullah' },
        geometry: { type: 'Point', coordinates: [72.05032655273911, 34.204248986428894] }
      },
      {
        type: 'Feature',
        properties: { name: 'Panjkora River' },
        geometry: { type: 'Point', coordinates: [71.98903089027516, 35.21747329784386] }
      }
    ]
  };

  map1.addSource("unfolded_event_points", {
    type: "geojson",
    data: unfoldedEventPoints
  });

  if (!map1.getLayer("unfolded_event_points")) {
    map1.addLayer({
      id: "unfolded_event_points",
      type: "circle",
      source: "unfolded_event_points",
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "#ff6b35",
        "circle-radius": 7,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        "circle-opacity": 1
      }
    });
  }

  map1.on("click", "unfolded_event_points", function (e) {
    if (!e.features || !e.features.length) return;
    const feature = e.features[0];
    const name = feature.properties && feature.properties.name ? feature.properties.name : "Unfolded Event";
    const coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [];
    const popupHTML = `
      <div class="ffd-popup-container">
        <div class="popup-header" style="border-left: 4px solid #ff6b35;">
          <div class="station-info">
            <h3 class="station-name">${name}</h3>
            <div class="status-badge" style="background-color: #ff6b35;">
              <i class="fas fa-map-marker-alt"></i>
              Event
            </div>
          </div>
        </div>
        <div class="popup-content">
          <div class="unfolded-image-wrap">
            <img src="media/Exposures+Levels/unfolded.png" alt="Unfolded event" class="unfolded-event-image" style="cursor:pointer;" onclick="showFullscreen('media/Exposures+Levels/unfolded.png'); return false;" />
          </div>
        </div>
      </div>
      <style>
        .ffd-popup-container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 260px; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; border: 2px solid #ff6b35; position: relative; }
        .popup-header { background: #fff7f3; padding: 8px 12px; border-bottom: 2px solid #ffe4d6; }
        .station-info { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .station-name { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0; line-height: 1.2; flex: 1; }
        .status-badge { color: white; padding: 4px 8px; border-radius: 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; display: flex; align-items: center; gap: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); white-space: nowrap; }
        .popup-content { padding: 10px; background: #ffffff; }
        .unfolded-image-wrap { width: 100%; margin-bottom: 10px; border-radius: 10px; overflow: hidden; background: #f8fafc; border: 1px solid #f1f5f9; }
        .unfolded-event-image { display: block; width: 100%; height: auto; max-height: 180px; object-fit: cover; }
        .mapboxgl-popup-content { padding: 0; border-radius: 12px; overflow: hidden; }
      </style>
    `;

    new mapboxgl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '260px', className: 'ffd-enhanced-popup' })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(popupHTML)
      .addTo(map1);
  });

  map1.on("mouseenter", "unfolded_event_points", function () {
    map1.getCanvas().style.cursor = "pointer";
  });
  map1.on("mouseleave", "unfolded_event_points", function () {
    map1.getCanvas().style.cursor = "";
  });

  const unfoldedElem = document.getElementById("unfoldedEvent");
  if (unfoldedElem) {
    unfoldedElem.addEventListener("change", function () {
      const isVisible = this.checked;
      if (map1.getLayer("unfolded_event_points")) {
        map1.setLayoutProperty("unfolded_event_points", "visibility", isVisible ? "visible" : "none");
      }
    });
  }

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
      tiles: [`${mamAyman}/geoserver/gwc/service/tms/1.0.0/ne:Future@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  //Ready for construction
  if (!map1.getSource("Ready_for_Construction")) {
    map1.addSource("Ready_for_Construction", {
      type: "vector",
      scheme: "tms",
      tiles: [`${mamAyman}/geoserver/gwc/service/tms/1.0.0/ne:Ready_for_Construction@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  //ongoing structures
  if (!map1.getSource("Ongoing")) {
    map1.addSource("Ongoing", {
      type: "vector",
      scheme: "tms",
      tiles: [`${mamAyman}/geoserver/gwc/service/tms/1.0.0/ne:Ongoing@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
    });
  }

  //under constructoiom
  if (!map1.getSource("Under_construction")) {
    map1.addSource("Under_construction", {
      type: "vector",
      scheme: "tms",
      tiles: [`${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:under_construction_dams@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
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
  if (!window.__dayNightToggleControlAdded) {
    map1.addControl(new DayNightToggleControl(), 'top-right');
    window.__dayNightToggleControlAdded = true;
  }
  /******************* END TIME-ENABLED LAYER SUPPORT (v2) *******************/


  //Reservoir layer
  if (!map1.getSource("Dams_Water_Bodies")) {
    map1.addSource("Dams_Water_Bodies", {
      type: "vector",
      scheme: "tms",
      tiles: [
        `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:reserviors@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:minnor_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:pakistan_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:kp_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/Humza:G15_Flood_Inundation_2010_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:G16_Flood_Inundation_2011_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/GCC:G17_Flood_Inundation_2012_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:G18_Flood_Inundation_2013_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:G19_Flood_Inundation_2014_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:G20_Flood_Inundation_2015_NDMA_GIS_Team@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamAyman}/geoserver/gwc/service/tms/1.0.0/Flood_Insight:river_2022@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/	ne:VIIRS_20230726_20230730_FloodExtent_PAK@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geo_1_4}/geoserver/gwc/service/tms/1.0.0/abdul_sattar:flood_Hotspot_Area@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mustafa}/geoserver/gwc/service/tms/1.0.0/ne:VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${ibrahim}/geoserver/gwc/service/tms/1.0.0/Boundaries:2024 sept@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
  //     `${ahad}/geoserver/monsoon/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=monsoon:fLOOD_Extent&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=256&HEIGHT=256&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/	gcop:protection_bands@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:settlements@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:schools@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:railway_stations@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:airports@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:BridgesL@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:health_facilities@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_extent_27-28Aug@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_Extent_1-2sep@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood05Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood06Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood07Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood09Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood13Sep25@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Extent16-09-2025@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_Extant_19-09-2025@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_extant_21sep@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:buner_hill_torrents@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:FloodExtents_CummTill14Sep25Dis@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Flood_Extent_Comulated_5to21f@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Pond_Sites@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:KP_Dams@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:GB@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Retention_Reserviors@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Retention_Pond@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:DGK@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:balochistan@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Dams@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
      `${mamHimael}/geoserver/gwc/service/tms/1.0.0/Hydromet:Retention_PondImp@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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
          `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:Main_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('branch_canals_src')) {
      map1.addSource('branch_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:Branch_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('link_canals_src')) {
      map1.addSource('link_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:Link_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('distributories_src')) {
      map1.addSource('distributories_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:Distributories@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
        `${geoserverUrl}/geoserver/gwc/service/tms/1.0.0/gcop:water_shed@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
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

  // refreshKarachiLightPreset(map1); // Disabled auto dusk/day mode
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
// refreshKarachiLightPreset(map1);
// setInterval(() => refreshKarachiLightPreset(map1), 5 * 60 * 1000);
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
//-----------------------------------------------------Mapbox gl js Day Night Toggle Control START--------------------------------------------------------------------------------------//
class DayNightToggleControl {
  constructor() {
    this._isNight = false;
  }

  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    
    this._button = document.createElement('button');
    this._button.className = 'mapboxgl-ctrl-icon';
    this._button.title = 'Toggle Day/Night Mode';
    
    this._icon = document.createElement('img');
    this._icon.src = 'media/UI/controlicons/day.gif';
    this._icon.style.width = '100%';
    this._icon.style.height = '100%';
    
    this._button.appendChild(this._icon);
    
    this._button.addEventListener('click', () => {
      this._isNight = !this._isNight;
      
      if (this._isNight) {
        this._icon.src = 'media/UI/controlicons/night.gif';
        applyBasemapConfig(this._map, { lightPreset: 'dusk' });
      } else {
        this._icon.src = 'media/UI/controlicons/day.gif';
        applyBasemapConfig(this._map, { lightPreset: 'day' });
      }
    });
    
    this._container.appendChild(this._button);
    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}
//-----------------------------------------------------Mapbox gl js Day Night Toggle Control END----------------------------------------------------------------------------------------//
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


function ensureFullscreenImageOverlay() {
  let overlay = document.getElementById('fullscreen-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'fullscreen-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;z-index:99999;padding:24px;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close enlarged image');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = 'position:absolute;top:20px;right:24px;width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:28px;cursor:pointer;line-height:1;';
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeFullscreen();
  });

  const img = document.createElement('img');
  img.id = 'fullscreen-image';
  img.alt = 'Expanded view';
  img.style.cssText = 'max-width:100%;max-height:90vh;border-radius:12px;box-shadow:0 24px 50px rgba(0,0,0,0.35);background:#fff;object-fit:contain;';

  overlay.appendChild(closeBtn);
  overlay.appendChild(img);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeFullscreen();
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

function closeFullscreen() {
  const overlay = document.getElementById('fullscreen-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}

// Show fullscreen image
function showFullscreen(imageSrc) {
  const overlay = ensureFullscreenImageOverlay();
  const img = document.getElementById('fullscreen-image');

  if (!img) return;
  img.src = imageSrc;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay && overlay.style.display === 'flex') {
      closeFullscreen();
    }
  }
});

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
    z-index: 1000;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    padding: 10px 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: none;
    font-family: Arial, sans-serif;
  `;

  // Legend items data (shared color palette)
  const legendItems = [
    { color: '#288846', label: 'Normal Flow' },
    { color: '#2c65bd', label: 'Low Flood' },
    { color: '#f6c445', label: 'Medium Flood' },
    { color: '#f78339', label: 'High Flood' },
    { color: '#ef3742', label: 'Very High Flood' },
    { color: '#a51f2b', label: 'Exceptionally High' }
  ];

  // Build legend using innerHTML for cleaner two-column layout
  legendDiv.innerHTML = `
    <style>
      #ffdLegend {
        position: fixed;
        bottom: 120px;
        right: 20px;
        z-index: 1000;
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 8px;
        padding: 10px 14px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        transition: all 0.2s ease-in-out;
      }
      #ffdLegend .ffd-legend-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        padding-bottom: 5px;
        border-bottom: 1px solid #ddd;
        gap: 16px;
      }
      #ffdLegend .ffd-legend-col-title {
        font-size: 11px;
        font-weight: 700;
        color: #2c3e50;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      #ffdLegend .ffd-legend-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 5px;
        gap: 8px;
      }
      #ffdLegend .ffd-legend-row:last-child {
        margin-bottom: 0;
      }
      #ffdLegend .ffd-legend-label {
        font-size: 11px;
        font-weight: 500;
        color: #333;
        flex: 1;
        white-space: nowrap;
      }
      #ffdLegend .ffd-legend-circle {
        width: 13px;
        height: 13px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
        flex-shrink: 0;
      }
      #ffdLegend .ffd-legend-separator {
        width: 1px;
        height: 13px;
        background: #ddd;
        margin: 0 4px;
        flex-shrink: 0;
      }
      #ffdLegend .ffd-legend-square {
        width: 13px;
        height: 13px;
        border-radius: 2px;
        border: 2px solid #333;
        flex-shrink: 0;
      }
      @media (max-width: 1024px) {
        #ffdLegend {
          bottom: 100px;
          right: 16px;
          padding: 8px 12px;
        }
      }
      @media (max-width: 768px) {
        #ffdLegend {
          bottom: 90px;
          right: 12px;
          padding: 8px 10px;
        }
        #ffdLegend .ffd-legend-label {
          font-size: 10px;
        }
        #ffdLegend .ffd-legend-col-title {
          font-size: 10px;
        }
      }
      @media (max-width: 480px) {
        #ffdLegend {
          bottom: 80px;
          right: 8px;
          padding: 6px 8px;
          max-width: calc(100vw - 16px);
        }
        #ffdLegend .ffd-legend-circle,
        #ffdLegend .ffd-legend-square {
          width: 11px;
          height: 11px;
        }
      }
    </style>
    <div class="ffd-legend-header">
      <span class="ffd-legend-col-title">Status</span>
      <span class="ffd-legend-col-title" style="margin-left: auto;">Forecast (24h)</span>
    </div>
    ${legendItems.map(item => `
      <div class="ffd-legend-row">
        <span class="ffd-legend-label">${item.label}</span>
        <div class="ffd-legend-circle" style="background-color: ${item.color};"></div>
        <div class="ffd-legend-separator"></div>
        <div class="ffd-legend-square" style="background-color: ${item.color};"></div>
      </div>
    `).join('')}
  `;

  // Add legend to body
  document.body.appendChild(legendDiv);
}

// Helper to calculate dynamic stack position for FFD legend to prevent overlap with Flood Extent legend
function repositionFFDLegend() {
  const ffdLegendEl = document.getElementById('ffdLegend');
  if (!ffdLegendEl || ffdLegendEl.style.display === 'none') return;

  const floodLegendEl = document.getElementById('floodLegend');
  const isFloodLegendVisible = floodLegendEl && floodLegendEl.offsetHeight > 0 && window.getComputedStyle(floodLegendEl).display !== 'none';

  const width = window.innerWidth;
  let baseRight = '20px';
  let baseBottom = 20;

  if (width <= 480) {
    baseRight = '8px';
    baseBottom = 10;
  } else if (width <= 768) {
    baseRight = '12px';
    baseBottom = 14;
  } else if (width <= 1024) {
    baseRight = '16px';
    baseBottom = 16;
  }

  if (isFloodLegendVisible) {
    const floodHeight = floodLegendEl.offsetHeight || 190;
    const floodStyle = window.getComputedStyle(floodLegendEl);
    const floodBottom = parseInt(floodStyle.bottom, 10) || baseBottom;
    const newBottom = floodBottom + floodHeight + 12;
    ffdLegendEl.style.bottom = `${newBottom}px`;
  } else {
    ffdLegendEl.style.bottom = `${baseBottom}px`;
  }
  ffdLegendEl.style.right = baseRight;
}

if (typeof window !== 'undefined' && !window._ffdLegendResizeAdded) {
  window.addEventListener('resize', repositionFFDLegend);
  window._ffdLegendResizeAdded = true;
}

// Function to toggle FFD legend visibility
function ffdLegend() {
  createFfdLegend();
  const legend = document.getElementById('ffdLegend');
  const cbFFD = document.getElementById('ffd');
  const cbKP = document.getElementById('kp_flood_cell');
  const cbGB = document.getElementById('gb_stations');
  const cbOther = document.getElementById('other_gauges');
  const historyPanel = document.getElementById('ffd-history-panel');

  const isHistoryOpen = historyPanel && historyPanel.classList.contains('open');
  const isAnyChecked = (cbFFD && cbFFD.checked) || (cbKP && cbKP.checked) || (cbGB && cbGB.checked) || (cbOther && cbOther.checked);

  if (legend) {
    if (isAnyChecked && !isHistoryOpen) {
      legend.style.display = 'block';
      requestAnimationFrame(() => repositionFFDLegend());
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
//                   `${geo_1_43}/geoserver/gwc/service/tms/1.0.0/Flood_simu:Jhelum_${i}@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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
    { checkboxId: 'ffd_rivers', layers: ['ffd_rivers_layer', 'ffd_rivers_outline'] },
    { checkboxId: 'kp_flood_cell', layers: ['kp_flood_cell_layer', 'kp_flood_cell_point', 'kp_flood_cell_outline'] },
    { checkboxId: 'gb_stations', layers: ['gb_stations_point', 'gb_stations_label'] },
    { checkboxId: 'other_gauges', layers: ['other_gauges_forecast_square', 'other_gauges_point', 'other_gauges_label'] },
    { checkboxId: 'Reservoirs', layers: ['Dams_Water_Bodies'] },
    { checkboxId: 'india', layers: ['indian', 'gis-existing-indian-label'] },
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
  const mapContainer = getMapDockContainer();
  const mapHeight = mapContainer ? mapContainer.clientHeight : window.innerHeight;
  
  let top = '14px';
  let right = '16px';
  let left = 'auto';
  let width = `${getDockPanelWidth()}px`;
  let maxHeight = `${Math.max(220, Math.floor(mapHeight - 30))}px`;

  if (window.innerWidth <= 480) {
    top = '10px';
    right = 'auto';
    left = '5%';
    width = '90%';
    maxHeight = `${Math.floor(mapHeight * 0.45)}px`;
  } else if (window.innerWidth <= 1440) {
    top = '14px';
    right = '56px';
    left = 'auto';
    width = 'clamp(300px, 35vw, 380px)';
    maxHeight = `${Math.floor(mapHeight * 0.52)}px`;
  }

  const metrics = { top, right, left, width, maxHeight };

  if (window.innerWidth > 1440) {
    const historyPanel = document.getElementById('ffd-history-panel');
    const mapRect = mapContainer ? mapContainer.getBoundingClientRect() : null;
    if (historyPanel && historyPanel.classList.contains('open')) {
      const panelRect = historyPanel.getBoundingClientRect();
      if (Number.isFinite(panelRect.top) && mapRect && Number.isFinite(mapRect.top)) {
        const availableHeight = Math.floor(panelRect.top - mapRect.top - 24);
        if (availableHeight > 180) {
          metrics.maxHeight = `${availableHeight}px`;
        }
      }
    }
  }

  return metrics;
}

function alignFFDHistoryPanelToFluidMeter() {
  const historyPanel = document.getElementById('ffd-history-panel');
  const fluidContainer = document.getElementById('fluidMeterContainer');

  if (!historyPanel || !historyPanel.classList.contains('open')) return;
  if (historyPanel.classList.contains('dragging') || historyPanel.dataset.dragged === 'true') return;

  const mapContainer = getMapDockContainer();
  const mapHeight = mapContainer ? mapContainer.clientHeight : window.innerHeight;

  historyPanel.style.height = 'auto';

  if (window.innerWidth <= 480) {
    historyPanel.style.width = '90%';
    historyPanel.style.left = '5%';
    historyPanel.style.right = 'auto';
    historyPanel.style.top = 'auto';
    historyPanel.style.bottom = '10px';
    historyPanel.style.maxHeight = `${Math.floor(mapHeight * 0.85)}px`;
    return;
  } else if (window.innerWidth <= 1440) {
    historyPanel.style.left = '16px';
    historyPanel.style.top = 'auto';
    historyPanel.style.bottom = '16px';
    historyPanel.style.maxHeight = `${Math.floor(mapHeight * 0.85)}px`;

    const isFluidOpen = fluidContainer && fluidContainer.style.display === 'block';
    const isFluidDocked = isFluidOpen && (!fluidContainer.style.left || fluidContainer.style.left === 'auto');
    if (window.innerWidth >= 1024 && isFluidDocked) {
      historyPanel.style.right = 'calc(clamp(300px, 35vw, 380px) + 72px)';
      historyPanel.style.width = 'auto';
    } else {
      historyPanel.style.right = '56px';
      historyPanel.style.width = 'calc(100% - 72px)';
    }
    return;
  }

  historyPanel.style.maxHeight = `${Math.floor(mapHeight * 0.85)}px`;
  const sharedWidth = `${Math.round(getFFDHistoryDockWidth())}px`;

  if (!fluidContainer || fluidContainer.style.display !== 'block') {
    historyPanel.style.width = sharedWidth;
    historyPanel.style.right = '16px';
    historyPanel.style.left = 'auto';
    historyPanel.style.top = 'auto';
    historyPanel.style.bottom = '16px';
    return;
  }

  if (!fluidContainer.style.left || fluidContainer.style.left === 'auto') {
    dockFluidMeter(fluidContainer, true);
  }

  const fluidRect = fluidContainer.getBoundingClientRect();
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

function dockFluidMeter(container, avoidAligningHistory = false) {
  if (!container) return;

  const metrics = getFluidMeterDockMetrics();

  container.style.position = 'absolute';
  container.style.left = metrics.left || 'auto';
  container.style.top = metrics.top;
  container.style.right = metrics.right;
  container.style.width = metrics.width;
  container.style.maxHeight = metrics.maxHeight;
  container.style.transform = 'none';

  container.setAttribute('data-original-top', container.style.top);
  container.setAttribute('data-original-right', container.style.right);
  container.setAttribute('data-original-transform', 'none');

  if (!avoidAligningHistory) {
    alignFFDHistoryPanelToFluidMeter();
  }
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
  if (window.innerWidth <= 1024) return; // Disable dragging on mobile/tablet
  const container = document.getElementById('fluidMeterContainer');
  if (!container) return;

  // Do not start panel drag from actionable controls.
  if (e.target.closest('button, input, select, textarea, a, .close-btn')) {
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
    const getHistoricalMax = (type, defaultMax) => {
      const norm = String(damName || '').toLowerCase();
      if (norm.includes('tarbela')) {
        if (type === 'lastYear') return 5.728;
        if (type === 'avg5' || type === 'avg10') return 5.691;
        return 5.580;
      }
      if (norm.includes('mangla')) {
        if (type === 'lastYear') return 7.277;
        if (type === 'avg5' || type === 'avg10') return 7.268;
        return 7.258;
      }
      return defaultMax;
    };

    const isTarbela = String(damName || '').toLowerCase().includes('tarbela');

    if (details.todayStorage !== undefined && details.todayStorage !== null) {
      const currentMaxStorage = getHistoricalMax('current', toNumericOrNull(details.maxStorage) || 1.0);
      let currentFillPct = (toNumericOrNull(details.todayStorage) / currentMaxStorage) * 100;
      if (isTarbela && currentFillPct > 100) currentFillPct = 100;
      
      if (details.lastYearStorage !== null && details.lastYearStorage !== undefined) {
        const lastYearMax = getHistoricalMax('lastYear', currentMaxStorage);
        let lastYearFillPct = (toNumericOrNull(details.lastYearStorage) / lastYearMax) * 100;
        if (isTarbela && lastYearFillPct > 100) lastYearFillPct = 100;
        const delta = currentFillPct - lastYearFillPct;
        addMetricCard('Last Year', lastYearFillPct, delta);
      } else {
        addMetricCard('Last Year', null, null);
      }
      
      if (details.avg5YearStorage !== null && details.avg5YearStorage !== undefined) {
        const avg5Max = getHistoricalMax('avg5', currentMaxStorage);
        let avg5YearFillPct = (toNumericOrNull(details.avg5YearStorage) / avg5Max) * 100;
        if (isTarbela && avg5YearFillPct > 100) avg5YearFillPct = 100;
        const delta = currentFillPct - avg5YearFillPct;
        addMetricCard('5-Year Avg', avg5YearFillPct, delta);
      }
      
      if (details.avg10YearStorage !== null && details.avg10YearStorage !== undefined) {
        const avg10Max = getHistoricalMax('avg10', currentMaxStorage);
        let avg10YearFillPct = (toNumericOrNull(details.avg10YearStorage) / avg10Max) * 100;
        if (isTarbela && avg10YearFillPct > 100) avg10YearFillPct = 100;
        const delta = currentFillPct - avg10YearFillPct;
        addMetricCard('10-Year Avg', avg10YearFillPct, delta);
      }
    } else {
      let lastYearLevelFill = (toNumericOrNull(details.lastYearLevel) && details.fullCapacity) ? (toNumericOrNull(details.lastYearLevel) / details.fullCapacity) * 100 : null;
      let avg5YearFill = (toNumericOrNull(details.avg5YearLevel) && details.fullCapacity) ? (toNumericOrNull(details.avg5YearLevel) / details.fullCapacity) * 100 : null;
      let avg10YearFill = (toNumericOrNull(details.avg10YearLevel) && details.fullCapacity) ? (toNumericOrNull(details.avg10YearLevel) / details.fullCapacity) * 100 : null;

      if (isTarbela) {
        if (lastYearLevelFill !== null && lastYearLevelFill > 100) lastYearLevelFill = 100;
        if (avg5YearFill !== null && avg5YearFill > 100) avg5YearFill = 100;
        if (avg10YearFill !== null && avg10YearFill > 100) avg10YearFill = 100;
      }

      const deltaLastYear = (currentFill !== null && lastYearLevelFill !== null) ? currentFill - lastYearLevelFill : null;
      const deltaAvg5 = (currentFill !== null && avg5YearFill !== null) ? currentFill - avg5YearFill : null;
      const deltaAvg10 = (currentFill !== null && avg10YearFill !== null) ? currentFill - avg10YearFill : null;

      addMetricCard('Last Year', lastYearLevelFill, deltaLastYear);
      addMetricCard('5-Year Avg', avg5YearFill, deltaAvg5);
      addMetricCard('10-Year Avg', avg10YearFill, deltaAvg10);
    }
  } else {
    addMetricCard('Current Fill', currentFill, 0);
    addMetricCard('Capacity', fullCapacity, null);
  }

  insightsChart.innerHTML = `
    <div class="dam-metric-cards" style="grid-template-columns: repeat(${cards.length}, minmax(0, 1fr));">
      ${cards.map((card) => `
        <div class="dam-metric-card">
          <div class="dam-metric-title">${escapeHtmlValue(card.title)}</div>
          <div class="dam-metric-row">
            <span class="dam-metric-label">Filled</span>
            <span class="dam-metric-value dam-metric-value-filled">${escapeHtmlValue(card.filled)}</span>
          </div>
          <div class="dam-metric-row">
            <span class="dam-metric-label">Change</span>
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

  const labelEl = container.querySelector('.reservoir-level-label');
  if (labelEl) {
    labelEl.textContent = 'Reservoir Level (ft)';
  }

  const numericLevel = toNumericOrNull(reservoirLevel);
  const capacity = toNumericOrNull(details.fullCapacity);

  const currentText = numericLevel === null ? 'N/A' : numericLevel.toFixed(2);
  const totalText = capacity === null ? 'N/A' : capacity.toFixed(2);
  
  let pastText = 'N/A';
  let pastLabel = 'Last Year';
  let pastClass = 'last-year';
  
  if (details.lastYearLevel !== undefined && details.lastYearLevel !== null) {
    const parsed = parseFloat(details.lastYearLevel);
    if (!isNaN(parsed)) {
      pastText = parsed.toFixed(2);
    }
  }

  if (pastText === 'N/A') {
    if (details.yesterdayLevel !== undefined && details.yesterdayLevel !== null) {
      const parsedYest = parseFloat(details.yesterdayLevel);
      if (!isNaN(parsedYest)) {
        pastText = parsedYest.toFixed(2);
        pastLabel = 'Yesterday';
        pastClass = 'yesterday';
      }
    }
  }

  const pastRowHtml = pastText !== 'N/A' ? `
      <span class="reservoir-level-divider" aria-hidden="true"></span>
      <div class="reservoir-level-row reservoir-level-row-${pastClass}">
        <span class="reservoir-level-number reservoir-level-number-${pastClass}">${escapeHtmlValue(pastText)}</span>
        <span class="reservoir-level-pill reservoir-level-pill-${pastClass}">${pastLabel}</span>
      </div>` : '';

  reservoirValue.innerHTML = `
    <div class="reservoir-level-grid">
      <div class="reservoir-level-row reservoir-level-row-current">
        <span class="reservoir-level-number reservoir-level-number-current">${escapeHtmlValue(currentText)}</span>
        <span class="reservoir-level-pill reservoir-level-pill-current">Current</span>
      </div>${pastRowHtml}
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
  makeDraggable();

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
        fontSize: "18px",
        drawPercentageSign: true,
        precision: 2,
        drawBubbles: true,
        size: window.innerWidth <= 1440 ? 105 : 130,
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

const fetchDailySituation = async (station) => {
  try {
    const host = window.location.protocol === 'file:' ? 'localhost' : (window.location.hostname || 'localhost');
    const response = await fetch(`${apiDailyHost}/api/daily-situation?station=${encodeURIComponent(station)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      return data;
    }
  } catch (error) {
    console.error("Failed to fetch daily situation data:", error);
  }
  return null;
};

function showSkarduTemperature(data) {
  const container = document.getElementById('fluidMeterContainer');
  const title = document.getElementById('meterTitle');
  const meta = document.getElementById('meterMeta');
  const liveBadge = document.getElementById('meterLive');
  const meterDiv = document.getElementById('fluid-meter');
  const reservoirValue = document.getElementById('reservoirValue');

  if (!container || !title || !meta || !liveBadge || !meterDiv || !reservoirValue) {
    console.error('Fluid meter HTML elements not found.');
    return;
  }

  title.textContent = "Skardu";
  meta.textContent = "PAKISTAN · GILGIT-BALTISTAN";
  liveBadge.textContent = "LIVE";

  const temps = data.skardu_temp || [];
  const latestTemps = temps.filter(t => t.recorded_date === data.latest_date);
  const yesterdayTemps = temps.filter(t => t.recorded_date === data.yesterday_date);

  const maxTempObj = latestTemps.find(t => t.metric === 'Maximum') || {};
  const minTempObj = latestTemps.find(t => t.metric === 'Minimum') || {};

  const yestMaxTempObj = yesterdayTemps.find(t => t.metric === 'Maximum') || {};
  const yestMinTempObj = yesterdayTemps.find(t => t.metric === 'Minimum') || {};

  const todayMax = maxTempObj.today !== undefined ? maxTempObj.today : null;
  const todayMin = minTempObj.today !== undefined ? minTempObj.today : null;

  const yestMax = yestMaxTempObj.today !== undefined ? yestMaxTempObj.today : null;
  const yestMin = yestMinTempObj.today !== undefined ? yestMinTempObj.today : null;

  const labelEl = container.querySelector('.reservoir-level-label');
  if (labelEl) {
    labelEl.textContent = 'Daily Temperature (°C)';
  }

  const currentText = todayMax === null ? 'N/A' : `${todayMax.toFixed(1)}°`;
  const totalText = todayMin === null ? 'N/A' : `${todayMin.toFixed(1)}°`;
  const yestMaxText = yestMax === null ? 'N/A' : `${yestMax.toFixed(1)}°`;
  const yestMinText = yestMin === null ? 'N/A' : `${yestMin.toFixed(1)}°`;

  reservoirValue.innerHTML = `
    <div class="reservoir-level-grid">
      <!-- Max Today -->
      <div class="reservoir-level-row">
        <span class="reservoir-level-number" style="color: #f87171;">${escapeHtmlValue(currentText)}</span>
        <span class="reservoir-level-pill" style="background-color: #ef4444; color: white;">Max Today</span>
      </div>
      <!-- Max Yesterday -->
      <div class="reservoir-level-row">
        <span class="reservoir-level-number" style="color: #fca5a5;">${escapeHtmlValue(yestMaxText)}</span>
        <span class="reservoir-level-pill" style="background-color: #991b1b; color: white;">Max Yesterday</span>
      </div>
      
      <span class="reservoir-level-divider" style="margin: 2px 0;" aria-hidden="true"></span>
      
      <!-- Min Today -->
      <div class="reservoir-level-row">
        <span class="reservoir-level-number" style="color: #60a5fa;">${escapeHtmlValue(totalText)}</span>
        <span class="reservoir-level-pill" style="background-color: #3b82f6; color: white;">Min Today</span>
      </div>
      <!-- Min Yesterday -->
      <div class="reservoir-level-row">
        <span class="reservoir-level-number" style="color: #93c5fd;">${escapeHtmlValue(yestMinText)}</span>
        <span class="reservoir-level-pill" style="background-color: #1e40af; color: white;">Min Yesterday</span>
      </div>
    </div>
  `;

  meterDiv.innerHTML = `
    <style>
      @keyframes thermo-pulse {
        0%, 100% {
          filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.4)) drop-shadow(0 0 4px rgba(239, 68, 68, 0.2));
        }
        50% {
          filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.85)) drop-shadow(0 0 12px rgba(239, 68, 68, 0.5));
        }
      }
      .thermo-pulse-element {
        animation: thermo-pulse 2s infinite ease-in-out;
      }
    </style>
    <div style="position: relative; width: 130px; height: 130px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
      <svg width="130" height="130" viewBox="0 0 120 120" style="transform: rotate(-90deg); display: block;">
        <defs>
          <linearGradient id="tempGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6" />
            <stop offset="50%" stop-color="#f97316" />
            <stop offset="100%" stop-color="#ef4444" />
          </linearGradient>
        </defs>
        <!-- Background track -->
        <circle cx="60" cy="60" r="46" stroke="#1e293b" stroke-width="6" fill="transparent" />
        <!-- Animated Temperature Circle Arc -->
        <circle cx="60" cy="60" r="46" stroke="url(#tempGrad)" stroke-width="6" fill="transparent" 
                stroke-dasharray="289" stroke-dashoffset="289" stroke-linecap="round" id="temp-gauge-fill" />
      </svg>
      <!-- Center Display -->
      <div style="position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; transform: translateY(-2px);">
        <span style="font-family: 'Oxygen', sans-serif; font-weight: 800; font-size: 20px; color: #f8fafc; margin-bottom: 2px;">
          ${todayMax !== null ? Math.round(todayMax) : '--'}°C
        </span>
        <svg width="16" height="30" viewBox="0 0 16 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Outer Case -->
          <path d="M8 2C6.34 2 5 3.34 5 5V18.27C3.17 19.5 2 21.6 2 24C2 27.31 4.69 30 8 30C11.31 30 14 27.31 14 24C14 21.6 12.83 19.5 11 18.27V5C11 3.34 9.66 2 8 2Z" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
          <!-- Bulb with glow animation -->
          <circle cx="8" cy="24" r="3.5" fill="#ef4444" class="thermo-pulse-element" />
          <!-- Animated rising mercury column -->
          <path d="M8 20.5V6" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" id="thermo-mercury" 
                stroke-dasharray="15" stroke-dashoffset="15" class="thermo-pulse-element" />
        </svg>
      </div>
    </div>
  `;

  container.style.display = 'block';
  setupFluidMeterDockObserver();
  dockFluidMeter(container);
  makeDraggable();

  renderSkarduInsights(data);

  currentFluidMeter = null;

  // Start animated sweep
  const tempPercent = todayMax !== null ? Math.max(0, Math.min(100, (todayMax + 10) / 50 * 100)) : 50;
  const targetOffset = 289 - (289 * tempPercent) / 100;
  const mercuryOffset = 15 - (15 * tempPercent) / 100;

  setTimeout(() => {
    const fill = document.getElementById('temp-gauge-fill');
    if (fill) {
      fill.style.transition = 'stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1)';
      fill.style.strokeDashoffset = String(targetOffset);
    }
    const mercury = document.getElementById('thermo-mercury');
    if (mercury) {
      mercury.style.transition = 'stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1)';
      mercury.style.strokeDashoffset = String(mercuryOffset);
    }
  }, 100);
}

function renderSkarduInsights(data) {
  const insightsRoot = document.getElementById('damInsights');
  const insightsStrip = document.getElementById('damInsightsStrip');
  const insightsChart = document.getElementById('damInsightsChart');
  const barsTitle = document.getElementById('damBarsTitle');

  if (!insightsRoot || !insightsStrip || !insightsChart || !barsTitle) {
    return;
  }

  insightsRoot.style.display = 'block';
  insightsStrip.style.display = 'none';
  insightsStrip.innerHTML = '';
  barsTitle.style.display = 'none';
  barsTitle.textContent = '';

  const temps = data.skardu_temp || [];
  const latestTemps = temps.filter(t => t.recorded_date === data.latest_date);
  const maxTempObj = latestTemps.find(t => t.metric === 'Maximum') || {};
  const minTempObj = latestTemps.find(t => t.metric === 'Minimum') || {};

  const cards = [];

  const getSkarduChange = (trend, percent) => {
    if (percent === null || percent === undefined) {
      return { arrow: '', value: 'N/A', tone: 'neutral' };
    }
    const delta = parseFloat(percent);
    const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '▶');
    return {
      arrow,
      value: `${Math.abs(delta).toFixed(1)}%`,
      tone: delta > 0 ? 'up' : (delta < 0 ? 'down' : 'neutral')
    };
  };

  const addSkarduCard = (title, label, value, trend, percent) => {
    const change = getSkarduChange(trend, percent);
    cards.push({
      title,
      label,
      value: value !== null && value !== undefined ? `${value.toFixed(1)}°C` : 'N/A',
      changeArrow: change.arrow,
      changeValue: change.value,
      changeTone: change.tone
    });
  };

  if (maxTempObj.today !== undefined) {
    addSkarduCard('Max - Last Year', 'Last Year', maxTempObj.last_year, maxTempObj.variation_trend, maxTempObj.variation_percent);
    addSkarduCard('Max - 5Yr Avg', '5-Yr Avg', maxTempObj.avg_last_5_years, maxTempObj.variation_trend, maxTempObj.variation_percent);
  }
  if (minTempObj.today !== undefined) {
    addSkarduCard('Min - Last Year', 'Last Year', minTempObj.last_year, minTempObj.variation_trend, minTempObj.variation_percent);
    addSkarduCard('Min - 5Yr Avg', '5-Yr Avg', minTempObj.avg_last_5_years, minTempObj.variation_trend, minTempObj.variation_percent);
  }

  insightsChart.innerHTML = `
    <div class="dam-metric-cards" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
      ${cards.map((card) => `
        <div class="dam-metric-card" style="padding: 10px;">
          <div class="dam-metric-title" style="font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 6px;">${escapeHtmlValue(card.title)}</div>
          <div class="dam-metric-row" style="margin-bottom: 4px;">
            <span class="dam-metric-label" style="font-size: 11px; color: #cbd5e1;">${escapeHtmlValue(card.label)}</span>
            <span class="dam-metric-value dam-metric-value-filled" style="font-size: 12px; font-weight: bold; color: #f8fafc;">${escapeHtmlValue(card.value)}</span>
          </div>
          <div class="dam-metric-row">
            <span class="dam-metric-label" style="font-size: 11px; color: #cbd5e1;">% Change</span>
            <span class="dam-metric-value dam-metric-value-change ${escapeHtmlValue(card.changeTone)}" style="font-size: 12px; font-weight: bold;">
              <span class="dam-change-arrow">${escapeHtmlValue(card.changeArrow)}</span>
              <span class="dam-change-text">${escapeHtmlValue(card.changeValue)}</span>
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
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

    alignFFDHistoryPanelToFluidMeter();
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
    foregroundColor: "#fafafa",
    precision: 0
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
    drawGlassReflection();
    if (options.drawText) {
      drawText();
    }
    drawMeterForeground();
  }

  function drawMeterBackground() {
    context.save();
    var cx = options.size / 2;
    var cy = options.size / 2;
    var r = getMeterRadius() / 2 - options.borderWidth;
    
    // Create a 3D-like spherical depth radial gradient
    var grad = context.createRadialGradient(
      cx - r * 0.15, 
      cy - r * 0.15, 
      r * 0.1, 
      cx, 
      cy, 
      r
    );
    grad.addColorStop(0, '#102233');
    grad.addColorStop(0.5, '#08141f');
    grad.addColorStop(1, '#02070d');
    
    context.fillStyle = grad;
    context.beginPath();
    context.arc(cx, cy, r, 0, 2 * Math.PI);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawGlassReflection() {
    var cx = options.size / 2;
    var cy = options.size / 2;
    var r = getMeterRadius() / 2 - options.borderWidth;

    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, 2 * Math.PI);
    context.clip();

    // Create a 3D glass highlight reflection (specular glow) at the top-left
    var grad = context.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = grad;
    context.beginPath();
    context.ellipse(cx - r * 0.2, cy - r * 0.2, r * 0.85, r * 0.65, Math.PI / 4, 0, 2 * Math.PI);
    context.fill();
    context.restore();
  }

  function drawMeterForeground() {
    var cx = options.size / 2;
    var cy = options.size / 2;
    var r = getMeterRadius() / 2 - options.borderWidth / 2;

    // 1. Draw background track ring
    context.save();
    context.lineWidth = options.borderWidth;
    context.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    context.beginPath();
    context.arc(cx, cy, r, 0, 2 * Math.PI);
    context.stroke();
    context.restore();

    // 2. Draw active progress arc with glow
    if (fillPercentage > 0) {
      context.save();
      context.lineWidth = options.borderWidth;
      
      var grad = context.createLinearGradient(0, 0, options.size, options.size);
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(1, '#3b82f6');
      
      context.strokeStyle = grad;
      context.lineCap = 'round';
      
      context.shadowColor = '#06b6d4';
      context.shadowBlur = 4;
      
      context.beginPath();
      var startAngle = -Math.PI / 2;
      var endAngle = startAngle + (2 * Math.PI * currentFillPercentage) / 100;
      context.arc(cx, cy, r, startAngle, endAngle);
      context.stroke();
      context.restore();
    }
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
      if (currentFillPercentage > fillPercentage) {
        currentFillPercentage = fillPercentage;
      }
    } else if (currentFillPercentage > fillPercentage) {
      currentFillPercentage -= 15 * dt;
      if (currentFillPercentage < fillPercentage) {
        currentFillPercentage = fillPercentage;
      }
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
    
    // Create rich linear gradients for fluid layers
    var grad = context.createLinearGradient(0, layer.initialHeight, 0, options.size);
    if (layer === foregroundFluidLayer) {
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
      grad.addColorStop(1, 'rgba(14, 116, 144, 0.3)');
    } else {
      grad.addColorStop(0, 'rgba(14, 116, 144, 0.5)');
      grad.addColorStop(1, 'rgba(8, 47, 73, 0.2)');
    }
    context.fillStyle = grad;
    context.fill();

    // Draw a subtle highlighted crest line on the foreground wave
    if (layer === foregroundFluidLayer) {
      context.save();
      context.beginPath();
      context.moveTo(0, layer.initialHeight);
      x = 0;
      while (x < options.size) {
        y = layer.initialHeight + amplitude * Math.sin((x + layer.horizontalPosition) / layer.frequency);
        context.lineTo(x, y);
        x++;
      }
      context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      context.lineWidth = 1.5;
      context.stroke();
      context.restore();
    }
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
      // Draw a soft-glowing volumetric bubble using a radial gradient
      var radGrad = context.createRadialGradient(
        bubble.x - bubble.r * 0.3,
        bubble.y - bubble.r * 0.3,
        bubble.r * 0.1,
        bubble.x,
        bubble.y,
        bubble.r
      );
      radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      radGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.5)');
      radGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      
      context.fillStyle = radGrad;
      context.arc(bubble.x, bubble.y, bubble.r, 0, 2 * Math.PI);
      context.fill();

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
    var suffix = options.suffix !== undefined ? options.suffix : (options.drawPercentageSign ? "%" : "");
    var precision = options.precision !== undefined ? options.precision : 0;
    var text = currentFillPercentage.toFixed(precision) + suffix;

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
        options.suffix = env.options.suffix !== undefined ? env.options.suffix : undefined;
        options.precision = env.options.precision !== undefined ? env.options.precision : 0;
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
const DEW_EXPOSURE_API_URL_LEGACY = "${apiDewHost}/get-exposures/";

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

// Mobile Resolution Layout Orchestrator: Auto-close overlapping panels
(function() {
  const isMobile = () => window.innerWidth <= 768;

  // Watch for window resize to auto-close if moving from desktop to mobile/tablet width
  window.addEventListener('resize', () => {
    if (isMobile()) {
      const sidebar = document.getElementById('app-sidebar');
      const gisEditPanel = document.querySelector('.gis-layer-edit-panel');
      if (sidebar && !sidebar.classList.contains('is-closed') && gisEditPanel && gisEditPanel.classList.contains('is-open')) {
        closeSidebar();
      }
    }
  });

  // Helper to close the sidebar
  const closeSidebar = () => {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const closeBtn = document.getElementById('sidebar-close');
    if (sidebar && !sidebar.classList.contains('is-closed')) {
      sidebar.classList.add('is-closed');
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.classList.remove('is-hidden');
      }
      if (closeBtn) {
        closeBtn.setAttribute('aria-expanded', 'false');
        closeBtn.style.display = 'none';
      }
    }
  };

  // Helper to close all floating panels
  const closeAllPanels = (excludeId) => {
    // FFD History
    if (excludeId !== 'ffd-history-panel') {
      const p = document.getElementById('ffd-history-panel');
      if (p && p.classList.contains('open')) p.classList.remove('open');
    }
    // Impact Summary
    if (excludeId !== 'impact-summary-panel') {
      const p = document.getElementById('impact-summary-panel');
      if (p && p.classList.contains('open')) p.classList.remove('open');
    }
    // DEW Exposure
    if (excludeId !== 'dew-exposure-panel') {
      const p = document.getElementById('dew-exposure-panel');
      if (p && p.style.display !== 'none') p.style.display = 'none';
    }
    // Style Switcher
    if (excludeId !== 'mapboxgl-style-list') {
      const sl = document.querySelector('.mapboxgl-style-list');
      const sb = document.querySelector('.mapboxgl-style-switcher');
      if (sl && sl.style.display !== 'none') {
        sl.style.display = 'none';
        if (sb) sb.style.display = 'block';
      }
    }
    // GIS Layer Edit
    if (excludeId !== 'gis-layer-edit-panel') {
      const p = document.querySelector('.gis-layer-edit-panel');
      if (p && p.classList.contains('is-open')) p.classList.remove('is-open');
    }
  };

  const setupOrchestrator = () => {
    // 0. Auto-close sidebar on initial load if on mobile/tablet
    if (isMobile()) {
      closeSidebar();
    }

    // 1. Listen for sidebar open
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
      const sidebarObserver = new MutationObserver(() => {
        if (!isMobile()) return;
        if (!sidebar.classList.contains('is-closed')) {
          // Sidebar just opened! Close all other panels.
          closeAllPanels();
        }
      });
      sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    // 2. Listen for FFD History panel open
    const ffdPanel = document.getElementById('ffd-history-panel');
    if (ffdPanel) {
      const ffdObserver = new MutationObserver(() => {
        if (!isMobile()) return;
        if (ffdPanel.classList.contains('open')) {
          closeSidebar();
          closeAllPanels('ffd-history-panel');
        }
      });
      ffdObserver.observe(ffdPanel, { attributes: true, attributeFilter: ['class'] });
    }

    // 3. Listen for Impact Summary panel open
    const impactPanel = document.getElementById('impact-summary-panel');
    if (impactPanel) {
      const impactObserver = new MutationObserver(() => {
        if (!isMobile()) return;
        if (impactPanel.classList.contains('open')) {
          closeSidebar();
          closeAllPanels('impact-summary-panel');
        }
      });
      impactObserver.observe(impactPanel, { attributes: true, attributeFilter: ['class'] });
    }

    // 4. Listen for DEW Exposure panel visibility changes
    const dewPanel = document.getElementById('dew-exposure-panel');
    if (dewPanel) {
      const dewObserver = new MutationObserver(() => {
        if (!isMobile()) return;
        if (dewPanel.style.display !== 'none') {
          closeSidebar();
          closeAllPanels('dew-exposure-panel');
        }
      });
      dewObserver.observe(dewPanel, { attributes: true, attributeFilter: ['style'] });
    }

    // 5. Use event delegation for dynamically added Mapbox controls instead of a heavy subtree MutationObserver
    // Mapbox triggers thousands of internal DOM updates; observing the subtree kills performance on mobile.
    document.addEventListener('click', (e) => {
      if (!isMobile()) return;
      
      const isGisEditBtn = e.target.closest('.gis-layer-edit-btn');
      const isStyleSwitcherBtn = e.target.closest('.mapboxgl-style-switcher');

      if (isGisEditBtn) {
        closeSidebar();
        closeAllPanels('gis-layer-edit-panel');
      } else if (isStyleSwitcherBtn) {
        closeSidebar();
        closeAllPanels('mapboxgl-style-list');
      }
    }, true); // Use capture phase to ensure we catch it even if Mapbox stops propagation

    // 6. Collapsible controls toolbar (mobile only)
    // Inject a gear toggle button into the top-right Mapbox control container
    const ctrlContainer = document.querySelector('.mapboxgl-ctrl-top-right');
    if (ctrlContainer) {
      // Create the wrapper (needs .mapboxgl-ctrl class so Mapbox treats it as a control)
      const toggleWrap = document.createElement('div');
      toggleWrap.className = 'mapboxgl-ctrl controls-master-toggle-wrap';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'controls-master-toggle';
      toggleBtn.title = 'Toggle map controls';
      toggleBtn.setAttribute('aria-label', 'Toggle map controls');
      toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>`;

      toggleWrap.appendChild(toggleBtn);

      // Prepend as the first child so it sits at the top
      ctrlContainer.insertBefore(toggleWrap, ctrlContainer.firstChild);

      // Start collapsed on mobile
      if (isMobile()) {
        ctrlContainer.classList.add('controls-collapsed');
      }

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = ctrlContainer.classList.toggle('controls-collapsed');
        toggleBtn.classList.toggle('is-active', !isCollapsed);
      });

      // On resize: collapse on mobile, expand on desktop
      window.addEventListener('resize', () => {
        if (isMobile()) {
          // Keep whatever state the user has set
        } else {
          ctrlContainer.classList.remove('controls-collapsed');
          toggleBtn.classList.remove('is-active');
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupOrchestrator);
  } else {
    setupOrchestrator();
  }
})();

// Auto-Sync Handler: keeps portal data fresh without requiring manual batch runs
(function initPortalAutoSync() {
  const syncLivePortalData = () => {
    fetch('/api/sync-now', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'success') {
          console.log('🔄 Portal data auto-synced successfully');
        }
      })
      .catch(() => {});
  };

  // Run on initial load and every 5 minutes (300,000 ms)
  setTimeout(syncLivePortalData, 4000);
  setInterval(syncLivePortalData, 300000);
})();
