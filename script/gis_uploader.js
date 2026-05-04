(function () {
  const API_BASE = 'http://localhost:8001/api/gis';
  const uploadedLayers = new Map();
  let modal = null;
  let currentMode = 'vector';
  let selectedPanelId = '';

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
      const map = getMapInstance();
      if (!map) {
        reject(new Error('Map is not ready yet.'));
        return;
      }
      if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
        resolve(map);
        return;
      }
      map.once('style.load', () => resolve(map));
    });
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

  function checkboxId(layer) {
    return `gis-upload-toggle-${layer.id}`;
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
          paint: { 'raster-opacity': 0.85 }
        });
      }
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
          paint: {
            'circle-color': '#06b6d4',
            'circle-radius': 6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5
          }
        });
      }
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
          paint: {
            'line-color': '#22c55e',
            'line-width': 2.5,
            'line-opacity': 0.9
          }
        });
      }
      return map;
    }

    const [fillId, outlineId] = layerIds(layer);
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source,
        layout: { visibility },
        paint: {
          'fill-color': '#0ea5e9',
          'fill-opacity': 0.35
        }
      });
    }
    if (!map.getLayer(outlineId)) {
      map.addLayer({
        id: outlineId,
        type: 'line',
        source,
        layout: { visibility },
        paint: {
          'line-color': '#0284c7',
          'line-width': 1.8,
          'line-opacity': 0.95
        }
      });
    }

    try {
      if (typeof moveAllLabelsToTop === 'function') {
        setTimeout(() => moveAllLabelsToTop(map), 200);
      }
    } catch (error) {
      // Non-critical label ordering helper.
    }
    return map;
  }

  async function setUploadedLayerVisibility(layer, visible) {
    const map = await ensureMapLayer(layer);
    layerIds(layer).forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }

  function getPanelLabel(panel) {
    const button = panel.previousElementSibling;
    const label = button?.querySelector('.sidebar-label');
    return cleanText(label?.textContent || button?.textContent || panel.id);
  }

  function getPanelPath(panel) {
    const path = [];
    let current = panel;
    while (current && current.classList?.contains('section-panel')) {
      path.unshift(getPanelLabel(current));
      current = current.parentElement?.closest('.section-panel');
    }
    return path;
  }

  function getSidebarPanels() {
    return Array.from(document.querySelectorAll('#app-sidebar .section-panel'))
      .filter((panel) => panel.id && panel.previousElementSibling)
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
      if (typeof toggleHighlight === 'function') {
        toggleHighlight(checkbox);
      }
      setUploadedLayerVisibility(layer, checkbox.checked)
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

    layerIds(layer).forEach((id) => {
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
    renderUploadedLayerManager();
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
      const response = await fetch(`${API_BASE}/layers`);
      if (!response.ok) throw new Error(`GIS uploader API returned ${response.status}`);
      const data = await response.json();
      (data.layers || []).forEach((layer) => addUploadedLayer(layer, false));
      renderUploadedLayerManager();
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
        uploadedLayers.forEach((layer) => {
          ensureMapLayer(layer)
            .then(() => setUploadedLayerVisibility(layer, isLayerChecked(layer)))
            .catch((error) => console.warn('[GIS uploader] Could not restore uploaded layer:', error));
        });
      }, 350);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('upload-data-btn');
    if (uploadButton) {
      uploadButton.addEventListener('click', openModal);
    }
    bindMapStyleReload();
    loadSavedLayers();
  });
})();
