#!/usr/bin/env python3
"""
fetch_other_gauges.py
=====================
Fetches live station data for 26 specific FFD gauge stations from
https://ffd.pmd.gov.pk/river-state-3d/data?scope=all

Strategy:
  Tier 1: cloudscraper (auto Cloudflare bypass)
  Tier 2: Playwright headless Chromium (live cookie scraping)
  Tier 3: Graceful fallback — keep existing latest_all_gauges.json if present

Output:
  - latest_all_gauges.json  (root directory)
  - data/other_gauges.sqlite  (historical archive)
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
import requests

MODULE_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_JSON = MODULE_DIR / "latest_all_gauges.json"
DB_PATH = REPO_ROOT / "data" / "other_gauges.sqlite"

FFD_API_URL = "https://ffd.pmd.gov.pk/river-state-3d/data?scope=all"
FFD_PAGE_URL = "https://ffd.pmd.gov.pk/river-state-3d"

# ── Strict Allowlist: 26 Stations ────────────────────────────────────────
ALLOWED_STATIONS = {
    "Warsak",
    "Daggar",
    "Palkhu - Wazirabad",
    "Phulra",
    "Ravi Syphon",
    "Aik - Sialkot",
    "Arandu Nullah",
    "Attock Khairabad",
    "Bain Nullah",
    "Bassantar Nalah",
    "Bosak Bridge",
    "Chak Amru",
    "Chowni Bridge",
    "Darashoot",
    "Deg Nullah",
    "Dhok Pathan",
    "Garhiala (Telemetry)",
    "Japan Bridge",
    "Jinnah Barrage",
    "Khair Abad",
    "Khawagoobo Bridge",
    "Khiali (Charsada Road)",
    "Khushab Bridge",
    "Melsi Syphon",
    "Sharda",
    "Shishi Darosh",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


def _parse_discharge(val):
    """Convert '29,988' or 'N/A' to a float or None."""
    if val is None or str(val).strip().upper() in ("N/A", "", "NULL"):
        return None
    try:
        return float(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return None


def _extract_gauge(gauges, gauge_type):
    """Extract discharge and trend for a given gauge type (OUTFLOW/INFLOW)."""
    if not gauges:
        return None, None
    for g in gauges:
        if g.get("type", "").upper() == gauge_type.upper():
            return _parse_discharge(g.get("discharge")), g.get("trend")
    return None, None


def filter_stations(raw_data):
    """Filter only our 26 allowed stations from the full FFD API response."""
    stations_raw = raw_data.get("stations", [])
    if not stations_raw:
        # Maybe the response IS the list
        if isinstance(raw_data, list):
            stations_raw = raw_data
        else:
            print(f"Warning: 'stations' key not found. Top-level keys: {list(raw_data.keys()) if isinstance(raw_data, dict) else 'N/A'}")
            return []

    filtered = []
    for s in stations_raw:
        name = (s.get("name") or "").strip()
        if name not in ALLOWED_STATIONS:
            continue

        outflow, outflow_trend = _extract_gauge(s.get("gauges"), "OUTFLOW")
        inflow, inflow_trend = _extract_gauge(s.get("gauges"), "INFLOW")

        filtered.append({
            "name": name,
            "name_ur": s.get("name_ur") or "",
            "river": s.get("river") or s.get("area_name") or "",
            "area_name": s.get("area_name") or "",
            "kind": s.get("kind") or "",
            "status": s.get("status") or "NORMAL",
            "outflow": outflow,
            "inflow": inflow,
            "outflow_trend": outflow_trend,
            "inflow_trend": inflow_trend,
            "latitude": s.get("latitude"),
            "longitude": s.get("longitude"),
            "recording_time": s.get("recording_time") or "",
            "height": s.get("height") or "",
            "max_peak": s.get("cyp_discharge") or "N/A",
            "cyp_status": s.get("cyp_status") or "",
            "cyp_date": s.get("cyp_date") or "",
            "forecast_status": s.get("forecast_status") or "",
            "forecast_qual": s.get("forecast_qual") or "",
            "forecast_quant": s.get("forecast_quant") or "",
            "high_threshold": s.get("high_threshold"),
            "is_nullah": bool(s.get("is_nullah", False)),
            "stale": s.get("stale", False),
        })

    return filtered


# ── Tier 1: Direct Session + In-Page RS_TOKEN Extraction ─────────────────
def fetch_with_session_token():
    """
    Fetch FFD page HTML, extract the embedded RS_TOKEN from JavaScript,
    and query the token-gated API endpoint directly using session cookies.
    """
    print("Tier 1: Trying direct session + embedded RS_TOKEN...")
    session = requests.Session()
    page_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    page_resp = session.get(FFD_PAGE_URL, headers=page_headers, timeout=25)
    page_resp.raise_for_status()

    match = re.search(r'RS_TOKEN\s*=\s*["\']([^"\']+)["\']', page_resp.text)
    if not match:
        raise Exception("RS_TOKEN variable not found in FFD page HTML")

    token = match.group(1).strip()
    print(f"  Extracted RS_TOKEN: {token[:25]}...")

    api_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-FW-Token": token,
        "Referer": FFD_PAGE_URL,
    }
    api_resp = session.get(FFD_API_URL, headers=api_headers, timeout=25)
    api_resp.raise_for_status()
    data = api_resp.json()

    if data and isinstance(data, dict) and "stations" in data:
        print(f"  Successfully fetched live data ({len(data['stations'])} total stations) via session token!")
        return data

    raise Exception("API returned unexpected response structure")


# ── Tier 2: Cloudscraper + RS_TOKEN Extraction ───────────────────────────
def fetch_with_cloudscraper():
    """Attempt to fetch using cloudscraper in case Cloudflare JS challenge is present."""
    print("Tier 2: Trying cloudscraper + RS_TOKEN...")
    import cloudscraper
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "desktop": True}
    )
    page_resp = scraper.get(FFD_PAGE_URL, timeout=35, headers={"User-Agent": USER_AGENT})
    page_resp.raise_for_status()

    match = re.search(r'RS_TOKEN\s*=\s*["\']([^"\']+)["\']', page_resp.text)
    if not match:
        raise Exception("RS_TOKEN not found via cloudscraper HTML")

    token = match.group(1).strip()
    api_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-FW-Token": token,
        "Referer": FFD_PAGE_URL,
    }
    api_resp = scraper.get(FFD_API_URL, headers=api_headers, timeout=35)
    api_resp.raise_for_status()
    data = api_resp.json()
    if data and isinstance(data, dict) and "stations" in data:
        print(f"  cloudscraper succeeded. Response has {len(data.get('stations', []))} stations.")
        return data

    raise Exception("Cloudscraper failed to parse API response")


# ── Tier 3: Playwright Stealth Interception with X-FW-TOKEN ──────────────
def fetch_with_playwright():
    """Open FFD in Playwright, extract dynamic X-FW-TOKEN, and fetch scope=all data."""
    print("Tier 2: Trying Playwright browser with dynamic X-FW-TOKEN...")
    from playwright.sync_api import sync_playwright

    stealth_args = [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
    ]

    fw_token = [None]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=stealth_args)
        context = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            timezone_id="Asia/Karachi",
        )

        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        """)

        page = context.new_page()

        def handle_req(req):
            if "river-state-3d/data" in req.url:
                tok = req.headers.get("x-fw-token")
                if tok:
                    fw_token[0] = tok

        page.on("request", handle_req)

        print("  Navigating to FFD river-state-3d page...")
        try:
            page.goto(FFD_PAGE_URL, wait_until="domcontentloaded", timeout=45000)
        except Exception as nav_err:
            print(f"  Navigation note: {nav_err}")

        # Wait for token capture
        for _ in range(30):
            if fw_token[0]:
                break
            page.wait_for_timeout(500)

        if not fw_token[0]:
            browser.close()
            raise Exception("Failed to capture X-FW-TOKEN from FFD page request")

        tok = fw_token[0]
        print(f"  Captured X-FW-TOKEN: {tok[:20]}...")

        print("  Executing in-page fetch for scope=all ...")
        res = page.evaluate(f"""
            async () => {{
                const resp = await fetch('/river-state-3d/data?scope=all', {{
                    headers: {{
                        'Accept': 'application/json',
                        'X-FW-TOKEN': '{tok}',
                        'X-Requested-With': 'XMLHttpRequest'
                    }}
                }});
                if (resp.ok) return await resp.json();
                return null;
            }}
        """)

        browser.close()

    if res and isinstance(res, dict) and "stations" in res:
        print(f"  Successfully fetched live data ({len(res['stations'])} total stations)!")
        return res

    raise Exception("Playwright failed to retrieve scope=all data using X-FW-TOKEN")


# ── SQLite Persistence ───────────────────────────────────────────────────
def init_db():
    """Create the SQLite database and table if they don't exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ffd_gauge_readings (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            name_ur         TEXT,
            river           TEXT,
            area_name       TEXT,
            kind            TEXT,
            status          TEXT,
            outflow         REAL,
            inflow          REAL,
            outflow_trend   TEXT,
            inflow_trend    TEXT,
            latitude        REAL,
            longitude       REAL,
            recording_time  TEXT,
            height          TEXT,
            max_peak        TEXT,
            cyp_status      TEXT,
            cyp_date        TEXT,
            forecast_status TEXT,
            forecast_qual   TEXT,
            forecast_quant  TEXT,
            high_threshold  INTEGER,
            is_nullah       INTEGER,
            fetched_at      TEXT
        )
    """)
    conn.commit()
    return conn


def cleanup_existing_duplicates(conn):
    """Purge any historical duplicate records keeping only the most recent id."""
    cursor = conn.cursor()
    cursor.execute("""
        DELETE FROM ffd_gauge_readings
        WHERE id NOT IN (
            SELECT MAX(id)
            FROM ffd_gauge_readings
            GROUP BY name, recording_time, status, outflow, inflow, outflow_trend, inflow_trend
        )
    """)
    deleted = cursor.rowcount
    conn.commit()
    if deleted > 0:
        print(f"  Cleaned up {deleted} duplicate rows from database.")


def is_duplicate_reading(conn, station):
    """
    Check if this station reading is a duplicate of the latest entry in DB.
    Returns True if the reading matches the latest record (same recording_time + same values).
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT recording_time, status, outflow, inflow, outflow_trend, inflow_trend
        FROM ffd_gauge_readings
        WHERE name = ?
        ORDER BY id DESC
        LIMIT 1
    """, (station["name"],))
    last = cursor.fetchone()

    if not last:
        return False

    rec_time_match = (
        bool(station["recording_time"])
        and last["recording_time"] == station["recording_time"]
    )
    values_match = (
        (last["status"] or "").upper() == (station["status"] or "").upper()
        and last["outflow"] == station["outflow"]
        and last["inflow"] == station["inflow"]
        and (last["outflow_trend"] or "") == (station["outflow_trend"] or "")
        and (last["inflow_trend"] or "") == (station["inflow_trend"] or "")
    )

    if rec_time_match or values_match:
        return True

    return False


def save_to_db(conn, stations, fetched_at):
    """Insert filtered station data into SQLite only if values/recording_time changed."""
    cleanup_existing_duplicates(conn)

    inserted_count = 0
    skipped_count = 0

    for s in stations:
        if is_duplicate_reading(conn, s):
            skipped_count += 1
            continue

        conn.execute("""
            INSERT INTO ffd_gauge_readings
                (name, name_ur, river, area_name, kind, status, outflow, inflow, outflow_trend, inflow_trend,
                 latitude, longitude, recording_time, height, max_peak, cyp_status, cyp_date,
                 forecast_status, forecast_qual, forecast_quant, high_threshold, is_nullah, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            s["name"], s.get("name_ur", ""), s["river"], s.get("area_name", ""), s.get("kind", ""),
            s["status"], s["outflow"], s["inflow"], s["outflow_trend"], s["inflow_trend"],
            s["latitude"], s["longitude"], s["recording_time"], s.get("height", ""), s.get("max_peak", ""),
            s.get("cyp_status", ""), s.get("cyp_date", ""), s.get("forecast_status", ""), s.get("forecast_qual", ""),
            s.get("forecast_quant", ""), s.get("high_threshold"), 1 if s.get("is_nullah") else 0, fetched_at,
        ))
        inserted_count += 1

    conn.commit()
    print(f"  DB Sync: Inserted {inserted_count} new/updated rows, skipped {skipped_count} unchanged duplicate rows.")


# ── Main ─────────────────────────────────────────────────────────────────
def main():
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw_data = None

    # Tier 1: Direct Session + In-page RS_TOKEN extraction (fastest, no headless browser needed)
    try:
        raw_data = fetch_with_session_token()
    except Exception as e:
        print(f"  Session token fetch failed: {e}")

    # Tier 2: Cloudscraper + RS_TOKEN extraction
    if raw_data is None:
        try:
            raw_data = fetch_with_cloudscraper()
        except Exception as e:
            print(f"  cloudscraper failed: {e}")

    # Tier 3: Playwright fallback
    if raw_data is None:
        try:
            raw_data = fetch_with_playwright()
        except Exception as e:
            print(f"  Playwright failed: {e}")

    if raw_data is None:
        print("ERROR: All fetch tiers failed.")
        if OUTPUT_JSON.exists():
            print(f"  Keeping existing {OUTPUT_JSON.name} as fallback.")
            sys.exit(0)
        else:
            print(f"  No existing {OUTPUT_JSON.name} available.")
            sys.exit(1)

    # Filter stations
    filtered = filter_stations(raw_data)
    print(f"\nFiltered to {len(filtered)} / 26 allowed stations.")

    if not filtered:
        print("Warning: No stations matched the allowlist. Check station names.")
        if OUTPUT_JSON.exists():
            print(f"  Keeping existing {OUTPUT_JSON.name} as fallback.")
            sys.exit(0)
        else:
            sys.exit(1)

    # Write JSON output
    output = {
        "fetched_at": fetched_at,
        "total_stations": len(filtered),
        "stations": filtered,
    }
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUTPUT_JSON.name} ({len(filtered)} stations)")

    # Also update legacy/runtime volume path if it exists
    runtime_ffd = Path("/opt/hydroanalytics/ffd_fetch/latest_all_gauges.json")
    if runtime_ffd.parent.exists():
        try:
            with open(runtime_ffd, "w", encoding="utf-8") as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    # Save to SQLite
    conn = init_db()
    save_to_db(conn, filtered, fetched_at)
    conn.close()

    print("Done.")


if __name__ == "__main__":
    main()
