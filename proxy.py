import requests
from flask import Flask, request, Response

app = Flask(__name__)

import os
import sqlite3
import json

# Read ports from environment variables or use default fallback
PROXY_PORT = int(os.environ.get('PROXY_PORT', 8000))
UI_PORT = int(os.environ.get('UI_PORT', 5504))
DASHBOARD_PORT = int(os.environ.get('DASHBOARD_PORT', 5000))
GIS_PORT = int(os.environ.get('GIS_PORT', 8001))

# Map of proxy prefixes to target local/network IP bases
ROUTES = {
    '/proxy_main/': 'http://172.18.7.35:8080/',
    '/proxy_ayman/': 'http://172.18.1.179:8080/',
    '/proxy_ibrahim/': 'http://172.18.1.115:8080/',
    '/proxy_mustafa/': 'http://172.18.1.39:8080/',
    '/proxy_ahad/': 'http://172.18.1.85:8080/',
    '/proxy_1_4/': 'http://172.18.1.4:8080/',
    '/proxy_1_43/': 'http://172.18.1.43:8080/',
    '/proxy_1_56/': 'http://172.18.1.56:8080/',
    '/proxy_api_impact/': 'http://172.18.1.45:5009/',
    '/proxy_api_dew/': 'http://172.18.1.108:8000/',
    '/proxy_api_daily/': f'http://127.0.0.1:{DASHBOARD_PORT}/',
    '/proxy_api_gis/': f'http://127.0.0.1:{GIS_PORT}/api/gis/',
    '/proxy_api_precip/': 'http://172.18.0.19:5000/',
    '/proxy_ffd_rivers/': 'http://172.18.7.21/',
}

# The default UI server (Live Server or Python HTTP server)
UI_URL = f"http://127.0.0.1:{UI_PORT}/"

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

def start_background_auto_sync():
    """Daemon thread running auto-sync every 5 minutes (300s)"""
    def loop():
        time.sleep(3) # Wait 3 seconds on startup
        while True:
            run_auto_sync()
            time.sleep(300)

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    print("🔄 Background Auto-Sync Thread started (Google Sheets synced every 5 min)")

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
        
        # Get the most recent date and time
        c.execute("SELECT date, time FROM kp_water_reports ORDER BY id DESC LIMIT 1")
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

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def proxy(path):
    # Handle CORS Preflight automatically
    if request.method == 'OPTIONS':
        return Response('', 204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        # Exclude 'Host' header to prevent issues with target servers
        headers = {k: v for k, v in req.headers if k.lower() != 'host'}
        
        # Stream the request
        resp = requests.request(
            method=req.method,
            url=url,
            headers=headers,
            data=req.get_data(),
            cookies=req.cookies,
            allow_redirects=False,
            stream=True
        )
        
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-credentials', 'access-control-allow-headers']
        response_headers = [(k, v) for k, v in resp.raw.headers.items() if k.lower() not in excluded_headers]

        # Ensure permissive CORS on all responses
        response_headers.append(('Access-Control-Allow-Origin', '*'))

        # Prevent remote browsers (Tailscale / Cloudflare / HTTP proxy) from serving stale cached JS/API data
        if 'ft_and_percentage.js' in url or 'api' in url:
            response_headers.append(('Cache-Control', 'no-cache, no-store, must-revalidate'))
            response_headers.append(('Pragma', 'no-cache'))
            response_headers.append(('Expires', '0'))

        # Stream the response back (important for large map tiles/images)
        def generate():
            try:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        yield chunk
            except (requests.exceptions.ChunkedEncodingError, requests.exceptions.ConnectionError) as e:
                # Mapbox aggressively cancels tile requests when panning. This is totally normal.
                pass
                    
        return Response(generate(), resp.status_code, response_headers)
        
    except requests.exceptions.RequestException as e:
        print(f"Proxy connection error for {url}: {str(e)}")
        return f"Proxy Error: Could not reach target {url}. Make sure the target server is running.", 502

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 HYDRO ANALYTICS REVERSE PROXY STARTING 🚀")
    print("=" * 60)
    print(f"UI Router: Forwarding to {UI_URL}")
    print(f"GeoServers Proxied: {len(ROUTES) - 3}")
    print(f"APIs Proxied: 3")
    print("-" * 60)
    print("INSTRUCTIONS TO SHARE OVER THE INTERNET:")
    print(f"1. Forward port {PROXY_PORT} and set visibility to Public.")
    print("2. Open the forwarded link in your browser!")
    print("=" * 60)
    
    start_background_auto_sync()
    app.run(host='0.0.0.0', port=PROXY_PORT, threaded=True)
