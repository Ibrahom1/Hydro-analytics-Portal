///File depreceted maybe used layer have some met layers flood extent layers already exported to map1


const map2Layers = [
  "glofas", "G15_Flood_Inundation_2010_SUPARCO", "pak_precip_July",
  "pak_precip_aug", "pak_precip_sept", "pak_precip_jas",
  "pak_temp_July_proj", "pak_temp_aug_proj",
  "nationalBoundary", "provincialBoundary", "districtBoundary", "districtBoundary_label",
  "DistrictBoundary", "TehsilBoundary", "TehsilBoundaryLine", "tehsilBoundary_label",
  "Union_Council", "DistrictBoundaryHighlight", "TehsilBoundaryHighlight"
];

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiemVlc2hhbjEwIiwiYSI6ImNtMXN0YXVhbTBhYnIybHNhOHRheHRwOWoifQ.vgmSlaE3lAnZPy59Ni7SkQ';

// Initialize Mapbox map
const map2 = new mapboxgl.Map({
  container: 'map2',
  style: 'mapbox://styles/mapbox/satellite-v9',
  center: [70, 30],
  zoom: 4.5,
  projection: 'mercator'
});

//Layers
map2.on('load', function () {


  //2010 FLOOD EXTENT 
  map2.addSource("G15_Flood_Inundation_2010_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/Humza:G15_Flood_Inundation_2010_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "G15_Flood_Inundation_2010_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });



  // map2.addSource("Swat_rivert", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:Swat_rivert@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
  //   ],
  // });
  // map2.addLayer({
  //   id: "Swat_rivert",
  //   type: "fill",
  //   source: "Swat_rivert",
  //   "source-layer": "Swat_rivert",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "fill-opacity": 0.9,
  //     "fill-color": "#00FFFF",
  //   },
  // });
  // document.getElementById("swatRiver").addEventListener("change", function () {
  //   const isVisible = this.checked;

  //   // Correctly set the layer visibility property
  //   map2.setLayoutProperty(
  //       "Swat_rivert",
  //       "visibility", // Specify the 'visibility' layout property
  //       isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
  //   );
  // });




  // map2.addSource("Kabil_medium_flood", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:Kabil_medium_flood@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
  //   ],
  // });
  // map2.addLayer({
  //   id: "Kabil_medium_flood",
  //   type: "fill",
  //   source: "Kabil_medium_flood",
  //   "source-layer": "Kabil_medium_flood",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "fill-opacity": 0.9,
  //     "fill-color": "#0096FF",
  //   },
  // });
  // document.getElementById("kabilMediumFlood").addEventListener("change", function () {
  //   const isVisible = this.checked;

  //   // Correctly set the layer visibility property
  //   map2.setLayoutProperty(
  //       "Kabil_medium_flood",
  //       "visibility", // Specify the 'visibility' layout property
  //       isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
  //   );
  // });



  // map2.addSource("Lower_indus_high_flood", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:Lower_indus_high_flood@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
  //   ],
  // });
  // map2.addLayer({
  //   id: "Lower_indus_high_flood",
  //   type: "fill",
  //   source: "Lower_indus_high_flood",
  //   "source-layer": "Lower_indus_high_flood",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "fill-opacity": 0.9,
  //     "fill-color": "#00A36C ",
  //   },
  // });
  // document.getElementById("lowerIndusHighFlood").addEventListener("change", function () {
  //   const isVisible = this.checked;

  //   // Correctly set the layer visibility property
  //   map2.setLayoutProperty(
  //       "Lower_indus_high_flood",
  //       "visibility", // Specify the 'visibility' layout property
  //       isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
  //   );
  // });




  // map2.addSource("Panjgora_river", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:Panjgora_river@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
  //   ],
  // });
  // map2.addLayer({
  //   id: "Panjgora_river",
  //   type: "fill",
  //   source: "Panjgora_river",
  //   "source-layer": "Panjgora_river",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "fill-opacity": 1,
  //     "fill-color": "#89CFF0 ",
  //   },
  // });
  // document.getElementById("panjgoraRiver").addEventListener("change", function () {
  //   const isVisible = this.checked;

  //   // Correctly set the layer visibility property
  //   map2.setLayoutProperty(
  //       "Panjgora_river",
  //       "visibility", // Specify the 'visibility' layout property
  //       isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
  //   );
  // });





  // map2.addSource("Upper_indus_flood", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:Upper_indus_flood@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
  //   ],
  // });
  // map2.addLayer({
  //   id: "Upper_indus_flood",
  //   type: "fill",
  //   source: "Upper_indus_flood",
  //   "source-layer": "Upper_indus_flood",
  //   layout: {
  //     visibility: "none",
  //   },
  //   paint: {
  //     "fill-opacity": 1,
  //     "fill-color": "#0096FF ",
  //   },
  // });
  // document.getElementById("upperIndusFlood").addEventListener("change", function () {
  //   const isVisible = this.checked;

  //   // Correctly set the layer visibility property
  //   map2.setLayoutProperty(
  //       "Upper_indus_flood",
  //       "visibility", // Specify the 'visibility' layout property
  //       isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
  //   );
  // });


  // map2.addSource("KPKDrainage_Density", {
  //   'type': 'raster',
  //   'tiles': [
  //       `http://172.18.1.43:8080/geoserver/ne/wms?service=WMS&version=1.1.0&request=GetMap&layers=KPKDrainage_Density&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
  //   ],
  //   'tileSize': 256
  // });

  // map2.addLayer({
  //   'id': 'KPKDrainage_Density',
  //   'type': 'raster',
  //   'source': 'KPKDrainage_Density',
  //   'layout': { 'visibility': 'none' }
  // });


  // document.getElementById("kpkDrainageDensity").addEventListener("change", function () {
  // const isVisible = this.checked;

  // // Correctly set the layer visibility property
  // map2.setLayoutProperty(
  //     "KPKDrainage_Density",
  //     "visibility", // Specify the 'visibility' layout property
  //     isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
  // );
  // });


  // map2.loadImage("https://i.ibb.co/QvGCF1Dw/flood.png", (error, image) => {
  //   if (error) throw error;
  //   map2.addImage("Flood", image);
  // });

  // map2.addSource("kpk_urban", {
  //   type: "vector",
  //   scheme: "tms",
  //   tiles: [
  //     "http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:kpk_urban@EPSG:900913@pbf/{z}/{x}/{y}.pbf"
  //   ]
  // });

  // map2.addLayer({
  //   id: "kpk_urban",
  //   type: "symbol",
  //   source: "kpk_urban",
  //   "source-layer": "kpk_urban",
  //   layout: {
  //     visibility: "none",
  //     "icon-image": "Flood",
  //     "icon-size": 0.07
  //   }
  // });

  // document.getElementById("urbanFloodingKpk").addEventListener("change", function() {
  //   const isVisible = this.checked;
  //   map2.setLayoutProperty(
  //     "kpk_urban",
  //     "visibility",
  //     isVisible ? "visible" : "none"
  //   );
  // });

  // // === ADD POPUP ON CLICK ===
  // map2.on("click", "kpk_urban", function(e) {
  //   const features = map2.queryRenderedFeatures(e.point, { layers: ["kpk_urban"] });
  //   if (!features.length) return;

  //   const feature = features[0];
  //   // Be sure the property names match what's in your data!
  //   const name = feature.properties.NAME || "N/A";
  //   const district = feature.properties.District || "N/A";

  //   new mapboxgl.Popup()
  //     .setLngLat(e.lngLat)
  //     .setHTML(
  //       `<div style="color:black;">
  //         <strong>Name:</strong> ${name}<br>
  //         <strong>District:</strong> ${district}
  //       </div>`
  //     )
  //     .addTo(map2);
  // });

  // // OPTIONAL: Change cursor on hover for better UX
  // map2.on('mouseenter', 'kpk_urban', () => {
  //   map2.getCanvas().style.cursor = 'pointer';
  // });
  // map2.on('mouseleave', 'kpk_urban', () => {
  //   map2.getCanvas().style.cursor = '';
  // });




  //Prcpt (july, august, sept and combined)

  map2.addSource("pak_precip_July", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_precip_July&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_precip_July',
    'type': 'raster',
    'source': 'pak_precip_July',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("prcpJuly").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_precip_July",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  map2.addSource("pak_precip_aug", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_precip_aug&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_precip_aug',
    'type': 'raster',
    'source': 'pak_precip_aug',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("prcpAugust").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_precip_aug",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  map2.addSource("pak_precip_sept", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_precip_sept&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_precip_sept',
    'type': 'raster',
    'source': 'pak_precip_sept',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("prcpSept").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_precip_sept",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  map2.addSource("pak_precip_jas", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_precip_jas&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_precip_jas',
    'type': 'raster',
    'source': 'pak_precip_jas',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("prcpCombined").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_precip_jas",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  //Temp (july, august, sept and combined)

  map2.addSource("pak_temp_July_proj", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_temp_July_proj&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_temp_July_proj',
    'type': 'raster',
    'source': 'pak_temp_July_proj',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("tempJuly").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_temp_July_proj",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });



  map2.addSource("pak_temp_aug_proj", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_temp_aug_proj&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_temp_aug_proj',
    'type': 'raster',
    'source': 'pak_temp_aug_proj',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("tempAugust").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_temp_aug_proj",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  map2.addSource("pak_temp_sept_proj", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_temp_sept_proj&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_temp_sept_proj',
    'type': 'raster',
    'source': 'pak_temp_sept_proj',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("tempSept").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_temp_sept_proj",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  map2.addSource("pak_temp_jas_proj", {
    'type': 'raster',
    'tiles': [
      `http://172.18.1.155:8080/geoserver/dew3_pak/wms?service=WMS&version=1.1.0&request=GetMap&layers=pak_temp_jas_proj&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&styles=&format=image/png&transparent=true`
    ],
    'tileSize': 256
  });

  map2.addLayer({
    'id': 'pak_temp_jas_proj',
    'type': 'raster',
    'source': 'pak_temp_jas_proj',
    'layout': { 'visibility': 'none' }
  });


  document.getElementById("tempCombined").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "pak_temp_jas_proj",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });




  //2011 FLOOD EXTENT 
  map2.addSource("G16_Flood_Inundation_2011_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:G16_Flood_Inundation_2011_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "G16_Flood_Inundation_2011_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });



  //2012 FLOOD EXTENT
  map2.addSource("G17_Flood_Inundation_2012_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/GCC:G17_Flood_Inundation_2012_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "G17_Flood_Inundation_2012_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });


  //2013 FLOOD EXTENT
  map2.addSource("G18_Flood_Inundation_2013_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:G18_Flood_Inundation_2013_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "G18_Flood_Inundation_2013_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //2014 Flood Extent

  map2.addSource("G19_Flood_Inundation_2014_SUPARCO", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:G19_Flood_Inundation_2014_SUPARCO@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "G19_Flood_Inundation_2014_SUPARCO",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //2015 FLOOD EXTENT 
  map2.addSource("G20_Flood_Inundation_2015_NDMA_GIS_Team", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:G20_Flood_Inundation_2015_NDMA_GIS_Team@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "G20_Flood_Inundation_2015_NDMA_GIS_Team",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  //2023 FLOOD EXTENT 
  map2.addSource("VIIRS_20230726_20230730_FloodExtent_PAK", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/	ne:VIIRS_20230726_20230730_FloodExtent_PAK@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "VIIRS_20230726_20230730_FloodExtent_PAK",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );
  });

  map2.addSource("HOTSPOTS", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.4:8080/geoserver/gwc/service/tms/1.0.0/abdul_sattar:flood_Hotspot_Area@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });

  map2.addLayer({
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
      "line-width": 8,
    },
  });

  document.getElementById("hotspots").addEventListener("change", function () {
    const isVisible = this.checked;

    // Correctly set the layer visibility property
    map2.setLayoutProperty(
      "HOTSPOTS",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );

    // restoreLayerVisibility(map2, map2Layers);

  });

  // Store the blink interval id so we can clear it when toggled off
  let hotspotBlinkInterval = null;
  const HOTSPOTS_OPACITY = 1; // main opacity

  document.getElementById("hotspots").addEventListener("change", function () {
    const isVisible = this.checked;

    // Set the layer's visibility right away
    map2.setLayoutProperty("HOTSPOTS", "visibility", isVisible ? "visible" : "none");

    // Set opacity immediately for toggle on/off
    map2.setPaintProperty("HOTSPOTS", "line-opacity", isVisible ? HOTSPOTS_OPACITY : 0);

    if (hotspotBlinkInterval) {
      clearInterval(hotspotBlinkInterval);
      hotspotBlinkInterval = null;
    }

    if (isVisible) {
      // Wait 1s, then start the periodic blink
      hotspotBlinkInterval = setInterval(() => {
        // Animate fade out (opacity to 0)
        map2.setPaintProperty("HOTSPOTS", "line-opacity", 0);

        // After a short timeout, restore to full opacity
        setTimeout(() => {
          map2.setPaintProperty("HOTSPOTS", "line-opacity", HOTSPOTS_OPACITY);
        }, 200); // opacity is 0 for 0.2s
      }, 1000); // fires every 1s
    }
  });

  //2024 FLOOD EXTENT
  map2.addSource("VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan", {
    type: "vector",
    scheme: "tms",
    tiles: [
      `http://172.18.1.43:8080/geoserver/gwc/service/tms/1.0.0/ne:VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
    ],
  });
  map2.addLayer({
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
    map2.setLayoutProperty(
      "VIIRS_20240420_20240424_MaximumFloodExtent_Pakistan",
      "visibility", // Specify the 'visibility' layout property
      isVisible ? "visible" : "none" // Toggle between 'visible' and 'none'
    );

    // restoreLayerVisibility(map2, map2Layers);

  });
});


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
      this._button.innerHTML = `<img src="3d.png" alt="threed" style="width: 25px; height: 25px;">`;
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
  map2.addControl(threeDControl, "top-right");
  // Store default pitch and bearing values
  map2.once('load', () => {
    threeDControl._defaultPitch = map.getPitch();
    threeDControl._defaultBearing = map.getBearing();
  });
}
map2.addControl(new mapboxgl.FullscreenControl());