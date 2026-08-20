/**
 * PMD NWFC Daily Forecast & PMD NWFC Daily Rain Controller
 * Hydro Analytics 2026
 *
 * PMD NWFC Daily Forecast:
 *   - Points & Icons: Forecast API (/api/pmd/nwfc/forecast/) + PMD_CITY_COORDINATES
 *   - Weather Report Panel: Forecast API (/api/pmd/nwfc/forecast/)
 *
 * PMD NWFC Daily Rain:
 *   - Points & Icons: Observations API (/api/pmd/nwfc/observations/)
 *   - Filter: ONLY stations with rain_3h > 0 OR rain_24h > 0 (excludes null/0 rain stations)
 *   - Click Popup: Styled Mapbox popup with rain_3h & rain_24h details (no bottom weather text)
 *   - Weather Report Panel: NOT shown
 */

(function () {

  const PMD_CITY_COORDINATES = {
    "ISLAMABAD CITY": [73.0479, 33.6844],
    "CHAKLALA- RAWALPINDI": [73.0714, 33.5970],
    "MURREE": [73.3903, 33.9070],
    "SARGODHA CITY": [72.6711, 32.0836],
    "JHELUM": [73.7273, 32.9425],
    "FAISALABAD": [73.0791, 31.4504],
    "CHAKWAL": [72.8560, 32.9328],
    "LAHORE CITY": [74.3587, 31.5204],
    "D G KHAN": [70.6403, 30.0561],
    "MULTAN AIRPORT": [71.4181, 30.1978],
    "SAHIWAL": [73.1068, 30.6682],
    "BAHAWALPUR CITY": [71.6833, 29.3956],
    "ATTOCK": [72.3601, 33.7660],
    "CHITRAL": [71.7864, 35.8510],
    "DIR": [71.8763, 35.2037],
    "SAIDU SHARIF": [72.3556, 34.7479],
    "MALAM JABBA": [72.5694, 34.7997],
    "PESHAWAR AP": [71.5249, 34.0151],
    "KAKUL": [73.2568, 34.1794],
    "BANNU": [70.6044, 32.9861],
    "DI KHAN CITY": [70.9019, 31.8314],
    "SUKKUR": [68.8570, 27.7052],
    "DADU": [67.7754, 26.7303],
    "MOHENJO DARO": [68.1362, 27.3278],
    "NAWABSHAH": [68.3737, 26.2483],
    "HYDERABAD AIRPORT": [68.3683, 25.3960],
    "KARACHI": [67.0011, 24.8607],
    "THATTA": [67.9239, 24.7475],
    "MITHI": [69.7998, 24.7370],
    "SAMUNGLI": [66.9500, 30.2500],
    "QUETTA": [67.0011, 30.1798],
    "KALAT": [66.5916, 29.0266],
    "SIBBI": [67.8773, 29.5448],
    "NOKKUNDI": [62.0163, 28.8250],
    "TURBAT": [63.0440, 26.0023],
    "JIWANI": [61.7677, 25.0485],
    "GAWADAR": [62.3254, 25.1264],
    "RAWALAKOT": [73.7604, 33.8584],
    "GARHI DOPATTA": [73.6186, 34.2259],
    "MUZAFFARABAD CITY": [73.4711, 34.3700],
    "GUPIS": [73.4358, 36.2304],
    "HUNZA": [74.6500, 36.3167],
    "GILGIT": [74.3144, 35.9208],
    "SKARDU": [75.6333, 35.2971],
    "BUNJI": [74.6347, 35.6591],
    "CHILAS": [74.0961, 35.4190],
    "ASTORE": [74.9048, 35.3670],
    "BABUSAR": [74.0436, 35.1481]
  };

  const WEATHER_SVGS = {
    "sunny": `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="32" r="14" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="4" stroke-linecap="round"><line x1="32" y1="6" x2="32" y2="12"/><line x1="32" y1="52" x2="32" y2="58"/><line x1="6" y1="32" x2="12" y2="32"/><line x1="52" y1="32" x2="58" y2="32"/><line x1="13.6" y1="13.6" x2="17.8" y2="17.8"/><line x1="46.2" y1="46.2" x2="50.4" y2="50.4"/><line x1="13.6" y1="50.4" x2="17.8" y2="46.2"/><line x1="46.2" y1="17.8" x2="50.4" y2="13.6"/></g></svg>`,
    "partly-cloudy": `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="24" cy="22" r="10" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="3" stroke-linecap="round"><line x1="24" y1="6" x2="24" y2="9"/><line x1="8" y1="22" x2="11" y2="22"/><line x1="12.7" y1="10.7" x2="14.8" y2="12.8"/><line x1="35.3" y1="10.7" x2="33.2" y2="12.8"/></g><path d="M46 48H20a10 10 0 0 1-2-19.8A14 14 0 0 1 44 22a10 10 0 0 1 2 26z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/></svg>`,
    "overcast": `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M50 46H18a12 12 0 0 1-1.5-23.9A16 16 0 0 1 46 14a12 12 0 0 1 4 32z" fill="#94a3b8" stroke="#78909c" stroke-width="1.5"/><path d="M42 50H22a8 8 0 0 1-1-15.9A11 11 0 0 1 40 30a8 8 0 0 1 2 20z" fill="#b0bec5" opacity="0.7"/></svg>`,
    "heavy-rain-strong-winds": `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M46 38H20a10 10 0 0 1-2-19.8A14 14 0 0 1 44 12a10 10 0 0 1 2 26z" fill="#94a3b8"/><g stroke="#38bdf8" stroke-width="3" stroke-linecap="round"><line x1="22" y1="44" x2="18" y2="54"/><line x1="32" y1="44" x2="28" y2="54"/><line x1="42" y1="44" x2="38" y2="54"/></g><g stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"><line x1="12" y1="48" x2="26" y2="48"/><line x1="34" y1="52" x2="48" y2="52"/></g></svg>`,
    "thunder-lightning": `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M46 34H20a10 10 0 0 1-2-19.8A14 14 0 0 1 44 8a10 10 0 0 1 2 26z" fill="#64748b"/><polygon points="32,28 24,44 32,44 26,58 42,38 34,38" fill="#f59e0b" stroke="#fef08a" stroke-width="1"/></svg>`,
    "default": `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="24" r="11" fill="#fbbf24"/><path d="M48 48H22a9 9 0 0 1-1.8-17.8A12 12 0 0 1 42 24a9 9 0 0 1 6 24z" fill="#cbd5e1"/></svg>`
  };

  let forecastMarkers = [];
  let rainMarkers = [];
  let activePopups = [];
  let forecastData = null;
  let observationsData = null;

  // ── Sidebar Auto-Close ─────────────────────────────────────────────────────
  function closeAppSidebar() {
    try {
      // ONLY auto-close sidebar on mobile/tablet screen sizes (<= 1024px)
      if (window.innerWidth > 1024) return;

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
    } catch (err) {
      console.warn('[PMD NWFC] Could not auto-close sidebar:', err);
    }
  }

  // ── Helper Functions ───────────────────────────────────────────────────────

  function getSVGIcon(iconName) {
    if (!iconName) return WEATHER_SVGS["partly-cloudy"];
    const key = String(iconName).trim().toLowerCase();
    return WEATHER_SVGS[key] || WEATHER_SVGS["partly-cloudy"];
  }

  function getWeatherIcon(props) {
    const weather = String(props.weather || '').trim().toLowerCase();
    const rain3h = parseFloat(props.rain_3h) || 0;

    if (weather.includes('thunderstorm')) return 'thunder-lightning';
    if (weather === 'rain' || rain3h > 0) return 'heavy-rain-strong-winds';
    if (weather === 'clear sky' || weather === 'ceiling and visibility ok' || weather === 'no significant cloud') return 'sunny';
    if (weather === 'partly cloudy' || weather === 'clouds forming' || weather.startsWith('few ') || weather.startsWith('sct ')) return 'partly-cloudy';
    if (weather.startsWith('bkn ') || weather.startsWith('ovc ') || weather === 'haze' || weather === 'smoke' || weather === 'dust' || weather === '0' || weather === '') return 'overcast';
    return 'partly-cloudy';
  }

  function getTempStyle(tempVal) {
    const num = parseFloat(String(tempVal).split('-')[0]);
    if (isNaN(num)) return 'background: linear-gradient(135deg, #475569, #334155); color: #ffffff;';
    if (num < 25) return 'background: linear-gradient(135deg, #0d9488, #0f766e); color: #ffffff;';
    if (num < 35) return 'background: linear-gradient(135deg, #d97706, #b45309); color: #ffffff;';
    if (num < 39) return 'background: linear-gradient(135deg, #ea580c, #c2410c); color: #ffffff;';
    return 'background: linear-gradient(135deg, #dc2626, #991b1b); color: #ffffff;';
  }

  function getRainBadgeStyle(rainVal) {
    const num = parseFloat(rainVal);
    if (isNaN(num) || num === 0) return 'background: rgba(15,23,42,0.95); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.3);';
    if (num <= 5) return 'background: rgba(14,116,144,0.95); color: #cffafe; border: 1px solid rgba(34,211,238,0.5);';
    if (num <= 15) return 'background: rgba(2,132,199,0.95); color: #e0f2fe; border: 1px solid rgba(56,189,248,0.6);';
    if (num <= 30) return 'background: rgba(217,119,6,0.95); color: #fef3c7; border: 1px solid rgba(251,191,36,0.6);';
    return 'background: rgba(220,38,38,0.95); color: #fee2e2; border: 1px solid rgba(248,113,113,0.6);';
  }

  function formatRain(val) {
    if (val === null || val === undefined || val === '') return '--';
    const num = parseFloat(val);
    if (isNaN(num)) return '--';
    return Number.isInteger(num) ? num + 'mm' : num.toFixed(1) + 'mm';
  }

  function formatColHeader(col) {
    if (!col) return '';
    const clean = String(col).trim();
    if (clean.toLowerCase().includes('humidity')) return 'HUMID%';
    if (clean.toLowerCase().includes('max temp')) return 'MAX';
    if (clean.toLowerCase().startsWith('friday')) return 'FRI';
    if (clean.toLowerCase().startsWith('saturday')) return 'SAT';
    if (clean.toLowerCase().startsWith('sunday')) return 'SUN';
    if (clean.toLowerCase().startsWith('monday')) return 'MON';
    if (clean.toLowerCase().startsWith('tuesday')) return 'TUE';
    if (clean.toLowerCase().startsWith('wednesday')) return 'WED';
    if (clean.toLowerCase().startsWith('thursday')) return 'THU';
    return clean.replace(/°C/gi, '').toUpperCase();
  }

  function findCityCoords(cityName) {
    if (!cityName) return null;
    const clean = String(cityName).trim().toUpperCase();
    if (PMD_CITY_COORDINATES[clean]) return PMD_CITY_COORDINATES[clean];
    for (const [key, coords] of Object.entries(PMD_CITY_COORDINATES)) {
      if (clean.includes(key) || key.includes(clean)) return coords;
    }
    return null;
  }

  // ── Data Fetchers ──────────────────────────────────────────────────────────

  async function fetchForecastData() {
    if (forecastData) return forecastData;
    try {
      const host = typeof ffdRiversHost !== 'undefined' ? ffdRiversHost : 'http://172.18.7.21';
      const response = await fetch(`${host}/api/pmd/nwfc/forecast/`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && data.cities && data.cities.length > 0) {
          forecastData = data;
          return forecastData;
        }
      }
    } catch (e) {
      console.warn('[PMD NWFC] Forecast API unreachable, loading local fallback:', e);
    }
    try {
      const fallbackResp = await fetch('./forecast.json');
      forecastData = await fallbackResp.json();
      return forecastData;
    } catch (err) {
      console.error('[PMD NWFC] Failed to load forecast.json fallback:', err);
      return null;
    }
  }

  async function fetchObservationsData() {
    if (observationsData) return observationsData;
    try {
      const host = typeof ffdRiversHost !== 'undefined' ? ffdRiversHost : 'http://172.18.7.21';
      const response = await fetch(`${host}/api/pmd/nwfc/observations/`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && data.features && data.features.length > 0) {
          observationsData = data;
          return observationsData;
        }
      }
    } catch (e) {
      console.warn('[PMD NWFC] Observations API unreachable, loading local fallback:', e);
    }
    try {
      const fallbackResp = await fetch('./observations.json');
      observationsData = await fallbackResp.json();
      return observationsData;
    } catch (err) {
      console.error('[PMD NWFC] Failed to load observations.json fallback:', err);
      return null;
    }
  }

  // ── PMD Forecast Markers ───────────────────────────────────────────────────

  function clearForecastMarkers() {
    forecastMarkers.forEach(m => { try { m.remove(); } catch(e){} });
    forecastMarkers = [];
  }

  function renderForecastMarkers(data) {
    clearForecastMarkers();
    if (!data || !data.cities || typeof map1 === 'undefined' || !map1) return;

    data.cities.forEach(item => {
      const cityName = item.city;
      const coords = findCityCoords(cityName);
      if (!coords) return;

      const maxTempObj = item["Max Temp°C"] || {};
      const maxTemp = maxTempObj.value || "--";

      let primaryIcon = maxTempObj.icon;
      if (!primaryIcon) {
        const dayCols = Object.keys(item).filter(k => k.includes('°C') && k !== 'Max Temp°C');
        if (dayCols.length > 0 && item[dayCols[0]]) {
          primaryIcon = item[dayCols[0]].icon;
        }
      }

      const el = document.createElement('div');
      el.className = 'pmd-nwfc-map-marker';
      el.title = `${cityName}: ${maxTemp}°C`;
      el.innerHTML = `
        <div class="pmd-marker-icon">${getSVGIcon(primaryIcon)}</div>
        <div class="pmd-marker-badge pmd-forecast-badge">${maxTemp}°</div>
      `;

      el.onclick = (e) => {
        e.stopPropagation();
        highlightCityInReport(cityName);
      };

      try {
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(coords)
          .addTo(map1);
        forecastMarkers.push(marker);
      } catch (err) {
        console.warn(`[PMD NWFC] Error adding forecast marker for ${cityName}:`, err);
      }
    });
  }

  function highlightCityInReport(cityName) {
    const reportPanel = document.getElementById('pmd-nwfc-weather-report-panel');
    if (!reportPanel || reportPanel.classList.contains('hidden') || reportPanel.style.display === 'none') return;

    const rows = reportPanel.querySelectorAll('.pmd-report-row');
    rows.forEach(row => {
      if (row.dataset.city && row.dataset.city.toUpperCase() === cityName.toUpperCase()) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('bg-emerald-900/60', 'ring-2', 'ring-emerald-400');
        setTimeout(() => {
          row.classList.remove('bg-emerald-900/60', 'ring-2', 'ring-emerald-400');
        }, 3000);
      }
    });
  }

  // ── PMD Daily Rain Markers ────────────────────────────────────────────────

  function clearRainMarkers() {
    rainMarkers.forEach(m => { try { m.remove(); } catch(e){} });
    rainMarkers = [];
    activePopups.forEach(p => { try { p.remove(); } catch(e){} });
    activePopups = [];
  }

  function getEffectiveRain(props) {
    if (!props) return null;
    const isAvailable = (val) => val !== null && val !== undefined && val !== '' && !isNaN(parseFloat(val));
    const r24 = isAvailable(props.rain_24h) ? parseFloat(props.rain_24h) : null;
    const r3 = isAvailable(props.rain_3h) ? parseFloat(props.rain_3h) : null;

    // Default to 24h if it has a non-zero value
    if (r24 !== null && r24 > 0) {
      return props.rain_24h;
    }
    // If 24h is 0 or null and 3h has a non-zero value, show 3h value
    if (r3 !== null && r3 > 0) {
      return props.rain_3h;
    }
    // Fallback if both are 0 or empty
    if (r24 !== null) return props.rain_24h;
    if (r3 !== null) return props.rain_3h;
    return null;
  }

  function renderRainMarkers(obsData) {
    clearRainMarkers();
    if (!obsData || !obsData.features || typeof map1 === 'undefined' || !map1) return;

    // FILTER: ONLY show stations where rain_3h > 0 OR rain_24h > 0 (do not show null/0 rain stations)
    const activeRainFeatures = obsData.features.filter(f => {
      const props = f.properties || {};
      const r3 = parseFloat(props.rain_3h) || 0;
      const r24 = parseFloat(props.rain_24h) || 0;
      return r3 > 0 || r24 > 0;
    });

    activeRainFeatures.forEach(feature => {
      const coords = feature.geometry && feature.geometry.coordinates;
      if (!coords || coords.length < 2) return;

      const props = feature.properties || {};
      const stationName = props.name || 'Unknown';
      const effectiveRain = getEffectiveRain(props);
      const iconKey = getWeatherIcon(props);
      const rainDisplay = formatRain(effectiveRain);
      const is3hUsed = (parseFloat(props.rain_24h) || 0) <= 0 && (parseFloat(props.rain_3h) || 0) > 0;
      const labelPeriod = is3hUsed ? '3h' : '24h';

      const el = document.createElement('div');
      el.className = 'pmd-nwfc-map-marker pmd-rain-marker';
      el.title = `${stationName}: ${rainDisplay} (${labelPeriod})`;
      el.innerHTML = `
        <div class="pmd-marker-icon">${getSVGIcon(iconKey)}</div>
        <div class="pmd-marker-badge" style="${getRainBadgeStyle(effectiveRain)}">${rainDisplay}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();

        activePopups.forEach(p => { try { p.remove(); } catch(ex){} });
        activePopups = [];

        const popupHtml = buildObservationPopup(props, iconKey);
        const popup = new mapboxgl.Popup({
          closeOnClick: true,
          closeButton: true,
          maxWidth: '280px',
          className: 'pmd-obs-popup',
          anchor: 'bottom',
          offset: [0, -40]
        })
        .setLngLat(coords)
        .setHTML(popupHtml)
        .addTo(map1);

        activePopups.push(popup);
      });

      try {
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(coords)
          .addTo(map1);
        rainMarkers.push(marker);
      } catch (err) {
        console.warn(`[PMD NWFC] Error adding rain marker for ${stationName}:`, err);
      }
    });
  }

  function buildObservationPopup(props, iconKey) {
    const name = props.name || 'Unknown';
    const obsTime = props.obs_time || '--';
    const rain3h = props.rain_3h;
    const rain24h = props.rain_24h;
    const temp = props.temperature;
    const maxTemp = props.max_temperature;
    const humidity = props.humidity;
    const windSpeed = props.wind_speed;

    const r3Val = (rain3h !== null && rain3h !== undefined && !isNaN(parseFloat(rain3h))) ? parseFloat(rain3h) : null;
    const r24Val = (rain24h !== null && rain24h !== undefined && !isNaN(parseFloat(rain24h))) ? parseFloat(rain24h) : null;

    const is24hActive = r24Val !== null && r24Val > 0;
    const is3hActive = !is24hActive && r3Val !== null && r3Val > 0;

    const rain3hStr = r3Val !== null ? r3Val.toFixed(1) + ' mm' + (is3hActive ? ' (Active)' : '') : '-- mm';
    const rain24hStr = r24Val !== null ? r24Val.toFixed(1) + ' mm' + (is24hActive ? ' (Active)' : '') : '-- mm';
    const rain3hColor = (r3Val !== null && r3Val > 0) ? '#38bdf8' : '#94a3b8';
    const rain24hColor = (r24Val !== null && r24Val > 0) ? '#38bdf8' : '#94a3b8';
    const tempStr = (temp !== null && temp !== undefined) ? temp + '°C' : '--';
    const maxTempStr = (maxTemp !== null && maxTemp !== undefined) ? maxTemp + '°C' : '--';
    const humidStr = (humidity !== null && humidity !== undefined) ? humidity + '%' : '--';

    return `
      <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; color:#e2e8f0; min-width:220px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid rgba(148,163,184,0.25);">
          <div style="width:28px; height:28px; flex-shrink:0;">${getSVGIcon(iconKey)}</div>
          <div>
            <div style="font-weight:700; font-size:13px; color:#ffffff; letter-spacing:0.3px;">${name}</div>
            <div style="font-size:10px; color:#94a3b8; margin-top:1px;">${obsTime}</div>
          </div>
        </div>

        <div style="background:rgba(14,116,144,0.15); border:1px solid rgba(34,211,238,0.2); border-radius:8px; padding:8px 10px; margin-bottom:8px;">
          <div style="font-size:10px; font-weight:700; color:#67e8f9; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:6px;">Rainfall</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; ${is3hActive ? 'background:rgba(56,189,248,0.15); border-radius:4px; padding:2px 4px;' : ''}">
            <span style="font-size:11px; color:${is3hActive ? '#e0f2fe; font-weight:600;' : '#cbd5e1;'}">Rain (3h)</span>
            <span style="font-size:12px; font-weight:700; color:${rain3hColor};">${rain3hStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; ${is24hActive ? 'background:rgba(56,189,248,0.15); border-radius:4px; padding:2px 4px;' : ''}">
            <span style="font-size:11px; color:${is24hActive ? '#e0f2fe; font-weight:600;' : '#cbd5e1;'}">Rain (24h)</span>
            <span style="font-size:12px; font-weight:700; color:${rain24hColor};">${rain24hStr}</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:11px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#94a3b8;">Temp</span>
            <span style="color:#fbbf24; font-weight:600;">${tempStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#94a3b8;">Max</span>
            <span style="color:#fb923c; font-weight:600;">${maxTempStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#94a3b8;">Humid</span>
            <span style="color:#38bdf8; font-weight:600;">${humidStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#94a3b8;">Wind</span>
            <span style="color:#e2e8f0; font-weight:600;">${windSpeed || 0} km/h</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Weather Report Panel ───────────────────────────────────────────────────

  function filterReportCities(query) {
    const q = String(query || '').trim().toLowerCase();
    const rows = document.querySelectorAll('.pmd-report-row');
    rows.forEach(row => {
      const city = String(row.dataset.city || '').toLowerCase();
      row.style.display = (!q || city.includes(q)) ? '' : 'none';
    });
  }

  function renderWeatherReportPanel(data) {
    let panel = document.getElementById('pmd-nwfc-weather-report-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'pmd-nwfc-weather-report-panel';
      panel.className = 'pmd-weather-report-container hidden';
      document.body.appendChild(panel);
    }

    if (!data || !data.cities) return;

    const columns = data.columns || ["City", "Humidity%", "Max Temp°C", "Friday°C", "Saturday°C", "Sunday°C"];
    const dayCols = columns.filter(c => c !== "City" && c !== "Humidity%" && c !== "Max Temp°C");

    let tableHeadersHtml = `
      <th class="py-2.5 px-2 text-left font-bold text-gray-200 border-b border-gray-700/80 sticky left-0 bg-slate-900/95 z-20 shadow-md">CITY</th>
      <th class="py-2.5 px-1.5 text-center font-bold text-gray-200 border-b border-gray-700/80">HUMID%</th>
      <th class="py-2.5 px-1.5 text-center font-bold text-gray-200 border-b border-gray-700/80">MAX</th>
    `;

    dayCols.forEach(col => {
      tableHeadersHtml += `<th class="py-2.5 px-1.5 text-center font-bold text-gray-200 border-b border-gray-700/80">${formatColHeader(col)}</th>`;
    });

    let tableRowsHtml = '';
    data.cities.forEach(item => {
      const city = item.city || '';
      const humidityObj = item["Humidity%"] || {};
      const maxTempObj = item["Max Temp°C"] || {};

      const humidityVal = humidityObj.value || '--';
      const maxTempVal = maxTempObj.value || '--';

      let cityIcon = maxTempObj.icon;
      if (!cityIcon && dayCols.length > 0 && item[dayCols[0]]) {
        cityIcon = item[dayCols[0]].icon;
      }

      const isHighHumidity = parseFloat(humidityVal) >= 80;
      const humidityClass = isHighHumidity
        ? 'bg-sky-500/25 text-sky-300 font-bold rounded px-1.5 py-0.5'
        : 'text-gray-300';

      tableRowsHtml += `
        <tr class="pmd-report-row border-b border-gray-800/60 hover:bg-slate-800/70 transition-colors" data-city="${city}">
          <td class="py-1.5 px-2 font-bold text-white whitespace-nowrap sticky left-0 bg-slate-900/95 z-10">
            <div class="flex items-center gap-1.5">
              <span class="w-4 h-4 sm:w-5 sm:h-5 inline-block flex-shrink-0">${getSVGIcon(cityIcon)}</span>
              <span class="text-[11px] sm:text-xs truncate max-w-[110px] sm:max-w-[150px]" title="${city}">${city}</span>
            </div>
          </td>
          <td class="py-1.5 px-1 text-center text-[11px]">
            <span class="${humidityClass}">${humidityVal}</span>
          </td>
          <td class="py-1.5 px-1 text-center">
            <span class="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold shadow-sm" style="${getTempStyle(maxTempVal)}">
              ${maxTempVal}°C
            </span>
          </td>
      `;

      dayCols.forEach(col => {
        const colObj = item[col] || {};
        const val = colObj.value || '--';
        const icon = colObj.icon || '';
        tableRowsHtml += `
          <td class="py-1.5 px-1 text-center whitespace-nowrap">
            <div class="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold shadow-sm" style="${getTempStyle(val)}">
              <span class="w-3.5 h-3.5 inline-block flex-shrink-0">${getSVGIcon(icon)}</span>
              <span>${val}</span>
            </div>
          </td>
        `;
      });

      tableRowsHtml += `</tr>`;
    });

    panel.innerHTML = `
      <div class="pmd-report-card">
        <!-- Top Title Bar -->
        <div class="px-3.5 py-2.5 border-b border-gray-700/60 flex items-center justify-between bg-slate-900/95 rounded-t-xl gap-2">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <h2 class="text-xs sm:text-sm font-bold text-white tracking-wide whitespace-nowrap">Weather Report</h2>
          </div>

          <!-- Quick City Search Filter -->
          <div class="flex-1 max-w-[180px] mx-2">
            <input type="text"
                   placeholder="Search city..."
                   oninput="window.filterPMDReportCities(this.value)"
                   class="w-full bg-slate-800/90 text-white text-[11px] px-2 py-1 rounded border border-gray-700/80 outline-none focus:border-emerald-500 transition-colors" />
          </div>

          <button onclick="window.closePMDWeatherReportPanel()"
                  class="text-gray-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 p-1.5 rounded-lg transition-colors flex-shrink-0"
                  title="Close Weather Report">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Subheader Title Banner -->
        <div class="px-3.5 py-1.5 bg-gradient-to-r from-emerald-900/40 via-slate-900/60 to-slate-950/80 border-b border-emerald-500/20 flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="font-bold text-emerald-300 tracking-wide">NWFC Daily Forecast</span>
          </div>
          <span class="text-gray-400 font-mono text-[9px]">PMD NWFC · WEATHER.GOV.PK</span>
        </div>

        <!-- Table Container with Full Height Scroll -->
        <div class="pmd-report-table-scroll overflow-y-auto overflow-x-hidden sm:overflow-x-auto">
          <table class="w-full text-[11px] text-left border-collapse table-auto">
            <thead>
              <tr class="bg-slate-900/95 text-gray-300 text-[11px]">
                ${tableHeadersHtml}
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── Global Exports ─────────────────────────────────────────────────────────

  window.filterPMDReportCities = filterReportCities;

  window.closePMDWeatherReportPanel = function () {
    const cb = document.getElementById('pmd_nwfc_forecast');
    if (cb) cb.checked = false;
    clearForecastMarkers();
    const panel = document.getElementById('pmd-nwfc-weather-report-panel');
    if (panel) {
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }
  };

  /** PMD NWFC Daily Forecast Toggle Handler */
  window.togglePMDNWFCDailyForecast = async function (checkbox, forceState) {
    const cb = checkbox || document.getElementById('pmd_nwfc_forecast');
    const isChecked = typeof forceState === 'boolean' ? forceState : (cb ? cb.checked : false);
    if (cb) cb.checked = isChecked;

    let panel = document.getElementById('pmd-nwfc-weather-report-panel');

    if (!isChecked) {
      clearForecastMarkers();
      if (panel) {
        panel.classList.add('hidden');
        panel.style.display = 'none';
      }
      return;
    }

    closeAppSidebar();

    const data = await fetchForecastData();
    if (data) {
      renderForecastMarkers(data);
      renderWeatherReportPanel(data);
      panel = document.getElementById('pmd-nwfc-weather-report-panel');
      if (panel) {
        panel.classList.remove('hidden');
        panel.style.display = 'flex';
      }
    }
  };

  /** PMD NWFC Daily Rain Toggle Handler */
  window.togglePMDNWFCDailyRain = async function (checkbox, forceState) {
    const cb = checkbox || document.getElementById('pmd_nwfc_daily_rain');
    const isChecked = typeof forceState === 'boolean' ? forceState : (cb ? cb.checked : false);
    if (cb) cb.checked = isChecked;

    if (!isChecked) {
      clearRainMarkers();
      return;
    }

    const obsData = await fetchObservationsData();
    if (obsData) {
      renderRainMarkers(obsData);
    }
  };

  // ── Injected CSS ───────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Map Marker Styling */
    .pmd-nwfc-map-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      z-index: 20;
      transition: z-index 0.2s ease;
    }
    .pmd-nwfc-map-marker:hover {
      z-index: 1000 !important;
    }
    .pmd-marker-icon {
      width: 26px;
      height: 26px;
      filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.6));
      margin-bottom: -3px;
      pointer-events: none;
    }
    .pmd-marker-badge {
      font-weight: 700;
      font-size: 10px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 1.5px 5px;
      border-radius: 5px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.6);
      white-space: nowrap;
      line-height: 1.2;
      pointer-events: none;
    }

    /* Forecast Temperature Badge - Crisp solid dark navy pill for 100% legibility on light/outdoors maps! */
    .pmd-forecast-badge {
      background: #0f172a !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      border: 1px solid rgba(255, 255, 255, 0.4) !important;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.75) !important;
    }

    /* FIX: High Z-Index for Mapbox Popups to prevent markers clipping on top of popup! */
    .mapboxgl-popup,
    .pmd-obs-popup {
      z-index: 99999 !important;
    }
    .pmd-obs-popup .mapboxgl-popup-content {
      z-index: 99999 !important;
      background: rgba(15, 23, 42, 0.96) !important;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 12px !important;
      padding: 14px 16px !important;
      box-shadow: 0 20px 45px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08) !important;
      color: #e2e8f0;
    }
    .pmd-obs-popup .mapboxgl-popup-close-button {
      color: #94a3b8 !important;
      font-size: 18px !important;
      right: 6px !important;
      top: 6px !important;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      border-radius: 6px;
      background: rgba(51,65,85,0.6);
    }
    .pmd-obs-popup .mapboxgl-popup-close-button:hover {
      color: #ffffff !important;
      background: rgba(71,85,105,0.8) !important;
    }
    .pmd-obs-popup .mapboxgl-popup-tip {
      border-top-color: rgba(15, 23, 42, 0.96) !important;
    }

    /* Weather Report Container - Smaller height equally on top and bottom */
    .pmd-weather-report-container {
      position: fixed;
      top: 110px;
      right: 85px;
      bottom: 50px;
      z-index: 9980;
      width: min(580px, calc(100vw - 110px));
      max-height: calc(100vh - 160px);
      box-shadow: 0 20px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12);
      border-radius: 12px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      background: rgba(15, 23, 42, 0.95);
      display: flex;
      flex-direction: column;
    }

    .pmd-weather-report-container.hidden {
      display: none !important;
    }

    .pmd-report-card {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: calc(100vh - 160px);
    }

    .pmd-report-table-scroll {
      flex: 1 1 auto;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .pmd-report-table-scroll::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    .pmd-report-table-scroll::-webkit-scrollbar-track {
      background: rgba(15, 23, 42, 0.6);
    }
    .pmd-report-table-scroll::-webkit-scrollbar-thumb {
      background: rgba(71, 85, 105, 0.8);
      border-radius: 4px;
    }
    .pmd-report-table-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(100, 116, 139, 1);
    }

    @media (max-width: 1024px) {
      .pmd-weather-report-container {
        top: 100px;
        right: 75px;
        bottom: 40px;
        width: min(560px, calc(100vw - 90px));
        max-height: calc(100vh - 140px);
      }
      .pmd-report-card {
        max-height: calc(100vh - 140px);
      }
      .pmd-report-table-scroll {
        overflow-x: auto;
      }
    }

    @media (max-width: 768px) {
      .pmd-weather-report-container {
        top: auto;
        bottom: 8px;
        right: 8px;
        left: 8px;
        width: auto;
        max-height: 50vh;
        z-index: 9995;
      }
      .pmd-report-card {
        max-height: 50vh;
      }
      .pmd-report-table-scroll {
        max-height: calc(50vh - 75px);
        overflow-x: auto;
      }
      .pmd-marker-icon {
        width: 22px;
        height: 22px;
      }
      .pmd-marker-badge {
        font-size: 9px;
        padding: 1px 3px;
      }
    }

    @media (max-width: 480px) {
      .pmd-weather-report-container {
        bottom: 0;
        left: 0;
        right: 0;
        border-radius: 16px 16px 0 0;
        max-height: 48vh;
      }
      .pmd-report-card {
        border-radius: 16px 16px 0 0;
        max-height: 48vh;
      }
      .pmd-report-table-scroll {
        max-height: calc(48vh - 70px);
        overflow-x: auto;
      }
    }
  `;
  document.head.appendChild(styleEl);
})();
