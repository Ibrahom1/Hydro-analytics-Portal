(function () {
  const API_BASE = 'http://localhost:8001/api/gis';
  const uploadedLayers = new Map();
  let modal = null;
  let currentMode = 'vector';
  let selectedPanelId = '';
  let editControl = null;
  let editPanel = null;
  let editLayerSelect = null;
  let editForm = null;
  let editStatus = null;
  let selectedEditLayerId = '';
  let activeSidebarToggle = null;
  const featureSummaryCache = new Map();
  const layerDrafts = new Map();
  const mapLayerPreparationPromises = new Map();
  const existingLayerOriginalStyles = new Map();
  const existingLayerToggleMappings = new Map();
  const PRESENTATION_KEYS = ['style', 'filter', 'feature_colors', 'label'];
  const LOCAL_PRESENTATION_KEY = 'hydro-gis-uploader-presentations-v1';
  const EXISTING_LAYER_STYLE_KEY = 'hydro-gis-existing-layer-styles-v1';
  const MAP_READY_TIMEOUT_MS = 45000;
  const EDITABLE_EXISTING_LAYER_TYPES = new Set(['circle', 'line', 'fill', 'raster']);
  const KNOWN_EXISTING_TOGGLE_LAYERS = [
    { checkboxId: 'natBoundary', layers: ['nationalBoundary'] },
    { checkboxId: 'prvBoundary', layers: ['provincialBoundary'] },
    { checkboxId: 'dstBoundary', layers: ['districtBoundary', 'DistrictBoundary'] },
    { checkboxId: 'tslBoundary', layers: ['TehsilBoundary', 'TehsilBoundaryLine'] },
    { checkboxId: 'uncBoundary', layers: ['Union_Council'] },
    { checkboxId: 'PakRivers', layers: ['Pakistan_Rivers'] },
    { checkboxId: 'kp_Rivers', layers: ['KP_RIVERS'] },
    { checkboxId: 'Reservoirs', layers: ['Dams_Water_Bodies'] },
    { checkboxId: 'india', layers: ['indian'] },
    { checkboxId: 'Glofas', layers: ['glofas'] },
    { checkboxId: 'gmrcWapda', layers: ['gmrc_wapda_stations'] },
    { checkboxId: 'pmdStations', layers: ['pmd_stations'] },
    { checkboxId: 'damagedPmdStations', layers: ['damaged_pmd_stations'] },
    { checkboxId: 'Barrages', layers: ['Barrages'] },
    { checkboxId: 'watershed', layers: ['Combined'] },
    { checkboxId: 'minorRivers', layers: ['minor_rivers_outline'] },
    { checkboxId: 'breach', layers: ['breach_points'] },
    { checkboxId: 'telemetric', layers: ['telemetric_stations'] },
    { checkboxId: 'protectionBand', layers: ['protection_bands'] },
    { checkboxId: 'settlements', layers: ['settlements'] },
    { checkboxId: 'schools', layers: ['schools'] },
    { checkboxId: 'railwayStations', layers: ['railway_stations'] },
    { checkboxId: 'airports', layers: ['airports'] },
    { checkboxId: 'bridges', layers: ['BridgesL'] },
    { checkboxId: 'healthFacilities', layers: ['health_facilities'] },
    { checkboxId: 'mainCanal', layers: ['main_canals_line'] },
    { checkboxId: 'branchCanal', layers: ['branch_canals_line'] },
    { checkboxId: 'linkCanals', layers: ['link_canals_line'] },
    { checkboxId: 'distributaries', layers: ['distributories_line'] },
    { checkboxId: 'ffd', layers: ['ffd_point'] },
    { checkboxId: 'lowerIndusHighFlood', layers: ['lihfex'] },
    { checkboxId: 'lowerIndusMediumFlood', layers: ['limfex'] },
    { checkboxId: 'lowerIndusLowFlood', layers: ['lilfex'] },
    { checkboxId: 'upperIndusHighFlood', layers: ['uihfex'] },
    { checkboxId: 'upperIndusFlood', layers: ['Upper_indus_flood'] },
    { checkboxId: 'upperIndusLowFlood', layers: ['uilfex'] },
    { checkboxId: 'chenabHighFlood', layers: ['chfex'] },
    { checkboxId: 'chenabMediumFlood', layers: ['cmfex'] },
    { checkboxId: 'chenabLowFlood', layers: ['clfex'] },
    { checkboxId: 'kabilHighFlood', layers: ['khfex'] },
    { checkboxId: 'kabilMediumFlood', layers: ['Kabil_medium_flood'] },
    { checkboxId: 'kabilLowFlood', layers: ['klfex'] },
    { checkboxId: 'jhelumHighFlood', layers: ['jhfex'] },
    { checkboxId: 'jhelumMediumFlood', layers: ['jmfex'] },
    { checkboxId: 'jhelumLowFlood', layers: ['jlfex'] },
    { checkboxId: 'swatHighExtent', layers: ['3_Swat_River_50yr_Flood_Extent'] },
    { checkboxId: 'swatExtent', layers: ['2_Swat_River_25yr_Flood_Extent'] },
    { checkboxId: 'swatLowExtent', layers: ['1_Swat_River_5yr_Flood_Extent'] },
    { checkboxId: 'raviHighFlood', layers: ['rhfex'] },
    { checkboxId: 'raviMediumFlood', layers: ['rmfex'] },
    { checkboxId: 'raviLowFlood', layers: ['rlfex'] },
    { checkboxId: 'sutlejHighFlood', layers: ['shfex'] },
    { checkboxId: 'sutlejMediumFlood', layers: ['smfex'] },
    { checkboxId: 'sutlejLowFlood', layers: ['slfex'] },
    { checkboxId: 'DI', layers: ['DIKHAN_CL'] },
    { checkboxId: 'di_ht', layers: ['DI_Khan_HT'] },
    { checkboxId: 'DG', layers: ['DG khan'] },
    { checkboxId: 'dg_ht', layers: ['DG khan HT'] },
    { checkboxId: 'panjal', layers: ['Pir_Panjal_HT'] },
    { checkboxId: 'hyder', layers: ['Hyderabad_arc'] },
    { checkboxId: 'hyderabad', layers: ['Terrain_hyd'] },
    { checkboxId: 'urbanFloodingKpk', layers: ['kpk_urban'] },
    { checkboxId: 'urbanFloodingPunjab', layers: ['urban_punjab'] },
    { checkboxId: 'urbanFloodingSindh', layers: ['urban_sindh'] },
    { checkboxId: 'Sindh', layers: ['Sindh'] },
    { checkboxId: 'Kirthar', layers: ['Kirthar'] },
    { checkboxId: 'Kirthar_extent', layers: ['KIRTHAR_RANGE'] },
    { checkboxId: 'Gujranwala', layers: ['Gujranwala'] },
    { checkboxId: 'sargodha', layers: ['Depth_Max_Terrain_sargodha'] },
    { checkboxId: 'rwp', layers: ['Depth_Max_Terrain_Rawalpindi'] },
    { checkboxId: 'fais', layers: ['Depth_Max_Terrain_dem_faislabad'] },
    { checkboxId: 'nowshera', layers: ['Nowshera_Depth'] },
    { checkboxId: 'charsadda', layers: ['Charsadda_Depth'] }
  ];

  const DEFAULT_LAYER_PAINT = {
    point: {
      'circle-color': '#06b6d4',
      'circle-opacity': 1,
      'circle-radius': 6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 1
    },
    line: {
      'line-color': '#22c55e',
      'line-opacity': 0.9,
      'line-width': 2.5,
      'line-dasharray': [1, 0]
    },
    fill: {
      'fill-color': '#0ea5e9',
      'fill-opacity': 0.35
    },
    outline: {
      'line-color': '#0284c7',
      'line-opacity': 0.95,
      'line-width': 1.8
    },
    raster: {
      'raster-opacity': 0.85
    }
  };

  const DASH_PRESETS = {
    solid: [1, 0],
    dashed: [2, 2],
    dotted: [0.4, 1.6]
  };

  const FEATURE_COLOR_PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'
  ];

  const DEFAULT_LABEL_STYLE = {
    enabled: false,
    field: '',
    color: '#ffffff',
    size: 12,
    haloColor: '#000000',
    haloWidth: 1
  };

  const UPLOADED_POPUP_SKIPPED_FIELD_NAMES = new Set([
    'x',
    'y',
    'z',
    'lat',
    'latitude',
    'latitde',
    'lattitude',
    'latitud',
    'lon',
    'long',
    'lng',
    'longitude',
    'longitud',
    'xcoord',
    'ycoord',
    'xcoordinate',
    'ycoordinate',
    'coordx',
    'coordy',
    'easting',
    'northing',
    'geom',
    'geometry',
    'thegeom',
    'wkbgeometry',
    'shape',
    'shapeleng',
    'shapelength',
    'shapearea',
    'bbox',
    'bounds',
    'centroid'
  ]);

  function getMapInstance() {
    try {
      if (typeof map1 !== 'undefined' && map1) return map1;
    } catch (error) {
      return null;
    }
    return null;
  }

  function isMapStyleReadyForLayerChanges(map) {
    if (!map || typeof map.getStyle !== 'function') return false;
    try {
      const style = map.getStyle();
      if (!style || !Array.isArray(style.layers)) return false;
      if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) return true;
      if (map.__gisUploaderStyleReady && map.__gisUploaderStyleReadyStyle === map.style) return true;
      return Boolean(map.style?._loaded);
    } catch (error) {
      return false;
    }
  }

  function waitForMapReady() {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let boundMap = null;
      let timeoutId = null;
      let settled = false;

      const unbindMapEvents = () => {
        if (!boundMap) return;
        boundMap.off?.('load', check);
        boundMap.off?.('style.load', markReady);
        boundMap.off?.('styledata', check);
      };

      const cleanup = () => {
        unbindMapEvents();
        if (timeoutId) clearTimeout(timeoutId);
      };

      const markReady = () => {
        const map = getMapInstance();
        if (map) {
          map.__gisUploaderStyleReady = true;
          map.__gisUploaderStyleReadyStyle = map.style;
        }
        check();
      };

      const check = () => {
        if (settled) return;
        const map = getMapInstance();
        if (isMapStyleReadyForLayerChanges(map)) {
          if (map) {
            map.__gisUploaderStyleReady = true;
            map.__gisUploaderStyleReadyStyle = map.style;
          }
          settled = true;
          cleanup();
          resolve(map);
          return;
        }
        if (Date.now() - startedAt > MAP_READY_TIMEOUT_MS) {
          settled = true;
          cleanup();
          reject(new Error('Map is not ready yet.'));
          return;
        }
        if (!map) {
          setTimeout(check, 100);
          return;
        }
        if (map && map !== boundMap) {
          unbindMapEvents();
          boundMap = map;
          map.on?.('load', check);
          map.on?.('style.load', markReady);
          map.on?.('styledata', check);
        }
      };

      timeoutId = setTimeout(check, MAP_READY_TIMEOUT_MS);
      check();
    });
  }

  function waitForMapInstance() {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        const map = getMapInstance();
        if (map) {
          resolve(map);
          return;
        }
        if (Date.now() - startedAt > MAP_READY_TIMEOUT_MS) {
          reject(new Error('Map is not available yet.'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  function apiUrl(path, noCache = false) {
    if (!noCache) return `${API_BASE}${path}`;
    const separator = path.includes('?') ? '&' : '?';
    return `${API_BASE}${path}${separator}_=${Date.now()}`;
  }

  async function fetchSavedLayerRegistry() {
    const response = await fetch(apiUrl('/layers', true), { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.detail || `GIS uploader API returned ${response.status}`);
    }
    const layers = Array.isArray(body.layers) ? body.layers : [];
    return layers.map(mergeLayerWithLocalPresentation);
  }

  function readLocalPresentationStore() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_PRESENTATION_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeLocalPresentationStore(store) {
    try {
      localStorage.setItem(LOCAL_PRESENTATION_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn('[GIS uploader] Could not write local style backup:', error);
    }
  }

  function readExistingLayerStyleStore() {
    try {
      return JSON.parse(localStorage.getItem(EXISTING_LAYER_STYLE_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeExistingLayerStyleStore(store) {
    try {
      localStorage.setItem(EXISTING_LAYER_STYLE_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn('[GIS uploader] Could not write existing layer style backup:', error);
    }
  }

  function saveExistingLayerStyle(layerId, payload) {
    if (!layerId) return;
    const store = readExistingLayerStyleStore();
    store[layerId] = {
      ...presentationPayloadCopy(payload),
      saved_at: new Date().toISOString()
    };
    writeExistingLayerStyleStore(store);
  }

  function removeExistingLayerStyle(layerId) {
    if (!layerId) return;
    const store = readExistingLayerStyleStore();
    if (!store[layerId]) return;
    delete store[layerId];
    writeExistingLayerStyleStore(store);
  }

  function presentationPayloadCopy(payload) {
    const copy = {};
    PRESENTATION_KEYS.forEach((key) => {
      copy[key] = payload?.[key] || null;
    });
    return copy;
  }

  function saveLocalLayerPresentation(layerId, payload) {
    if (!layerId) return;
    const store = readLocalPresentationStore();
    store[layerId] = {
      ...presentationPayloadCopy(payload),
      saved_at: new Date().toISOString()
    };
    writeLocalPresentationStore(store);
  }

  function removeLocalLayerPresentation(layerId) {
    if (!layerId) return;
    const store = readLocalPresentationStore();
    if (!store[layerId]) return;
    delete store[layerId];
    writeLocalPresentationStore(store);
  }

  function hasSavedPresentation(layer) {
    return PRESENTATION_KEYS.some((key) => Boolean(layer?.[key]));
  }

  function parseSavedAt(value) {
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function shouldUseLocalPresentation(layer, localPresentation) {
    if (!localPresentation) return false;
    if (!hasSavedPresentation(layer)) return true;
    const localTime = parseSavedAt(localPresentation.saved_at);
    const backendTime = parseSavedAt(layer?.updated_at);
    return localTime && (!backendTime || localTime >= backendTime);
  }

  function applyPresentationToLayer(layer, presentation) {
    if (!layer || !presentation) return layer;
    const nextLayer = { ...layer };
    PRESENTATION_KEYS.forEach((key) => {
      if (presentation[key]) {
        nextLayer[key] = presentation[key];
      } else if (Object.prototype.hasOwnProperty.call(presentation, key)) {
        delete nextLayer[key];
      }
    });
    return nextLayer;
  }

  function mergeLayerWithLocalPresentation(layer) {
    if (!layer?.id) return layer;
    const localPresentation = readLocalPresentationStore()[layer.id];
    if (!shouldUseLocalPresentation(layer, localPresentation)) return layer;
    return applyPresentationToLayer(layer, localPresentation);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapePopupHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapeAttributeSelector(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizePropertyKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function cloneData(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function isUploadedEditableLayer(layer) {
    return !layer?.editor_source || layer.editor_source === 'uploaded';
  }

  function isExistingEditableLayer(layer) {
    return layer?.editor_source === 'existing';
  }

  function editorLayerKey(layer) {
    if (!layer?.id) return '';
    return `${isExistingEditableLayer(layer) ? 'existing' : 'uploaded'}:${layer.id}`;
  }

  function existingLayerBucketFromType(type) {
    if (type === 'circle') return 'point';
    if (type === 'line') return 'line';
    if (type === 'fill') return 'fill';
    if (type === 'raster') return 'raster';
    return '';
  }

  function existingLayerTypeFromBucket(bucket) {
    if (bucket === 'point') return 'point';
    if (bucket === 'line') return 'line';
    if (bucket === 'fill') return 'fill';
    return 'raster';
  }

  function friendlyLayerName(layerId) {
    return cleanText(String(layerId || '')
      .replace(/^gis-upload-/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')) || layerId;
  }

  function layerTypeDisplayName(layer) {
    if (layer?.map_layer_type === 'circle' || layer?.render_type === 'point') return 'Point';
    if (layer?.map_layer_type === 'line' || layer?.render_type === 'line') return 'Line';
    if (layer?.map_layer_type === 'fill' || layer?.render_type === 'fill') return 'Fill';
    if (layer?.map_layer_type === 'raster' || layer?.kind === 'raster') return 'Raster';
    return 'Layer';
  }

  function sidebarToggleLabel(checkbox) {
    if (!checkbox) return '';
    const row = checkbox.closest('label');
    const firstSpan = row?.querySelector('span');
    return cleanText(firstSpan?.textContent || checkbox.getAttribute('aria-label') || checkbox.id);
  }

  function sidebarTogglePath(checkbox) {
    const row = checkbox?.closest('label');
    const panels = [];
    let panel = row?.parentElement?.closest?.('[id]');
    while (panel && panel.id !== 'app-sidebar') {
      if (isSidebarPlacementPanel(panel)) {
        panels.unshift(getPanelLabel(panel));
      }
      panel = panel.parentElement?.closest?.('[id]');
    }
    return panels;
  }

  function sidebarToggleInfo(checkbox) {
    if (!checkbox?.id) return null;
    return {
      checkboxId: checkbox.id,
      label: sidebarToggleLabel(checkbox),
      path: sidebarTogglePath(checkbox)
    };
  }

  function checkedSidebarToggleInfos() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return [];
    return Array.from(sidebar.querySelectorAll('input[type="checkbox"]:checked'))
      .map(sidebarToggleInfo)
      .filter(Boolean);
  }

  function checkboxForToggleInfo(info) {
    if (!info?.checkboxId) return null;
    return document.getElementById(info.checkboxId);
  }

  function isToggleInfoActive(info) {
    const checkbox = checkboxForToggleInfo(info);
    return Boolean(checkbox?.checked);
  }

  function isLayerCurrentlyVisible(map, styleLayer) {
    if (!map || !styleLayer?.id) return false;
    try {
      return map.getLayoutProperty(styleLayer.id, 'visibility') !== 'none';
    } catch (error) {
      return styleLayer.layout?.visibility !== 'none';
    }
  }

  function defaultPaintValue(bucket, property) {
    const value = DEFAULT_LAYER_PAINT[bucket]?.[property];
    return cloneData(value);
  }

  function rgbToHex(value, fallback) {
    const match = String(value || '').match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (!match) return fallback;
    const toHex = (part) => Math.max(0, Math.min(255, Number(part) || 0)).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  function normalizeColorForInput(value, fallback) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
    if (/^#[0-9a-f]{3}$/i.test(text)) {
      return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    }
    return rgbToHex(text, fallback);
  }

  function normalizePaintValueForInput(bucket, property, value) {
    const fallback = defaultPaintValue(bucket, property);
    if (property.includes('color')) return normalizeColorForInput(value, fallback || '#06b6d4');
    if (property === 'line-dasharray') return Array.isArray(value) ? cloneData(value) : cloneData(fallback || DASH_PRESETS.solid);
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  function editablePaintProperties(bucket) {
    return Object.keys(DEFAULT_LAYER_PAINT[bucket] || {});
  }

  function readLayerPaint(map, layerId, bucket) {
    const paint = {};
    editablePaintProperties(bucket).forEach((property) => {
      let value;
      try {
        value = map.getPaintProperty(layerId, property);
      } catch (error) {
        value = undefined;
      }
      paint[property] = normalizePaintValueForInput(bucket, property, value);
    });
    return paint;
  }

  function mergePaintStyles(baseStyle, savedStyle) {
    const merged = { paint: cloneData(baseStyle?.paint || {}) || {} };
    Object.entries(savedStyle?.paint || {}).forEach(([bucket, paint]) => {
      merged.paint[bucket] = {
        ...(merged.paint[bucket] || {}),
        ...(paint || {})
      };
    });
    return merged;
  }

  function isRegisteredCustomLayer(layerId) {
    try {
      return typeof customLayerRegistry !== 'undefined' && customLayerRegistry?.has(layerId);
    } catch (error) {
      return false;
    }
  }

  function isKnownAppLayerSource(map, styleLayer) {
    const sourceId = styleLayer?.source;
    if (!sourceId) return false;
    if (/^(mapbox|composite)$/i.test(sourceId)) return false;
    try {
      const source = map.getStyle()?.sources?.[sourceId];
      return /geoserver|geojson|wms|ows|gwc|172\.18|localhost|hydro|gcop|hydromet/i.test(JSON.stringify(source || {}));
    } catch (error) {
      return false;
    }
  }

  function isExistingLayerCandidate(map, styleLayer) {
    if (!map || !styleLayer?.id || !EDITABLE_EXISTING_LAYER_TYPES.has(styleLayer.type)) return false;
    if (String(styleLayer.id).startsWith('gis-upload-')) return false;
    return isRegisteredCustomLayer(styleLayer.id) || isKnownAppLayerSource(map, styleLayer);
  }

  function recordExistingLayerToggle(layerId, info) {
    if (!layerId || !info?.checkboxId) return;
    existingLayerToggleMappings.set(layerId, {
      checkboxId: info.checkboxId,
      label: info.label || info.checkboxId,
      path: Array.isArray(info.path) ? info.path : []
    });
  }

  function toggleInfoFromKnownLayerMap(layerId) {
    const match = KNOWN_EXISTING_TOGGLE_LAYERS.find((entry) => entry.layers.includes(layerId));
    if (!match) return null;
    const checkbox = document.getElementById(match.checkboxId);
    if (!checkbox?.checked) return null;
    return sidebarToggleInfo(checkbox);
  }

  function normalizedLayerHints(styleLayer) {
    return [
      styleLayer?.id,
      styleLayer?.source,
      styleLayer?.['source-layer']
    ].filter(Boolean).map(normalizePropertyKey);
  }

  function toggleInfoByNameMatch(styleLayer) {
    const hints = normalizedLayerHints(styleLayer);
    if (!hints.length) return null;
    return checkedSidebarToggleInfos().find((info) => {
      const checkboxHint = normalizePropertyKey(info.checkboxId);
      const labelHint = normalizePropertyKey(info.label);
      return hints.some((hint) => {
        const checkboxMatch = checkboxHint && (
          hint === checkboxHint
          || (checkboxHint.length >= 3 && hint.includes(checkboxHint))
          || (hint.length >= 3 && checkboxHint.includes(hint))
        );
        const labelMatch = labelHint && (
          hint === labelHint
          || (labelHint.length >= 4 && hint.includes(labelHint))
          || (hint.length >= 4 && labelHint.includes(hint))
        );
        return checkboxMatch || labelMatch;
      });
    }) || null;
  }

  function toggleInfoForStyleLayer(styleLayer) {
    const mapped = existingLayerToggleMappings.get(styleLayer?.id);
    if (mapped && isToggleInfoActive(mapped)) return mapped;
    const knownMapped = toggleInfoFromKnownLayerMap(styleLayer?.id);
    if (knownMapped) {
      recordExistingLayerToggle(styleLayer.id, knownMapped);
      return knownMapped;
    }
    const matched = toggleInfoByNameMatch(styleLayer);
    if (matched) {
      recordExistingLayerToggle(styleLayer.id, matched);
      return matched;
    }
    return null;
  }

  function rememberExistingLayerOriginalStyle(map, styleLayer) {
    if (!map || !styleLayer?.id || existingLayerOriginalStyles.has(styleLayer.id)) {
      return existingLayerOriginalStyles.get(styleLayer?.id);
    }
    const bucket = existingLayerBucketFromType(styleLayer.type);
    if (!bucket) return null;
    const originalStyle = {
      paint: {
        [bucket]: readLayerPaint(map, styleLayer.id, bucket)
      }
    };
    existingLayerOriginalStyles.set(styleLayer.id, originalStyle);
    return originalStyle;
  }

  function existingEditableLayerFromStyleLayer(map, styleLayer, toggleInfo) {
    if (!isExistingLayerCandidate(map, styleLayer)) return null;
    const bucket = existingLayerBucketFromType(styleLayer.type);
    const originalStyle = rememberExistingLayerOriginalStyle(map, styleLayer) || { paint: { [bucket]: {} } };
    const savedPresentation = readExistingLayerStyleStore()[styleLayer.id] || {};
    const displayName = toggleInfo?.label || friendlyLayerName(styleLayer.id);
    const editableLayer = {
      id: styleLayer.id,
      editor_source: 'existing',
      display_name: displayName,
      toggle_label: displayName,
      toggle_checkbox_id: toggleInfo?.checkboxId || '',
      toggle_path: toggleInfo?.path || [],
      kind: bucket === 'raster' ? 'raster' : 'vector',
      render_type: existingLayerTypeFromBucket(bucket),
      map_layer_type: styleLayer.type,
      map_source_id: styleLayer.source || '',
      map_source_layer: styleLayer['source-layer'] || '',
      map_filter: cloneData(styleLayer.filter || null),
      map_minzoom: styleLayer.minzoom,
      map_maxzoom: styleLayer.maxzoom,
      style: mergePaintStyles(originalStyle, savedPresentation.style),
      original_style: cloneData(originalStyle)
    };
    ['filter', 'feature_colors', 'label'].forEach((key) => {
      if (savedPresentation[key]) editableLayer[key] = cloneData(savedPresentation[key]);
    });
    return editableLayer;
  }

  function getExistingEditableLayers() {
    const map = getMapInstance();
    if (!map?.getStyle) return [];
    const layers = Array.from(map.getStyle().layers || [])
      .filter((styleLayer) => isExistingLayerCandidate(map, styleLayer))
      .filter((styleLayer) => isLayerCurrentlyVisible(map, styleLayer))
      .map((styleLayer) => {
        const toggleInfo = toggleInfoForStyleLayer(styleLayer);
        if (!toggleInfo || !isToggleInfoActive(toggleInfo)) return null;
        return existingEditableLayerFromStyleLayer(map, styleLayer, toggleInfo);
      })
      .filter(Boolean);

    const nameCounts = layers.reduce((counts, layer) => {
      const label = layer.display_name || layer.id;
      counts.set(label, (counts.get(label) || 0) + 1);
      return counts;
    }, new Map());
    const nameIndexes = new Map();
    return layers.map((layer) => {
      const label = layer.display_name || layer.id;
      if ((nameCounts.get(label) || 0) > 1) {
        const typeName = layerTypeDisplayName(layer);
        const key = `${label}:${typeName}`;
        const index = (nameIndexes.get(key) || 0) + 1;
        nameIndexes.set(key, index);
        layer.display_name = `${label} (${typeName}${index > 1 ? ` ${index}` : ''})`;
      }
      return layer;
    })
      .sort((a, b) => cleanText(a.display_name).localeCompare(cleanText(b.display_name)));
  }

  function sourceId(layer) {
    return `gis-upload-source-${layer.id}`;
  }

  function layerIds(layer) {
    if (isExistingEditableLayer(layer)) {
      return [layer.id];
    }
    if (layer.kind === 'raster') {
      return [`gis-upload-${layer.id}-raster`];
    }
    if (layer.render_type === 'point') {
      return [`gis-upload-${layer.id}-point`];
    }
    if (layer.render_type === 'line') {
      return [`gis-upload-${layer.id}-line`];
    }
    return [`gis-upload-${layer.id}-fill`, `gis-upload-${layer.id}-outline`];
  }

  function labelLayerId(layer) {
    if (isExistingEditableLayer(layer)) return existingLabelLayerIdForLayerId(layer.id);
    return `gis-upload-${layer.id}-label`;
  }

  function warmupLayerId(layer) {
    return `gis-upload-${layer.id}-warmup`;
  }

  function existingLabelLayerIdForLayerId(layerId) {
    return `gis-existing-${layerId}-label`;
  }

  function allUploadedLayerIds(layer) {
    if (layer.kind === 'raster') return [...layerIds(layer), warmupLayerId(layer)];
    return [...layerIds(layer), labelLayerId(layer), warmupLayerId(layer)];
  }

  function checkboxId(layer) {
    return `gis-upload-toggle-${layer.id}`;
  }

  function uploadedLayerType(layer) {
    if (isExistingEditableLayer(layer)) return existingLayerBucketFromType(layer.map_layer_type);
    if (layer?.kind === 'raster') return 'raster';
    if (layer?.render_type === 'point') return 'point';
    if (layer?.render_type === 'line') return 'line';
    return 'fill';
  }

  function editablePaintBuckets(layer) {
    if (isExistingEditableLayer(layer)) {
      return [existingLayerBucketFromType(layer.map_layer_type)].filter(Boolean);
    }
    const type = uploadedLayerType(layer);
    if (type === 'fill') return ['fill', 'outline'];
    return [type];
  }

  function paintForBucket(layer, bucket) {
    return {
      ...(DEFAULT_LAYER_PAINT[bucket] || {}),
      ...((layer?.style?.paint && layer.style.paint[bucket]) || {})
    };
  }

  function styleLayerIdsForBucket(layer, bucket) {
    if (isExistingEditableLayer(layer)) {
      return bucket === existingLayerBucketFromType(layer.map_layer_type) ? [layer.id] : [];
    }
    const ids = layerIds(layer);
    if (bucket === 'fill') return ids.slice(0, 1);
    if (bucket === 'outline') return ids.slice(1, 2);
    return ids;
  }

  function normalizeFilterValue(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function buildMapboxFilter(layer) {
    const filter = layer?.filter;
    if (!filter?.field || !Array.isArray(filter.values) || !filter.values.length) {
      return null;
    }
    const values = Array.from(new Set(filter.values.map(normalizeFilterValue))).filter((value) => value !== '');
    if (!values.length) return null;
    return [
      'match',
      ['to-string', ['get', filter.field]],
      values,
      true,
      false
    ];
  }

  function buildLegacyMapboxFilter(layer) {
    const filter = layer?.filter;
    if (!filter?.field || !Array.isArray(filter.values) || !filter.values.length) {
      return null;
    }
    const values = Array.from(new Set(filter.values.map(normalizeFilterValue))).filter((value) => value !== '');
    if (!values.length) return null;
    return ['in', filter.field, ...values];
  }

  function featureColorBucket(layer) {
    if (layer?.kind === 'raster') return '';
    if (layer.render_type === 'point') return 'point';
    if (layer.render_type === 'line') return 'line';
    return 'fill';
  }

  function featureColorPaintProperty(layer) {
    if (layer?.render_type === 'point') return 'circle-color';
    if (layer?.render_type === 'line') return 'line-color';
    return 'fill-color';
  }

  function popupInteractiveLayerIds(layer) {
    if (layer?.kind !== 'vector') return [];
    const ids = layerIds(layer);
    if (layer.render_type === 'point' || layer.render_type === 'line') return ids.slice(0, 1);
    return ids.slice(0, 1);
  }

  function shouldSkipPopupField(name) {
    const key = normalizePropertyKey(name);
    if (!key) return true;
    if (UPLOADED_POPUP_SKIPPED_FIELD_NAMES.has(key)) return true;
    if (/^(x|y|z|lat|latitude|latitde|lattitude|latitud|lon|long|lng|longitude|longitud)(coord|coordinate|dd)?\d*$/.test(key)) return true;
    if (/^(coord)?(x|y)$/.test(key)) return true;
    if (/^(shape)(leng|length|area)$/.test(key)) return true;
    return false;
  }

  function hasPopupValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  function formatPopupLabel(name) {
    const spaced = String(name || '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    if (!spaced) return 'Attribute';
    return spaced
      .split(' ')
      .map((word) => {
        if (word.length <= 3 && word === word.toUpperCase()) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function formatPopupValue(value) {
    if (Array.isArray(value)) return value.map(formatPopupValue).join(', ');
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return String(value ?? '');
  }

  function popupRowsForFeature(feature) {
    return Object.entries(feature?.properties || {})
      .filter(([name, value]) => !shouldSkipPopupField(name) && hasPopupValue(value))
      .map(([name, value]) => ({
        label: formatPopupLabel(name),
        value: formatPopupValue(value)
      }));
  }

  function popupTitleForFeature(layer, rows, properties) {
    const titleKeys = new Set([
      'name',
      'title',
      'label',
      'stationname',
      'station',
      'site',
      'sitename',
      'district',
      'tehsil',
      'village',
      'city'
    ]);
    const matchedTitle = Object.entries(properties || {}).find(([name, value]) => {
      return titleKeys.has(normalizePropertyKey(name)) && hasPopupValue(value) && !shouldSkipPopupField(name);
    });
    if (matchedTitle) return formatPopupValue(matchedTitle[1]);
    return rows[0]?.value || layer?.display_name || 'Uploaded Feature';
  }

  function uploadedLayerAccentColor(layer) {
    const bucket = featureColorBucket(layer) || uploadedLayerType(layer);
    const property = featureColorPaintProperty(layer);
    const color = paintForBucket(layer, bucket)[property] || '#06b6d4';
    return /^#[0-9a-f]{3,8}$/i.test(String(color)) ? color : '#06b6d4';
  }

  function uploadedLayerTypeLabel(layer) {
    if (layer?.render_type === 'point') return 'Point';
    if (layer?.render_type === 'line') return 'Line';
    return 'Polygon';
  }

  function createUploadedFeaturePopupHtml(feature, layer) {
    const rows = popupRowsForFeature(feature);
    const accentColor = uploadedLayerAccentColor(layer);
    const title = popupTitleForFeature(layer, rows, feature?.properties || {});
    const layerName = layer?.display_name || 'Uploaded Layer';
    const contentRows = rows.length
      ? rows.map((row) => `
        <div class="discharge-item">
          <span class="discharge-label">${escapePopupHtml(row.label)}:</span>
          <span class="discharge-value">${escapePopupHtml(row.value)}</span>
        </div>
      `).join('')
      : '<div class="gis-upload-popup-empty">No display attributes available.</div>';

    return `
      <div class="ffd-popup-container gis-upload-popup-container">
        <div class="popup-header" style="border-left: 4px solid ${accentColor};">
          <div class="station-info">
            <h3 class="station-name">${escapePopupHtml(title)}</h3>
            <div class="status-badge" style="background-color: ${accentColor};" title="${escapePopupHtml(layerName)}">
              <i class="fas fa-layer-group"></i>
              ${escapePopupHtml(uploadedLayerTypeLabel(layer))}
            </div>
          </div>
        </div>
        <div class="popup-content">
          <div class="gis-upload-popup-layer">${escapePopupHtml(layerName)}</div>
          <div class="discharge-section">
            <div class="discharge-grid">
              ${contentRows}
            </div>
          </div>
        </div>
      </div>
      <style>
        .gis-upload-feature-popup .mapboxgl-popup-content {
          padding: 0 !important;
          border-radius: 12px !important;
          overflow: hidden !important;
        }
        .gis-upload-feature-popup .mapboxgl-popup-close-button {
          display: none !important;
        }
        .gis-upload-popup-container {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          width: 340px;
          max-width: 340px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
          overflow: hidden;
          border: 2px solid ${accentColor};
          position: relative;
        }
        .gis-upload-popup-container .popup-header {
          background: #f8f9fa;
          padding: 8px 12px;
          border-bottom: 2px solid #e3f2fd;
        }
        .gis-upload-popup-container .station-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .gis-upload-popup-container .station-name {
          font-size: 16px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0;
          line-height: 1.2;
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .gis-upload-popup-container .status-badge {
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
        .gis-upload-popup-container .popup-content {
          padding: 8px 12px 12px;
          max-height: 360px;
          overflow: auto;
        }
        .gis-upload-popup-layer {
          margin: 0 0 8px;
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .gis-upload-popup-container .discharge-section {
          margin-bottom: 0;
        }
        .gis-upload-popup-container .discharge-grid {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .gis-upload-popup-container .discharge-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          padding: 6px 8px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #e3f2fd;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .gis-upload-popup-container .discharge-label {
          flex: 0 0 42%;
          font-size: 12px;
          font-weight: 600;
          color: #495057;
          overflow-wrap: anywhere;
        }
        .gis-upload-popup-container .discharge-value {
          flex: 1;
          min-width: 0;
          text-align: right;
          font-size: 13px;
          font-weight: 700;
          color: #212529;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .gis-upload-popup-empty {
          padding: 10px 8px;
          background: #f8f9fa;
          border: 1px solid #e3f2fd;
          border-radius: 6px;
          color: #475569;
          font-size: 13px;
          font-weight: 600;
        }
        .gis-upload-feature-popup .mapboxgl-popup-tip {
          border-top-color: #ffffff !important;
        }
      </style>
    `;
  }

  function bindUploadedLayerPopups(map, layer) {
    if (!map || !layer || layer.kind !== 'vector' || typeof mapboxgl === 'undefined') return;
    if (!map.__gisUploaderPopupBoundLayerIds) {
      map.__gisUploaderPopupBoundLayerIds = new Set();
    }

    popupInteractiveLayerIds(layer).forEach((styleLayerId) => {
      if (!map.getLayer(styleLayerId) || map.__gisUploaderPopupBoundLayerIds.has(styleLayerId)) return;

      map.on('click', styleLayerId, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const currentLayer = currentUploadedLayer(layer.id) || layer;
        new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: true,
          maxWidth: '360px',
          className: 'ffd-enhanced-popup gis-upload-feature-popup'
        })
          .setLngLat(event.lngLat)
          .setHTML(createUploadedFeaturePopupHtml(feature, currentLayer))
          .addTo(map);
      });

      map.on('mouseenter', styleLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', styleLayerId, () => {
        map.getCanvas().style.cursor = '';
      });

      map.__gisUploaderPopupBoundLayerIds.add(styleLayerId);
    });
  }

  function buildFeatureColorExpression(layer) {
    const config = layer?.feature_colors;
    if (!config?.field || !config.colors || !Object.keys(config.colors).length) return null;
    const bucket = featureColorBucket(layer);
    const property = featureColorPaintProperty(layer);
    const defaultColor = paintForBucket(layer, bucket)[property] || DEFAULT_LAYER_PAINT[bucket]?.[property] || '#0ea5e9';
    const stops = [];
    Object.entries(config.colors).forEach(([value, color]) => {
      stops.push(String(value), color);
    });
    return ['match', ['to-string', ['get', config.field]], ...stops, defaultColor];
  }

  function labelConfigForLayer(layer) {
    return {
      ...DEFAULT_LABEL_STYLE,
      ...(layer?.label || {})
    };
  }

  function isLabelEnabled(layer) {
    const label = labelConfigForLayer(layer);
    return layer?.kind === 'vector' && Boolean(label.enabled && label.field);
  }

  function labelLayerLayout(layer, visibility) {
    const label = labelConfigForLayer(layer);
    return {
      visibility: isLabelEnabled(layer) ? visibility : 'none',
      'text-field': ['to-string', ['get', label.field || '']],
      'text-size': Number(label.size) || DEFAULT_LABEL_STYLE.size,
      'text-anchor': 'center',
      'text-offset': [0, layer.render_type === 'point' ? 1.2 : 0],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-placement': layer.render_type === 'line' ? 'line' : 'point'
    };
  }

  function labelLayerPaint(layer) {
    const label = labelConfigForLayer(layer);
    return {
      'text-color': label.color || DEFAULT_LABEL_STYLE.color,
      'text-halo-color': label.haloColor || DEFAULT_LABEL_STYLE.haloColor,
      'text-halo-width': Number(label.haloWidth) || DEFAULT_LABEL_STYLE.haloWidth,
      'text-opacity': isLabelEnabled(layer) ? 1 : 0
    };
  }

  function labelLayerDefinition(layer, visibility) {
    return {
      id: labelLayerId(layer),
      type: 'symbol',
      source: sourceId(layer),
      layout: labelLayerLayout(layer, visibility),
      paint: labelLayerPaint(layer)
    };
  }

  function existingLabelLayerDefinition(map, layer, visibility) {
    const styleLayer = map?.getLayer(layer.id);
    const source = layer.map_source_id || styleLayer?.source;
    if (!source) return null;
    const definition = {
      id: labelLayerId(layer),
      type: 'symbol',
      source,
      layout: labelLayerLayout(layer, visibility),
      paint: labelLayerPaint(layer)
    };
    const sourceLayer = layer.map_source_layer || styleLayer?.['source-layer'];
    if (sourceLayer) definition['source-layer'] = sourceLayer;
    const baseFilter = layer.map_filter || styleLayer?.filter;
    if (baseFilter) definition.filter = cloneData(baseFilter);
    const minzoom = Number.isFinite(layer.map_minzoom) ? layer.map_minzoom : styleLayer?.minzoom;
    const maxzoom = Number.isFinite(layer.map_maxzoom) ? layer.map_maxzoom : styleLayer?.maxzoom;
    if (Number.isFinite(minzoom)) definition.minzoom = minzoom;
    if (Number.isFinite(maxzoom)) definition.maxzoom = maxzoom;
    return definition;
  }

  function applyLayerStyle(map, layer) {
    if (!map || !layer) return;
    editablePaintBuckets(layer).forEach((bucket) => {
      const paint = paintForBucket(layer, bucket);
      styleLayerIdsForBucket(layer, bucket).forEach((styleLayerId) => {
        if (!map.getLayer(styleLayerId)) return;
        Object.entries(paint).forEach(([property, value]) => {
          try {
            map.setPaintProperty(styleLayerId, property, value);
          } catch (error) {
            console.warn('[GIS uploader] Could not apply paint property:', property, error);
          }
        });
      });
    });

    const colorExpression = buildFeatureColorExpression(layer);
    if (colorExpression) {
      const bucket = featureColorBucket(layer);
      const property = featureColorPaintProperty(layer);
      styleLayerIdsForBucket(layer, bucket).forEach((styleLayerId) => {
        if (!map.getLayer(styleLayerId)) return;
        try {
          map.setPaintProperty(styleLayerId, property, colorExpression);
        } catch (error) {
          console.warn('[GIS uploader] Could not apply feature color expression:', error);
        }
      });
    }
  }

  function applyLayerFilter(map, layer) {
    if (!map || !layer || !isUploadedEditableLayer(layer) || layer.kind !== 'vector') return;
    const filter = buildMapboxFilter(layer);
    const fallbackFilter = buildLegacyMapboxFilter(layer);
    allUploadedLayerIds(layer).forEach((styleLayerId) => {
      if (!map.getLayer(styleLayerId)) return;
      try {
        map.setFilter(styleLayerId, filter);
      } catch (error) {
        if (!fallbackFilter) {
          console.warn('[GIS uploader] Could not apply uploaded layer filter:', error);
          return;
        }
        try {
          map.setFilter(styleLayerId, fallbackFilter);
        } catch (fallbackError) {
          console.warn('[GIS uploader] Could not apply uploaded layer filter:', fallbackError);
        }
      }
    });
  }

  function updateLabelLayerProperties(map, layerId, definition) {
    Object.entries(definition.layout || {}).forEach(([property, value]) => {
      try {
        map.setLayoutProperty(layerId, property, value);
      } catch (error) {
        console.warn('[GIS uploader] Could not update label layout:', property, error);
      }
    });
    Object.entries(definition.paint || {}).forEach(([property, value]) => {
      try {
        map.setPaintProperty(layerId, property, value);
      } catch (error) {
        console.warn('[GIS uploader] Could not update label paint:', property, error);
      }
    });
  }

  function applyUploadedLayerLabels(map, layer) {
    const id = labelLayerId(layer);
    const visibility = isLayerChecked(layer) ? 'visible' : 'none';

    if (!map.getLayer(id)) {
      try {
        map.addLayer(labelLayerDefinition(layer, visibility));
      } catch (error) {
        console.warn('[GIS uploader] Could not add uploaded layer labels:', error);
        return;
      }
    }

    const definition = labelLayerDefinition(layer, visibility);
    updateLabelLayerProperties(map, id, definition);
  }

  function applyExistingLayerLabels(map, layer) {
    const id = labelLayerId(layer);
    const baseLayer = map.getLayer(layer.id);
    if (!baseLayer) return;
    const visibility = isLayerCurrentlyVisible(map, baseLayer) ? 'visible' : 'none';
    const definition = existingLabelLayerDefinition(map, layer, visibility);
    if (!definition) return;

    if (!map.getLayer(id)) {
      if (!isLabelEnabled(layer)) return;
      try {
        map.addLayer(definition);
      } catch (error) {
        console.warn('[GIS uploader] Could not add existing layer labels:', error);
        return;
      }
    }

    updateLabelLayerProperties(map, id, definition);
  }

  function applyLayerLabels(map, layer) {
    if (!map || !layer || layer.kind !== 'vector') return;
    if (isExistingEditableLayer(layer)) {
      applyExistingLayerLabels(map, layer);
      return;
    }
    if (isUploadedEditableLayer(layer)) {
      applyUploadedLayerLabels(map, layer);
    }
  }

  function applySavedLayerPresentation(map, layer) {
    applyLayerStyle(map, layer);
    applyLayerLabels(map, layer);
    applyLayerFilter(map, layer);
  }

  function warmupLayerDefinition(layer) {
    const id = warmupLayerId(layer);
    const source = sourceId(layer);
    const layout = { visibility: 'visible' };

    if (layer.kind === 'raster') {
      return {
        id,
        type: 'raster',
        source,
        layout,
        paint: { 'raster-opacity': 0 }
      };
    }

    if (layer.render_type === 'point') {
      return {
        id,
        type: 'circle',
        source,
        layout,
        paint: {
          'circle-opacity': 0,
          'circle-radius': 4,
          'circle-stroke-opacity': 0
        }
      };
    }

    if (layer.render_type === 'line') {
      return {
        id,
        type: 'line',
        source,
        layout,
        paint: {
          'line-opacity': 0,
          'line-color': '#000000',
          'line-width': 1
        }
      };
    }

    return {
      id,
      type: 'fill',
      source,
      layout,
      paint: {
        'fill-opacity': 0,
        'fill-color': '#000000'
      }
    };
  }

  function ensureUploadedWarmupLayer(map, layer) {
    const id = warmupLayerId(layer);
    if (!map || !layer || map.getLayer(id)) return;
    try {
      map.addLayer(warmupLayerDefinition(layer));
    } catch (error) {
      console.warn('[GIS uploader] Could not add uploaded layer warmup:', error);
    }
  }

  function isLayerChecked(layer) {
    const checkbox = document.getElementById(checkboxId(layer));
    return Boolean(checkbox?.checked);
  }

  async function ensureMapLayerInternal(layer) {
    const map = await waitForMapReady();
    const source = sourceId(layer);
    const visibility = isLayerChecked(layer) ? 'visible' : 'none';

    if (!map.getSource(source)) {
      if (layer.kind === 'raster') {
        map.addSource(source, {
          type: 'raster',
          tiles: [layer.wms_tile_url],
          tileSize: 256
        });
      } else {
        map.addSource(source, {
          type: 'geojson',
          data: layer.geojson_url
        });
      }
    }

    ensureUploadedWarmupLayer(map, layer);

    if (layer.kind === 'raster') {
      const id = layerIds(layer)[0];
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: 'raster',
          source,
          layout: { visibility },
          paint: paintForBucket(layer, 'raster')
        });
      }
      applySavedLayerPresentation(map, layer);
      return map;
    }

    if (layer.render_type === 'point') {
      const id = layerIds(layer)[0];
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: 'circle',
          source,
          layout: { visibility },
          paint: paintForBucket(layer, 'point')
        });
      }
      bindUploadedLayerPopups(map, layer);
      applySavedLayerPresentation(map, layer);
      return map;
    }

    if (layer.render_type === 'line') {
      const id = layerIds(layer)[0];
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: 'line',
          source,
          layout: { visibility },
          paint: paintForBucket(layer, 'line')
        });
      }
      bindUploadedLayerPopups(map, layer);
      applySavedLayerPresentation(map, layer);
      return map;
    }

    const [fillId, outlineId] = layerIds(layer);
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source,
        layout: { visibility },
        paint: paintForBucket(layer, 'fill')
      });
    }
    if (!map.getLayer(outlineId)) {
      map.addLayer({
        id: outlineId,
        type: 'line',
        source,
        layout: { visibility },
        paint: paintForBucket(layer, 'outline')
      });
    }

    try {
      if (typeof moveAllLabelsToTop === 'function') {
        setTimeout(() => moveAllLabelsToTop(map), 200);
      }
    } catch (error) {
      // Non-critical label ordering helper.
    }
    bindUploadedLayerPopups(map, layer);
    applySavedLayerPresentation(map, layer);
    return map;
  }

  async function ensureMapLayer(layer) {
    if (!layer?.id) return waitForMapReady();
    if (mapLayerPreparationPromises.has(layer.id)) {
      return mapLayerPreparationPromises.get(layer.id);
    }
    const promise = ensureMapLayerInternal(layer)
      .finally(() => {
        mapLayerPreparationPromises.delete(layer.id);
      });
    mapLayerPreparationPromises.set(layer.id, promise);
    return promise;
  }

  async function setUploadedLayerVisibility(layer, visible) {
    const map = await ensureMapLayer(layer);
    layerIds(layer).forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    });
    const labelId = labelLayerId(layer);
    if (map.getLayer(labelId)) {
      map.setLayoutProperty(labelId, 'visibility', visible && isLabelEnabled(layer) ? 'visible' : 'none');
    }
  }

  function getPanelLabel(panel) {
    const button = panel.previousElementSibling;
    const label = button?.querySelector('.sidebar-label');
    return cleanText(label?.textContent || button?.textContent || panel.id);
  }

  function getToggleTarget(button) {
    const onclick = button?.getAttribute?.('onclick') || '';
    const match = onclick.match(/toggleSection\(\s*['"]([^'"]+)['"]\s*\)/);
    return match?.[1] || '';
  }

  function isSidebarPlacementPanel(element) {
    if (!element?.id || !element.previousElementSibling) return false;
    const button = element.previousElementSibling;
    if (getToggleTarget(button) === element.id) return true;
    return element.classList?.contains('section-panel') && button.matches?.('button');
  }

  function getParentPlacementPanel(panel) {
    let parent = panel.parentElement;
    while (parent && parent.id !== 'app-sidebar') {
      if (isSidebarPlacementPanel(parent)) return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  function getPanelPath(panel) {
    const path = [];
    let current = panel;
    while (current && isSidebarPlacementPanel(current)) {
      path.unshift(getPanelLabel(current));
      current = getParentPlacementPanel(current);
    }
    return path;
  }

  function getSidebarPanels() {
    return Array.from(document.querySelectorAll('#app-sidebar [id]'))
      .filter(isSidebarPlacementPanel)
      .map((panel) => {
        const path = getPanelPath(panel);
        return {
          id: panel.id,
          panel,
          label: path[path.length - 1] || panel.id,
          path,
          depth: Math.max(0, path.length - 1)
        };
      });
  }

  function setStatus(message, tone = 'neutral') {
    const status = modal?.querySelector('[data-gis-status]');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  function setEditStatus(message, tone = 'neutral') {
    if (!editStatus) return;
    editStatus.textContent = message || '';
    editStatus.dataset.tone = tone;
  }

  function asUploadedEditableLayer(layer) {
    if (!layer) return layer;
    layer.editor_source = 'uploaded';
    return layer;
  }

  function getUploadedEditableLayers() {
    return Array.from(uploadedLayers.values())
      .map(asUploadedEditableLayer)
      .filter(isLayerChecked)
      .sort((a, b) => cleanText(a.display_name).localeCompare(cleanText(b.display_name)));
  }

  function getEditableLayers() {
    return [
      ...getUploadedEditableLayers(),
      ...getExistingEditableLayers()
    ];
  }

  function selectedEditLayer() {
    if (!selectedEditLayerId) return null;
    return getEditableLayers().find((layer) => editorLayerKey(layer) === selectedEditLayerId) || null;
  }

  function presentationPayloadFromEditor() {
    return {
      style: collectStyleFromEditor(),
      filter: collectFilterFromEditor(),
      feature_colors: collectFeatureColorsFromEditor(),
      label: collectLabelFromEditor()
    };
  }

  function layerWithDraft(layer) {
    const key = editorLayerKey(layer);
    if (!layer?.id || !layerDrafts.has(key)) return layer;
    const draft = layerDrafts.get(key);
    const nextLayer = { ...layer };
    PRESENTATION_KEYS.forEach((key) => {
      if (draft[key]) {
        nextLayer[key] = draft[key];
      } else {
        delete nextLayer[key];
      }
    });
    return nextLayer;
  }

  function currentUploadedLayer(layerId) {
    const layer = uploadedLayers.get(layerId);
    return layer ? layerWithDraft(layer) : null;
  }

  async function refreshUploadedLayerFromRegistry(layerId, fallbackLayer) {
    let savedLayer = fallbackLayer;
    try {
      const layers = await fetchSavedLayerRegistry();
      const registryLayer = layers.find((item) => item.id === layerId);
      savedLayer = hasSavedPresentation(registryLayer) || !hasSavedPresentation(fallbackLayer)
        ? registryLayer || fallbackLayer
        : fallbackLayer;
    } catch (error) {
      console.warn('[GIS uploader] Could not refresh saved layer registry:', error);
    }
    savedLayer = mergeLayerWithLocalPresentation(savedLayer);
    if (!savedLayer?.id) return fallbackLayer;

    asUploadedEditableLayer(savedLayer);
    uploadedLayers.set(savedLayer.id, savedLayer);
    layerDrafts.delete(editorLayerKey(savedLayer));
    try {
      const map = await ensureMapLayer(savedLayer);
      applySavedLayerPresentation(map, savedLayer);
    } catch (error) {
      console.warn('[GIS uploader] Could not reapply saved uploaded layer style:', error);
    }
    return savedLayer;
  }

  function formatPaintValue(property, value) {
    const number = Number(value);
    if (property.includes('opacity')) return `${Math.round(number * 100)}%`;
    if (Number.isFinite(number)) return String(number);
    return String(value || '');
  }

  function dashPresetName(value) {
    const serialized = JSON.stringify(value || []);
    const match = Object.entries(DASH_PRESETS).find(([, preset]) => JSON.stringify(preset) === serialized);
    return match ? match[0] : 'solid';
  }

  function colorControl(bucket, property, label, value) {
    return `
      <label class="gis-layer-edit-field gis-layer-edit-field--color">
        <span>${label}</span>
        <input type="color" value="${escapeHtml(value)}" data-paint-bucket="${bucket}" data-paint-prop="${property}" />
      </label>
    `;
  }

  function rangeControl(bucket, property, label, value, min, max, step) {
    return `
      <label class="gis-layer-edit-field">
        <span>
          ${label}
          <output data-paint-output="${bucket}:${property}">${escapeHtml(formatPaintValue(property, value))}</output>
        </span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}" data-paint-bucket="${bucket}" data-paint-prop="${property}" />
      </label>
    `;
  }

  function dashControl(bucket, property, label, value) {
    const selected = dashPresetName(value);
    return `
      <label class="gis-layer-edit-field">
        <span>${label}</span>
        <select data-paint-bucket="${bucket}" data-paint-prop="${property}">
          <option value="solid"${selected === 'solid' ? ' selected' : ''}>Solid</option>
          <option value="dashed"${selected === 'dashed' ? ' selected' : ''}>Dashed</option>
          <option value="dotted"${selected === 'dotted' ? ' selected' : ''}>Dotted</option>
        </select>
      </label>
    `;
  }

  function updatePaintOutput(input) {
    const bucket = input.dataset.paintBucket;
    const property = input.dataset.paintProp;
    const output = editForm?.querySelector(`[data-paint-output="${bucket}:${property}"]`);
    if (output) output.textContent = formatPaintValue(property, input.value);
  }

  function updateLabelOutput(input) {
    const property = input.dataset.gisLabelProp;
    const output = editForm?.querySelector(`[data-label-output="${property}"]`);
    if (output) output.textContent = input.value;
  }

  function renderPointControls(layer) {
    const paint = paintForBucket(layer, 'point');
    return `
      <div class="gis-layer-edit-section">
        <div class="gis-layer-edit-section-title">Point Style</div>
        ${colorControl('point', 'circle-color', 'Fill color', paint['circle-color'])}
        ${rangeControl('point', 'circle-opacity', 'Fill opacity', paint['circle-opacity'], 0, 1, 0.01)}
        ${rangeControl('point', 'circle-radius', 'Radius', paint['circle-radius'], 1, 40, 0.5)}
        ${colorControl('point', 'circle-stroke-color', 'Stroke color', paint['circle-stroke-color'])}
        ${rangeControl('point', 'circle-stroke-width', 'Stroke width', paint['circle-stroke-width'], 0, 20, 0.5)}
        ${rangeControl('point', 'circle-stroke-opacity', 'Stroke opacity', paint['circle-stroke-opacity'], 0, 1, 0.01)}
      </div>
    `;
  }

  function renderLineControls(layer) {
    const paint = paintForBucket(layer, 'line');
    return `
      <div class="gis-layer-edit-section">
        <div class="gis-layer-edit-section-title">Line Style</div>
        ${colorControl('line', 'line-color', 'Line color', paint['line-color'])}
        ${rangeControl('line', 'line-opacity', 'Line opacity', paint['line-opacity'], 0, 1, 0.01)}
        ${rangeControl('line', 'line-width', 'Line width', paint['line-width'], 0.5, 30, 0.5)}
        ${dashControl('line', 'line-dasharray', 'Line pattern', paint['line-dasharray'])}
      </div>
    `;
  }

  function renderPolygonControls(layer) {
    const fill = paintForBucket(layer, 'fill');
    const outline = paintForBucket(layer, 'outline');
    return `
      <div class="gis-layer-edit-section">
        <div class="gis-layer-edit-section-title">Polygon Style</div>
        ${colorControl('fill', 'fill-color', 'Fill color', fill['fill-color'])}
        ${rangeControl('fill', 'fill-opacity', 'Fill opacity', fill['fill-opacity'], 0, 1, 0.01)}
        ${colorControl('outline', 'line-color', 'Outline color', outline['line-color'])}
        ${rangeControl('outline', 'line-width', 'Outline width', outline['line-width'], 0, 20, 0.5)}
        ${rangeControl('outline', 'line-opacity', 'Outline opacity', outline['line-opacity'], 0, 1, 0.01)}
      </div>
    `;
  }

  function renderRasterControls(layer) {
    const paint = paintForBucket(layer, 'raster');
    return `
      <div class="gis-layer-edit-section">
        <div class="gis-layer-edit-section-title">Raster Display</div>
        ${rangeControl('raster', 'raster-opacity', 'Opacity', paint['raster-opacity'], 0, 1, 0.01)}
      </div>
    `;
  }

  function renderExistingFillControls(layer) {
    const fill = paintForBucket(layer, 'fill');
    return `
      <div class="gis-layer-edit-section">
        <div class="gis-layer-edit-section-title">Fill Layer Style</div>
        ${colorControl('fill', 'fill-color', 'Fill color', fill['fill-color'])}
        ${rangeControl('fill', 'fill-opacity', 'Fill opacity', fill['fill-opacity'], 0, 1, 0.01)}
      </div>
    `;
  }

  function renderExistingStyleControls(layer) {
    const bucket = existingLayerBucketFromType(layer.map_layer_type);
    if (bucket === 'point') return renderPointControls(layer);
    if (bucket === 'line') return renderLineControls(layer);
    if (bucket === 'fill') return renderExistingFillControls(layer);
    return renderRasterControls(layer);
  }

  function renderStyleControls(layer) {
    if (isExistingEditableLayer(layer)) return renderExistingStyleControls(layer);
    if (layer.kind === 'raster') return renderRasterControls(layer);
    if (layer.render_type === 'point') return renderPointControls(layer);
    if (layer.render_type === 'line') return renderLineControls(layer);
    return renderPolygonControls(layer);
  }

  function renderFilterShell(layer) {
    if (!isUploadedEditableLayer(layer) || layer.kind !== 'vector') return '';
    return `
      <div class="gis-layer-edit-section" data-gis-filter-section>
        <div class="gis-layer-edit-section-title">
          Feature Filter
          <button type="button" data-gis-clear-filter>Clear</button>
        </div>
        <div data-gis-filter-content class="gis-layer-edit-filter-loading">Loading fields...</div>
      </div>
    `;
  }

  function renderFeatureColorShell(layer) {
    if (!isUploadedEditableLayer(layer) || layer.kind !== 'vector') return '';
    return `
      <div class="gis-layer-edit-section" data-gis-feature-color-section>
        <div class="gis-layer-edit-section-title">
          Feature Colors
          <button type="button" data-gis-clear-feature-colors>Clear</button>
        </div>
        <div data-gis-feature-color-content class="gis-layer-edit-filter-loading">Loading fields...</div>
      </div>
    `;
  }

  function renderLabelShell(layer) {
    if (layer?.kind !== 'vector') return '';
    return `
      <div class="gis-layer-edit-section" data-gis-label-section>
        <div class="gis-layer-edit-section-title">Labels</div>
        <div data-gis-label-content class="gis-layer-edit-filter-loading">Loading fields...</div>
      </div>
    `;
  }

  function collectStyleFromEditor() {
    const paint = {};
    editForm?.querySelectorAll('[data-paint-bucket][data-paint-prop]').forEach((input) => {
      const bucket = input.dataset.paintBucket;
      const property = input.dataset.paintProp;
      paint[bucket] = paint[bucket] || {};
      if (property === 'line-dasharray') {
        paint[bucket][property] = DASH_PRESETS[input.value] || DASH_PRESETS.solid;
      } else if (property.includes('color')) {
        paint[bucket][property] = input.value;
      } else {
        paint[bucket][property] = Number(input.value);
      }
    });
    return { paint };
  }

  function collectFeatureColorsFromEditor() {
    const field = editForm?.querySelector('[data-gis-feature-color-field]')?.value || '';
    if (!field) return null;
    const colors = {};
    editForm.querySelectorAll('[data-gis-feature-color-value]').forEach((input) => {
      const value = input.dataset.gisFeatureColorValue;
      if (value) colors[value] = input.value;
    });
    return { field, colors };
  }

  function collectLabelFromEditor() {
    const enabled = Boolean(editForm?.querySelector('[data-gis-label-enabled]')?.checked);
    const field = editForm?.querySelector('[data-gis-label-field]')?.value || '';
    if (!enabled && !field) return null;
    return {
      enabled,
      field,
      color: editForm?.querySelector('[data-gis-label-prop="color"]')?.value || DEFAULT_LABEL_STYLE.color,
      size: Number(editForm?.querySelector('[data-gis-label-prop="size"]')?.value || DEFAULT_LABEL_STYLE.size),
      haloColor: editForm?.querySelector('[data-gis-label-prop="haloColor"]')?.value || DEFAULT_LABEL_STYLE.haloColor,
      haloWidth: Number(editForm?.querySelector('[data-gis-label-prop="haloWidth"]')?.value || DEFAULT_LABEL_STYLE.haloWidth)
    };
  }

  function collectFilterFromEditor() {
    const field = editForm?.querySelector('[data-gis-filter-field]')?.value || '';
    if (!field) return null;
    const values = Array.from(editForm.querySelectorAll('[data-gis-filter-value]:checked'))
      .map((input) => input.value);
    return { field, values };
  }

  async function applyEditorFormToMap() {
    const layer = selectedEditLayer();
    if (!layer) return;
    const draft = presentationPayloadFromEditor();
    layerDrafts.set(editorLayerKey(layer), draft);
    const previewLayer = layerWithDraft(layer);
    try {
      if (isExistingEditableLayer(previewLayer)) {
        const map = getMapInstance();
        if (map) applySavedLayerPresentation(map, previewLayer);
        return;
      }
      const map = await ensureMapLayer(previewLayer);
      applySavedLayerPresentation(map, previewLayer);
    } catch (error) {
      console.warn('[GIS uploader] Could not preview layer style:', error);
    }
  }

  function resetEditorToDefaults() {
    const layer = selectedEditLayer();
    if (!layer || !editForm) return;
    editablePaintBuckets(layer).forEach((bucket) => {
      const defaults = isExistingEditableLayer(layer)
        ? (layer.original_style?.paint?.[bucket] || existingLayerOriginalStyles.get(layer.id)?.paint?.[bucket] || DEFAULT_LAYER_PAINT[bucket] || {})
        : (DEFAULT_LAYER_PAINT[bucket] || {});
      Object.entries(defaults).forEach(([property, value]) => {
        const input = editForm.querySelector(`[data-paint-bucket="${bucket}"][data-paint-prop="${property}"]`);
        if (!input) return;
        input.value = property === 'line-dasharray' ? dashPresetName(value) : value;
        updatePaintOutput(input);
      });
    });
    const fieldSelect = editForm.querySelector('[data-gis-filter-field]');
    if (fieldSelect) {
      fieldSelect.value = '';
      populateFilterValues(layer, false);
    }
    const colorFieldSelect = editForm.querySelector('[data-gis-feature-color-field]');
    if (colorFieldSelect) {
      colorFieldSelect.value = '';
      populateFeatureColorValues(layer, false);
    }
    const labelEnabled = editForm.querySelector('[data-gis-label-enabled]');
    const labelField = editForm.querySelector('[data-gis-label-field]');
    if (labelEnabled) labelEnabled.checked = false;
    if (labelField) labelField.value = '';
    editForm.querySelectorAll('[data-gis-label-prop]').forEach((input) => {
      const prop = input.dataset.gisLabelProp;
      input.value = DEFAULT_LABEL_STYLE[prop];
      updateLabelOutput(input);
    });
    layerDrafts.set(editorLayerKey(layer), presentationPayloadFromEditor());
    applyEditorFormToMap();
  }

  async function saveEditorStyle() {
    const layer = selectedEditLayer();
    if (!layer) return;
    setEditStatus('Saving style...', 'neutral');
    const key = editorLayerKey(layer);
    const payload = layerDrafts.get(key) || presentationPayloadFromEditor();
    layerDrafts.set(key, payload);

    if (isExistingEditableLayer(layer)) {
      const styledLayer = layerWithDraft(layer);
      try {
        const map = getMapInstance();
        if (map) applySavedLayerPresentation(map, styledLayer);
        saveExistingLayerStyle(layer.id, payload);
        layerDrafts.delete(key);
        renderEditPanel();
        setEditStatus('Existing layer style saved in this browser.', 'success');
      } catch (error) {
        setEditStatus(error.message || 'Existing layer style save failed.', 'error');
      }
      return;
    }

    saveLocalLayerPresentation(layer.id, payload);
    try {
      const response = await fetch(`${API_BASE}/layers/${encodeURIComponent(layer.id)}/style`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Style save failed with HTTP ${response.status}`);
      }
      const fallbackLayer = applyPresentationToLayer(body.layer || layer, payload);
      const savedLayer = await refreshUploadedLayerFromRegistry(body.layer?.id || layer.id, fallbackLayer);
      selectedEditLayerId = editorLayerKey(savedLayer);
      renderUploadedLayerManager();
      renderEditPanel();
      setEditStatus('Style saved.', 'success');
    } catch (error) {
      const localLayer = applyPresentationToLayer(layer, payload);
      uploadedLayers.set(layer.id, localLayer);
      layerDrafts.delete(key);
      try {
        const map = await ensureMapLayer(localLayer);
        applySavedLayerPresentation(map, localLayer);
      } catch (applyError) {
        console.warn('[GIS uploader] Could not apply locally saved style:', applyError);
      }
      renderUploadedLayerManager();
      renderEditPanel();
      setEditStatus(`Saved in this browser. Backend save failed: ${error.message || 'Style save failed.'}`, 'error');
    }
  }

  function featureSummaryCacheKey(layer) {
    return editorLayerKey(layer) || layer?.id || '';
  }

  function cachedFeatureSummary(layer) {
    const cacheKey = featureSummaryCacheKey(layer);
    return (
      (cacheKey && featureSummaryCache.get(cacheKey)) ||
      (layer?.id && featureSummaryCache.get(layer.id)) ||
      null
    );
  }

  function fieldTypeForValue(value) {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'string';
  }

  function summarizeFeatureFields(features) {
    const fieldsByName = new Map();
    (features || []).forEach((feature) => {
      Object.entries(feature?.properties || {}).forEach(([name, value]) => {
        if (shouldSkipPopupField(name) || !hasPopupValue(value)) return;
        if (!fieldsByName.has(name)) {
          fieldsByName.set(name, {
            name,
            type: fieldTypeForValue(value),
            values: new Set()
          });
        }
        const field = fieldsByName.get(name);
        if (field.values.size < 100) {
          field.values.add(normalizeFilterValue(value));
        }
      });
    });
    return Array.from(fieldsByName.values())
      .map((field) => ({
        name: field.name,
        type: field.type,
        values: Array.from(field.values).sort((a, b) => a.localeCompare(b))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function queryRenderedFeaturesForExistingLayer(map, layer) {
    try {
      return map.queryRenderedFeatures({ layers: [layer.id] }) || [];
    } catch (error) {
      try {
        return map.queryRenderedFeatures(undefined, { layers: [layer.id] }) || [];
      } catch (fallbackError) {
        return [];
      }
    }
  }

  function querySourceFeaturesForExistingLayer(map, layer) {
    if (!map?.querySourceFeatures || !layer?.map_source_id) return [];
    const options = {};
    if (layer.map_source_layer) options.sourceLayer = layer.map_source_layer;
    if (layer.map_filter) options.filter = cloneData(layer.map_filter);
    try {
      return map.querySourceFeatures(layer.map_source_id, options) || [];
    } catch (error) {
      return [];
    }
  }

  async function loadExistingFeatureSummary(layer) {
    const map = await waitForMapReady();
    const features = [
      ...querySourceFeaturesForExistingLayer(map, layer),
      ...queryRenderedFeaturesForExistingLayer(map, layer)
    ];
    return { fields: summarizeFeatureFields(features) };
  }

  async function loadFeatureSummary(layer) {
    const cacheKey = featureSummaryCacheKey(layer);
    if (cacheKey && featureSummaryCache.has(cacheKey)) return featureSummaryCache.get(cacheKey);
    if (isExistingEditableLayer(layer)) {
      const summary = await loadExistingFeatureSummary(layer);
      if (cacheKey && summary.fields?.length) featureSummaryCache.set(cacheKey, summary);
      return summary;
    }
    const response = await fetch(`${API_BASE}/layers/${encodeURIComponent(layer.id)}/feature-summary`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.detail || `Feature summary failed with HTTP ${response.status}`);
    }
    if (cacheKey) featureSummaryCache.set(cacheKey, body);
    return body;
  }

  function populateFilterValues(layer, useSavedSelection = true) {
    const summary = cachedFeatureSummary(layer);
    const fieldSelect = editForm?.querySelector('[data-gis-filter-field]');
    const valuesContainer = editForm?.querySelector('[data-gis-filter-values]');
    if (!summary || !fieldSelect || !valuesContainer) return;

    const selectedField = fieldSelect.value;
    const fieldInfo = (summary.fields || []).find((field) => field.name === selectedField);
    const selectedValues = new Set(
      useSavedSelection && layer.filter?.field === selectedField
        ? layer.filter.values.map(normalizeFilterValue)
        : []
    );

    valuesContainer.innerHTML = '';
    if (!selectedField) {
      valuesContainer.innerHTML = '<div class="gis-layer-edit-empty">Choose a field to filter.</div>';
      return;
    }
    if (!fieldInfo || !Array.isArray(fieldInfo.values) || !fieldInfo.values.length) {
      valuesContainer.innerHTML = '<div class="gis-layer-edit-empty">No values found for this field.</div>';
      return;
    }

    fieldInfo.values.forEach((value) => {
      const stringValue = normalizeFilterValue(value);
      const row = document.createElement('label');
      row.className = 'gis-layer-edit-filter-value';
      row.innerHTML = `
        <input type="checkbox" data-gis-filter-value value="${escapeHtml(stringValue)}"${selectedValues.has(stringValue) ? ' checked' : ''} />
        <span>${escapeHtml(stringValue)}</span>
      `;
      valuesContainer.appendChild(row);
    });
  }

  function renderFilterFields(layer, summary) {
    const content = editForm?.querySelector('[data-gis-filter-content]');
    if (!content) return;
    const fields = Array.isArray(summary.fields) ? summary.fields : [];
    if (!fields.length) {
      content.innerHTML = '<div class="gis-layer-edit-empty">No filterable properties found.</div>';
      return;
    }
    const selectedField = layer.filter?.field || '';
    content.innerHTML = `
      <label class="gis-layer-edit-field">
        <span>Property field</span>
        <select data-gis-filter-field>
          <option value="">No filter</option>
          ${fields.map((field) => `<option value="${escapeHtml(field.name)}"${field.name === selectedField ? ' selected' : ''}>${escapeHtml(field.name)}</option>`).join('')}
        </select>
      </label>
      <div class="gis-layer-edit-filter-values" data-gis-filter-values></div>
    `;
    populateFilterValues(layer, true);
  }

  function populateFeatureColorValues(layer, useSavedSelection = true) {
    const summary = cachedFeatureSummary(layer);
    const fieldSelect = editForm?.querySelector('[data-gis-feature-color-field]');
    const valuesContainer = editForm?.querySelector('[data-gis-feature-color-values]');
    if (!summary || !fieldSelect || !valuesContainer) return;

    const selectedField = fieldSelect.value;
    const fieldInfo = (summary.fields || []).find((field) => field.name === selectedField);
    const savedColors = useSavedSelection && layer.feature_colors?.field === selectedField
      ? layer.feature_colors.colors || {}
      : {};

    valuesContainer.innerHTML = '';
    if (!selectedField) {
      valuesContainer.innerHTML = '<div class="gis-layer-edit-empty">Choose a field to color individual features.</div>';
      return;
    }
    if (!fieldInfo || !Array.isArray(fieldInfo.values) || !fieldInfo.values.length) {
      valuesContainer.innerHTML = '<div class="gis-layer-edit-empty">No values found for this field.</div>';
      return;
    }

    fieldInfo.values.forEach((value, index) => {
      const stringValue = normalizeFilterValue(value);
      const color = savedColors[stringValue] || FEATURE_COLOR_PALETTE[index % FEATURE_COLOR_PALETTE.length];
      const row = document.createElement('label');
      row.className = 'gis-layer-edit-feature-color-row';
      row.innerHTML = `
        <span title="${escapeHtml(stringValue)}">${escapeHtml(stringValue)}</span>
        <input type="color" value="${escapeHtml(color)}" data-gis-feature-color-value="${escapeHtml(stringValue)}" />
      `;
      valuesContainer.appendChild(row);
    });
  }

  function renderFeatureColorFields(layer, summary) {
    const content = editForm?.querySelector('[data-gis-feature-color-content]');
    if (!content) return;
    const fields = Array.isArray(summary.fields) ? summary.fields : [];
    if (!fields.length) {
      content.innerHTML = '<div class="gis-layer-edit-empty">No properties found for feature colors.</div>';
      return;
    }
    const selectedField = layer.feature_colors?.field || '';
    content.innerHTML = `
      <label class="gis-layer-edit-field">
        <span>Color by field</span>
        <select data-gis-feature-color-field>
          <option value="">No individual colors</option>
          ${fields.map((field) => `<option value="${escapeHtml(field.name)}"${field.name === selectedField ? ' selected' : ''}>${escapeHtml(field.name)}</option>`).join('')}
        </select>
      </label>
      <div class="gis-layer-edit-feature-color-values" data-gis-feature-color-values></div>
    `;
    populateFeatureColorValues(layer, true);
  }

  function renderLabelFields(layer, summary) {
    const content = editForm?.querySelector('[data-gis-label-content]');
    if (!content) return;
    const fields = Array.isArray(summary.fields) ? summary.fields : [];
    if (!fields.length) {
      content.innerHTML = '<div class="gis-layer-edit-empty">No properties found for labels.</div>';
      return;
    }
    const label = labelConfigForLayer(layer);
    content.innerHTML = `
      <label class="gis-layer-edit-check-row">
        <input type="checkbox" data-gis-label-enabled${label.enabled ? ' checked' : ''} />
        <span>Show labels</span>
      </label>
      <label class="gis-layer-edit-field">
        <span>Label field</span>
        <select data-gis-label-field>
          <option value="">Choose field</option>
          ${fields.map((field) => `<option value="${escapeHtml(field.name)}"${field.name === label.field ? ' selected' : ''}>${escapeHtml(field.name)}</option>`).join('')}
        </select>
      </label>
      ${colorControl('label', 'color', 'Text color', label.color).replace('data-paint-bucket="label" data-paint-prop="color"', 'data-gis-label-prop="color"')}
      <label class="gis-layer-edit-field">
        <span>Text size <output data-label-output="size">${escapeHtml(label.size)}</output></span>
        <input type="range" min="8" max="36" step="1" value="${escapeHtml(label.size)}" data-gis-label-prop="size" />
      </label>
      ${colorControl('label', 'haloColor', 'Halo color', label.haloColor).replace('data-paint-bucket="label" data-paint-prop="haloColor"', 'data-gis-label-prop="haloColor"')}
      <label class="gis-layer-edit-field">
        <span>Halo width <output data-label-output="haloWidth">${escapeHtml(label.haloWidth)}</output></span>
        <input type="range" min="0" max="8" step="0.5" value="${escapeHtml(label.haloWidth)}" data-gis-label-prop="haloWidth" />
      </label>
    `;
  }

  async function loadAndRenderFilterFields(layer) {
    if (layer?.kind !== 'vector') return;
    try {
      const summary = await loadFeatureSummary(layer);
      if (selectedEditLayerId !== editorLayerKey(layer)) return;
      const activeLayer = layerWithDraft(selectedEditLayer()) || layer;
      if (isUploadedEditableLayer(activeLayer)) {
        renderFilterFields(activeLayer, summary);
        renderFeatureColorFields(activeLayer, summary);
      }
      renderLabelFields(activeLayer, summary);
    } catch (error) {
      const selectors = isUploadedEditableLayer(layer)
        ? ['[data-gis-filter-content]', '[data-gis-feature-color-content]', '[data-gis-label-content]']
        : ['[data-gis-label-content]'];
      selectors.forEach((selector) => {
        const content = editForm?.querySelector(selector);
        if (content) content.innerHTML = `<div class="gis-layer-edit-empty">${escapeHtml(error.message || 'Could not load feature fields.')}</div>`;
      });
    }
  }

  function renderSelectedEditor() {
    const layer = layerWithDraft(selectedEditLayer());
    if (!editForm) return;
    if (!layer) {
      editForm.innerHTML = '<div class="gis-layer-edit-empty">No editable map layers available. Turn on a sidebar layer or upload a layer first.</div>';
      return;
    }
    const sourceLabel = isExistingEditableLayer(layer) ? 'existing map layer' : 'uploaded layer';
    const typeLabel = layer.kind === 'raster' ? 'raster' : (layer.render_type || 'vector');

    editForm.innerHTML = `
      <div class="gis-layer-edit-meta">${escapeHtml(sourceLabel)} / ${escapeHtml(typeLabel)}</div>
      ${renderStyleControls(layer)}
      ${renderFilterShell(layer)}
      ${renderFeatureColorShell(layer)}
      ${renderLabelShell(layer)}
      <div class="gis-layer-edit-actions">
        <button type="button" data-gis-reset-style>Reset</button>
        <button type="button" data-gis-save-style>Save Style</button>
      </div>
    `;
    loadAndRenderFilterFields(layer);
  }

  function renderEditLayerOptions() {
    if (!editLayerSelect) return;
    const uploaded = getUploadedEditableLayers();
    const existing = getExistingEditableLayers();
    const layers = [...uploaded, ...existing];

    editLayerSelect.innerHTML = '';
    if (!layers.length) {
      editLayerSelect.disabled = true;
      selectedEditLayerId = '';
      return;
    }

    editLayerSelect.disabled = false;
    const hasSelected = layers.some((layer) => editorLayerKey(layer) === selectedEditLayerId);
    if (!hasSelected) selectedEditLayerId = editorLayerKey(layers[0]);

    const appendGroup = (label, groupLayers) => {
      if (!groupLayers.length) return;
      const group = document.createElement('optgroup');
      group.label = label;
      groupLayers.forEach((layer) => {
        group.appendChild(new Option(layer.display_name || layer.id, editorLayerKey(layer)));
      });
      editLayerSelect.appendChild(group);
    };
    appendGroup('Uploaded layers', uploaded);
    appendGroup('Visible toggled layers', existing);
    editLayerSelect.value = selectedEditLayerId;
  }

  function renderEditPanel() {
    renderEditLayerOptions();
    renderSelectedEditor();
  }

  class GisLayerEditControl {
    onAdd(map) {
      this._map = map;
      const container = document.createElement('div');
      container.className = 'mapboxgl-ctrl gis-layer-edit-control';

      const group = document.createElement('div');
      group.className = 'mapboxgl-ctrl-group';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mapboxgl-ctrl-icon gis-layer-edit-btn';
      button.title = 'Edit GIS layer styles';
      button.innerHTML = '<img src="media/UI/controlicons/edit.gif" alt="Edit GIS layer styles" />';

      const panel = document.createElement('div');
      panel.className = 'gis-layer-edit-panel';
      panel.innerHTML = `
        <div class="gis-layer-edit-header">
          <span>Edit GIS Layers</span>
          <button type="button" data-gis-edit-close title="Close">&times;</button>
        </div>
        <div class="gis-layer-edit-body">
          <label class="gis-layer-edit-field">
            <span>Map layer</span>
            <select data-gis-edit-layer></select>
          </label>
          <div data-gis-edit-form></div>
          <div class="gis-layer-edit-status" data-gis-edit-status></div>
        </div>
      `;

      group.appendChild(button);
      container.appendChild(group);
      container.appendChild(panel);

      editPanel = panel;
      editLayerSelect = panel.querySelector('[data-gis-edit-layer]');
      editForm = panel.querySelector('[data-gis-edit-form]');
      editStatus = panel.querySelector('[data-gis-edit-status]');

      ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel', 'keydown'].forEach((eventName) => {
        panel.addEventListener(eventName, (event) => {
          event.stopPropagation();
        });
      });

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        panel.classList.toggle('is-open');
        if (panel.classList.contains('is-open')) {
          renderEditPanel();
          setEditStatus('');
        }
      });

      panel.querySelector('[data-gis-edit-close]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        panel.classList.remove('is-open');
      });

      editLayerSelect?.addEventListener('change', () => {
        selectedEditLayerId = editLayerSelect.value;
        renderSelectedEditor();
        setEditStatus('');
      });

      editForm?.addEventListener('input', (event) => {
        const target = event.target;
        if (!target?.matches) return;
        if (target.matches('[data-paint-bucket][data-paint-prop]')) {
          updatePaintOutput(target);
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-feature-color-value]')) {
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-label-prop]')) {
          updateLabelOutput(target);
          applyEditorFormToMap();
        }
      });

      editForm?.addEventListener('change', (event) => {
        const target = event.target;
        if (!target?.matches) return;
        const layer = layerWithDraft(selectedEditLayer());
        if (!layer) return;
        if (target.matches('[data-paint-bucket][data-paint-prop]')) {
          updatePaintOutput(target);
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-filter-field]')) {
          populateFilterValues(layer, false);
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-filter-value]')) {
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-feature-color-field]')) {
          populateFeatureColorValues(layer, false);
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-feature-color-value]')) {
          applyEditorFormToMap();
        } else if (target.matches('[data-gis-label-enabled], [data-gis-label-field], [data-gis-label-prop]')) {
          if (target.matches('[data-gis-label-prop]')) updateLabelOutput(target);
          applyEditorFormToMap();
        }
      });

      editForm?.addEventListener('click', (event) => {
        const target = event.target;
        if (!target?.closest) return;
        if (target.closest('[data-gis-save-style]')) {
          saveEditorStyle();
        } else if (target.closest('[data-gis-reset-style]')) {
          resetEditorToDefaults();
          setEditStatus('Defaults previewed. Save to keep them.', 'neutral');
        } else if (target.closest('[data-gis-clear-filter]')) {
          const layer = layerWithDraft(selectedEditLayer());
          const fieldSelect = editForm.querySelector('[data-gis-filter-field]');
          if (fieldSelect && layer) {
            fieldSelect.value = '';
            populateFilterValues(layer, false);
            applyEditorFormToMap();
          }
        } else if (target.closest('[data-gis-clear-feature-colors]')) {
          const layer = layerWithDraft(selectedEditLayer());
          const fieldSelect = editForm.querySelector('[data-gis-feature-color-field]');
          if (fieldSelect && layer) {
            fieldSelect.value = '';
            populateFeatureColorValues(layer, false);
            applyEditorFormToMap();
          }
        }
      });

      this._outsideClick = (event) => {
        if (!container.contains(event.target)) panel.classList.remove('is-open');
      };
      document.addEventListener('click', this._outsideClick);

      return container;
    }

    onRemove() {
      if (this._outsideClick) document.removeEventListener('click', this._outsideClick);
      editPanel = null;
      editLayerSelect = null;
      editForm = null;
      editStatus = null;
      this._map = null;
    }
  }

  function addEditControl() {
    const map = getMapInstance();
    if (!map || editControl || window.__gisLayerEditControlAdded) return;
    editControl = new GisLayerEditControl();
    map.addControl(editControl, 'top-right');
    window.__gisLayerEditControlAdded = true;
  }

  function renderEditPanelIfOpen() {
    if (editPanel?.classList.contains('is-open')) {
      renderEditPanel();
    }
  }

  function bindSidebarToggleTracking() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar || sidebar.__gisLayerEditToggleTrackingBound) return;
    sidebar.__gisLayerEditToggleTrackingBound = true;

    sidebar.addEventListener('change', (event) => {
      const checkbox = event.target;
      if (!checkbox?.matches?.('input[type="checkbox"]')) return;
      activeSidebarToggle = sidebarToggleInfo(checkbox);
      setTimeout(() => {
        if (activeSidebarToggle?.checkboxId === checkbox.id) {
          activeSidebarToggle = null;
        }
        renderEditPanelIfOpen();
      }, 0);
    }, true);
  }

  function restoreUploadedLayersOnMap() {
    uploadedLayers.forEach((layer) => {
      const currentLayer = currentUploadedLayer(layer.id) || mergeLayerWithLocalPresentation(layer);
      ensureMapLayer(currentLayer)
        .then(() => setUploadedLayerVisibility(currentLayer, isLayerChecked(currentLayer)))
        .catch((error) => console.warn('[GIS uploader] Could not restore uploaded layer:', error));
    });
  }

  function applySavedExistingLayerStyleById(map, layerId) {
    if (!map || !layerId) return;
    const styleLayer = map.getLayer(layerId);
    if (!isExistingLayerCandidate(map, styleLayer)) return;
    rememberExistingLayerOriginalStyle(map, styleLayer);
    const savedPresentation = readExistingLayerStyleStore()[layerId];
    if (!savedPresentation || !PRESENTATION_KEYS.some((key) => Boolean(savedPresentation[key]))) return;
    const editableLayer = existingEditableLayerFromStyleLayer(map, styleLayer);
    if (editableLayer) applySavedLayerPresentation(map, editableLayer);
  }

  function setExistingLabelVisibility(map, layerId, visible) {
    if (!map || !layerId) return;
    const labelId = existingLabelLayerIdForLayerId(layerId);
    if (!map.getLayer(labelId)) return;
    try {
      map.setLayoutProperty(labelId, 'visibility', visible ? 'visible' : 'none');
    } catch (error) {
      console.warn('[GIS uploader] Could not sync existing layer label visibility:', error);
    }
  }

  function restoreExistingLayerStyles() {
    const map = getMapInstance();
    if (!map?.getStyle) return;
    (map.getStyle().layers || []).forEach((styleLayer) => {
      if (!isExistingLayerCandidate(map, styleLayer)) return;
      rememberExistingLayerOriginalStyle(map, styleLayer);
      applySavedExistingLayerStyleById(map, styleLayer.id);
    });
    renderEditPanelIfOpen();
  }

  function bindExistingLayerStyleAutoApply() {
    const map = getMapInstance();
    if (!map || map.__gisExistingLayerStyleBound) return;
    map.__gisExistingLayerStyleBound = true;

    const previousSetLayoutProperty = map.setLayoutProperty.bind(map);
    map.setLayoutProperty = function (layerId, prop, value) {
      const result = previousSetLayoutProperty(layerId, prop, value);
      if (prop === 'visibility') {
        const styleLayer = map.getLayer(layerId);
        if (activeSidebarToggle && isExistingLayerCandidate(map, styleLayer)) {
          recordExistingLayerToggle(layerId, activeSidebarToggle);
        }
        if (value !== 'none') {
          applySavedExistingLayerStyleById(map, layerId);
        } else {
          setExistingLabelVisibility(map, layerId, false);
        }
        renderEditPanelIfOpen();
      }
      return result;
    };

    const previousAddLayer = map.addLayer.bind(map);
    map.addLayer = function (layer, beforeId) {
      const result = beforeId === undefined ? previousAddLayer(layer) : previousAddLayer(layer, beforeId);
      if (layer?.id) {
        setTimeout(() => {
          applySavedExistingLayerStyleById(map, layer.id);
          renderEditPanelIfOpen();
        }, 0);
      }
      return result;
    };
  }

  function renderUploadedLayerManager() {
    const list = modal?.querySelector('[data-gis-uploaded-list]');
    if (!list) return;

    list.innerHTML = '';
    const layers = Array.from(uploadedLayers.values())
      .sort((a, b) => cleanText(a.display_name).localeCompare(cleanText(b.display_name)));

    if (!layers.length) {
      const empty = document.createElement('div');
      empty.className = 'gis-uploaded-empty';
      empty.textContent = 'No uploaded togglers yet.';
      list.appendChild(empty);
      return;
    }

    layers.forEach((layer) => {
      const row = document.createElement('div');
      row.className = 'gis-uploaded-manager-row';
      row.dataset.gisLayerId = layer.id;
      row.innerHTML = `
        <div>
          <div class="gis-uploaded-manager-name">${escapeHtml(layer.display_name)}</div>
          <div class="gis-uploaded-manager-meta">${escapeHtml(layer.kind || 'layer')} / ${escapeHtml(layer.sidebar_panel_id || 'sidebar')}</div>
        </div>
        <button type="button" class="gis-uploaded-delete" data-gis-delete-layer="${escapeHtml(layer.id)}" title="Delete toggler" aria-label="Delete ${escapeHtml(layer.display_name)} toggler">&times;</button>
      `;
      list.appendChild(row);
    });
  }

  function selectPlacement(panelId) {
    selectedPanelId = panelId;
    modal?.querySelectorAll('.gis-placement-row').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.panelId === panelId);
    });
    const hiddenInput = modal?.querySelector('input[name="sidebar_panel_id"]');
    if (hiddenInput) hiddenInput.value = panelId;
  }

  function renderPlacementBrowser() {
    const list = modal?.querySelector('[data-gis-placement-list]');
    if (!list) return;
    const panels = getSidebarPanels();
    list.innerHTML = '';

    panels.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'gis-placement-row';
      row.dataset.panelId = item.id;
      row.dataset.searchText = item.path.join(' ').toLowerCase();
      row.style.paddingLeft = `${12 + item.depth * 16}px`;
      row.innerHTML = `
        <span class="gis-placement-name">${escapeHtml(item.label)}</span>
        <span class="gis-placement-path">${escapeHtml(item.path.join(' / '))}</span>
      `;
      row.addEventListener('click', () => selectPlacement(item.id));
      list.appendChild(row);
    });

    const defaultPanel = panels.find((item) => item.id === selectedPanelId)
      || panels.find((item) => item.id === 'miscellaneous')
      || panels[0];
    if (defaultPanel) {
      selectPlacement(defaultPanel.id);
    } else {
      setStatus('No sidebar sections were found for placement.', 'error');
    }
  }

  function setMode(mode) {
    currentMode = mode;
    modal?.querySelectorAll('[data-gis-mode]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.gisMode === mode);
    });
    modal?.querySelectorAll('[data-mode-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.modePanel !== mode;
    });
    const submit = modal?.querySelector('[data-gis-submit]');
    if (submit) {
      submit.textContent = mode === 'vector' ? 'Publish Vector Layer' : 'Publish Raster Layer';
    }
  }

  function createModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'gis-uploader-modal hidden';
    modal.innerHTML = `
      <div class="gis-uploader-backdrop" data-gis-close></div>
      <div class="gis-uploader-panel" role="dialog" aria-modal="true" aria-labelledby="gisUploaderTitle">
        <div class="gis-uploader-header">
          <div>
            <h2 id="gisUploaderTitle">Upload Data</h2>
            <p>Publish GIS layers to GeoServer and place them in the sidebar.</p>
          </div>
          <button class="gis-uploader-close" type="button" data-gis-close aria-label="Close uploader">&times;</button>
        </div>
        <div class="gis-mode-tabs" role="tablist">
          <button type="button" data-gis-mode="vector">Vector Data Upload</button>
          <button type="button" data-gis-mode="raster">Raster Data Upload</button>
        </div>
        <form class="gis-upload-form">
          <label class="gis-field">
            <span>Layer toggle name</span>
            <input type="text" name="display_name" required maxlength="120" placeholder="Example: New flood extent" />
          </label>
          <input type="hidden" name="sidebar_panel_id" />
          <div data-mode-panel="vector">
            <label class="gis-field">
              <span>Vector shapefile zip</span>
              <input type="file" name="vector_file" accept=".zip" />
            </label>
            <div class="gis-helper">Zip must contain one shapefile with .shp, .shx, .dbf, and .prj.</div>
          </div>
          <div data-mode-panel="raster" hidden>
            <label class="gis-field">
              <span>Raster GeoTIFF</span>
              <input type="file" name="raster_file" accept=".tif,.tiff" />
            </label>
            <label class="gis-field">
              <span>Raster SLD style</span>
              <input type="file" name="sld_file" accept=".sld" />
            </label>
          </div>
          <div class="gis-placement">
            <div class="gis-placement-header">
              <span>Place toggle in sidebar</span>
              <input type="search" data-gis-placement-search placeholder="Filter sections" />
            </div>
            <div class="gis-placement-list" data-gis-placement-list></div>
          </div>
          <div class="gis-uploaded-manager">
            <div class="gis-uploaded-manager-header">Uploaded togglers</div>
            <div class="gis-uploaded-manager-list" data-gis-uploaded-list></div>
          </div>
          <div class="gis-uploader-footer">
            <div class="gis-status" data-gis-status></div>
            <button type="submit" data-gis-submit>Publish Vector Layer</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-gis-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });
    modal.querySelectorAll('[data-gis-mode]').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.gisMode));
    });
    modal.querySelector('.gis-upload-form')?.addEventListener('submit', submitUpload);
    modal.querySelector('[data-gis-uploaded-list]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-gis-delete-layer]');
      if (!button) return;
      deleteUploadedLayer(button.dataset.gisDeleteLayer, button);
    });
    modal.querySelector('[data-gis-placement-search]')?.addEventListener('input', (event) => {
      const query = event.target.value.toLowerCase().trim();
      modal.querySelectorAll('.gis-placement-row').forEach((row) => {
        row.hidden = query && !row.dataset.searchText.includes(query);
      });
    });
    setMode('vector');
    return modal;
  }

  function openModal() {
    createModal();
    renderPlacementBrowser();
    renderUploadedLayerManager();
    setStatus('');
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal?.classList.add('hidden');
  }

  async function submitUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const displayName = form.elements.display_name.value.trim();
    const panelId = form.elements.sidebar_panel_id.value.trim();
    if (!displayName || !panelId) {
      setStatus('Choose a name and sidebar placement first.', 'error');
      return;
    }

    const payload = new FormData();
    payload.append('display_name', displayName);
    payload.append('sidebar_panel_id', panelId);

    if (currentMode === 'vector') {
      const file = form.elements.vector_file.files[0];
      if (!file) {
        setStatus('Choose a zipped shapefile.', 'error');
        return;
      }
      payload.append('file', file);
    } else {
      const rasterFile = form.elements.raster_file.files[0];
      const sldFile = form.elements.sld_file.files[0];
      if (!rasterFile || !sldFile) {
        setStatus('Choose both a GeoTIFF and an SLD file.', 'error');
        return;
      }
      payload.append('raster_file', rasterFile);
      payload.append('sld_file', sldFile);
    }

    const submit = form.querySelector('[data-gis-submit]');
    submit.disabled = true;
    setStatus('Uploading and publishing to GeoServer...', 'neutral');
    try {
      const response = await fetch(`${API_BASE}/upload/${currentMode}`, {
        method: 'POST',
        body: payload
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Upload failed with HTTP ${response.status}`);
      }
      addUploadedLayer(body.layer, true);
      form.reset();
      renderPlacementBrowser();
      renderUploadedLayerManager();
      setStatus('Layer published and added to the sidebar.', 'success');
    } catch (error) {
      setStatus(error.message || 'Upload failed.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  function addUploadedLayer(layer, focusToggle) {
    if (!layer?.id) return;
    asUploadedEditableLayer(layer);
    uploadedLayers.set(layer.id, layer);
    addLayerToggle(layer, focusToggle);
    renderUploadedLayerManager();
    renderEditPanel();
    ensureMapLayer(layer).catch((error) => console.warn('[GIS uploader] Could not prepare map layer:', error));
  }

  function addLayerToggle(layer, focusToggle) {
    if (document.getElementById(checkboxId(layer))) return;
    const panel = document.getElementById(layer.sidebar_panel_id) || document.getElementById('miscellaneous');
    if (!panel) return;

    const row = document.createElement('label');
    row.className = 'flex items-center justify-between p-2 hover:bg-gray-600 rounded cursor-pointer gis-uploaded-layer-row';
    row.dataset.gisLayerId = layer.id;
    row.innerHTML = `
      <span class="text-sm">${escapeHtml(layer.display_name)}</span>
      <div class="relative">
        <input type="checkbox" id="${escapeHtml(checkboxId(layer))}" class="hidden" />
        <label for="${escapeHtml(checkboxId(layer))}" class="cursor-pointer"></label>
      </div>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const currentLayer = currentUploadedLayer(layer.id) || layer;
      if (typeof toggleHighlight === 'function') {
        toggleHighlight(checkbox);
      }
      setUploadedLayerVisibility(currentLayer, checkbox.checked)
        .catch((error) => console.warn('[GIS uploader] Could not toggle uploaded layer:', error));
      renderEditPanelIfOpen();
    });

    panel.appendChild(row);
    if (focusToggle) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function removeUploadedLayerFromMap(layer) {
    const map = getMapInstance();
    if (!map || !layer) return;

    allUploadedLayerIds(layer).forEach((id) => {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
    });

    const source = sourceId(layer);
    if (map.getSource(source)) {
      map.removeSource(source);
    }
  }

  function removeUploadedLayerUi(layer) {
    if (!layer?.id) return;
    const selectorId = escapeAttributeSelector(layer.id);
    const row = document.querySelector(`.gis-uploaded-layer-row[data-gis-layer-id="${selectorId}"]`);
    row?.remove();
    modal?.querySelector(`.gis-uploaded-manager-row[data-gis-layer-id="${selectorId}"]`)?.remove();
    uploadedLayers.delete(layer.id);
    featureSummaryCache.delete(layer.id);
    featureSummaryCache.delete(editorLayerKey(asUploadedEditableLayer(layer)));
    layerDrafts.delete(editorLayerKey(asUploadedEditableLayer(layer)));
    removeLocalLayerPresentation(layer.id);
    if (selectedEditLayerId === editorLayerKey(layer)) selectedEditLayerId = '';
    renderUploadedLayerManager();
    renderEditPanel();
  }

  async function deleteUploadedLayer(layerId, button) {
    const layer = uploadedLayers.get(layerId);
    if (!layer) return;
    if (!window.confirm(`Delete "${layer.display_name}" from uploaded togglers?`)) return;

    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = '...';
    }
    setStatus('Deleting uploaded toggler...', 'neutral');

    try {
      const response = await fetch(`${API_BASE}/layers/${encodeURIComponent(layerId)}`, {
        method: 'DELETE'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Delete failed with HTTP ${response.status}`);
      }

      removeUploadedLayerFromMap(layer);
      removeUploadedLayerUi(layer);
      setStatus('Uploaded toggler deleted.', 'success');
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      setStatus(error.message || 'Delete failed.', 'error');
    }
  }

  async function loadSavedLayers() {
    try {
      const layers = await fetchSavedLayerRegistry();
      layers.forEach((layer) => addUploadedLayer(layer, false));
      renderUploadedLayerManager();
      renderEditPanel();
    } catch (error) {
      console.warn('[GIS uploader] Saved layers were not loaded:', error.message || error);
    }
  }

  function bindMapStyleReload() {
    const map = getMapInstance();
    if (!map || map.__gisUploaderStyleBound) return;
    map.__gisUploaderStyleBound = true;
    map.on('style.load', () => {
      setTimeout(() => {
        restoreUploadedLayersOnMap();
        restoreExistingLayerStyles();
      }, 350);
    });
  }

  function initializeMapBindings() {
    waitForMapInstance()
      .then(() => {
        addEditControl();
        bindExistingLayerStyleAutoApply();
        bindMapStyleReload();
        return waitForMapReady();
      })
      .then(() => {
        restoreUploadedLayersOnMap();
        restoreExistingLayerStyles();
      })
      .catch((error) => console.warn('[GIS uploader] Map bindings were not initialized:', error.message || error));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('upload-data-btn');
    if (uploadButton) {
      uploadButton.addEventListener('click', openModal);
    }
    bindSidebarToggleTracking();
    initializeMapBindings();
    loadSavedLayers();
  });
})();
