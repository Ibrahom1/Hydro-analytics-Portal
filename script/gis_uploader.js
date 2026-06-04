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
  const featureSummaryCache = new Map();
  const layerDrafts = new Map();
  const PRESENTATION_KEYS = ['style', 'filter', 'feature_colors', 'label'];
  const LOCAL_PRESENTATION_KEY = 'hydro-gis-uploader-presentations-v1';
  const MAP_READY_TIMEOUT_MS = 20000;

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

  function getMapInstance() {
    try {
      if (typeof map1 !== 'undefined' && map1) return map1;
    } catch (error) {
      return null;
    }
    return null;
  }

  function waitForMapReady() {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        const map = getMapInstance();
        if (map && (typeof map.isStyleLoaded !== 'function' || map.isStyleLoaded())) {
          resolve(map);
          return;
        }
        if (Date.now() - startedAt > MAP_READY_TIMEOUT_MS) {
          reject(new Error('Map is not ready yet.'));
          return;
        }
        setTimeout(check, 150);
      };
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

  function escapeAttributeSelector(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sourceId(layer) {
    return `gis-upload-source-${layer.id}`;
  }

  function layerIds(layer) {
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
    return `gis-upload-${layer.id}-label`;
  }

  function allUploadedLayerIds(layer) {
    if (layer.kind === 'raster') return layerIds(layer);
    return [...layerIds(layer), labelLayerId(layer)];
  }

  function checkboxId(layer) {
    return `gis-upload-toggle-${layer.id}`;
  }

  function uploadedLayerType(layer) {
    if (layer?.kind === 'raster') return 'raster';
    if (layer?.render_type === 'point') return 'point';
    if (layer?.render_type === 'line') return 'line';
    return 'fill';
  }

  function editablePaintBuckets(layer) {
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
    return [
      'in',
      ['to-string', ['get', filter.field]],
      ['literal', filter.values.map(normalizeFilterValue)]
    ];
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

  function labelLayerDefinition(layer, visibility) {
    const label = labelConfigForLayer(layer);
    return {
      id: labelLayerId(layer),
      type: 'symbol',
      source: sourceId(layer),
      layout: {
        visibility: isLabelEnabled(layer) ? visibility : 'none',
        'text-field': ['to-string', ['get', label.field || '']],
        'text-size': Number(label.size) || DEFAULT_LABEL_STYLE.size,
        'text-anchor': 'center',
        'text-offset': [0, layer.render_type === 'point' ? 1.2 : 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'symbol-placement': layer.render_type === 'line' ? 'line' : 'point'
      },
      paint: {
        'text-color': label.color || DEFAULT_LABEL_STYLE.color,
        'text-halo-color': label.haloColor || DEFAULT_LABEL_STYLE.haloColor,
        'text-halo-width': Number(label.haloWidth) || DEFAULT_LABEL_STYLE.haloWidth,
        'text-opacity': isLabelEnabled(layer) ? 1 : 0
      }
    };
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
    if (!map || !layer || layer.kind !== 'vector') return;
    const filter = buildMapboxFilter(layer);
    allUploadedLayerIds(layer).forEach((styleLayerId) => {
      if (!map.getLayer(styleLayerId)) return;
      try {
        map.setFilter(styleLayerId, filter);
      } catch (error) {
        console.warn('[GIS uploader] Could not apply uploaded layer filter:', error);
      }
    });
  }

  function applyLayerLabels(map, layer) {
    if (!map || !layer || layer.kind !== 'vector') return;
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
    Object.entries(definition.layout).forEach(([property, value]) => {
      try {
        map.setLayoutProperty(id, property, value);
      } catch (error) {
        console.warn('[GIS uploader] Could not update label layout:', property, error);
      }
    });
    Object.entries(definition.paint).forEach(([property, value]) => {
      try {
        map.setPaintProperty(id, property, value);
      } catch (error) {
        console.warn('[GIS uploader] Could not update label paint:', property, error);
      }
    });
  }

  function applySavedLayerPresentation(map, layer) {
    applyLayerStyle(map, layer);
    applyLayerLabels(map, layer);
    applyLayerFilter(map, layer);
  }

  function isLayerChecked(layer) {
    const checkbox = document.getElementById(checkboxId(layer));
    return Boolean(checkbox?.checked);
  }

  async function ensureMapLayer(layer) {
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
    applySavedLayerPresentation(map, layer);
    return map;
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

  function selectedEditLayer() {
    return uploadedLayers.get(selectedEditLayerId) || null;
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
    if (!layer?.id || !layerDrafts.has(layer.id)) return layer;
    const draft = layerDrafts.get(layer.id);
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

    uploadedLayers.set(savedLayer.id, savedLayer);
    layerDrafts.delete(savedLayer.id);
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

  function renderStyleControls(layer) {
    if (layer.kind === 'raster') return renderRasterControls(layer);
    if (layer.render_type === 'point') return renderPointControls(layer);
    if (layer.render_type === 'line') return renderLineControls(layer);
    return renderPolygonControls(layer);
  }

  function renderFilterShell(layer) {
    if (layer.kind !== 'vector') return '';
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
    if (layer.kind !== 'vector') return '';
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
    if (layer.kind !== 'vector') return '';
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
    if (!Object.keys(colors).length) return null;
    return { field, colors };
  }

  function collectLabelFromEditor() {
    const enabled = Boolean(editForm?.querySelector('[data-gis-label-enabled]')?.checked);
    const field = editForm?.querySelector('[data-gis-label-field]')?.value || '';
    if (!enabled || !field) return null;
    return {
      enabled: true,
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
    if (!values.length) return null;
    return { field, values };
  }

  async function applyEditorFormToMap() {
    const layer = selectedEditLayer();
    if (!layer) return;
    const draft = presentationPayloadFromEditor();
    layerDrafts.set(layer.id, draft);
    const previewLayer = layerWithDraft(layer);
    try {
      const map = await ensureMapLayer(previewLayer);
      applySavedLayerPresentation(map, previewLayer);
    } catch (error) {
      console.warn('[GIS uploader] Could not preview uploaded layer style:', error);
    }
  }

  function resetEditorToDefaults() {
    const layer = selectedEditLayer();
    if (!layer || !editForm) return;
    editablePaintBuckets(layer).forEach((bucket) => {
      const defaults = DEFAULT_LAYER_PAINT[bucket] || {};
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
    layerDrafts.set(layer.id, presentationPayloadFromEditor());
    applyEditorFormToMap();
  }

  async function saveEditorStyle() {
    const layer = selectedEditLayer();
    if (!layer) return;
    setEditStatus('Saving style...', 'neutral');
    const payload = layerDrafts.get(layer.id) || presentationPayloadFromEditor();
    layerDrafts.set(layer.id, payload);
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
      selectedEditLayerId = savedLayer.id;
      renderUploadedLayerManager();
      renderEditPanel();
      setEditStatus('Style saved.', 'success');
    } catch (error) {
      const localLayer = applyPresentationToLayer(layer, payload);
      uploadedLayers.set(layer.id, localLayer);
      layerDrafts.delete(layer.id);
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

  async function loadFeatureSummary(layer) {
    if (featureSummaryCache.has(layer.id)) return featureSummaryCache.get(layer.id);
    const response = await fetch(`${API_BASE}/layers/${encodeURIComponent(layer.id)}/feature-summary`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.detail || `Feature summary failed with HTTP ${response.status}`);
    }
    featureSummaryCache.set(layer.id, body);
    return body;
  }

  function populateFilterValues(layer, useSavedSelection = true) {
    const summary = featureSummaryCache.get(layer.id);
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
    const summary = featureSummaryCache.get(layer.id);
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
        <input type="checkbox" data-gis-label-enabled${label.enabled && label.field ? ' checked' : ''} />
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
    if (layer.kind !== 'vector') return;
    try {
      const summary = await loadFeatureSummary(layer);
      if (selectedEditLayerId !== layer.id) return;
      renderFilterFields(layer, summary);
      renderFeatureColorFields(layer, summary);
      renderLabelFields(layer, summary);
    } catch (error) {
      ['[data-gis-filter-content]', '[data-gis-feature-color-content]', '[data-gis-label-content]'].forEach((selector) => {
        const content = editForm?.querySelector(selector);
        if (content) content.innerHTML = `<div class="gis-layer-edit-empty">${escapeHtml(error.message || 'Could not load feature fields.')}</div>`;
      });
    }
  }

  function renderSelectedEditor() {
    const layer = layerWithDraft(selectedEditLayer());
    if (!editForm) return;
    if (!layer) {
      editForm.innerHTML = '<div class="gis-layer-edit-empty">No uploaded layers available.</div>';
      return;
    }

    editForm.innerHTML = `
      <div class="gis-layer-edit-meta">${escapeHtml(layer.kind || 'layer')} / ${escapeHtml(layer.render_type || 'raster')}</div>
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
    const layers = Array.from(uploadedLayers.values())
      .sort((a, b) => cleanText(a.display_name).localeCompare(cleanText(b.display_name)));

    editLayerSelect.innerHTML = '';
    if (!layers.length) {
      editLayerSelect.disabled = true;
      selectedEditLayerId = '';
      return;
    }

    editLayerSelect.disabled = false;
    const hasSelected = layers.some((layer) => layer.id === selectedEditLayerId);
    if (!hasSelected) selectedEditLayerId = layers[0].id;
    layers.forEach((layer) => {
      editLayerSelect.appendChild(new Option(layer.display_name || layer.id, layer.id));
    });
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
      button.title = 'Edit uploaded GIS layer styles';
      button.innerHTML = '<img src="media/UI/controlicons/edit.gif" alt="Edit uploaded layer styles" />';

      const panel = document.createElement('div');
      panel.className = 'gis-layer-edit-panel';
      panel.innerHTML = `
        <div class="gis-layer-edit-header">
          <span>Edit Uploaded Layers</span>
          <button type="button" data-gis-edit-close title="Close">&times;</button>
        </div>
        <div class="gis-layer-edit-body">
          <label class="gis-layer-edit-field">
            <span>Uploaded layer</span>
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

  function restoreUploadedLayersOnMap() {
    uploadedLayers.forEach((layer) => {
      const currentLayer = currentUploadedLayer(layer.id) || mergeLayerWithLocalPresentation(layer);
      ensureMapLayer(currentLayer)
        .then(() => setUploadedLayerVisibility(currentLayer, isLayerChecked(currentLayer)))
        .catch((error) => console.warn('[GIS uploader] Could not restore uploaded layer:', error));
    });
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
    layerDrafts.delete(layer.id);
    removeLocalLayerPresentation(layer.id);
    if (selectedEditLayerId === layer.id) selectedEditLayerId = '';
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
      setTimeout(restoreUploadedLayersOnMap, 350);
    });
  }

  function initializeMapBindings() {
    waitForMapInstance()
      .then(() => {
        addEditControl();
        bindMapStyleReload();
        return waitForMapReady();
      })
      .then(() => {
        restoreUploadedLayersOnMap();
      })
      .catch((error) => console.warn('[GIS uploader] Map bindings were not initialized:', error.message || error));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('upload-data-btn');
    if (uploadButton) {
      uploadButton.addEventListener('click', openModal);
    }
    initializeMapBindings();
    loadSavedLayers();
  });
})();
