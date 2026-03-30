"""Fetch current bulletin data and expose required dam metrics as variables."""

from __future__ import annotations

import json
import re
import ssl
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import pandas as pd
import pdfplumber

PROJECT_ROOT: Path = Path(__file__).resolve().parent
CWC_URL: str = "https://rsms.cwc.gov.in/frameWork/web/bulletin-report-page"
TITLE_PATTERN: str = "REGION/STATE WISE WEEKLY REPORT"
DOWNLOAD_TIMEOUT: int = 30
WEEKLY_BULLETINS_PATH: Path = PROJECT_ROOT / "weekly_bulletins"

REQUIRED_RESERVOIRS: Mapping[str, str] = {
    "GOBIND SAGAR": "bhakra",
    "PONG DAM": "pong_dam",
    "THEIN DAM": "thein_dam",
}

METERS_TO_FEET: float = 3.28084
OUTPUT_JSON_PATH: Path = PROJECT_ROOT / "data" / "current_reservoir_snapshot.json"


@dataclass(frozen=True)
class ReservoirSnapshot:
    """Strictly validated reservoir metrics for one dam."""

    current_reservoir_level_m: float
    current_reservoir_level_ft: float
    current_year: float
    last_year: float
    normal_storage: float


# Flat variables requested by user. They are populated when main() runs.
bhakra_current_reservoir_level_m: Optional[float] = None
bhakra_current_reservoir_level_ft: Optional[float] = None
bhakra_current_year: Optional[float] = None
bhakra_last_year: Optional[float] = None
bhakra_normal_storage: Optional[float] = None

pong_dam_current_reservoir_level_m: Optional[float] = None
pong_dam_current_reservoir_level_ft: Optional[float] = None
pong_dam_current_year: Optional[float] = None
pong_dam_last_year: Optional[float] = None
pong_dam_normal_storage: Optional[float] = None

thein_dam_current_reservoir_level_m: Optional[float] = None
thein_dam_current_reservoir_level_ft: Optional[float] = None
thein_dam_current_year: Optional[float] = None
thein_dam_last_year: Optional[float] = None
thein_dam_normal_storage: Optional[float] = None

# Dam-level variable objects, also populated by main().
bhakra: Optional[Dict[str, float]] = None
pong_dam: Optional[Dict[str, float]] = None
thein_dam: Optional[Dict[str, float]] = None


class SnapshotValidationError(RuntimeError):
    """Raised when required fields are absent in parsed bulletin data."""


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value)).strip().upper()


def _find_column_by_all_tokens(
    columns: Sequence[str], required_tokens: Iterable[str]
) -> Optional[str]:
    required: List[str] = [token.upper() for token in required_tokens]
    for column in columns:
        normalized = _normalize_text(column)
        if all(token in normalized for token in required):
            return column
    return None


def _find_column_by_all_tokens_excluding(
    columns: Sequence[str],
    required_tokens: Iterable[str],
    excluded_tokens: Iterable[str],
) -> Optional[str]:
    required: List[str] = [token.upper() for token in required_tokens]
    excluded: List[str] = [token.upper() for token in excluded_tokens]
    for column in columns:
        normalized = _normalize_text(column)
        if all(token in normalized for token in required) and not any(
            token in normalized for token in excluded
        ):
            return column
    return None


def _find_column_by_exact_normalized(
    columns: Sequence[str], expected_value: str
) -> Optional[str]:
    normalized_expected = _normalize_text(expected_value)
    for column in columns:
        if _normalize_text(column) == normalized_expected:
            return column
    return None


def _find_next_column(columns: Sequence[str], current_column: str) -> Optional[str]:
    try:
        current_index = list(columns).index(current_column)
    except ValueError:
        return None
    next_index = current_index + 1
    if next_index >= len(columns):
        return None
    return list(columns)[next_index]


def _extract_date_from_any_text(text: str) -> Optional[date]:
    match = re.search(r"(\d{2})[-_.](\d{2})[-_.](\d{4})", text)
    if match is None:
        return None
    day_text, month_text, year_text = match.groups()
    try:
        return date(int(year_text), int(month_text), int(day_text))
    except ValueError:
        return None


def _choose_latest_bulletin(pdf_links: Sequence[Tuple[str, str]]) -> Tuple[str, str]:
    if not pdf_links:
        raise SnapshotValidationError("No PDF links found on bulletin page.")

    dated_links: List[Tuple[date, Tuple[str, str]]] = []
    for link_text, link_url in pdf_links:
        extracted_date = _extract_date_from_any_text(link_text) or _extract_date_from_any_text(link_url)
        if extracted_date is not None:
            dated_links.append((extracted_date, (link_text, link_url)))

    if dated_links:
        dated_links.sort(key=lambda item: item[0], reverse=True)
        return dated_links[0][1]

    return pdf_links[0]


def _download_pdf_if_needed(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0:
        return destination

    ssl_context = ssl.create_default_context()
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, context=ssl_context, timeout=DOWNLOAD_TIMEOUT) as response:
        content = response.read()

    if not content:
        raise SnapshotValidationError(f"Downloaded empty PDF content from {url}")

    destination.write_bytes(content)
    return destination


def _to_required_float(raw_value: object, field_name: str, dam_name: str) -> float:
    numeric_value = pd.to_numeric(raw_value, errors="coerce")
    if pd.isna(numeric_value):
        raise SnapshotValidationError(
            f"Missing or non-numeric value for '{field_name}' in dam '{dam_name}'."
        )
    return float(numeric_value)


def _extract_date_from_text(text: str) -> Optional[date]:
    match = re.search(r"(\d{2}\.\d{2}\.\d{4})", text)
    if match is None:
        return None
    try:
        parsed_date = pd.to_datetime(match.group(1), format="%d.%m.%Y", errors="coerce")
        if pd.isna(parsed_date):
            return None
        return parsed_date.date()
    except ValueError:
        return None


def _process_single_pdf(
    pdf_path: str,
    reservoirs: Mapping[str, str],
    title_pattern: str,
) -> pd.DataFrame:
    rows: List[pd.DataFrame] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if title_pattern.lower() not in text.lower():
                continue

            extracted_date = _extract_date_from_text(text)
            tables = page.extract_tables() or []

            for table in tables:
                table_frame = pd.DataFrame(table)
                if len(table_frame) <= 5:
                    continue

                primary_header = list(table_frame.iloc[2])
                secondary_header = list(table_frame.iloc[3])
                combined_headers: List[str] = []
                for index, primary_value in enumerate(primary_header):
                    secondary_value = secondary_header[index] if index < len(secondary_header) else None
                    primary_text = "" if primary_value is None else str(primary_value).strip()
                    secondary_text = "" if secondary_value is None else str(secondary_value).strip()

                    if primary_text and secondary_text:
                        combined_header = f"{primary_text} {secondary_text}"
                    elif primary_text:
                        combined_header = primary_text
                    elif secondary_text:
                        combined_header = secondary_text
                    else:
                        combined_header = f"col_{index}"

                    combined_headers.append(combined_header.upper())

                table_frame.columns = combined_headers
                table_frame = table_frame[5:].reset_index(drop=True)

                reservoir_name_column = _find_column_by_all_tokens(
                    list(table_frame.columns), ["RESERVOIR", "NAME"]
                )
                if reservoir_name_column is None:
                    continue

                normalized_reservoir_names = (
                    table_frame[reservoir_name_column].astype(str).map(_normalize_text)
                )
                filtered_rows = table_frame[
                    normalized_reservoir_names.isin(set(reservoirs.keys()))
                ].copy()

                if filtered_rows.empty:
                    continue

                filtered_rows["DATE"] = extracted_date
                filtered_rows["SOURCE_PDF"] = Path(pdf_path).name
                rows.append(filtered_rows)

    if not rows:
        return pd.DataFrame()

    combined_frame = pd.concat(rows, ignore_index=True)
    combined_frame = combined_frame.loc[:, ~combined_frame.columns.duplicated()].reset_index(drop=True)
    combined_frame.columns = [
        str(column_name) if column_name is not None else f"col_{index}"
        for index, column_name in enumerate(combined_frame.columns)
    ]
    return combined_frame


def _fetch_pdf_links_from_page(url: str) -> List[Tuple[str, str]]:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=DOWNLOAD_TIMEOUT) as response:
        html_text = response.read().decode("utf-8", errors="ignore")

    link_pattern = re.compile(
        r'<a[^>]*href=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\'][^>]*>(.*?)</a>',
        re.IGNORECASE | re.DOTALL,
    )

    parsed_links: List[Tuple[str, str]] = []
    for href_value, anchor_text in link_pattern.findall(html_text):
        absolute_url = urljoin(url, href_value.strip())
        clean_text = re.sub(r"<[^>]+>", "", anchor_text)
        clean_text = re.sub(r"\s+", " ", clean_text).strip()
        parsed_links.append((clean_text, absolute_url))

    unique_links: Dict[str, Tuple[str, str]] = {}
    for text_value, link_value in parsed_links:
        unique_links[link_value] = (text_value, link_value)

    return list(unique_links.values())


def _fetch_pdf_links_with_selenium(url: str) -> List[Tuple[str, str]]:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait
    except ImportError as import_error:
        raise SnapshotValidationError(
            "Selenium fallback is unavailable because selenium is not installed."
        ) from import_error

    driver = None
    try:
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")

        driver = webdriver.Chrome(options=chrome_options)
        driver.get(url)

        table = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.TAG_NAME, "table"))
        )

        links = table.find_elements(By.TAG_NAME, "a")
        parsed_links: List[Tuple[str, str]] = []
        for link in links:
            href = link.get_attribute("href")
            if href and href.lower().endswith(".pdf"):
                parsed_links.append((link.text.strip(), href))

        return parsed_links
    except Exception as selenium_error:
        raise SnapshotValidationError(
            f"Failed to fetch PDF links with Selenium fallback: {selenium_error}"
        ) from selenium_error
    finally:
        if driver is not None:
            driver.quit()


def _prepare_column_aliases(data_frame: pd.DataFrame) -> Mapping[str, str]:
    available_columns: List[str] = list(data_frame.columns)

    aliases: Dict[str, str] = {}

    reservoir_name_col = _find_column_by_all_tokens(available_columns, ["RESERVOIR", "NAME"])
    if reservoir_name_col is None:
        raise SnapshotValidationError("Could not find reservoir name column.")
    aliases["reservoir_name"] = reservoir_name_col

    level_m_col = _find_column_by_all_tokens(available_columns, ["CURRENT", "RESERVOIR", "LEVEL"])
    if level_m_col is None:
        raise SnapshotValidationError("Could not find current reservoir level column.")
    aliases["current_reservoir_level_m"] = level_m_col

    storage_pct_col = _find_column_by_all_tokens(
        available_columns,
        ["STORAGE", "%", "LIVE", "CAPACITY", "FRL"],
    )
    if storage_pct_col is None:
        raise SnapshotValidationError(
            "Could not find 'STORAGE AS % OF LIVE CAPACITY AT FRL' column."
        )
    aliases["storage_pct"] = storage_pct_col

    current_year_col = _find_column_by_all_tokens(
        available_columns,
        ["STORAGE", "CAPACITY", "CURRENT", "YEAR"],
    )
    last_year_col = _find_column_by_all_tokens(
        available_columns,
        ["STORAGE", "CAPACITY", "LAST", "YEAR"],
    )
    normal_storage_col = _find_column_by_all_tokens(
        available_columns,
        ["STORAGE", "CAPACITY", "NORMAL", "STORAGE"],
    )

    # Handle split headers where CAPACITY can be absent from one logical column label.
    if current_year_col is None:
        current_year_col = _find_column_by_all_tokens_excluding(
            available_columns,
            ["CURRENT", "YEAR"],
            ["BENEFITS"],
        )
    if last_year_col is None:
        last_year_col = _find_column_by_all_tokens_excluding(
            available_columns,
            ["LAST", "YEAR"],
            ["BENEFITS"],
        )
    if normal_storage_col is None:
        normal_storage_col = _find_column_by_all_tokens_excluding(
            available_columns,
            ["NORMAL", "STORAGE"],
            ["BENEFITS"],
        )

    # CWC tables can expose these as numeric headers (column ids 8, 9, 10).
    if current_year_col is None:
        current_year_col = _find_column_by_exact_normalized(available_columns, "8")
    if last_year_col is None:
        last_year_col = _find_column_by_exact_normalized(available_columns, "9")
    if normal_storage_col is None:
        normal_storage_col = _find_column_by_exact_normalized(available_columns, "10")

    # Split-header fallback observed in CWC extraction where headers become:
    # STORAGE AS % OF LIVE CAPACITY AT FRL, NONE, BENEFITS.
    none_col = _find_column_by_exact_normalized(available_columns, "NONE")
    benefits_col = _find_column_by_exact_normalized(available_columns, "BENEFITS")
    if current_year_col is None and (none_col is not None or benefits_col is not None):
        current_year_col = storage_pct_col
    if last_year_col is None and (none_col is not None or benefits_col is not None):
        last_year_col = none_col or _find_next_column(available_columns, current_year_col)
    if normal_storage_col is None and (none_col is not None or benefits_col is not None):
        normal_storage_col = benefits_col or _find_next_column(available_columns, last_year_col)

    if current_year_col is None:
        raise SnapshotValidationError("Could not find storage capacity current year column.")
    if last_year_col is None:
        raise SnapshotValidationError("Could not find storage capacity last year column.")
    if normal_storage_col is None:
        raise SnapshotValidationError("Could not find storage capacity normal storage column.")

    aliases["current_year"] = current_year_col
    aliases["last_year"] = last_year_col
    aliases["normal_storage"] = normal_storage_col

    date_col = _find_column_by_all_tokens(available_columns, ["DATE"])
    if date_col is not None:
        aliases["date"] = date_col

    source_pdf_col = _find_column_by_all_tokens(available_columns, ["SOURCE", "PDF"])
    if source_pdf_col is not None:
        aliases["source_pdf"] = source_pdf_col

    return aliases


def _extract_snapshots_for_required_dams(data_frame: pd.DataFrame) -> Mapping[str, ReservoirSnapshot]:
    aliases = _prepare_column_aliases(data_frame)
    reservoir_name_col = aliases["reservoir_name"]

    normalized_series = data_frame[reservoir_name_col].astype(str).map(_normalize_text)

    snapshots: Dict[str, ReservoirSnapshot] = {}
    for source_name, alias_name in REQUIRED_RESERVOIRS.items():
        matching_rows = data_frame[normalized_series == source_name]
        if matching_rows.empty:
            raise SnapshotValidationError(f"Required dam '{source_name}' not found in bulletin.")

        row = matching_rows.iloc[0]
        level_m = _to_required_float(row[aliases["current_reservoir_level_m"]], "CURRENT RESERVOIR LEVEL (M)", source_name)
        current_year = _to_required_float(
            row[aliases["current_year"]],
            "STORAGE CAPACITY CURRENT YEAR",
            source_name,
        )
        last_year = _to_required_float(
            row[aliases["last_year"]],
            "STORAGE CAPACITY LAST YEAR",
            source_name,
        )
        normal_storage = _to_required_float(
            row[aliases["normal_storage"]],
            "STORAGE CAPACITY NORMAL STORAGE",
            source_name,
        )

        snapshots[alias_name] = ReservoirSnapshot(
            current_reservoir_level_m=level_m,
            current_reservoir_level_ft=level_m * METERS_TO_FEET,
            current_year=current_year,
            last_year=last_year,
            normal_storage=normal_storage,
        )

    return snapshots


def _extract_metadata(
    data_frame: pd.DataFrame,
    aliases: Mapping[str, str],
    selected_url: str,
) -> Mapping[str, Optional[str]]:
    bulletin_date: Optional[str] = None
    if "date" in aliases:
        non_null_dates = data_frame[aliases["date"]].dropna()
        if not non_null_dates.empty:
            parsed_date = pd.to_datetime(non_null_dates.iloc[0], errors="coerce")
            if not pd.isna(parsed_date):
                bulletin_date = parsed_date.date().isoformat()

    source_pdf: Optional[str] = None
    if "source_pdf" in aliases:
        non_null_pdfs = data_frame[aliases["source_pdf"]].dropna()
        if not non_null_pdfs.empty:
            source_pdf = str(non_null_pdfs.iloc[0])

    return {
        "run_timestamp_utc": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "selected_bulletin_url": selected_url,
        "bulletin_date": bulletin_date,
        "source_pdf": source_pdf,
    }


def _populate_flat_variables(snapshots: Mapping[str, ReservoirSnapshot]) -> None:
    for alias_name, snapshot in snapshots.items():
        payload = asdict(snapshot)
        globals()[alias_name] = payload
        for key_name, value in payload.items():
            globals()[f"{alias_name}_{key_name}"] = value


def _write_json_output(payload: Mapping[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _find_latest_local_pdf(directory: Path) -> Path:
    pdf_files = [path for path in directory.glob("*.pdf") if path.is_file()]
    if not pdf_files:
        raise SnapshotValidationError(
            "Could not fetch bulletin links and no local PDF files are available."
        )
    return max(pdf_files, key=lambda path: path.stat().st_mtime)


def main() -> None:
    selected_pdf_url: str
    try:
        pdf_links = _fetch_pdf_links_from_page(CWC_URL)
        if not pdf_links:
            pdf_links = _fetch_pdf_links_with_selenium(CWC_URL)
        _, selected_pdf_url = _choose_latest_bulletin(pdf_links)

        selected_filename = Path(urlparse(selected_pdf_url).path).name
        if not selected_filename:
            raise SnapshotValidationError(
                f"Could not derive PDF filename from URL: {selected_pdf_url}"
            )

        local_pdf_path = WEEKLY_BULLETINS_PATH / selected_filename
        local_pdf_path = _download_pdf_if_needed(selected_pdf_url, local_pdf_path)
    except Exception as fetch_error:
        local_pdf_path = _find_latest_local_pdf(WEEKLY_BULLETINS_PATH)
        selected_pdf_url = f"local://{local_pdf_path.name}"
        print(f"Warning: Falling back to local bulletin due to fetch error: {fetch_error}")

    extracted_frame = _process_single_pdf(
        pdf_path=str(local_pdf_path),
        reservoirs=REQUIRED_RESERVOIRS,
        title_pattern=TITLE_PATTERN,
    )

    if extracted_frame.empty:
        raise SnapshotValidationError(
            "No matching reservoir data extracted from selected bulletin PDF."
        )

    snapshots = _extract_snapshots_for_required_dams(extracted_frame)
    aliases = _prepare_column_aliases(extracted_frame)
    metadata = _extract_metadata(extracted_frame, aliases, selected_pdf_url)

    _populate_flat_variables(snapshots)

    json_payload: Dict[str, object] = dict(metadata)
    for alias_name, snapshot in snapshots.items():
        json_payload[alias_name] = asdict(snapshot)

    _write_json_output(json_payload, OUTPUT_JSON_PATH)

    print(f"Snapshot saved to: {OUTPUT_JSON_PATH}")
    print("Variables populated: bhakra, pong_dam, thein_dam and their flat field variables.")


if __name__ == "__main__":
    main()
