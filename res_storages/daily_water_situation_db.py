from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - runtime dependency check
    raise SystemExit(
        "Missing dependency: pdfplumber. Install with: pip install pdfplumber"
    ) from exc


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF_PATH = Path(__file__).resolve().parent / "Daily Water Situation.pdf"
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "daily_water_situation.sqlite"
DEFAULT_ARCHIVE_DIR = Path(__file__).resolve().parent / "Historical Daily Storages"
KARACHI_TZ = ZoneInfo("Asia/Karachi")

EXPECTED_COUNTS = {
    "river_inflows": 5,
    "skardu_temperature": 2,
    "reservoir_outflows": 5,
    "irsa_indent_at_reservoirs": 3,
    "reservoir_levels": 3,
    "reservoir_storages": 4,
    "barrages_discharge": 9,
}


@dataclass(frozen=True)
class CommonValues:
    today: float
    last_year: float
    avg_last_5_years: float
    avg_last_10_years: float
    variation_percent: float
    variation_trend: str
    variation_band: str


def normalize_cell(value: object) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def parse_number(value: object, field_name: str) -> float:
    text = normalize_cell(value).replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if match is None:
        raise ValueError(f"Missing numeric value for {field_name}: {value!r}")
    return float(match.group(0))


def parse_first_cell_metadata(first_cell: object) -> tuple[str, dict[str, float]]:
    lines = [normalize_cell(part) for part in str(first_cell or "").splitlines()]
    lines = [line for line in lines if line]
    label = lines[0] if lines else normalize_cell(first_cell)
    metadata_text = " ".join(lines[1:])

    metadata: dict[str, float] = {}
    for key in ("MOL", "MCL", "Max"):
        match = re.search(rf"\b{key}\s+(-?\d+(?:\.\d+)?)", metadata_text, flags=re.IGNORECASE)
        if match:
            metadata[key.lower()] = float(match.group(1))

    return label, metadata


def parse_report_date(pdf_text: str) -> str:
    match = re.search(r"\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b", pdf_text)
    if match is None:
        raise ValueError("Could not find report date in PDF text.")
    return datetime.strptime(match.group(1), "%d-%b-%Y").date().isoformat()


def parse_variation_trend(variation_percent: float, arrow_text: object) -> str:
    arrow = normalize_cell(arrow_text)
    if "▲" in arrow:
        return "increase"
    if "▼" in arrow:
        return "decrease"
    if "►" in arrow:
        return "neutral"
    if variation_percent > 0:
        return "increase"
    if variation_percent < 0:
        return "decrease"
    return "neutral"


def parse_variation_band(variation_percent: float) -> str:
    absolute_value = abs(variation_percent)
    if absolute_value <= 25:
        return "0-25"
    if absolute_value <= 50:
        return "25-50"
    return ">50"


def parse_common_values(row: list[object], row_name: str) -> CommonValues:
    if len(row) < 7:
        raise ValueError(f"Expected 7 columns for {row_name}, got {len(row)}.")

    variation_percent = parse_number(row[5], f"{row_name}.variation_percent")
    return CommonValues(
        today=parse_number(row[1], f"{row_name}.today"),
        last_year=parse_number(row[2], f"{row_name}.last_year"),
        avg_last_5_years=parse_number(row[3], f"{row_name}.avg_last_5_years"),
        avg_last_10_years=parse_number(row[4], f"{row_name}.avg_last_10_years"),
        variation_percent=variation_percent,
        variation_trend=parse_variation_trend(variation_percent, row[6]),
        variation_band=parse_variation_band(variation_percent),
    )


def is_header_table(table: list[list[object]]) -> bool:
    if not table or not table[0]:
        return False
    return normalize_cell(table[0][0]).lower() == "stations"


def non_header_tables(page) -> list[list[list[object]]]:
    tables = page.extract_tables() or []
    return [table for table in tables if table and not is_header_table(table)]


def to_common_tuple(values: CommonValues) -> tuple[float, float, float, float, float, str, str]:
    return (
        values.today,
        values.last_year,
        values.avg_last_5_years,
        values.avg_last_10_years,
        values.variation_percent,
        values.variation_trend,
        values.variation_band,
    )


def parse_simple_section(table: list[list[object]], label_name: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row_order, row in enumerate(table, start=1):
        label = normalize_cell(row[0] if row else "")
        if not label:
            continue
        values = parse_common_values(row, f"{label_name}:{label}")
        rows.append(
            {
                "row_order": row_order,
                label_name: label,
                "values": values,
            }
        )
    return rows


def parse_reservoir_levels(table: list[list[object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row_order, row in enumerate(table, start=1):
        reservoir, metadata = parse_first_cell_metadata(row[0] if row else "")
        if not reservoir:
            continue
        rows.append(
            {
                "row_order": row_order,
                "reservoir": reservoir,
                "mol_ft": metadata.get("mol"),
                "mcl_ft": metadata.get("mcl"),
                "values": parse_common_values(row, f"reservoir_levels:{reservoir}"),
            }
        )
    return rows


def parse_reservoir_storages(table: list[list[object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row_order, row in enumerate(table, start=1):
        reservoir, metadata = parse_first_cell_metadata(row[0] if row else "")
        if not reservoir:
            continue
        rows.append(
            {
                "row_order": row_order,
                "reservoir": reservoir,
                "max_maf": metadata.get("max"),
                "values": parse_common_values(row, f"reservoir_storages:{reservoir}"),
            }
        )
    return rows


def parse_barrages_discharge(table: list[list[object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    current_group = ""
    row_order = 0

    for row in table:
        first_cell = normalize_cell(row[0] if row else "")
        if not first_cell:
            continue

        empty_data_cells = all(not normalize_cell(cell) for cell in row[1:])
        if first_cell.lower().startswith("river ") and empty_data_cells:
            current_group = first_cell
            continue

        row_order += 1
        rows.append(
            {
                "row_order": row_order,
                "river_group": current_group,
                "station": first_cell,
                "values": parse_common_values(row, f"barrages_discharge:{first_cell}"),
            }
        )

    return rows


def extract_pdf_payload(pdf_path: Path) -> dict[str, object]:
    all_text_parts: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        pages = list(pdf.pages)
        if len(pages) < 2:
            raise ValueError(f"Expected at least 2 pages, found {len(pages)}.")

        page_tables: list[list[list[list[object]]]] = []
        for page in pages:
            all_text_parts.append(page.extract_text() or "")
            page_tables.append(non_header_tables(page))

    report_date = parse_report_date("\n".join(all_text_parts))

    if len(page_tables[0]) < 4:
        raise ValueError(f"Expected 4 data tables on page 1, found {len(page_tables[0])}.")
    if len(page_tables[1]) < 3:
        raise ValueError(f"Expected 3 data tables on page 2, found {len(page_tables[1])}.")

    sections = {
        "river_inflows": parse_simple_section(page_tables[0][0], "station"),
        "skardu_temperature": parse_simple_section(page_tables[0][1], "metric"),
        "reservoir_outflows": parse_simple_section(page_tables[0][2], "reservoir_or_channel"),
        "irsa_indent_at_reservoirs": parse_simple_section(page_tables[0][3], "reservoir"),
        "reservoir_levels": parse_reservoir_levels(page_tables[1][0]),
        "reservoir_storages": parse_reservoir_storages(page_tables[1][1]),
        "barrages_discharge": parse_barrages_discharge(page_tables[1][2]),
    }

    validate_sections(sections)
    return {
        "report_date": report_date,
        "page_count": len(pages),
        "sections": sections,
    }


def validate_sections(sections: dict[str, list[dict[str, object]]]) -> None:
    mismatches = []
    for section_name, expected_count in EXPECTED_COUNTS.items():
        actual_count = len(sections.get(section_name, []))
        if actual_count != expected_count:
            mismatches.append(f"{section_name}: expected {expected_count}, got {actual_count}")
    if mismatches:
        raise ValueError("Unexpected extracted row counts: " + "; ".join(mismatches))

    for rows in sections.values():
        for row in rows:
            values = row["values"]
            if not isinstance(values, CommonValues):
                raise ValueError("Parsed row is missing common metric values.")
            if values.variation_trend not in {"increase", "decrease", "neutral"}:
                raise ValueError(f"Invalid variation_trend: {values.variation_trend}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative_posix(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def connect_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS daily_water_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_date TEXT NOT NULL UNIQUE,
            source_sha256 TEXT NOT NULL UNIQUE,
            source_pdf_path TEXT NOT NULL,
            historical_pdf_path TEXT NOT NULL,
            processed_at_utc TEXT NOT NULL,
            processed_at_karachi TEXT NOT NULL,
            page_count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS river_inflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            station TEXT NOT NULL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );

        CREATE TABLE IF NOT EXISTS skardu_temperature (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            metric TEXT NOT NULL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );

        CREATE TABLE IF NOT EXISTS reservoir_outflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            reservoir_or_channel TEXT NOT NULL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );

        CREATE TABLE IF NOT EXISTS irsa_indent_at_reservoirs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            reservoir TEXT NOT NULL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );

        CREATE TABLE IF NOT EXISTS reservoir_levels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            reservoir TEXT NOT NULL,
            mol_ft REAL,
            mcl_ft REAL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );

        CREATE TABLE IF NOT EXISTS reservoir_storages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            reservoir TEXT NOT NULL,
            max_maf REAL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );

        CREATE TABLE IF NOT EXISTS barrages_discharge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES daily_water_reports(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL,
            river_group TEXT NOT NULL,
            station TEXT NOT NULL,
            today REAL NOT NULL,
            last_year REAL NOT NULL,
            avg_last_5_years REAL NOT NULL,
            avg_last_10_years REAL NOT NULL,
            variation_percent REAL NOT NULL,
            variation_trend TEXT NOT NULL CHECK (variation_trend IN ('increase', 'decrease', 'neutral')),
            variation_band TEXT NOT NULL CHECK (variation_band IN ('0-25', '25-50', '>50')),
            UNIQUE(report_id, row_order)
        );
        """
    )


def get_report_id_by_hash(connection: sqlite3.Connection, source_sha256: str) -> Optional[int]:
    row = connection.execute(
        "SELECT id FROM daily_water_reports WHERE source_sha256 = ?",
        (source_sha256,),
    ).fetchone()
    return int(row[0]) if row else None


def get_report_id_by_date(connection: sqlite3.Connection, report_date: str) -> Optional[int]:
    row = connection.execute(
        "SELECT id FROM daily_water_reports WHERE report_date = ?",
        (report_date,),
    ).fetchone()
    return int(row[0]) if row else None


def delete_section_rows(connection: sqlite3.Connection, report_id: int) -> None:
    for table_name in EXPECTED_COUNTS:
        connection.execute(f"DELETE FROM {table_name} WHERE report_id = ?", (report_id,))


def upsert_report(
    connection: sqlite3.Connection,
    report_date: str,
    source_sha256: str,
    source_pdf_path: Path,
    historical_pdf_path: Path,
    page_count: int,
) -> int:
    now_utc = datetime.now(timezone.utc).replace(microsecond=0)
    now_karachi = now_utc.astimezone(KARACHI_TZ)
    existing_id = get_report_id_by_date(connection, report_date)

    values = (
        report_date,
        source_sha256,
        relative_posix(source_pdf_path),
        relative_posix(historical_pdf_path),
        now_utc.isoformat().replace("+00:00", "Z"),
        now_karachi.isoformat(),
        page_count,
    )

    if existing_id is None:
        cursor = connection.execute(
            """
            INSERT INTO daily_water_reports (
                report_date,
                source_sha256,
                source_pdf_path,
                historical_pdf_path,
                processed_at_utc,
                processed_at_karachi,
                page_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
        return int(cursor.lastrowid)

    connection.execute(
        """
        UPDATE daily_water_reports
        SET source_sha256 = ?,
            source_pdf_path = ?,
            historical_pdf_path = ?,
            processed_at_utc = ?,
            processed_at_karachi = ?,
            page_count = ?
        WHERE id = ?
        """,
        values[1:] + (existing_id,),
    )
    delete_section_rows(connection, existing_id)
    return existing_id


def insert_simple_rows(
    connection: sqlite3.Connection,
    table_name: str,
    label_column: str,
    report_id: int,
    rows: Iterable[dict[str, object]],
) -> None:
    sql = f"""
        INSERT INTO {table_name} (
            report_id,
            row_order,
            {label_column},
            today,
            last_year,
            avg_last_5_years,
            avg_last_10_years,
            variation_percent,
            variation_trend,
            variation_band
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    for row in rows:
        values = row["values"]
        if not isinstance(values, CommonValues):
            raise ValueError(f"Invalid common values for {table_name}.")
        connection.execute(
            sql,
            (
                report_id,
                row["row_order"],
                row[label_column],
                *to_common_tuple(values),
            ),
        )


def insert_reservoir_levels(
    connection: sqlite3.Connection,
    report_id: int,
    rows: Iterable[dict[str, object]],
) -> None:
    sql = """
        INSERT INTO reservoir_levels (
            report_id,
            row_order,
            reservoir,
            mol_ft,
            mcl_ft,
            today,
            last_year,
            avg_last_5_years,
            avg_last_10_years,
            variation_percent,
            variation_trend,
            variation_band
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    for row in rows:
        values = row["values"]
        if not isinstance(values, CommonValues):
            raise ValueError("Invalid common values for reservoir_levels.")
        connection.execute(
            sql,
            (
                report_id,
                row["row_order"],
                row["reservoir"],
                row["mol_ft"],
                row["mcl_ft"],
                *to_common_tuple(values),
            ),
        )


def insert_reservoir_storages(
    connection: sqlite3.Connection,
    report_id: int,
    rows: Iterable[dict[str, object]],
) -> None:
    sql = """
        INSERT INTO reservoir_storages (
            report_id,
            row_order,
            reservoir,
            max_maf,
            today,
            last_year,
            avg_last_5_years,
            avg_last_10_years,
            variation_percent,
            variation_trend,
            variation_band
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    for row in rows:
        values = row["values"]
        if not isinstance(values, CommonValues):
            raise ValueError("Invalid common values for reservoir_storages.")
        connection.execute(
            sql,
            (
                report_id,
                row["row_order"],
                row["reservoir"],
                row["max_maf"],
                *to_common_tuple(values),
            ),
        )


def insert_barrages_discharge(
    connection: sqlite3.Connection,
    report_id: int,
    rows: Iterable[dict[str, object]],
) -> None:
    sql = """
        INSERT INTO barrages_discharge (
            report_id,
            row_order,
            river_group,
            station,
            today,
            last_year,
            avg_last_5_years,
            avg_last_10_years,
            variation_percent,
            variation_trend,
            variation_band
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    for row in rows:
        values = row["values"]
        if not isinstance(values, CommonValues):
            raise ValueError("Invalid common values for barrages_discharge.")
        connection.execute(
            sql,
            (
                report_id,
                row["row_order"],
                row["river_group"],
                row["station"],
                *to_common_tuple(values),
            ),
        )


def insert_sections(
    connection: sqlite3.Connection,
    report_id: int,
    sections: dict[str, list[dict[str, object]]],
) -> None:
    insert_simple_rows(connection, "river_inflows", "station", report_id, sections["river_inflows"])
    insert_simple_rows(connection, "skardu_temperature", "metric", report_id, sections["skardu_temperature"])
    insert_simple_rows(
        connection,
        "reservoir_outflows",
        "reservoir_or_channel",
        report_id,
        sections["reservoir_outflows"],
    )
    insert_simple_rows(
        connection,
        "irsa_indent_at_reservoirs",
        "reservoir",
        report_id,
        sections["irsa_indent_at_reservoirs"],
    )
    insert_reservoir_levels(connection, report_id, sections["reservoir_levels"])
    insert_reservoir_storages(connection, report_id, sections["reservoir_storages"])
    insert_barrages_discharge(connection, report_id, sections["barrages_discharge"])


def archive_pdf(pdf_path: Path, archive_dir: Path, report_date: str) -> Path:
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_path = archive_dir / f"{report_date}.pdf"
    shutil.copy2(pdf_path, archive_path)
    return archive_path


def ingest_pdf(pdf_path: Path, db_path: Path, archive_dir: Path) -> bool:
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    source_sha256 = sha256_file(pdf_path)
    with connect_db(db_path) as connection:
        create_schema(connection)

        duplicate_id = get_report_id_by_hash(connection, source_sha256)
        if duplicate_id is not None:
            print(f"[INFO] PDF already ingested as report id {duplicate_id}; no changes made.")
            return False

        payload = extract_pdf_payload(pdf_path)
        report_date = str(payload["report_date"])
        archive_path = archive_pdf(pdf_path, archive_dir, report_date)

        with connection:
            report_id = upsert_report(
                connection=connection,
                report_date=report_date,
                source_sha256=source_sha256,
                source_pdf_path=pdf_path,
                historical_pdf_path=archive_path,
                page_count=int(payload["page_count"]),
            )
            sections = payload["sections"]
            if not isinstance(sections, dict):
                raise ValueError("Parsed payload has invalid sections.")
            insert_sections(connection, report_id, sections)

    print(f"[INFO] Ingested report date {report_date} into {db_path}")
    print(f"[INFO] Archived PDF to {archive_path}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract Daily Water Situation PDF tables into SQLite."
    )
    parser.add_argument("--pdf", default=str(DEFAULT_PDF_PATH), help="Path to Daily Water Situation.pdf")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="Path to SQLite database")
    parser.add_argument(
        "--archive-dir",
        default=str(DEFAULT_ARCHIVE_DIR),
        help="Directory for historical Daily Water Situation PDFs",
    )
    args = parser.parse_args()

    ingest_pdf(Path(args.pdf), Path(args.db), Path(args.archive_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
