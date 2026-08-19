import requests
import gzip
import hashlib
from flask import Flask, request, Response, jsonify
from urllib.parse import quote

app = Flask(__name__)

import os
import sqlite3
import json
import datetime

# ── Load env/.env ───────────────────────────────────────────────────────
def load_dotenv_file(env_path):
    """Manually load key=value pairs from a .env file into os.environ"""
    if not os.path.exists(env_path):
        return
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key, value = key.strip(), value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)

repo_root_path = os.path.dirname(os.path.abspath(__file__))
load_dotenv_file(os.path.join(repo_root_path, 'env', '.env'))

# Read ports from environment variables or use default fallback
PROXY_PORT = int(os.environ.get('PROXY_PORT', 8000))
UI_PORT = int(os.environ.get('UI_PORT', 5504))
DASHBOARD_PORT = int(os.environ.get('DASHBOARD_PORT', 5000))
GIS_PORT = int(os.environ.get('GIS_PORT', 8001))

# Meteoblue API Token (loaded from env/.env)
METEOBLUE_TOKEN = os.environ.get('METEOBLUE_TOKEN', '')
if not METEOBLUE_TOKEN:
    print("[WARNING] METEOBLUE_TOKEN not found in env/.env — Meteoblue precipitation will not work!")
else:
    print(f"[METEOBLUE] Token loaded: {METEOBLUE_TOKEN[:4]}...{METEOBLUE_TOKEN[-4:]}")

# Map of proxy prefixes to target local/network IP bases
ROUTES = {
    '/proxy_main/': 'http://172.18.7.35:8080/',
    '/proxy_ayman/': 'http://172.18.1.185:8080/',
    '/proxy_ibrahim/': 'http://172.18.1.115:8080/',
    '/proxy_mustafa/': 'http://172.18.1.45:8080/',
    '/proxy_ahad/': 'http://172.18.1.87:8080/',
    '/proxy_1_4/': 'http://172.18.1.4:8080/',
    '/proxy_1_43/': 'http://172.18.1.43:8080/',
    '/proxy_1_56/': 'http://172.18.1.56:8080/',
    '/proxy_api_impact/': 'http://172.18.1.45:5009/',
    '/proxy_api_dew/': 'http://172.18.1.108:8000/',
    '/proxy_api_daily/': f'http://127.0.0.1:{DASHBOARD_PORT}/',
    '/proxy_api_gis/': f'http://127.0.0.1:{GIS_PORT}/api/gis/',
    '/proxy_ffd_rivers/': 'http://172.18.7.21/',
}

# The default UI server (Live Server or Python HTTP server)
UI_URL = f"http://127.0.0.1:{UI_PORT}/"

# ── Meteoblue Server-Side Cache ─────────────────────────────────────────
METEOBLUE_CACHE_DIR = os.path.join(repo_root_path, 'data', 'meteoblue_cache')
os.makedirs(METEOBLUE_CACHE_DIR, exist_ok=True)

import threading
import time

_meteoblue_cache_lock = threading.Lock()
_in_flight_locks = {}
_in_flight_global_lock = threading.Lock()

# Cache TTLs in seconds
HOURLY_TILE_TTL = 6 * 3600    # 6 hours for vector tiles (matches model run updates)
WEEKLY_GEOJSON_TTL = 12 * 3600 # 12 hours for weekly forecast data

def _cache_key(url_path):
    """Generate a filesystem-safe cache key from a URL path"""
    return hashlib.sha256(url_path.encode('utf-8')).hexdigest()

def _cache_get(cache_key):
    """Read cached response if it exists and hasn't expired. Returns (content_bytes, content_type) or (None, None)"""
    meta_path = os.path.join(METEOBLUE_CACHE_DIR, f"{cache_key}.meta.json")
    data_path = os.path.join(METEOBLUE_CACHE_DIR, f"{cache_key}.data")
    try:
        if not os.path.exists(meta_path) or not os.path.exists(data_path):
            return None, None
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        cached_time = meta.get('timestamp', 0)
        ttl = meta.get('ttl_seconds', HOURLY_TILE_TTL)
        if (datetime.datetime.utcnow().timestamp() - cached_time) > ttl:
            # Expired: delete old files immediately
            try:
                if os.path.exists(meta_path): os.remove(meta_path)
                if os.path.exists(data_path): os.remove(data_path)
            except Exception:
                pass
            return None, None  # Expired
        with open(data_path, 'rb') as f:
            content = f.read()
        return content, meta.get('content_type', 'application/octet-stream')
    except Exception:
        return None, None

def _cache_set(cache_key, content_bytes, content_type, ttl_seconds, url=""):
    """Write response to disk cache (overwrites existing file)"""
    meta_path = os.path.join(METEOBLUE_CACHE_DIR, f"{cache_key}.meta.json")
    data_path = os.path.join(METEOBLUE_CACHE_DIR, f"{cache_key}.data")
    try:
        meta = {
            'timestamp': datetime.datetime.utcnow().timestamp(),
            'ttl_seconds': ttl_seconds,
            'content_type': content_type,
            'url': url,
            'cached_at': datetime.datetime.utcnow().isoformat() + 'Z'
        }
        with open(data_path, 'wb') as f:
            f.write(content_bytes)
        with open(meta_path, 'w') as f:
            json.dump(meta, f)
    except Exception as e:
        print(f"[METEOBLUE CACHE] Write error: {e}")

def _purge_expired_cache():
    """Remove expired cache entries to keep disk clean"""
    removed = 0
    try:
        now = datetime.datetime.utcnow().timestamp()
        for fname in os.listdir(METEOBLUE_CACHE_DIR):
            if not fname.endswith('.meta.json'):
                continue
            meta_path = os.path.join(METEOBLUE_CACHE_DIR, fname)
            data_path = meta_path.replace('.meta.json', '.data')
            try:
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
                ttl = meta.get('ttl_seconds', HOURLY_TILE_TTL)
                # Remove if past TTL + 1 hour grace
                if (now - meta.get('timestamp', 0)) > (ttl + 3600):
                    if os.path.exists(meta_path): os.remove(meta_path)
                    if os.path.exists(data_path): os.remove(data_path)
                    removed += 1
            except Exception:
                pass
    except Exception:
        pass
    if removed > 0:
        print(f"[METEOBLUE CACHE] Purged {removed} expired cache files from disk")

def _periodic_cache_cleaner():
    """Background daemon thread to purge disk cache every hour"""
    while True:
        try:
            time.sleep(3600)
            with _meteoblue_cache_lock:
                _purge_expired_cache()
        except Exception:
            pass

# Start background cleaner thread
_cleaner_thread = threading.Thread(target=_periodic_cache_cleaner, daemon=True)
_cleaner_thread.start()

# Initial purge on startup
_purge_expired_cache()

# ── Meteoblue Proxy Routes ──────────────────────────────────────────────

@app.route('/proxy_api_meteoblue/weekly/dates', methods=['GET'])
def meteoblue_weekly_dates():
    """Return next 7 days as a JSON list (no API call needed)"""
    today = datetime.date.today()
    dates = [(today + datetime.timedelta(days=i)).isoformat() for i in range(7)]
    resp = jsonify({"precip": dates})
    resp.headers['Cache-Control'] = 'public, max-age=14400'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

@app.route('/proxy_api_meteoblue/weekly/geojson/<date>', methods=['GET'])
def meteoblue_weekly_geojson(date):
    """Legacy endpoint — weekly precipitation now uses vector tiles via /proxy_api_meteoblue/v1/map/vector/
    This returns an empty FeatureCollection for backwards compatibility."""
    return jsonify({"type": "FeatureCollection", "features": [], "info": "Weekly precipitation now uses vector tiles. See /proxy_api_meteoblue/v1/map/vector/"}), 200

@app.route('/proxy_api_meteoblue/v1/map/vector/<path:tile_path>', methods=['GET'])
def meteoblue_vector_tile(tile_path):
    """Proxy Meteoblue hourly vector tiles with disk caching and in-flight request deduplication"""
    if not METEOBLUE_TOKEN:
        return "METEOBLUE_TOKEN not configured", 500

    cache_id = _cache_key(f"vector_tile_{tile_path}")

    # 1. Check disk cache first
    with _meteoblue_cache_lock:
        cached_content, cached_ct = _cache_get(cache_id)
        if cached_content is not None:
            resp = Response(cached_content, 200)
            resp.headers['Content-Type'] = cached_ct
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['X-Cache'] = 'HIT'
            resp.headers['Cache-Control'] = 'public, max-age=21600'
            return resp

    # 2. Cache MISS — Deduplicate concurrent requests (Single-Flight Lock)
    with _in_flight_global_lock:
        if cache_id not in _in_flight_locks:
            _in_flight_locks[cache_id] = threading.Lock()
        tile_lock = _in_flight_locks[cache_id]

    with tile_lock:
        # Check cache once more in case another thread finished while we waited
        with _meteoblue_cache_lock:
            cached_content, cached_ct = _cache_get(cache_id)
            if cached_content is not None:
                resp = Response(cached_content, 200)
                resp.headers['Content-Type'] = cached_ct
                resp.headers['Access-Control-Allow-Origin'] = '*'
                resp.headers['X-Cache'] = 'HIT (DEDUP)'
                resp.headers['Cache-Control'] = 'public, max-age=21600'
                return resp

        # Fetch from upstream Meteoblue API
        upstream_url = f"https://maps-api.meteoblue.com/v1/map/vector/{tile_path}?apikey={METEOBLUE_TOKEN}"
        try:
            resp = requests.get(upstream_url, timeout=30, headers={'User-Agent': 'HydroAnalytics/1.0'})
            if resp.status_code == 200:
                content = resp.content
                ct = resp.headers.get('Content-Type', 'application/x-protobuf')
                with _meteoblue_cache_lock:
                    _cache_set(cache_id, content, ct, HOURLY_TILE_TTL, upstream_url)
                response = Response(content, 200)
                response.headers['Content-Type'] = ct
                response.headers['Access-Control-Allow-Origin'] = '*'
                response.headers['X-Cache'] = 'MISS'
                response.headers['Cache-Control'] = 'public, max-age=21600'
                return response
            else:
                return Response(resp.content, resp.status_code)
        except Exception as e:
            print(f"[METEOBLUE] Vector tile fetch error: {e}")
            return "Proxy Error: Could not reach Meteoblue", 502
        finally:
            with _in_flight_global_lock:
                _in_flight_locks.pop(cache_id, None)

import threading
import time
from pathlib import Path

def run_auto_sync():
    """Background task to auto-sync Google Sheets, Daily Water Situation, and microservices into ft_and_percentage.js"""
    try:
        repo_root = Path(__file__).resolve().parent
        js_target = repo_root / "script" / "ft_and_percentage.js"
        
        # 1. Sync Google Sheets (Indian Dams)
        from res_storages.fetch_indian_dams_sheet import update_indian_dams_from_google_sheet
        update_indian_dams_from_google_sheet(js_target)

        # 2. Sync Daily Water Situation PDF (Pakistani Dams & Storage)
        pdf_path = repo_root / "res_storages" / "Daily Water Situation.pdf"
        if pdf_path.exists():
            from res_storages.storages import main as run_storages_main
            run_storages_main()

        # 3. Ingest Daily Water Situation PDF into SQLite database
        db_path = repo_root / "data" / "daily_water_situation.sqlite"
        archive_dir = repo_root / "res_storages" / "Historical Daily Storages"
        if pdf_path.exists():
            from res_storages.daily_water_situation_db import ingest_pdf
            ingest_pdf(pdf_path, db_path, archive_dir)
    except Exception as e:
        print(f"[AUTO-SYNC WARNING] Background sync error: {e}")

# NOTE: Background auto-sync thread removed — hydro-cron container handles
# scheduled Google Sheets sync, storages.py, and DB ingestion to avoid
# duplicate writes and SQLite lock conflicts. Use /api/sync-now for on-demand sync.

@app.route('/api/sync-now', methods=['GET', 'POST'])
def sync_now():
    """Instant trigger endpoint to sync Google Sheets data on demand"""
    run_auto_sync()
    return {"status": "success", "message": "Google Sheets data synced successfully"}, 200

@app.route('/api/kp-stations', methods=['GET'])
def kp_stations_api():
    """Endpoint to fetch the latest KP stations data"""
    try:
        repo_root = Path(__file__).resolve().parent
        db_path = repo_root / "data" / "kp_stations_data.sqlite"
        if not db_path.exists():
            return {"status": "error", "message": "Database not found"}, 404
            
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Get the most recent calendar date and time (regardless of ingestion order)
        c.execute("""
            SELECT date, time 
            FROM kp_water_reports 
            ORDER BY 
                CASE 
                    WHEN date LIKE '__/__/____' THEN substr(date, 7, 4) || '-' || substr(date, 4, 2) || '-' || substr(date, 1, 2)
                    ELSE date 
                END DESC,
                time DESC,
                id DESC
            LIMIT 1
        """)
        latest = c.fetchone()
        
        if not latest:
            conn.close()
            return {"status": "success", "data": []}
            
        latest_date, latest_time = latest['date'], latest['time']
        
        # Fetch all records for that date and time
        c.execute("SELECT * FROM kp_water_reports WHERE date=? AND time=?", (latest_date, latest_time))
        rows = c.fetchall()
        conn.close()
        
        result = [dict(row) for row in rows]
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

@app.route('/api/gb-stations', methods=['GET'])
def gb_stations_api():
    """Endpoint to fetch the latest GB stations data (SWHP report)"""
    try:
        repo_root = Path(__file__).resolve().parent
        db_path = repo_root / "data" / "gb_stations.sqlite"
        if not db_path.exists():
            return {"status": "error", "message": "Database not found"}, 404
            
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Get most recent date + time
        c.execute("""
            SELECT recorded_date, time 
            FROM gb_water_reports 
            ORDER BY date_iso DESC, time DESC, id DESC
            LIMIT 1
        """)
        latest = c.fetchone()
        
        if not latest:
            conn.close()
            return {"status": "success", "data": []}
            
        latest_date, latest_time = latest['recorded_date'], latest['time']
        
        # Fetch all records for that date and time
        c.execute("SELECT * FROM gb_water_reports WHERE recorded_date=? AND time=?", 
                  (latest_date, latest_time))
        rows = c.fetchall()
        conn.close()
        
        result = [dict(row) for row in rows]
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

@app.route('/api/other-gauges', methods=['GET'])
def other_gauges_api():
    """Serve latest_all_gauges.json — the 26 FFD other gauges fetched hourly"""
    try:
        json_path = Path(__file__).resolve().parent / "FFD_other_gauge_fetch" / "latest_all_gauges.json"
        if not json_path.exists():
            return jsonify({"status": "error", "message": "latest_all_gauges.json not found in FFD_other_gauge_fetch. Run fetch_other_gauges.py first."}), 404
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        resp = Response(
            json.dumps({"status": "success", "data": data}, ensure_ascii=False),
            mimetype='application/json'
        )
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/script/ft_and_percentage.js', methods=['GET'])
def ft_and_percentage_api():
    """Serve ft_and_percentage.js directly from disk with strict no-cache headers (bypasses Nginx mount bugs)"""
    try:
        repo_root = Path(__file__).resolve().parent
        js_path = repo_root / "script" / "ft_and_percentage.js"
        if not js_path.exists():
            return "File not found", 404
        content = js_path.read_text(encoding="utf-8")
        resp = Response(content, mimetype='application/javascript')
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    except Exception as e:
        return str(e), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
def proxy(path):
    # Handle CORS Preflight automatically
    if request.method == 'OPTIONS':
        return Response('', 204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        })

    req_path = '/' + path

    # ==========================================
    # SECURITY BLOCKS
    # ==========================================
    # 1. Block access to GeoServer Admin Panel and REST APIs
    lower_path = req_path.lower()
    if '/geoserver/web' in lower_path or '/geoserver/rest' in lower_path or '/geoserver/j_spring_security_check' in lower_path:
        return "Forbidden: Admin access blocked over public proxy.", 403

    # Check if this request matches any of our API/GeoServer routes
    for prefix, target_base in ROUTES.items():
        if req_path.startswith(prefix):
            # 2. Strict Read-Only for GeoServers
            # If the route is a GeoServer (does not have 'api' in the prefix), block POST/PUT/DELETE
            if 'api' not in prefix and request.method not in ['GET', 'OPTIONS']:
                return "Method Not Allowed: GeoServer is strictly read-only via public proxy.", 405
                
            target_url = target_base + req_path[len(prefix):]
            if request.query_string:
                target_url += '?' + request.query_string.decode('utf-8')
            return forward_request(request, target_url)

    # If it doesn't match any API, forward it to the Frontend UI (Live Server)
    target_url = UI_URL + path
    if request.query_string:
        target_url += '?' + request.query_string.decode('utf-8')
    return forward_request(request, target_url)

def forward_request(req, url):
    try:
        # Exclude 'Host' and 'Accept-Encoding' so proxy gets raw response to compress/cache
        headers = {k: v for k, v in req.headers if k.lower() not in ['host', 'accept-encoding']}
        
        resp = requests.request(
            method=req.method,
            url=url,
            headers=headers,
            data=req.get_data(),
            cookies=req.cookies,
            allow_redirects=False,
            stream=False
        )
        
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-credentials', 'access-control-allow-headers', 'etag']
        response_headers = [(k, v) for k, v in resp.raw.headers.items() if k.lower() not in excluded_headers]

        # Ensure permissive CORS on all responses
        response_headers.append(('Access-Control-Allow-Origin', '*'))

        content = resp.content
        content_type = resp.headers.get('Content-Type', '').lower()
        url_lower = url.lower()

        # Dynamic State APIs vs Static Map / Asset Caching
        is_dynamic_api = any(k in url_lower for k in ['ft_and_percentage.js', 'daily', 'reservoir', 'storages', 'existing-styles', 'sync-now', 'kp-stations']) or ('layers' in url_lower and 'geojson' not in url_lower)

        if is_dynamic_api:
            response_headers.append(('Cache-Control', 'no-cache, no-store, must-revalidate'))
            response_headers.append(('Pragma', 'no-cache'))
            response_headers.append(('Expires', '0'))
        else:
            # Add browser caching headers for static assets, map layers, GeoJSON, JS/CSS, images, tiles
            if req.method == 'GET' and resp.status_code == 200 and content:
                etag = f'"{hashlib.md5(content).hexdigest()}"'
                response_headers.append(('ETag', etag))

                # Check If-None-Match for 304 Not Modified
                client_etag = req.headers.get('If-None-Match', '').strip('"\'' + '\\')
                clean_etag = etag.strip('"\'' + '\\')
                if client_etag and client_etag == clean_etag:
                    return Response('', 304, response_headers)

                response_headers.append(('Cache-Control', 'public, max-age=86400, must-revalidate'))

        # Check client Accept-Encoding for GZip
        accept_encoding = req.headers.get('Accept-Encoding', '').lower()
        compressible = any(t in content_type for t in ['json', 'geojson', 'text', 'javascript', 'css', 'html', 'xml', 'pbf', 'protobuf']) or any(ext in url_lower for ext in ['.js', '.css', '.json', '.geojson', '.pbf', '.html', '.svg'])

        if 'gzip' in accept_encoding and compressible and len(content) > 300:
            compressed_content = gzip.compress(content)
            response_headers.append(('Content-Encoding', 'gzip'))
            response_headers.append(('Content-Length', str(len(compressed_content))))
            return Response(compressed_content, resp.status_code, response_headers)

        return Response(content, resp.status_code, response_headers)
        
    except requests.exceptions.RequestException as e:
        print(f"Proxy connection error for {url}: {str(e)}")
        return f"Proxy Error: Could not reach target {url}. Make sure the target server is running.", 502

if __name__ == '__main__':
    print("=" * 60)
    print("HYDRO ANALYTICS REVERSE PROXY STARTING")
    print("=" * 60)
    print(f"UI Router: Forwarding to {UI_URL}")
    print(f"GeoServers Proxied: {len(ROUTES) - 3}")
    print(f"APIs Proxied: 3 + Meteoblue (cached)")
    print(f"Meteoblue Cache: {METEOBLUE_CACHE_DIR}")
    print(f"Meteoblue Token: {'[OK] Loaded' if METEOBLUE_TOKEN else '[!] MISSING'}")
    print("-" * 60)
    print("INSTRUCTIONS TO SHARE OVER THE INTERNET:")
    print(f"1. Forward port {PROXY_PORT} and set visibility to Public.")
    print("2. Open the forwarded link in your browser!")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=PROXY_PORT, threaded=True)
