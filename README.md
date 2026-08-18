<p align="center">
  <img src="media/UI/ndma_logo.png" alt="NDMA Logo" width="80" />
</p>

<h1 align="center">National Hydro Analytics Portal 2026</h1>

<p align="center">
  <strong>Real-Time Hydrological Monitoring, Flood Forecasting & Reservoir Tracking for Pakistan</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.31-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-NDMA%20Internal-red" alt="License" />
  <img src="https://img.shields.io/badge/status-Production-brightgreen" alt="Status" />
</p>

---

## Overview

The **National Hydro Analytics Portal** is a web-based geospatial intelligence platform developed for flood preparedness, hydrological monitoring, and disaster risk management across Pakistan. It integrates live river telemetry, reservoir storage tracking, precipitation forecasts, and historical flood mapping into a single, interactive map-based interface.

The portal serves as an operational decision-support tool during monsoon seasons, providing real-time situational awareness of all major river systems, dams, barrages, and headworks nationwide.

---

## Key Features

### 🌊 Real-Time River Monitoring
- Live inflow and outflow discharge readings (cusecs) for all major headworks and barrages across the **Indus, Jhelum, Chenab, Ravi, Sutlej, Kabul, and Swat** river systems.
- Telemetric gauge data from PMD Flood Forecasting Division (FFD) stations with danger level indicators.
- Interactive hydrograph charts with 7-day, 14-day, 30-day, and custom date range views.

### 🏔️ Reservoir & Dam Tracking
- **Pakistani Reservoirs**: Live water levels (ft), fill percentages, and live storage capacity (MAF) for **Tarbela**, **Mangla**, and **Chashma**.
- **Indian Upstream Dams**: Transboundary monitoring of **Bhakra**, **Pong**, and **Thein (Ranjit Sagar)** dams with current fill status, last year comparison, and 5-year normal benchmarks.
- Animated fluid gauge meters with historical storage trend comparisons (today vs last year vs 5-year average vs 10-year average).

### 🌧️ Weather & Precipitation Forecasts
- **Hourly Precipitation Forecasts**: Animated 10-step hourly precipitation tiles with playback controls and color-scaled legend (0.25 mm – 200+ mm).
- **Weekly Forecasts**: 7-day precipitation outlook with daily stepping.
- **PMD NWFC Forecasts**: Pakistan Meteorological Department weather forecast overlays.
- **GeoGLOWS Streamflow Predictions**: Global river discharge forecasts with interactive gauge-level charts.

### 🗺️ GIS Layer Library
Over **50+ toggleable map layers** organized into categories:

| Category | Layers |
|:---|:---|
| **Boundaries** | National, Provincial, District, Tehsil, Union Council |
| **Rivers & Structures** | Major rivers, KP rivers, minor streams, barrages, reservoirs, Indian structures, telemetric stations, breaching points, protection bunds |
| **Critical Infrastructure** | Settlements, schools, hospitals, railway stations, airports, bridges |
| **Canal Network** | Main canals, branch canals, distributaries, link canals (Punjab) |
| **Dams** | Future dams, ongoing construction, ready for construction, under construction |
| **Monitoring Stations** | PMD stations, GMRC WAPDA stations, GLOF sites, damaged stations |

### 🌊 Flood Outlook & Scenarios
- **Riverine Flooding**: River-by-river flood extent overlays for Indus (Upper & Lower), Jhelum, Chenab, Ravi, Sutlej, Kabul, and Swat.
- **Hill Torrents**: D.G. Khan, D.I. Khan, Rajanpur, Pir Panjal, Kirthar Range, Balochistan, and Sindh regions.
- **Urban Flooding**: Inundation models for major urban centers.
- **HEC-RAS 2D Simulations**: Pre-computed hydraulic flood simulation videos for critical regions.

### 📚 Historical Flood Archive
Georeferenced flood footprints from past events:
- 2010, 2011, 2012, 2013, 2014, 2015, 2023, 2024 (including September 2024).
- Potential flood mitigation sites: retention ponds, retention reservoirs, and RTIMP sites.

### 📊 Exposure & Impact Analysis
- Date-driven exposure analytics querying impacted populations, croplands, and buildings within flood-affected areas.
- Disaster Early Warning (DEW) exposure panel with provincial breakdowns.
- Advisory slideshows with localized alerts for Punjab, Sindh, Balochistan, and KPK.

### 📤 GIS Data Uploader
- Upload custom vector layers (Shapefiles) and raster layers (GeoTIFF) directly from the browser.
- Auto-publishes to GeoServer with customizable styling (colors, opacity, line widths, circle radii).
- Attribute-based thematic styling and feature summaries.

---

## Technology Stack

| Layer | Technologies |
|:---|:---|
| **Frontend** | Mapbox GL JS, Tailwind CSS, Chart.js, Turf.js, Vanilla JavaScript |
| **Backend APIs** | Python (Flask, FastAPI), SQLite |
| **GIS Server** | GeoServer (WMS, WFS, Vector Tiles) |
| **Containerization** | Podman / Docker with Compose |
| **Web Server** | Nginx |
| **Public Access** | Cloudflare Tunnel |

---

## Architecture

The portal runs as a set of containerized microservices:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Tunnel                          │
│                    (Public HTTPS Ingress)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Reverse Proxy  │
                    │   (Port 8000)    │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
   │   Frontend   │   │  Dashboard  │   │ GIS Uploader│
   │   (Nginx)    │   │   API       │   │   API       │
   │  Port 5504   │   │  Port 5000  │   │  Port 8001  │
   └──────────────┘   └─────────────┘   └─────────────┘
                             │
                    ┌────────▼────────┐
                    │    GeoServer    │
                    │  (WMS/WFS/MVT)  │
                    └─────────────────┘
```

---

## API Reference

### Hydrological Data

| Endpoint | Description |
|:---|:---|
| `GET /api/ffd-telemetries` | Live telemetry from all FFD river gauges |
| `GET /api/ffd-dams` | Dam-specific telemetry (Tarbela, Mangla, Chashma) |
| `GET /api/ffd-headworks` | Barrage and headwork data grouped by river basin |
| `GET /api/history?name={station}&days={N}` | Historical inflow/outflow time series (CSV + DB) |
| `GET /api/history-all?days={N}` | Combined historical data for all stations |
| `GET /api/storage-history?name={dam}&days={N}` | Reservoir storage history (MAF) with multi-year comparison |
| `GET /api/daily-situation?station={name}` | Today vs yesterday comparison for a station |
| `GET /api/kp-stations` | Latest KP provincial hydrometric data |
| `GET /api/other-gauges` | 26 additional FFD river gauges |

### GIS Management

| Endpoint | Description |
|:---|:---|
| `POST /api/gis/upload/vector` | Upload zipped Shapefiles (.shp, .shx, .dbf, .prj) |
| `POST /api/gis/upload/raster` | Upload GeoTIFF raster layers |
| `GET /api/gis/layers` | List all uploaded custom layers |
| `PATCH /api/gis/layers/{id}/style` | Update layer styling (color, opacity, width) |
| `GET /api/gis/layers/{id}/geojson` | Export layer as GeoJSON |
| `DELETE /api/gis/layers/{id}` | Remove a custom layer |

### System

| Endpoint | Description |
|:---|:---|
| `GET /api/health` | Service health check |
| `GET /api/sync-now` | Trigger manual data refresh |
| `GET /api/storage-status` | Database health and record counts |

---

## Data Sources

| Source | Data Type | Update Frequency |
|:---|:---|:---|
| **PMD Flood Forecasting Division** | River discharges, flood levels, danger marks | Every 5 minutes |
| **IRSA Daily Water Situation** | Reservoir storages, inflows, outflows (PDF) | Twice daily |
| **Indian CWC** | Bhakra, Pong, Thein dam levels and fill % | Every 5 minutes |
| **Meteoblue** | Precipitation forecast tiles (hourly & weekly) | Hourly |
| **PMD NWFC** | National weather forecasts | Daily |
| **GeoGLOWS** | Streamflow predictions | Daily |
| **WAPDA Hydromet** | GMRC telemetric station data | Real-time |
| **KP Irrigation** | Provincial flood reports and station readings | Twice daily |

---

## Deployment

### Prerequisites
- Ubuntu 22.04+ server with Podman (or Docker)
- GeoServer instance with pre-configured workspaces
- Cloudflare Tunnel token (for public HTTPS access)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Ibrahom1/Hydro-analytics-Portal.git
cd Hydro-analytics-Portal

# Build and start all services
podman-compose -f docker/podman-compose.yml up -d --build

# Verify services are running
podman ps
```

### Services

| Service | Port | Description |
|:---|:---|:---|
| `hydro-frontend` | 5504 | Nginx static web server |
| `hydro-proxy` | 8000 | Central reverse proxy and API gateway |
| `hydro-dashboard` | 5000 | Hydrological data API |
| `hydro-gis` | 8001 | GIS layer upload and management API |
| `hydro-cron` | — | Background data collection scheduler |
| `hydro-cloudflared` | — | Cloudflare Tunnel for public access |

---

## Project Structure

```
├── index.html                  # Main web portal (single-page application)
├── style/                      # CSS stylesheets
├── script/                     # Frontend JavaScript (map layers, charts, GIS tools)
├── media/                      # UI assets, advisories, alerts, flood videos
├── proxy.py                    # Reverse proxy and API gateway
├── backend/                    # Hydrological dashboard API
├── gis_uploader_backend/       # GIS layer upload microservice
├── res_storages/               # Daily Water Situation PDFs and processing
├── res_kp/                     # KP provincial flood reports
├── data/                       # SQLite databases
├── docker/                     # Container definitions and compose file
├── scripts/                    # Deployment and automation scripts
├── FFD_other_gauge_fetch/      # Additional gauge data collection
└── env/                        # Environment configuration
```

---

## License

This project is developed for the **National Disaster Management Authority (NDMA)**, Government of Pakistan. All rights reserved.

---

<p align="center">
  <sub>Built with ❤️ for flood preparedness and disaster resilience</sub>
</p>
