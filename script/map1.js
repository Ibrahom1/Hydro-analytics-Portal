// Global GeoServer IP variables
const mustafa = "172.18.1.60"; // Swat, Panjgora, etc.
const ahad = "172.18.1.73"; // AJK, Jhal, hyd layers, etc.
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

function swapLngLatInGeoJSON(gj) {
  const flipPair = (c) => (Array.isArray(c) && c.length >= 2 ? [c[1], c[0], ...c.slice(2)] : c);

  const flipCoords = (geom) => {
    if (!geom) return geom;
    const { type, coordinates, geometries } = geom;

    switch (type) {
      case 'Point':
        return { ...geom, coordinates: flipPair(coordinates) };
      case 'MultiPoint':
      case 'LineString':
        return { ...geom, coordinates: coordinates.map(flipPair) };
      case 'MultiLineString':
      case 'Polygon':
        return { ...geom, coordinates: coordinates.map(ring => ring.map(flipPair)) };
      case 'MultiPolygon':
        return { ...geom, coordinates: coordinates.map(poly => poly.map(ring => ring.map(flipPair))) };
      case 'GeometryCollection':
        return { ...geom, geometries: geometries.map(g => flipCoords(g)) };
      default:
        return geom;
    }
  };

  const swapLatLonProps = (props = {}) => {
    const latKeys = ['lat', 'latitude', 'LAT', 'Lat'];
    const lonKeys = ['lon', 'lng', 'long', 'longitude', 'LON', 'Lon', 'Lng'];

    const findKey = (keys) => keys.find(k => Object.prototype.hasOwnProperty.call(props, k));
    const latK = findKey(latKeys);
    const lonK = findKey(lonKeys);

    if (latK && lonK) {
      const tmp = props[latK];
      props[latK] = props[lonK];
      props[lonK] = tmp;
    }
    return props;
  };

  // Feature
  const fixFeature = (f) => ({
    ...f,
    geometry: flipCoords(f.geometry),
    properties: swapLatLonProps({ ...(f.properties || {}) })
  });

  // FeatureCollection vs single Feature/Geometry
  if (gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
    return { ...gj, features: gj.features.map(fixFeature) };
  }
  if (gj && gj.type === 'Feature') {
    return fixFeature(gj);
  }
  // raw Geometry
  return flipCoords(gj);
}


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
          map1.setFilter("TehsilBoundaryHighlight", ["in", "TEHSIL", ...blinkingState.selectedTehsils]);
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
  "glofas", "ffd_point", "ffd_label", "DI_Khan_HT", "DG khan HT", "Pir_Panjal_HT",
  "Hyderabad_arc", "jhal_magsi_arc_Complete", "KIRTHAR_RANGE", "lihfex", "limfex",
  "lilfex", "uihfex", "uilfex", "chfex", "clfex", "klfex", "jhfex", "jmfex",
  "3_Swat_River_50yr_Flood_Extent", "1_Swat_River_5yr_Flood_Extent", "Muzafferabad_arc",
  "Jamshoro flooding", "rhfex", "rmfex", "shfex", "smfex", "urban_sindh", "indian",
  "Future", "Ready_for_Construction", "Ongoing", "Under_construction", "STREAM_412_5_9"
];

///Map
mapboxgl.accessToken = 'pk.eyJ1IjoiemVlc2hhbjEwIiwiYSI6ImNtMXN0YXVhbTBhYnIybHNhOHRheHRwOWoifQ.vgmSlaE3lAnZPy59Ni7SkQ';
const map1 = new mapboxgl.Map({
  container: 'map1',
  style: 'mapbox://styles/mapbox/outdoors-v12',
  center: [69.3451, 30.3753],
  zoom: 5.2,
  projection: 'mercator'
});

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
      geojson = swapLngLatInGeoJSON(geojson);


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

                        .discharge-section, .trend-section {
                            margin-bottom: 8px;
                        }

                        .discharge-grid, .trend-grid {
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                        }

                        .discharge-item, .trend-item {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 4px 8px;
                            background: #f8f9fa;
                            border-radius: 6px;
                            border: 1px solid #e3f2fd;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
                        }

                        .discharge-label, .trend-label {
                            font-size: 13px;
                            font-weight: 500;
                            color: #495057;
                        }

                        .discharge-value {
                            font-size: 14px;
                            font-weight: 700;
                            color: #212529;
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
          'Mangla Dam': { percentage: fillPercentage_Mangla, level: val_Mangla },
          'Chashma': { percentage: fillPercentage_Chashma, level: val_Chashma },
          'Tarbela Dam': { percentage: fillPercentage_Tarbela, level: val_Tarbela }
        };

        if (damData.hasOwnProperty(props.name)) {
          const dam = damData[props.name];
          showDamFluidMeter(props.name, dam.percentage, dam.level);
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

  // Add FFD layers when map is loaded or if already loaded
  if (map1.isStyleLoaded()) {
    addFFDLayers();
  } else {
    map1.on('load', addFFDLayers);
  }

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
  }, 'water');

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
  }, 'water');

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
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:DI_Khan_HT@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "DI_Khan_HT",
    type: "fill",
    source: "DI_Khan_HT",
    "source-layer": "DI_Khan_HT",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  }, 'water');
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
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:DG khan HT@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "DG khan HT",
    type: "fill",
    source: "DG khan HT",
    "source-layer": "DG khan HT",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  }, 'water');
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
  }, 'water');
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
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Hyderabad_arc@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Hyderabad_arc",
    type: "fill",
    source: "Hyderabad_arc",
    "source-layer": "Hyderabad_arc",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  }, 'water');
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
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:jhal_magsi_arc_Complete@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "jhal_magsi_arc_Complete",
    type: "fill",
    source: "jhal_magsi_arc_Complete",
    "source-layer": "jhal_magsi_arc_Complete",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.5,
      "fill-color": "red",
    },
  }, 'water');
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
  }, 'water');
  document.getElementById("Kirthar_extent").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "KIRTHAR_RANGE",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });
  ///Flood extent of riverine flooding
  //lower indus high flood extent
  map1.addSource("lihfex", {
    type: "geojson",
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Alihfex&maxFeatures=50&outputFormat=application%2Fjson`,
  });

  map1.addLayer({
    id: "lihfex",
    type: "fill",
    source: "lihfex",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
    type: "geojson",
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Alimflex&maxFeatures=50&outputFormat=application%2Fjson`,
  });

  map1.addLayer({
    id: "limfex",
    type: "fill",
    source: "limfex",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:lilfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "lilfex",
    type: "fill",
    source: "lilfex",
    "source-layer": "lilfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:uihfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "uihfex",
    type: "fill",
    source: "uihfex",
    "source-layer": "uihfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:Upper_indus_flood@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Upper_indus_flood",
    type: "fill",
    source: "Upper_indus_flood",
    "source-layer": "Upper_indus_flood",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:uilfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "uilfex",
    type: "fill",
    source: "uilfex",
    "source-layer": "uilfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:chfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: 'chfex',
    type: 'fill',
    source: "chfex",
    "source-layer": "chfex",
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
    layout: {
      'visibility': 'none'
    }
  }, 'water');

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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:cmfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "cmfex",
    type: "fill",
    source: "cmfex",
    "source-layer": "cmfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:clfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: 'clfex',
    type: 'fill',
    source: "clfex",
    "source-layer": "clfex",
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
    layout: {
      'visibility': 'none'
    }
  }, 'water');

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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:khfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "khfex",
    type: "fill",
    source: "khfex",
    "source-layer": "khfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:Kabil_medium_flood@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "Kabil_medium_flood",
    type: "fill",
    source: "Kabil_medium_flood",
    "source-layer": "Kabil_medium_flood",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.9,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:klfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "klfex",
    type: "fill",
    source: "klfex",
    "source-layer": "klfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:jhfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "jhfex",
    type: "fill",
    source: "jhfex",
    "source-layer": "jhfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Ajmfex&maxFeatures=50&outputFormat=application%2Fjson`,
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
  }, 'water');
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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:jlfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "jlfex",
    type: "fill",
    source: "jlfex",
    "source-layer": "jlfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:3_Swat_River_50yr_Flood_Extent@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "3_Swat_River_50yr_Flood_Extent",
    type: "fill",
    source: "3_Swat_River_50yr_Flood_Extent",
    "source-layer": "3_Swat_River_50yr_Flood_Extent",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:2_Swat_River_25yr_Flood_Extent@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "2_Swat_River_25yr_Flood_Extent",
    type: "fill",
    source: "2_Swat_River_25yr_Flood_Extent",
    "source-layer": "2_Swat_River_25yr_Flood_Extent",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:1_Swat_River_5yr_Flood_Extent@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "1_Swat_River_5yr_Flood_Extent",
    type: "fill",
    source: "1_Swat_River_5yr_Flood_Extent",
    "source-layer": "1_Swat_River_5yr_Flood_Extent",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
  }, 'water');
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
  }, 'jhal_magsi_arc_full');


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
        }, 'water'); // Use 'water' as beforeId for proper ordering
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
  }, 'water');
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
    type: "geojson",
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Arhfex&maxFeatures=50&outputFormat=application%2Fjson`,
  });

  map1.addLayer({
    id: "rhfex",
    type: "fill",
    source: "rhfex",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
    type: "geojson",
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Armfex&maxFeatures=50&outputFormat=application%2Fjson`,
  });

  map1.addLayer({
    id: "rmfex",
    type: "fill",
    source: "rmfex",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:rlfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "rlfex",
    type: "fill",
    source: "rlfex",
    "source-layer": "rlfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:shfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "shfex",
    type: "fill",
    source: "shfex",
    "source-layer": "shfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.6,
      "fill-color": "red",
    },
  }, 'water');
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
    type: "geojson",
    data: `http://${mamAyman}:8080/geoserver/WaterResourceMonitoring/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=WaterResourceMonitoring%3Asmfex&maxFeatures=50&outputFormat=application%2Fjson`,
  });

  map1.addLayer({
    id: "smfex",
    type: "fill",
    source: "smfex",
    layout: {
      visibility: "none", // initially hidden
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.8,
      "fill-color": "orange",
    },
  }, 'water');
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
      `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:slfex@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "slfex",
    type: "fill",
    source: "slfex",
    "source-layer": "slfex",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-outline-color": "red",
      "fill-opacity": 0.45,
      "fill-color": "green",
    },
  }, 'water');
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:Barrages@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add the circle layer for Barrages
  map1.addLayer({
    id: "Barrages",
    type: "circle",
    source: "Barrages",
    "source-layer": "Barrages",
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
    const name2 = feature.properties.Name2 || "No Name2 attribute";

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
    type: "geojson",
    data: breach // your GeoJSON variable
  });
  map1.addLayer({
    id: "breach_points",
    type: "circle",
    source: "breach_points",
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
  ////Indian Structures
  map1.addSource("indian", {
    type: "geojson",
    data: indian // your GeoJSON variable
  });

  // 2. Add circle layer (remove source-layer)
  map1.addLayer({
    id: "indian",
    type: "circle",
    source: "indian",
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": "red",
      "circle-radius": 4,
    }
  });

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
      'BHAKRA DAM': { percentage: fillPercentage_Bhakra, level: val_Bhakra },
      'PONG DAM': { percentage: fillPercentage_Pong, level: val_Pong },
      'THEIN DAM': { percentage: fillPercentage_Thein, level: val_Thein }
    };
    const damName = feature.properties.Name;
    if (indianDamData.hasOwnProperty(damName)) {
      const dam = indianDamData[damName];
      showDamFluidMeter(damName, dam.percentage, dam.level);
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
      tiles: [`http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/ne:Under_construction@EPSG:900913@pbf/{z}/{x}/{y}.pbf`]
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
      "source-layer": "Under_construction", // Matches the actual layer name in vector tiles
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

      const projectNa = properties.Project_Na || 'N/A';
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
      this._btn.innerHTML = '🗓';
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
  // Prevent duplicate control if script re-runs or style is swapped and code path executes again.
  if (!window.__timeLayerControlAdded) {
    map1.addControl(new TimeLayerControl(), 'top-right');
    window.__timeLayerControlAdded = true;
  }
  /******************* END TIME-ENABLED LAYER SUPPORT (v2) *******************/


  //Reservoir layer
  if (!map1.getSource("Dams_Water_Bodies")) {
    map1.addSource("Dams_Water_Bodies", {
      type: "vector",
      scheme: "tms",
      tiles: [
        `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:Dams_Water_Bodies@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
      ],
    });
  }

  if (!map1.getLayer("Dams_Water_Bodies")) {
    map1.addLayer({
      id: "Dams_Water_Bodies",
      type: "fill",
      source: "Dams_Water_Bodies",
      "source-layer": "Dams_Water_Bodies",
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
      "http://172.18.7.21:8080/geoserver/gwc/service/tms/1.0.0/hydrological_global:minor_rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf",
    ],
  });

  // Add Minor Rivers outline layer
  map1.addLayer({
    id: "minor_rivers_outline",
    type: "line",
    source: "minor_rivers",
    "source-layer": "minor_rivers",
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
    "source-layer": "minor_rivers",
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
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/WaterResourceMonitoring:Pakistan_Rivers@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add Pakistan Rivers layer
  map1.addLayer({
    id: "Pakistan_Rivers",
    type: "line",
    source: "Pakistan_Rivers",
    "source-layer": "Pakistan_Rivers",
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
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:KP_RIVERS@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });


  map1.addLayer({
    id: "KP_RIVERS",
    type: "line",
    source: "KP_RIVERS",
    "source-layer": "KP_RIVERS",
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
  document.getElementById("flood2022").addEventListener("change", function () {
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

  //2024 FLOOD EXTENT
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
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:protection_band@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Line Layer for Protection Band
  map1.addLayer({
    id: "protection_band_line",
    type: "line",
    source: "protection_band",
    "source-layer": "protection_band", // must match the layer name inside the PBF
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
    "source-layer": "protection_band", // must match
    minzoom: 10, // show labels only after zoom level 10
    layout: {
      "text-field": ["get", "Descrption"], // field from attributes
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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:bunerflood@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map1.addLayer({
    id: "bunerflood",
    type: "fill",
    source: "bunerflood",
    "source-layer": "bunerflood",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-opacity": 0.4,
      "fill-color": "blue",
    },
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
  }, 'water');

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
          `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Main_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('branch_canals_src')) {
      map1.addSource('branch_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Branch_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('link_canals_src')) {
      map1.addSource('link_canals_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Link_Canals@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
        ]
      });
    }
    if (!map1.getSource('distributories_src')) {
      map1.addSource('distributories_src', {
        type: 'vector',
        scheme: 'tms',
        tiles: [
          `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/Hydromet:Distributories@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
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

      const popupHTML = (name, parent) => `
        <div class="ffd-popup-container">
          <div class="popup-content">
            <h3 class="section-title"><i class="fas fa-water"></i> Canal Segment</h3>
            <div class="discharge-item"><span class="discharge-label">Name:</span><span class="discharge-value">${name || 'N/A'}</span></div>
            <div class="discharge-item"><span class="discharge-label">Parent Channel:</span><span class="discharge-value">${parent || 'N/A'}</span></div>
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
          const parent = props.PARENT_CH || props.PARENT || '';

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



  ////3d buildings layer
  map1.addLayer(
    {
      'id': 'add-3d-buildings',
      'source': 'composite',
      'source-layer': 'building',
      'filter': ['==', 'extrude', 'true'],
      'type': 'fill-extrusion',
      'minzoom': 15,
      'paint': {
        'fill-extrusion-color': '#aaa',

        // Use an 'interpolate' expression to
        // add a smooth transition effect to
        // the buildings as the user zooms in.
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
    },
  );
  //WATER SHED LAYER
  if (!map1.getSource("Combined")) {
    map1.addSource("Combined", {
      type: "vector",
      scheme: "tms",
      tiles: [
        `http://${mustafa}:8080/geoserver/gwc/service/tms/1.0.0/ne:Combined@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
      ],
    });
  }

  if (!map1.getLayer("Combined")) {
    map1.addLayer(
      {
        id: "Combined",
        type: "fill",
        source: "Combined", // Updated to match the source created above
        "source-layer": "Combined",
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
      'water'
    );
  }


  document.getElementById("watershed").addEventListener("change", function () {
    const isVisible = this.checked;
    map1.setLayoutProperty(
      "Combined",
      "visibility",
      isVisible ? "visible" : "none"
    );
  });
}
map1.on('style.load', () => {
  // addJhelumFloodLayers(map1);
  addHydrometLayersToMap(map1);
  // updateSliderPosition(1);
});
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
          map.setStyle(newStyleUri);

          // Wait for style to fully load, then restore layers
          map.once("style.load", () => {
            // If satellite style, add a dummy 'water' layer to maintain layer ordering
            if (newStyleUri.includes('satellite')) {
              // Add an invisible water layer for proper layer ordering
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

            // Reset the hydromet layers flag for the new style
            map._hydrometLayersAdded = false;

            // Re-add all layers and restore states
            setTimeout(() => {
              addHydrometLayersToMap(map);

              // Restore checkbox states after layers are added - increased timeout for better reliability
              setTimeout(() => {
                restoreCheckboxStates();
              }, 2000); // Increased from 300ms to 2000ms (2 seconds)
            }, 500); // Increased from 200ms to 500ms
          });

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
MapboxStyleSwitcherControl.DEFAULT_STYLE = "Satellite";
MapboxStyleSwitcherControl.DEFAULT_STYLES = [
  { title: "Navigation Night", uri: "mapbox://styles/mapbox/navigation-night-v1" },
  { title: "Light", uri: "mapbox://styles/mapbox/light-v11" },
  { title: "Monochrome", uri: "mapbox://styles/daudi97/ckcouhqzd0l1f1io3zw42a9s7" },
  { title: "Pencil", uri: "mapbox://styles/daudi97/ckdudgjow12jd19prca4m3p1a" },
  { title: "Dark", uri: "mapbox://styles/mapbox/dark-v11" },
  { title: "Outdoors", uri: "mapbox://styles/mapbox/outdoors-v12" },
  { title: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12" },
  { title: "Streets", uri: "mapbox://styles/mapbox/streets-v12" },
];
map1.addControl(new mapboxgl.FullscreenControl());
map1.addControl(new MapboxStyleSwitcherControl());
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
    button.innerHTML = `<i class="fas fa-cloud-showers-heavy"></i>`;
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
    this._btn.innerHTML = '<i class="fa fa-line-chart"></i>';
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
      this._button.innerHTML = `<img src="media/UI/3d.png" alt="threed" style="width: 25px; height: 25px;">`;
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
    { checkboxId: 'Barrages', layers: ['Barrages'] },
    { checkboxId: 'watershed', layers: ['Combined'] },
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
map1.on('style.load', function () {
  addHydrometLayersToMap(map1); // Re-add all sources and layers
  const visibilityState = getMap1VisibilityStates(); // Get current checkbox states
  applyMap1VisibilityStates(map1, visibilityState); // Reapply visibility
  setTimeout(() => moveAllLabelsToTop(map1), 1000); // Ensure labels are on top after all layers are added
});

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

// Make the fluid meter container draggable
function makeDraggable() {
  const container = document.getElementById('fluidMeterContainer');
  if (!container || isDraggableSetup) return;

  // Add draggable cursor style
  container.style.cursor = 'move';

  // Store original CSS values for reset
  const originalTop = container.style.top || '50%';
  const originalRight = container.style.right || '20px';
  const originalTransform = container.style.transform || 'translateY(-50%)';

  // Store these as data attributes for later restoration
  container.setAttribute('data-original-top', originalTop);
  container.setAttribute('data-original-right', originalRight);
  container.setAttribute('data-original-transform', originalTransform);

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
function showDamFluidMeter(damName, percentage, reservoirLevel) {
  const container = document.getElementById('fluidMeterContainer');
  const title = document.getElementById('meterTitle');
  const meterDiv = document.getElementById('fluid-meter');
  const reservoirValue = document.getElementById('reservoirValue');

  // Check if elements exist before setting properties
  if (!container || !title || !meterDiv || !reservoirValue) {
    console.error('Fluid meter HTML elements not found. Make sure you added the HTML container.');
    return;
  }

  // Set dam name and reservoir level
  title.textContent = damName;
  reservoirValue.textContent = reservoirLevel + ' ft';

  // Clear previous meter
  meterDiv.innerHTML = '';

  // Show container and make it draggable
  container.style.display = 'block';
  makeDraggable();

  // Create new fluid meter
  try {
    currentFluidMeter = new FluidMeter();
    currentFluidMeter.init({
      targetContainer: meterDiv,
      fillPercentage: percentage,
      options: {
        fontFamily: "Oxygen",
        fontSize: "27px",
        drawPercentageSign: true,
        drawBubbles: true,
        size: 180,
        borderWidth: 4,
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
    const originalTop = container.getAttribute('data-original-top') || '50%';
    const originalRight = container.getAttribute('data-original-right') || '20px';
    const originalTransform = container.getAttribute('data-original-transform') || 'translateY(-50%)';

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
    context.filter = "drop-shadow(0px 0px 5px rgba(0,0,0,0.4))"
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