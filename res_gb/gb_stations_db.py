import sys
import os
import sqlite3
import re
import hashlib
import pdfplumber
import datetime
import traceback
import shutil
from pathlib import Path

def setup_db(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS gb_water_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recorded_date TEXT,
            time TEXT,
            date_iso TEXT,
            river TEXT,
            station_name TEXT,
            discharge_in_cusecs TEXT,
            source_sha256 TEXT,
            UNIQUE(recorded_date, time, station_name)
        )
    ''')
    
    c.execute('''
        CREATE VIEW IF NOT EXISTS v_gb_water_reports AS
        SELECT * FROM gb_water_reports
        ORDER BY date_iso DESC, time DESC, station_name ASC
    ''')
    conn.commit()
    return conn

def calculate_file_hash(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

def is_file_processed(conn, file_hash):
    c = conn.cursor()
    c.execute("SELECT 1 FROM gb_water_reports WHERE source_sha256 = ? LIMIT 1", (file_hash,))
    return c.fetchone() is not None

def clean_value(val):
    if not val:
        return ""
    val = val.strip()
    # Handle N.R
    if re.match(r'^[Nn]\.?[Rr]\.?$', val) or val.upper() == 'N.R':
        return 'N.R'
    return val.replace(',', '').strip()

def reorder_database_by_date(conn):
    c = conn.cursor()
    c.execute("BEGIN TRANSACTION;")
    c.execute("CREATE TABLE gb_water_reports_new AS SELECT * FROM gb_water_reports ORDER BY date_iso DESC, time DESC, station_name ASC;")
    c.execute("DROP TABLE gb_water_reports;")
    
    c.execute('''
        CREATE TABLE gb_water_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recorded_date TEXT,
            time TEXT,
            date_iso TEXT,
            river TEXT,
            station_name TEXT,
            discharge_in_cusecs TEXT,
            source_sha256 TEXT,
            UNIQUE(recorded_date, time, station_name)
        )
    ''')
    c.execute('''
        INSERT INTO gb_water_reports (recorded_date, time, date_iso, river, station_name, discharge_in_cusecs, source_sha256)
        SELECT recorded_date, time, date_iso, river, station_name, discharge_in_cusecs, source_sha256
        FROM gb_water_reports_new
    ''')
    c.execute("DROP TABLE gb_water_reports_new;")
    c.execute('''
        CREATE VIEW IF NOT EXISTS v_gb_water_reports AS
        SELECT * FROM gb_water_reports
        ORDER BY date_iso DESC, time DESC, station_name ASC
    ''')
    c.execute("COMMIT;")

STATION_FALLBACK_RIVERS = {
    'indus at kharmong': 'Indus River',
    'shyoke river at chowar': 'Shyoke River',
    'shyoke river at yogu': 'Shyoke River',
    'hunza river at danyor': 'Hunza River',
    'gilgit river at gilgit': 'Gilgit River',
    'gilgit river at alam bridge': 'Gilgit River',
    'astore river at doiyan': 'Astore River',
    'chitral river at chitral': 'Chitral River',
    'neelum river at karimabad': 'Neelum River',
    'jhelum river at chakothi': 'Jhelum River',
}

def ingest_pdf(pdf_path, db_path, archive_dir):
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = setup_db(db_path)
    file_hash = calculate_file_hash(pdf_path)
    
    if is_file_processed(conn, file_hash):
        print(f"File {pdf_path} already processed (hash: {file_hash}). Skipping.")
        conn.close()
        return
        
    date_val = None
    time_val = None
    date_iso = None
    
    print(f"Parsing {pdf_path}...")
    records = []
    current_river = "Indus River"
    
    with pdfplumber.open(pdf_path) as pdf:
        first_page = pdf.pages[0]
        text = first_page.extract_text()
        
        # Extract date and time
        date_match = re.search(r'(\d{1,2}-[A-Za-z]{3}-\d{4})', text)
        time_match = re.search(r'(\d{1,2}:\d{2}\s*PST)', text)
        
        if date_match:
            date_val = date_match.group(1)
            try:
                date_iso = datetime.datetime.strptime(date_val, '%d-%b-%Y').strftime('%Y-%m-%d')
            except ValueError:
                date_iso = date_val
                
        if time_match:
            time_val = time_match.group(1)
            
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or len(row) < 3:
                        continue
                    
                    cell0 = str(row[0]).strip().replace('\n', ' ') if row[0] is not None else ""
                    cell1 = str(row[1]).strip().replace('\n', ' ') if row[1] is not None else ""
                    
                    # Detect River Header Rows (e.g. 'Indus River', 'Swat River', 'Chitral River', 'Neelum River', 'Jhelum River')
                    if not cell0.isdigit():
                        combined = (cell0 + " " + cell1).lower()
                        if 'indus' in combined:
                            current_river = 'Indus River'
                        elif 'swat' in combined:
                            current_river = 'Swat River'
                        elif 'chitral' in combined:
                            current_river = 'Chitral River'
                        elif 'neelum' in combined:
                            current_river = 'Neelum River'
                        elif 'jhelum' in combined:
                            current_river = 'Jhelum River'
                        continue
                        
                    sr_no = cell0
                    station_name = cell1
                    discharge_cusecs = str(row[2]).strip().replace('\n', ' ') if row[2] is not None else ""
                    
                    if not station_name:
                        continue
                        
                    if 'massan' in station_name.lower() or 'chakdara' in station_name.lower():
                        continue
                        
                    discharge_cleaned = clean_value(discharge_cusecs)
                    assigned_river = current_river or STATION_FALLBACK_RIVERS.get(station_name.lower(), 'Indus River')
                    
                    records.append((
                        date_val,
                        time_val,
                        date_iso,
                        assigned_river,
                        station_name,
                        discharge_cleaned,
                        file_hash
                    ))
                    
    if records:
        c = conn.cursor()
        c.executemany('''
            INSERT OR IGNORE INTO gb_water_reports 
            (recorded_date, time, date_iso, river, station_name, discharge_in_cusecs, source_sha256)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', records)
        conn.commit()
        
        c.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        reorder_database_by_date(conn)
        
        os.makedirs(archive_dir, exist_ok=True)
        archive_name = f"{date_iso if date_iso else 'unknown'}.pdf"
        archive_path = os.path.join(archive_dir, archive_name)
        shutil.copy2(pdf_path, archive_path)
        print(f"Inserted {len(records)} records. Archived to {archive_path}")
        
    else:
        print("No valid records found in PDF to insert.")
        
    conn.close()

if __name__ == '__main__':
    project_root = Path(__file__).resolve().parent.parent
    pdf_path = project_root / 'res_gb' / 'SWHP Report.pdf'
    db_path = project_root / 'data' / 'gb_stations.sqlite'
    archive_dir = project_root / 'res_gb' / 'Historical GB Reports'
    
    try:
        ingest_pdf(str(pdf_path), str(db_path), str(archive_dir))
    except Exception as e:
        print(f"Error during GB stations ingestion: {e}")
        traceback.print_exc()
