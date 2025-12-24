// Global GeoServer IP variables
const mamAyman = "172.18.1.188"; // National, Provincial, District, Tehsil
const mamHimael = "172.18.1.151"; // Union Council
const mapDiv = document.getElementById("map1");

// Global variables for blinking functionality
let selectedTehsils = [];
let selectedDistrict = [];
let blinkInterval = null;

// const dashboards = [
//   {
//     toggleBtn: document.getElementById("toggleDashboard"),
//     iframe: document.getElementById("dashboardFrame"),
//     textSpan: document.getElementById("dashboardText"),
//     label: "Hydro Dashboard"
//   },
//   {
//     toggleBtn: document.getElementById("toggleHydrostructure"),
//     iframe: document.getElementById("hydrostructureFrame"),
//     textSpan: document.getElementById("hydrostructureText"),
//     label: "Hydrostructure Portal"
//   }
// ];


// //iframe toggling for hydro dashboard
// let activeDashboard = null;

// function toggleDashboard(targetDashboard) {
//   const isSame = activeDashboard === targetDashboard;
//   activeDashboard = isSame ? null : targetDashboard;

//   // Loop through all dashboards and update visibility
//   dashboards.forEach(d => {
//     if (d === targetDashboard && !isSame) {
//       d.iframe.classList.remove("hidden");
//       d.textSpan.textContent = "Back to Map";
//     } else {
//       d.iframe.classList.add("hidden");
//       d.textSpan.textContent = d.label;
//     }
//   });

//   // Toggle map children visibility
//   Array.from(mapDiv.children).forEach(child => {
//     if (child.tagName === "IFRAME") return; // skip iframe handling here
//     child.style.display = activeDashboard ? "none" : "";
//   });
// }

// dashboards.forEach(d => {
//   d.toggleBtn.addEventListener("click", () => toggleDashboard(d));
// });

// // On page load, show only map content
// toggleDashboard(null);

//This is for blink button Tehsils (Tehsil Layer)
function handleTslBoundary(checkbox) {
  const btn = document.getElementById('blinkLayersBtn');
  if (checkbox.checked) {
    // Show the button
    btn.style.display = 'flex';
    // Optionally add the layer back if it doesn't exist
    if (!map1.getLayer("TehsilBoundaryHighlight")) {
      map1.addLayer({
        id: "TehsilBoundaryHighlight", // Layer to show highlight
        type: "fill",
        source: "tehsilBoundary",
        "source-layer": "Tehsil_Boundary",
        paint: {
          "fill-color": "orange", // Highlight color
          "fill-opacity": 0.3, // Semi-transparent
        },
        filter: ["in", "TEHSIL", ""], // Initially no features are selected
      }, 'water');
    }
  } else {
    // Hide the button
    btn.style.display = 'none';
    // Remove the highlight layer if it exists
    if (map1.getLayer("TehsilBoundaryHighlight")) {
      map1.removeLayer("TehsilBoundaryHighlight");
    }
  }
}

//This is for blink button districts
function handleDisBoundary(checkbox) {
  const btn = document.getElementById('blinkLayersBtn');
  if (checkbox.checked) {
    // Show the button
    btn.style.display = 'flex';
    // Optionally add the layer back if it doesn't exist
    if (!map1.getLayer("DistrictBoundaryHighlight")) {
      map1.addLayer({
        id: "DistrictBoundaryHighlight", // Layer to show highlight
        type: "fill",
        source: "districtBoundary",
        "source-layer": "District_Boundary",
        paint: {
          "fill-color": "orange", // Highlight color
          "fill-opacity": 0.3, // Semi-transparent
        },
        filter: ["in", "DISTRICT", ""], // Initially no features are selected
      }, 'water');
    }
  } else {
    // Hide the button
    btn.style.display = 'none';
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
  map.addSource("nationalBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/abdul_sattar:National_Boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map.addLayer({
    id: "nationalBoundary",
    type: "line",
    source: "nationalBoundary",
    "source-layer": "National_Boundary",
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
  map.addSource("provincialBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/abdul_sattar:Provincial_Boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map.addLayer({
    id: "provincialBoundary",
    type: "line",
    source: "provincialBoundary",
    "source-layer": "Provincial_Boundary",
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
  map.addSource("districtBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/abdul_sattar:District_Boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map.addLayer({
    id: "DistrictBoundary",
    type: "fill",
    source: "districtBoundary",
    "source-layer": "District_Boundary",
    layout: {
      visibility: "visible", // Ensure it's visible
    },
    paint: {
      "fill-opacity": 0.2,
      "fill-color": "transparent",
    },
  });
  map.addLayer({
    id: "districtBoundary",
    type: "line",
    source: "districtBoundary",
    "source-layer": "District_Boundary",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 0.8,
      "line-color": "purple",
      "line-width": 1.5,
    },
  });
  map.addLayer({
    id: "districtBoundary_label",
    type: "symbol",
    source: "districtBoundary",
    "source-layer": "District_Boundary",
    minzoom: 6,
    layout: {
      visibility: "none",
      "text-field": "{DISTRICT}",
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

  map.addLayer({
    id: "DistrictBoundaryHighlight", // Layer to show highlight
    type: "fill",
    source: "districtBoundary",
    "source-layer": "District_Boundary",
    paint: {
      "fill-color": "orange", // Highlight color
      "fill-opacity": 0.3, // Semi-transparent
    },
    filter: ["in", "DISTRICT", ""], // Initially no features are selected
  }, 'water');

  // Arrays are now global - no need to redeclare here

  // Add the source
  map.addSource("tehsilBoundary", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamAyman}:8080/geoserver/gwc/service/tms/1.0.0/abdul_sattar:Tehsil_Boundary@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  // Add the boundary line layer
  map.addLayer({
    id: "TehsilBoundaryLine",
    type: "line",
    source: "tehsilBoundary",
    "source-layer": "Tehsil_Boundary",
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
  map.addLayer({
    id: "TehsilBoundary",
    type: "fill",
    source: "tehsilBoundary",
    "source-layer": "Tehsil_Boundary",
    layout: {
      visibility: "visible", // Ensure it's visible
    },
    paint: {
      "fill-opacity": 0.2,
      "fill-color": "transparent",
    },
  });



  // Add a highlighted layer for interaction
  map.addLayer({
    id: "TehsilBoundaryHighlight", // Layer to show highlight
    type: "fill",
    source: "tehsilBoundary",
    "source-layer": "Tehsil_Boundary",
    paint: {
      "fill-color": "orange", // Highlight color
      "fill-opacity": 0.3, // Semi-transparent
    },
    filter: ["in", "TEHSIL", ""], // Initially no features are selected
  }, 'water');


  map.addLayer({
    id: "tehsilBoundary_label",
    type: "symbol",
    source: "tehsilBoundary",
    "source-layer": "Tehsil_Boundary",
    minzoom: 6,
    layout: {
      visibility: "none",
      "text-field": "{TEHSIL}",
      "text-letter-spacing": 0.1,
      "text-size": 13,
      "text-offset": [0, 0],
      "text-anchor": "center",
    },
    paint: {
      "text-color": "black",

    },
  });
 
 
  // Add click event listener
// Add click event listener for Districts
map.on("click", "DistrictBoundary", (e) => {
  // Check if TehsilBoundary is visible
  const visibility = map.getLayoutProperty("districtBoundary_label", "visibility");

  if (visibility !== "visible") {
    return; // If not visible, do nothing
  }

  // ADDED: Check if blinking is active - if so, prevent new selections
  if (blinkInterval) {
    console.log("Blinking is active - district selection is locked");
    return; // Exit early if blinking is active
  }

  if (e.features && e.features.length > 0) {
    const clickedFeature = e.features[0];
    const districtName = clickedFeature.properties.DISTRICT;

    if (!selectedDistrict.includes(districtName)) {
      selectedDistrict.push(districtName);
    } else {
      selectedDistrict = selectedDistrict.filter(name => name !== districtName);
    }

    map.setFilter("DistrictBoundaryHighlight", ["in", "DISTRICT", ...selectedDistrict]);
  }
});
  // Change the cursor when hovering over the TehsilBoundary
  map.on("mouseenter", "DistrictBoundary", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "DistrictBoundary", () => {
    map.getCanvas().style.cursor = "";
  });

  // Add click event listener
// Add click event listener for Tehsils
map.on("click", "TehsilBoundary", (e) => {
  // Check if TehsilBoundary is visible
  const visibility = map.getLayoutProperty("tehsilBoundary_label", "visibility");

  if (visibility !== "visible") {
    return; // If not visible, do nothing
  }

  // ADDED: Check if blinking is active - if so, prevent new selections
  if (blinkInterval) {
    console.log("Blinking is active - tehsil selection is locked");
    return; // Exit early if blinking is active
  }

  if (e.features && e.features.length > 0) {
    const clickedFeature = e.features[0];
    const tehsilName = clickedFeature.properties.TEHSIL;

    if (!selectedTehsils.includes(tehsilName)) {
      selectedTehsils.push(tehsilName);
    } else {
      selectedTehsils = selectedTehsils.filter(name => name !== tehsilName);
    }

    map.setFilter("TehsilBoundaryHighlight", ["in", "TEHSIL", ...selectedTehsils]);
  }
});

  // Change the cursor when hovering over the TehsilBoundary
  map.on("mouseenter", "TehsilBoundary", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "TehsilBoundary", () => {
    map.getCanvas().style.cursor = "";
  });


  map.addSource("Union_Council", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://${mamHimael}:8080/geoserver/gwc/service/tms/1.0.0/zeeshan:Union_Council@EPSG:900913@pbf/{z}/{x}/{y}.pbf`
    ],
  });
  map.addLayer({
    id: "Union_Council",
    type: "line",
    source: "Union_Council",
    "source-layer": "Union_Council",
    layout: {
      visibility: "none",
    },
    paint: {
      "line-opacity": 1,
      "line-color": "brown",
      "line-width": 1,
    },
  });
  map.addLayer({
    id: "unionBoundary_label",
    type: "symbol",
    source: "Union_Council",
    "source-layer": "Union_Council",
    minzoom: 8,
    layout: {
      visibility: "none",
      "text-field": "{UC}",
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

  // Initial setup
  map1.on('load', function () {
    addBoundaryLayers(map1);
    const visibilityState = getVisibilityStates();
    applyVisibilityStates(map1, visibilityState);

    // Add toggle logic for checkboxes
    boundaryToggles.forEach(toggle => {
      const checkbox = document.getElementById(toggle.checkboxId);
      if (checkbox) {
        checkbox.addEventListener('change', function () {
          const isVisible = this.checked;
          toggle.layers.forEach(layerId => {
            setLayerVisibility(map1, layerId, isVisible);
            setLayerVisibility(map2, layerId, isVisible);
          });
        });
      }
    });
  });

  map2.on('load', function () {
    addBoundaryLayers(map2);
    const visibilityState = getVisibilityStates();
    applyVisibilityStates(map2, visibilityState);
  });

  // Re-add boundary layers after base style is changed on map1
  map1.on('style.load', function () {
    addBoundaryLayers(map1); // Re-add all sources and layers
    const visibilityState = getVisibilityStates(); // Reapply visibility
    applyVisibilityStates(map1, visibilityState);
  });
});
// Function to set layer visibility
function setLayerVisibility(map, layerId, isVisible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
  }
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
    return new Promise(resolve => {
      if (map1 && map1.isStyleLoaded && map1.isStyleLoaded()) {
        resolve();
      } else if (map1) {
        map1.once('style.load', resolve);
      } else {
        resolve(); // Fallback if map1 is not available
      }
    });
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
        timestampsEl.innerHTML = timestamps.map((time, index) =>
          `<span class="text-center cursor-pointer hover:bg-gray-600 p-1 rounded ${index === 0 ? 'active' : ''}"
                 style="width: ${100 / config.layerCount}%"
                 onclick="weatherController.updateLayer('${controllerId}', ${index})">${time}</span>`
        ).join('');
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

  // Add layers when map loads
  map1.on('style.load', () => {
    idSuffixes.forEach((suffix, index) => {
      const id = `forecast_${suffix}`;
      const time = getNextNDays(index);

      // Add source
      map1.addSource(id, {
        type: 'raster',
        tiles: [
          `https://maps.effis.emergency.copernicus.eu/gwis?SERVICE=WMS&REQUEST=GetMap&LAYERS=ecmwf.extra.lightning&VERSION=1.3.0&FORMAT=image/png&TRANSPARENT=true&WIDTH=1439&HEIGHT=602&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&TIME=${time}` // <-- Fixed template literal
        ],
        tileSize: 256
      });

      // Add layer
      map1.addLayer({
        id: id,
        type: 'raster',
        source: id,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': index === 0 ? 1 : 0 }
      });
    });
    // restoreLayerVisibility(map1);
  });
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

  // Add the weekly precipitation layers once the map loads
  map1.on('style.load', () => {
    for (let index = 0; index < totalWPAIndex; index++) {
      const layerId = `Convective_precipitation_weekly_kgm2_forecast_${index + 1}`;
      // Add the raster source for each forecast day using your custom time function
      map1.addSource(layerId, {
        type: 'raster',
        tiles: [
          `https://geo.weather.gc.ca/geomet?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&time=${getNextNDaysWithTime(index + 1, "00", "00", "00")}&layers=GDPS.ETA_PR`
        ]
      });
      // Add the layer (with the initial opacity set to 1 for the first layer and 0 for the rest)
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
      }, 'nationalBoundary')
    }
    // restoreLayerVisibility(map1);
  });

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

  // Add the 12 monthly precipitation layers once the map loads
  map1.on('style.load', () => {
    // Add layers for each month
    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      const sourceId = `Precipitation_2026_source_${month}`;
      
      if (!map1.getSource(sourceId)) {
        // Add source for each month
        map1.addSource(sourceId, {
          'type': 'raster',
          'tiles': [
            `http://${ahad}:8080/geoserver/Precipitation_2026/wms?service=WMS&version=1.1.0&request=GetMap&layers=Precipitation_2026:${month}&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
          ],
          'tileSize': 256
        });
      }

      if (!map1.getLayer(layerId)) {
        // Add layer
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
  });

  // Toggle visibility of the Precipitation 2026 layers
  precip2026Toggle.addEventListener('change', (e) => {
    const visible = e.target.checked;
    
    for (let month = 1; month <= totalMonths; month++) {
      const layerId = `Precipitation_2026_month_${month}`;
      if (map1.getLayer(layerId)) {
        map1.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }
    
    if (visible) {
      updateActivePrecip2026Layer(0);
    }

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
  const img = document.getElementById('slideshowImage');
  const counter = document.getElementById('slideCounter');
  const title = document.getElementById('slideTitle');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
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
  const btn = document.getElementById('playPauseBtn');
  const icon = btn.querySelector('i');
  
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