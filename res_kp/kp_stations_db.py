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
        CREATE TABLE IF NOT EXISTS kp_water_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            time TEXT,
            s_no TEXT,
            river TEXT,
            location TEXT,
            discharge TEXT,
            flow_status TEXT,
            remarks TEXT,
            source_sha256 TEXT,
            UNIQUE(date, time, location)
        )
    ''')
    conn.commit()
    return conn

def parse_pdf(pdf_path):
    date_val = None
    time_val = None
    
    with pdfplumber.open(pdf_path) as pdf:
        # Extract date and time from the first page text
        first_page = pdf.pages[0]
        text = first_page.extract_text()
        
        date_match = re.search(r'DATE\s*:\s*([0-9/]+)', text, re.IGNORECASE)
        time_match = re.search(r'TIME\s*:\s*([0-9:]+\s*[APM]+)', text, re.IGNORECASE)
        
        if date_match:
            date_val = date_match.group(1).strip()
        if time_match:
            time_val = time_match.group(1).strip()
            
        if not date_val:
            date_val = datetime.datetime.now().strftime("%d/%m/%Y")
        if not time_val:
            time_val = datetime.datetime.now().strftime("%I:%M %p")

        # Now extract the table
        target_rows = []
        is_in_range = False
        last_s_no = ""
        last_river = ""
        
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    # Clean up row
                    row = [str(cell).strip().replace('\n', ' ') if cell is not None else "" for cell in row]
                    
                    if len(row) < 5:
                        continue
                        
                    location = row[2]
                    
                    if 'Dir' in location and 'Panjkora' in row[1]:
                        is_in_range = True
                        
                    if is_in_range:
                        # Carry over previous S.No and River if empty or contains dots/quotes
                        s_no = row[0]
                        if not s_no or re.match(r'^[\W_]+$', s_no) or s_no.lower() == 'do':
                            row[0] = last_s_no
                        else:
                            last_s_no = s_no
                            
                        river = row[1]
                        if not river or re.match(r'^[\W_]+$', river) or river.lower() == 'do':
                            row[1] = last_river
                        else:
                            last_river = river
                            
                        target_rows.append(row)
                        
                    if 'Swabi Mardan' in location and 'Badri' in row[1]:
                        is_in_range = False

        return date_val, time_val, target_rows

def ingest_pdf(pdf_path, db_path, archive_dir):
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    with open(pdf_path, 'rb') as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()

    conn = setup_db(db_path)
    c = conn.cursor()
    
    # Check if this exact file was already fully ingested
    c.execute("SELECT 1 FROM kp_water_reports WHERE source_sha256=?", (file_hash,))
    if c.fetchone():
        print(f"PDF {pdf_path} (hash {file_hash[:8]}) is already ingested.")
        conn.close()
        return

    date_val, time_val, rows = parse_pdf(pdf_path)
    
    if not rows:
        print("No matching rows found in the PDF.")
        conn.close()
        return

    inserted = 0
    for row in rows:
        # Expected columns: S.No, Name of Rivers, Locations, Discharge, Flow Status, Remarks
        if len(row) >= 5:
            s_no = row[0]
            river = row[1]
            location = row[2]
            discharge = row[3]
            flow_status = row[4]
            remarks = row[5] if len(row) > 5 else ""
            
            # Clean up discharge (remove commas, handle text like 'N/A')
            try:
                c.execute('''
                    INSERT OR IGNORE INTO kp_water_reports 
                    (date, time, s_no, river, location, discharge, flow_status, remarks, source_sha256)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (date_val, time_val, s_no, river, location, discharge, flow_status, remarks, file_hash))
                if c.rowcount > 0:
                    inserted += 1
            except Exception as e:
                print(f"Error inserting row {row}: {e}")
                
    conn.commit()
    conn.close()
    
    print(f"Successfully inserted {inserted} new records from {pdf_path}.")
    
    # Archive the file
    # We parse the date for filename: DD/MM/YYYY -> YYYY-MM-DD
    try:
        parts = date_val.split('/')
        if len(parts) == 3:
            # assuming DD/MM/YYYY
            iso_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
        else:
            iso_date = datetime.datetime.now().strftime("%Y-%m-%d")
    except:
        iso_date = datetime.datetime.now().strftime("%Y-%m-%d")

    if not os.path.exists(archive_dir):
        os.makedirs(archive_dir)
        
    archive_path = os.path.join(archive_dir, f"{iso_date}.pdf")
    shutil.copy2(pdf_path, archive_path)
    print(f"Archived to {archive_path}")

if __name__ == '__main__':
    project_root = Path(__file__).resolve().parent.parent
    pdf_path = project_root / 'res_kp' / 'Flood Report.pdf'
    db_path = project_root / 'data' / 'kp_stations_data.sqlite'
    archive_dir = project_root / 'res_kp' / 'Historical KP Reports'
    
    try:
        ingest_pdf(str(pdf_path), str(db_path), str(archive_dir))
    except Exception as e:
        print(f"Error during KP stations ingestion: {e}")
        traceback.print_exc()
