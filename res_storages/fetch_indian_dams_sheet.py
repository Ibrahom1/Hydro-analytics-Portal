import csv
import io
import os
import re
import sys
import urllib.request
from pathlib import Path

# Default Google Sheet URL & CSV Export Endpoint
SPREADSHEET_ID = "1GKYy3bbW2cvtenuFro2BAetTkn3s8svFsLhxzwT_hrU"
SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid=0"

# Mapping from normalized Column A labels to (Target JS Variable, Is String Type)
LABEL_MAPPING = {
    # Reservoir Levels (stored as quoted strings in JS, e.g. '1322.50')
    "reservoir level pong": ("res_lvl_value_Pong", True),
    "reservoir level bhakra": ("res_lvl_value_Bhakra", True),
    "reservoir level thein": ("res_lvl_value_Thein", True),

    # Current Fill Percentages (stored as raw numbers in JS, e.g. 36.03)
    "current fill percentage pong": ("fillPercentage_Pong", False),
    "current fill percentage bhakra": ("fillPercentage_Bhakra", False),
    "current fill percentage thein": ("fillPercentage_Thein", False),

    # Last Year Fill Percentages
    "fill percentage pong last year": ("fillPercentage_Pong_last_year", False),
    "fill percentage bhakra last year": ("fillPercentage_Bhakra_last_year", False),
    "fill percentage thein last year": ("fillPercentage_Thein_last_year", False),

    # 5-Year Normal Fill Percentages
    "fill percentage pong 5year normal": ("fillPercentage_Pong_5year_normal", False),
    "fill percentage bhakra 5year normal": ("fillPercentage_Bhakra_5year_normal", False),
    "fill percentage thein 5year normal": ("fillPercentage_Thein_5year_normal", False),

    # Alternative label variations for tolerance
    "fill percentage pong 5 year normal": ("fillPercentage_Pong_5year_normal", False),
    "fill percentage bhakra 5 year normal": ("fillPercentage_Bhakra_5year_normal", False),
    "fill percentage thein 5 year normal": ("fillPercentage_Thein_5year_normal", False),
}

def normalize_label(label: str) -> str:
    """Normalize row label for robust matching."""
    return re.sub(r"\s+", " ", label.strip().lower())

def replace_js_variable(content: str, variable_name: str, rhs_value: str) -> str:
    """Safely replace a 'let <var> = <rhs_value>' definition in JS content."""
    pattern = re.compile(rf"(let\s+{re.escape(variable_name)}\s*=\s*)([^\r\n]+)")
    updated, count = pattern.subn(rf"\g<1>{rhs_value}", content, count=1)
    if count != 1:
        print(f"[WARNING] Could not find or update variable '{variable_name}' in ft_and_percentage.js")
        return content
    return updated

def fetch_sheet_csv(url: str = SHEET_CSV_URL, timeout: int = 15) -> str:
    """Fetch raw CSV content from Google Sheets."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8")

def update_indian_dams_from_google_sheet(js_path: Path, csv_url: str = SHEET_CSV_URL) -> bool:
    """Fetch Google Sheet CSV, parse Column A/B, and update script/ft_and_percentage.js."""
    print(f"Fetching Indian dams data from Google Sheet...")
    try:
        csv_text = fetch_sheet_csv(csv_url)
    except Exception as e:
        print(f"[WARNING] Failed to fetch Google Sheet data: {e}. Keeping existing Indian dam values in {js_path.name}.")
        return False

    reader = csv.reader(io.StringIO(csv_text))
    updates = {}

    for row in reader:
        if not row or len(row) < 2:
            continue
        raw_label = row[0].strip()
        raw_val = row[1].strip()

        if not raw_val:
            continue

        norm_key = normalize_label(raw_label)
        if norm_key in LABEL_MAPPING:
            var_name, is_string = LABEL_MAPPING[norm_key]
            if is_string:
                # Ensure quoted string format e.g. '1322.50'
                clean_val = raw_val.strip("'\"")
                updates[var_name] = f"'{clean_val}'"
            else:
                # Format numeric float/int e.g. 36.03
                try:
                    num_val = float(raw_val.replace("%", "").strip())
                    updates[var_name] = f"{num_val:.2f}"
                except ValueError:
                    updates[var_name] = raw_val

    if not updates:
        print("[INFO] No non-empty Indian dam values found in Column B of the Google Sheet.")
        return False

    if not js_path.exists():
        print(f"[ERROR] Target JS file not found: {js_path}")
        return False

    content = js_path.read_text(encoding="utf-8")
    updated_count = 0

    for var_name, rhs_val in updates.items():
        new_content = replace_js_variable(content, var_name, rhs_val)
        if new_content != content:
            content = new_content
            updated_count += 1
            print(f"  [UPDATED] {var_name} -> {rhs_val}")

    if updated_count > 0:
        tmp_path = js_path.with_suffix(js_path.suffix + ".tmp")
        tmp_path.write_text(content, encoding="utf-8")
        try:
            tmp_path.replace(js_path)
        except Exception:
            js_path.write_text(content, encoding="utf-8")
        print(f"[SUCCESS] Successfully updated {updated_count} Indian dam variables in {js_path.name}.")
        return True
    else:
        print(f"[INFO] All values in {js_path.name} were already up to date.")
        return False

if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent
    js_target = repo_root / "script" / "ft_and_percentage.js"
    update_indian_dams_from_google_sheet(js_target)
