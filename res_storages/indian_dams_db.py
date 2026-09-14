import os
import sys
import csv
import sqlite3
import argparse
from datetime import datetime, timedelta

# Import utilities from the sibling file.
# Try absolute import, fallback to relative if run as script in the res_storages directory
try:
    from res_storages.fetch_indian_dams_sheet import (
        LABEL_MAPPING,
        normalize_label,
        replace_js_variable,
        fetch_sheet_csv,
        SHEET_CSV_URL
    )
except ImportError:
    from fetch_indian_dams_sheet import (
        LABEL_MAPPING,
        normalize_label,
        replace_js_variable,
        fetch_sheet_csv,
        SHEET_CSV_URL
    )

M_TO_FT = 3.28084
NAME_MAP = {
    'GOBIND SAGAR': 'BHAKRA',
    'BHAKRA': 'BHAKRA',
    'PONG DAM': 'PONG',
    'PONG': 'PONG',
    'THEIN DAM': 'THEIN',
    'THEIN': 'THEIN',
}

# FRL (Full Reservoir Level) in meters for each dam - from CSV data
FRL_M = {
    'BHAKRA': 512.0,
    'PONG': 423.67,
    'THEIN': 527.91,
}

DAM_SHEET_MAPPING = {
    'PONG': {
        'level_label': 'reservoir level pong',
        'pct_label': 'current fill percentage pong',
        'last_year_label': 'fill percentage pong last year',
        'normal_label': 'fill percentage pong 5year normal',
    },
    'BHAKRA': {
        'level_label': 'reservoir level bhakra',
        'pct_label': 'current fill percentage bhakra',
        'last_year_label': 'fill percentage bhakra last year',
        'normal_label': 'fill percentage bhakra 5year normal',
    },
    'THEIN': {
        'level_label': 'reservoir level thein',
        'pct_label': 'current fill percentage thein',
        'last_year_label': 'fill percentage thein last year',
        'normal_label': 'fill percentage thein 5year normal',
    },
}

def init_db(db_path):
    """Initializes the SQLite database with the required schema."""
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        c = conn.cursor()
        c.execute("""
CREATE TABLE IF NOT EXISTS indian_reservoir_history (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    reservoir_name        TEXT    NOT NULL,
    date_iso              TEXT    NOT NULL,
    reservoir_level_m     REAL,
    reservoir_level_ft    REAL,
    frl_m                 REAL,
    live_capacity_bcm     REAL,
    current_storage_bcm   REAL,
    pct_current_year      REAL    NOT NULL,
    pct_last_year         REAL,
    pct_normal            REAL,
    source                TEXT    NOT NULL DEFAULT 'csv',
    source_detail         TEXT,
    updated_at            TEXT    NOT NULL,
    UNIQUE(reservoir_name, date_iso)
);
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_indian_res_name_date ON indian_reservoir_history(reservoir_name, date_iso);")
        conn.commit()
    print(f"Database initialized at {db_path}")

def parse_date(date_str):
    """Parses a date string in DD/MM/YYYY format to YYYY-MM-DD."""
    try:
        return datetime.strptime(date_str.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None

def ingest_csv(db_path, csv_path):
    """Seeds the database from a historical CSV file."""
    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found at {csv_path}")
        return
    
    init_db(db_path)
    
    inserted = 0
    skipped = 0
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)  # Skip header row
        
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            for row in reader:
                if len(row) < 14:
                    continue
                
                raw_name = row[1].strip().upper()
                name = NAME_MAP.get(raw_name)
                if not name:
                    continue
                
                # Columns: SR.NO.(0), RESERVOIR NAME(1), FRL(M)(2), CURRENT RESERVOIR LEVEL(M)(3), 
                # LIVE CAPACITY AT FRL(BCM)(4), CURRENT LIVE STORAGE(BCM)(5), DATE(6), 
                # pct_current_year(7), pct_last_year(8), pct_normal(9), IRR-CCA(10), 
                # HYDEL(11), SOURCE_PDF(12), pct_filled(13)
                
                date_iso = parse_date(row[6])
                if not date_iso:
                    continue
                
                try:
                    frl_m = float(row[2]) if row[2].strip() else FRL_M.get(name)
                    level_m = float(row[3]) if row[3].strip() else None
                    level_ft = level_m * M_TO_FT if level_m is not None else None
                    live_cap = float(row[4]) if row[4].strip() else None
                    curr_storage = float(row[5]) if row[5].strip() else None
                    pct_curr = float(row[7]) if row[7].strip() else 0.0
                    pct_last = float(row[8]) if row[8].strip() else None
                    pct_norm = float(row[9]) if row[9].strip() else None
                except ValueError:
                    continue
                
                source_pdf = row[12].strip()
                updated_at = datetime.utcnow().isoformat() + 'Z'
                
                try:
                    c.execute("""
                        INSERT INTO indian_reservoir_history 
                        (reservoir_name, date_iso, reservoir_level_m, reservoir_level_ft, 
                         frl_m, live_capacity_bcm, current_storage_bcm, pct_current_year, 
                         pct_last_year, pct_normal, source, source_detail, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv', ?, ?)
                    """, (name, date_iso, level_m, level_ft, frl_m, live_cap, curr_storage,
                          pct_curr, pct_last, pct_norm, source_pdf, updated_at))
                    inserted += 1
                except sqlite3.IntegrityError:
                    skipped += 1
            
            conn.commit()
    print(f"Ingest summary: {inserted} rows inserted, {skipped} rows skipped (duplicates).")

def sync_from_google_sheet(db_path, js_path):
    """Fetches latest data from Google Sheet, syncs with SQLite DB, and updates JS variables."""
    import io as _io

    init_db(db_path)

    print("Fetching Indian dams data from Google Sheet...")
    try:
        csv_text = fetch_sheet_csv()
    except Exception as e:
        print(f"[WARNING] Failed to fetch Google Sheet data: {e}")
        return 0

    reader = csv.reader(_io.StringIO(csv_text))
    rows = list(reader)

    if not rows:
        print("[WARNING] Google Sheet returned empty CSV data.")
        return 0

    parsed_data = {}
    sheet_date_iso = None

    # Parse CSV from Google Sheet
    for row in rows:
        if not row or len(row) < 2:
            continue
        label = normalize_label(row[0])
        val_str = row[1].strip()

        if not val_str:
            continue

        if label == 'date':
            sheet_date_iso = parse_date(val_str)
            if not sheet_date_iso:
                # Try YYYY-MM-DD format as fallback
                try:
                    datetime.strptime(val_str, "%Y-%m-%d")
                    sheet_date_iso = val_str
                except ValueError:
                    pass
        else:
            try:
                parsed_data[label] = float(val_str.replace('%', '').strip())
            except ValueError:
                parsed_data[label] = None

    if not sheet_date_iso:
        sheet_date_iso = datetime.now().strftime("%Y-%m-%d")
        print(f"[WARNING] 'Date' row missing or unparseable in sheet, using today: {sheet_date_iso}")

    changes_made = 0

    with sqlite3.connect(db_path) as conn:
        c = conn.cursor()

        for dam, mapping in DAM_SHEET_MAPPING.items():
            level_ft = parsed_data.get(mapping['level_label'])
            pct_curr = parsed_data.get(mapping['pct_label'])
            pct_last = parsed_data.get(mapping['last_year_label'])
            pct_norm = parsed_data.get(mapping['normal_label'])

            if level_ft is None or pct_curr is None:
                print(f"  {dam}: skipped (missing level or fill %)")
                continue

            level_m = level_ft / M_TO_FT

            # Check for existing record for this dam and date
            c.execute("""
                SELECT reservoir_level_ft, pct_current_year, pct_last_year, pct_normal
                FROM indian_reservoir_history
                WHERE reservoir_name = ? AND date_iso = ?
            """, (dam, sheet_date_iso))
            existing = c.fetchone()

            updated_at = datetime.utcnow().isoformat() + 'Z'

            def is_identical(rec, ft, pc, pl, pn):
                if not rec:
                    return False
                r_ft, r_pc, r_pl, r_pn = rec
                # Allow minor float discrepancies
                return (
                    r_ft is not None and abs(r_ft - ft) < 0.01 and
                    r_pc is not None and abs(r_pc - pc) < 0.01 and
                    (pl is None or (r_pl is not None and abs(r_pl - pl) < 0.01)) and
                    (pn is None or (r_pn is not None and abs(r_pn - pn) < 0.01))
                )

            if existing:
                if is_identical(existing, level_ft, pct_curr, pct_last, pct_norm):
                    print(f"  {dam} ({sheet_date_iso}): already up to date")
                else:
                    c.execute("""
                        UPDATE indian_reservoir_history
                        SET reservoir_level_m = ?, reservoir_level_ft = ?,
                            pct_current_year = ?, pct_last_year = ?, pct_normal = ?,
                            source = 'google_sheet', source_detail = ?, updated_at = ?
                        WHERE reservoir_name = ? AND date_iso = ?
                    """, (level_m, level_ft, pct_curr, pct_last, pct_norm,
                          f'sheet_sync_{updated_at}', updated_at, dam, sheet_date_iso))
                    print(f"  {dam} ({sheet_date_iso}): updated")
                    changes_made += 1
            else:
                # Check if latest record has identical values (same bulletin, no new data)
                c.execute("""
                    SELECT reservoir_level_ft, pct_current_year, pct_last_year, pct_normal
                    FROM indian_reservoir_history
                    WHERE reservoir_name = ?
                    ORDER BY date_iso DESC LIMIT 1
                """, (dam,))
                latest = c.fetchone()

                if latest and is_identical(latest, level_ft, pct_curr, pct_last, pct_norm):
                    print(f"  {dam} ({sheet_date_iso}): identical to latest record, skipping")
                else:
                    frl = FRL_M.get(dam)
                    c.execute("""
                        INSERT INTO indian_reservoir_history
                        (reservoir_name, date_iso, reservoir_level_m, reservoir_level_ft,
                         frl_m, pct_current_year, pct_last_year, pct_normal,
                         source, source_detail, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'google_sheet', ?, ?)
                    """, (dam, sheet_date_iso, level_m, level_ft, frl, pct_curr, pct_last, pct_norm,
                          f'sheet_sync_{updated_at}', updated_at))
                    print(f"  {dam} ({sheet_date_iso}): inserted")
                    changes_made += 1

        conn.commit()

    # Update ft_and_percentage.js variables (reuse existing logic from fetch_indian_dams_sheet.py)
    from pathlib import Path as _Path
    js_p = _Path(str(js_path))
    if js_p.exists():
        try:
            js_content = js_p.read_text(encoding='utf-8')
            js_updated = 0

            for row in rows:
                if not row or len(row) < 2:
                    continue
                label = normalize_label(row[0])
                val = row[1].strip()
                if not val:
                    continue

                if label in LABEL_MAPPING:
                    var_name, is_string = LABEL_MAPPING[label]
                    if is_string:
                        clean_val = val.strip("'\"")
                        rhs = f"'{clean_val}'"
                    else:
                        try:
                            num = float(val.replace('%', '').strip())
                            rhs = f"{num:.2f}"
                        except ValueError:
                            rhs = val
                    new_content = replace_js_variable(js_content, var_name, rhs)
                    if new_content != js_content:
                        js_content = new_content
                        js_updated += 1

            if js_updated > 0:
                js_p.write_text(js_content, encoding='utf-8')
                print(f"[SUCCESS] Updated {js_updated} Indian dam variables in {js_p.name}")
            else:
                print(f"[INFO] All JS values in {js_p.name} already up to date")
        except Exception as e:
            print(f"[WARNING] Error updating JS file: {e}")
    else:
        print(f"[WARNING] JS file not found at {js_path}")

    print(f"[INFO] Google Sheet sync complete. DB changes: {changes_made}")
    return changes_made

def query_history(db_path, reservoir_name, days=None, start_date=None, end_date=None):
    """Query historical storage data for a specific reservoir."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        reservoir_name = reservoir_name.upper()
        
        if not start_date and days is not None:
            c.execute("SELECT MAX(date_iso) as max_d FROM indian_reservoir_history WHERE reservoir_name = ?", (reservoir_name,))
            row = c.fetchone()
            if not row or not row['max_d']:
                return None
            latest_date = datetime.strptime(row['max_d'], "%Y-%m-%d")
            start_dt = latest_date - timedelta(days=days)
            start_date = start_dt.strftime("%Y-%m-%d")
            
        query = """
            SELECT date_iso, reservoir_level_ft, pct_current_year, pct_last_year, pct_normal 
            FROM indian_reservoir_history 
            WHERE reservoir_name = ?
        """
        params = [reservoir_name]
        
        if start_date:
            query += " AND date_iso >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date_iso <= ?"
            params.append(end_date)
            
        query += " ORDER BY date_iso ASC"
        
        c.execute(query, params)
        rows = c.fetchall()
        
        frl_m_val = FRL_M.get(reservoir_name, 0)
        
        series = []
        for r in rows:
            series.append({
                'date': r['date_iso'],
                'reservoir_level_ft': r['reservoir_level_ft'],
                'pct_current_year': r['pct_current_year'],
                'pct_last_year': r['pct_last_year'],
                'pct_normal': r['pct_normal']
            })
            
        return {
            'reservoir': reservoir_name,
            'frl_ft': frl_m_val * M_TO_FT,
            'series': series,
            'points': len(series)
        }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Indian Dams DB Manager")
    parser.add_argument('--seed', action='store_true', help="Seed DB from CSV")
    parser.add_argument('--ingest', action='store_true', help="Seed DB from CSV (alias for --seed)")
    parser.add_argument('--sync', action='store_true', help="Sync DB from Google Sheet")
    parser.add_argument('--db-path', default='data/indian_reservoirs.sqlite', help="Path to SQLite DB (relative to repo root)")
    parser.add_argument('--csv-path', default='data/historical_indian_dams/reservoir_timeseries.csv', help="Path to CSV (relative to repo root)")
    parser.add_argument('--js-path', default='script/ft_and_percentage.js', help="Path to JS file (relative to repo root)")
    
    args = parser.parse_args()
    
    # Resolve relative paths from repo root based on the script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, '..'))
    
    db_path = os.path.join(repo_root, args.db_path) if not os.path.isabs(args.db_path) else args.db_path
    csv_path = os.path.join(repo_root, args.csv_path) if not os.path.isabs(args.csv_path) else args.csv_path
    js_path = os.path.join(repo_root, args.js_path) if not os.path.isabs(args.js_path) else args.js_path
    
    run_seed = args.seed or args.ingest
    run_sync = args.sync
    
    # If no flags passed, run both ingest and sync
    if not run_seed and not run_sync:
        run_seed = True
        run_sync = True
        
    if run_seed:
        print("Running CSV Ingestion...")
        ingest_csv(db_path, csv_path)
        
    if run_sync:
        print("Running Google Sheet Sync...")
        sync_from_google_sheet(db_path, js_path)
