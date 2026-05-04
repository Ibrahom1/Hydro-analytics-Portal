import argparse
import importlib
import json
import re
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

try:
	import pdfplumber
except ImportError as exc:  # pragma: no cover - runtime dependency check
	raise SystemExit(
		"Missing dependency: pdfplumber. Install with: pip install pdfplumber"
	) from exc


DAM_KEYS = ("Tarbela", "Mangla", "Chashma")
INDIAN_DAM_SNAPSHOT_KEYS = {
	"Thein": "thein_dam",
	"Pong": "pong_dam",
	"Bhakra": "bhakra",
}
INDIAN_SNAPSHOT_FIELDS = (
	"current_reservoir_level_ft",
	"current_year",
	"last_year",
	"normal_storage",
)
DEFAULT_SNAPSHOT_JSON = Path(__file__).resolve().parent.parent / "data" / "current_reservoir_snapshot.json"
LAST_YEAR_HEADER_HINTS = (
	"last year",
	"previous year",
	"ly",
)
AVG_5_YEAR_HEADER_HINTS = (
	"average last 5 years",
	"average last 5 year",
	"average last 5 years avg",
	"average last 5-years",
	"avg last 5 years",
	"avg last 5 year",
	"last 5 years avg",
	"5 years avg",
	"5 year avg",
	"avg 5 years",
	"avg 5 year",
)
VARIATION_HEADER_HINTS = (
	"variation w r t last 5 years avg",
	"variation w.r.t last 5 years avg",
	"variation wrt last 5 years avg",
	"variation w r t",
	"variation",
	"change vs",
	"change w r t",
	"% variation",
)


def normalize_cell(value: Optional[str]) -> str:
	if value is None:
		return ""
	return re.sub(r"\s+", " ", str(value)).strip()


def extract_number_token(text: str) -> Optional[str]:
	if not text:
		return None
	match = re.search(r"-?\d[\d,]*\.?\d*", text)
	if not match:
		return None
	return match.group(0).replace(",", "").strip()


def safe_float(number_text: str) -> float:
	return float(number_text.replace(",", "").strip())


def format_js_numeric(value: float) -> str:
	rounded = round(value, 2)
	if abs(rounded) < 0.005:
		rounded = 0.0
	return f"{rounded:.2f}"


def load_indian_snapshot_values(snapshot_json_path: Path) -> Optional[Dict[str, Dict[str, float]]]:
	if not snapshot_json_path.exists():
		print(f"[WARN] Snapshot JSON not found, skipping Indian dam updates: {snapshot_json_path}")
		return None

	try:
		payload = json.loads(snapshot_json_path.read_text(encoding="utf-8"))
	except Exception as exc:
		print(f"[WARN] Could not read snapshot JSON, skipping Indian dam updates: {exc}")
		return None

	try:
		parsed_values: Dict[str, Dict[str, float]] = {}
		for js_dam_name, snapshot_key in INDIAN_DAM_SNAPSHOT_KEYS.items():
			raw_snapshot = payload[snapshot_key]
			if not isinstance(raw_snapshot, dict):
				raise ValueError(f"Invalid snapshot block for '{snapshot_key}'")

			parsed_values[js_dam_name] = {
				field_name: float(raw_snapshot[field_name])
				for field_name in INDIAN_SNAPSHOT_FIELDS
			}
		return parsed_values
	except Exception as exc:
		print(f"[WARN] Incomplete/invalid snapshot JSON, skipping Indian dam updates: {exc}")
		return None


def normalize_header_cell(value: Optional[str]) -> str:
	text = normalize_cell(value)
	text = text.lower()
	text = re.sub(r"[^a-z0-9%]+", " ", text)
	return re.sub(r"\s+", " ", text).strip()


def match_dam(name_text: str) -> Optional[str]:
	lower_name = name_text.lower()
	if "tarbela" in lower_name:
		return "Tarbela"
	if "mangla" in lower_name:
		return "Mangla"
	if "chashma" in lower_name:
		return "Chashma"
	return None


def find_today_index(rows: list[list[str]]) -> Optional[int]:
	for row in rows:
		for idx, cell in enumerate(row):
			if "today" in cell.lower():
				return idx
	return None


def pick_today_value(row: list[str], today_idx: Optional[int]) -> Optional[str]:
	candidates = []
	if today_idx is not None and today_idx < len(row):
		candidates.append(row[today_idx])

	# Fallback for compact/mobile table layouts where Today may be the second column.
	if len(row) > 1:
		candidates.append(row[1])

	for candidate in candidates:
		token = extract_number_token(candidate)
		if token is not None:
			return token
	return None


def find_column_index_by_hints(rows: list[list[str]], hints: tuple[str, ...]) -> Optional[int]:
	normalized_hints = tuple(normalize_header_cell(hint) for hint in hints)
	for row in rows:
		for idx, cell in enumerate(row):
			normalized_cell = normalize_header_cell(cell)
			if not normalized_cell:
				continue
			if any(hint in normalized_cell for hint in normalized_hints):
				return idx
	return None


def pick_value_at_index(row: list[str], column_idx: Optional[int]) -> Optional[str]:
	if column_idx is None or column_idx >= len(row):
		return None
	return extract_number_token(row[column_idx])


def pick_cell_text_at_index(row: list[str], column_idx: Optional[int]) -> Optional[str]:
	if column_idx is None or column_idx >= len(row):
		return None
	text = normalize_cell(row[column_idx])
	return text if text else None


def pick_last_numeric_token(row: list[str]) -> Optional[str]:
	for cell in reversed(row):
		token = extract_number_token(cell)
		if token is not None:
			return token
	return None


def variation_meta_from_text(value_text: str, source_text: str) -> Tuple[str, str]:
	if "▼" in source_text:
		return "▼", "decrease"
	if "▲" in source_text:
		return "▲", "increase"

	try:
		numeric_value = safe_float(value_text)
	except ValueError:
		return "▲", "increase"

	if numeric_value < 0:
		return "▼", "decrease"
	return "▲", "increase"


def missing_required_values(*value_maps: Dict[str, str]) -> bool:
	for dam in DAM_KEYS:
		for value_map in value_maps:
			if dam not in value_map:
				return True
	return False


def parse_page_text_sections(
	page_text: str,
	levels: Dict[str, str],
	storage_today: Dict[str, str],
	storage_max: Dict[str, str],
	last_year_levels: Dict[str, str],
	avg5_year_levels: Dict[str, str],
	variation5_year: Dict[str, str],
	variation5_year_arrow: Dict[str, str],
	variation5_year_trend: Dict[str, str],
) -> None:
	if not page_text.strip():
		return

	levels_match = re.search(
		r"reservoir\s+levels\s+in\s*ft[\s\S]*?(?=reservoir\s+storages\s+in\s+maf|$)",
		page_text,
		flags=re.IGNORECASE,
	)
	storages_match = re.search(
		r"reservoir\s+storages\s+in\s+maf[\s\S]*?(?=barrages\s+discharge|$)",
		page_text,
		flags=re.IGNORECASE,
	)

	levels_lines = [line.strip() for line in (levels_match.group(0).splitlines() if levels_match else []) if line.strip()]
	storages_lines = [line.strip() for line in (storages_match.group(0).splitlines() if storages_match else []) if line.strip()]

	for dam in DAM_KEYS:
		if dam not in levels:
			for idx, line in enumerate(levels_lines):
				if line.lower() != dam.lower():
					continue
				for look_ahead in range(idx + 1, min(len(levels_lines), idx + 5)):
					mol_line = levels_lines[look_ahead]
					if not mol_line.lower().startswith("mol"):
						continue
					numbers = re.findall(r"[-+]?\d[\d,]*\.?\d*", mol_line)
					if len(numbers) >= 6:
						if dam not in levels:
							levels[dam] = numbers[1].replace(",", "")
					break
				break

		# Storage section is the source-of-truth for 5-year variation values.
		for idx, line in enumerate(storages_lines):
			if line.lower() != dam.lower():
				continue

			storage_numbers: list[str] = []
			storage_value_text_parts: list[str] = []

			for look_ahead in range(idx + 1, min(len(storages_lines), idx + 7)):
				candidate_line = storages_lines[look_ahead]
				if candidate_line.lower().startswith("max"):
					continue
				numbers = re.findall(r"[-+]?\d[\d,]*\.?\d*", candidate_line)
				if not numbers:
					continue
				storage_value_text_parts.append(candidate_line)
				storage_numbers.extend(number.replace(",", "") for number in numbers)
				if len(storage_numbers) >= 5:
					break

			for look_ahead in range(idx + 1, min(len(storages_lines), idx + 7)):
				max_line = storages_lines[look_ahead]
				if not max_line.lower().startswith("max"):
					continue
				numbers = re.findall(r"[-+]?\d[\d,]*\.?\d*", max_line)
				if numbers and dam not in storage_max:
					storage_max[dam] = numbers[0].replace(",", "")
				break

			if storage_numbers:
				storage_today[dam] = storage_numbers[0]
				if len(storage_numbers) >= 2:
					last_year_levels[dam] = storage_numbers[1]
				if len(storage_numbers) >= 3:
					avg5_year_levels[dam] = storage_numbers[2]
				variation_value = storage_numbers[-1]
				variation5_year[dam] = variation_value
				variation_source_text = " ".join(storage_value_text_parts)
				arrow_symbol, trend_label = variation_meta_from_text(variation_value, variation_source_text)
				variation5_year_arrow[dam] = arrow_symbol
				variation5_year_trend[dam] = trend_label
			break


def extract_from_pdf_tables(
	pdf_path: Path,
) -> Tuple[
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
]:
	levels: Dict[str, str] = {}
	storage_today: Dict[str, str] = {}
	storage_max: Dict[str, str] = {}
	last_year_levels: Dict[str, str] = {}
	avg5_year_levels: Dict[str, str] = {}
	variation5_year: Dict[str, str] = {}
	variation5_year_arrow: Dict[str, str] = {}
	variation5_year_trend: Dict[str, str] = {}

	with pdfplumber.open(str(pdf_path)) as pdf:
		for page in pdf.pages:
			page_text = page.extract_text() or ""
			tables = page.extract_tables() or []
			for table in tables:
				rows = [[normalize_cell(cell) for cell in row] for row in table if row]
				if not rows:
					continue

				today_idx = find_today_index(rows)
				last_year_idx = find_column_index_by_hints(rows, LAST_YEAR_HEADER_HINTS)
				avg_5_year_idx = find_column_index_by_hints(rows, AVG_5_YEAR_HEADER_HINTS)
				variation_idx = find_column_index_by_hints(rows, VARIATION_HEADER_HINTS)

				# pdfplumber often extracts levels/storages as separate tables without section headers.
				first_column_text = " ".join((row[0] if row else "") for row in rows).lower()
				is_levels_table = (
					("reservoir levels in ft" in first_column_text)
					or ("mol" in first_column_text and "mcl" in first_column_text)
				)
				is_storage_table = (
					("reservoir storages in maf" in first_column_text)
					or ("max" in first_column_text and any(match_dam(row[0] if row else "") for row in rows))
				)

				if is_levels_table:
					for row in rows:
						first_cell = row[0] if row else ""
						dam = match_dam(first_cell)
						if not dam:
							continue
						value = pick_today_value(row, today_idx)
						if value:
							levels[dam] = value

				if is_storage_table:
					pending_max_for: Optional[str] = None
					for row in rows:
						first_cell = row[0] if row else ""
						dam = match_dam(first_cell)

						# Handle a split row where "Max ..." appears on the next line.
						if pending_max_for and first_cell.lower().startswith("max"):
							max_value = extract_number_token(first_cell)
							if max_value:
								storage_max[pending_max_for] = max_value
							pending_max_for = None

						if not dam:
							continue

						today_value = pick_today_value(row, today_idx)
						if today_value:
							storage_today[dam] = today_value

						last_year_value = pick_value_at_index(row, last_year_idx)
						avg_5_year_value = pick_value_at_index(row, avg_5_year_idx)
						row_numbers = re.findall(r"[-+]?\d[\d,]*\.?\d*", " ".join(row))

						if not last_year_value and today_idx is not None:
							last_year_value = pick_value_at_index(row, today_idx + 1)
						if not avg_5_year_value and today_idx is not None:
							avg_5_year_value = pick_value_at_index(row, today_idx + 2)

						if last_year_value:
							last_year_levels[dam] = last_year_value
						if avg_5_year_value:
							avg5_year_levels[dam] = avg_5_year_value

						variation_value = pick_value_at_index(row, variation_idx)
						if not variation_value:
							if row_numbers:
								variation_value = row_numbers[-1].replace(",", "")
						if variation_value:
							variation5_year[dam] = variation_value
							row_text = " ".join(row)
							arrow_symbol, trend_label = variation_meta_from_text(variation_value, row_text)
							variation5_year_arrow[dam] = arrow_symbol
							variation5_year_trend[dam] = trend_label

						max_match = re.search(r"\bmax\s*([\d,]+\.?\d*)", first_cell, flags=re.IGNORECASE)
						if max_match:
							storage_max[dam] = max_match.group(1).replace(",", "")
							pending_max_for = None
						else:
							pending_max_for = dam

			parse_page_text_sections(
				page_text,
				levels,
				storage_today,
				storage_max,
				last_year_levels,
				avg5_year_levels,
				variation5_year,
				variation5_year_arrow,
				variation5_year_trend,
			)

	return (
		levels,
		storage_today,
		storage_max,
		last_year_levels,
		avg5_year_levels,
		variation5_year,
		variation5_year_arrow,
		variation5_year_trend,
	)


def extract_with_ocr(
	pdf_path: Path,
) -> Tuple[
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
]:
	try:
		fitz = importlib.import_module("fitz")  # PyMuPDF
		pytesseract = importlib.import_module("pytesseract")
		image_module = importlib.import_module("PIL.Image")
	except ImportError:
		return {}, {}, {}, {}, {}, {}, {}, {}

	full_text_parts = []
	doc = fitz.open(str(pdf_path))
	try:
		for page in doc:
			pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
			image = image_module.frombytes("RGB", [pix.width, pix.height], pix.samples)
			full_text_parts.append(pytesseract.image_to_string(image))
	finally:
		doc.close()

	full_text = "\n".join(full_text_parts)
	return parse_ocr_text(full_text)


def parse_ocr_text(
	text: str,
) -> Tuple[
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
	Dict[str, str],
]:
	levels: Dict[str, str] = {}
	storage_today: Dict[str, str] = {}
	storage_max: Dict[str, str] = {}
	last_year_levels: Dict[str, str] = {}
	avg5_year_levels: Dict[str, str] = {}
	variation5_year: Dict[str, str] = {}
	variation5_year_arrow: Dict[str, str] = {}
	variation5_year_trend: Dict[str, str] = {}

	levels_section_match = re.search(
		r"reservoir\s+levels\s+in\s+ft[\s\S]*?(?=reservoir\s+storages\s+in\s+maf|$)",
		text,
		flags=re.IGNORECASE,
	)
	storages_section_match = re.search(
		r"reservoir\s+storages\s+in\s+maf[\s\S]*",
		text,
		flags=re.IGNORECASE,
	)

	levels_section = levels_section_match.group(0) if levels_section_match else ""
	storages_section = storages_section_match.group(0) if storages_section_match else ""

	for dam in DAM_KEYS:
		# OCR text can be noisy; capture several numbers and choose likely candidates.
		dam_block_match = re.search(
			rf"{dam}[\s\S]{{0,220}}",
			levels_section,
			flags=re.IGNORECASE,
		)
		if dam_block_match:
			numbers = re.findall(r"[-+]?\d[\d,]*\.?\d*", dam_block_match.group(0))
			if numbers:
				# In this report layout, TODAY is usually after MOL/MCL values.
				candidate = numbers[2] if len(numbers) >= 3 else numbers[-1]
				levels[dam] = candidate.replace(",", "")

		storage_block_match = re.search(
			rf"{dam}[\s\S]{{0,120}}",
			storages_section,
			flags=re.IGNORECASE,
		)
		if storage_block_match:
			block = storage_block_match.group(0)
			max_match = re.search(r"\bmax\s*([\d,]+\.?\d*)", block, flags=re.IGNORECASE)
			all_numbers = re.findall(r"[-+]?\d[\d,]*\.?\d*", block)
			offset = 1 if max_match else 0

			if all_numbers:
				if max_match and len(all_numbers) >= 2:
					storage_today[dam] = all_numbers[1].replace(",", "")
				else:
					storage_today[dam] = all_numbers[0].replace(",", "")

				if len(all_numbers) > offset + 1:
					last_year_levels[dam] = all_numbers[offset + 1].replace(",", "")
				if len(all_numbers) > offset + 2:
					avg5_year_levels[dam] = all_numbers[offset + 2].replace(",", "")

				# For Pakistani dams, use storage-table variation as authoritative.
				if len(all_numbers) >= offset + 5:
					variation_value = all_numbers[-1].replace(",", "")
					variation5_year[dam] = variation_value
					arrow_symbol, trend_label = variation_meta_from_text(variation_value, block)
					variation5_year_arrow[dam] = arrow_symbol
					variation5_year_trend[dam] = trend_label
			if max_match:
				storage_max[dam] = max_match.group(1).replace(",", "")

	return (
		levels,
		storage_today,
		storage_max,
		last_year_levels,
		avg5_year_levels,
		variation5_year,
		variation5_year_arrow,
		variation5_year_trend,
	)


def validate_extraction(
	levels: Dict[str, str],
	storage_today: Dict[str, str],
	storage_max: Dict[str, str],
	last_year_levels: Dict[str, str],
	avg5_year_levels: Dict[str, str],
	variation5_year: Dict[str, str],
	variation5_year_arrow: Dict[str, str],
	variation5_year_trend: Dict[str, str],
) -> None:
	missing = []
	for dam in DAM_KEYS:
		if dam not in levels or not levels[dam].strip():
			missing.append(f"level:{dam}")
		if dam not in storage_today or not storage_today[dam].strip():
			missing.append(f"storage_today:{dam}")
		if dam not in storage_max or not storage_max[dam].strip():
			missing.append(f"storage_max:{dam}")
		if dam not in last_year_levels or not last_year_levels[dam].strip():
			missing.append(f"last_year_level:{dam}")
		if dam not in avg5_year_levels or not avg5_year_levels[dam].strip():
			missing.append(f"avg_5_year_level:{dam}")
		if dam not in variation5_year or not variation5_year[dam].strip():
			missing.append(f"variation_5_year:{dam}")
		if dam not in variation5_year_arrow or not variation5_year_arrow[dam].strip():
			missing.append(f"variation_5_year_arrow:{dam}")
		if dam not in variation5_year_trend or not variation5_year_trend[dam].strip():
			missing.append(f"variation_5_year_trend:{dam}")
	if missing:
		raise ValueError("Could not extract required values: " + ", ".join(missing))


def compute_percentages(storage_today: Dict[str, str], storage_max: Dict[str, str]) -> Dict[str, float]:
	percentages: Dict[str, float] = {}
	for dam in DAM_KEYS:
		today = safe_float(storage_today[dam])
		max_value = safe_float(storage_max[dam])
		if max_value <= 0:
			raise ValueError(f"Invalid Max storage for {dam}: {storage_max[dam]}")
		percentages[dam] = round((today / max_value) * 100, 2)
	return percentages


def replace_js_variable(content: str, variable_name: str, rhs_value: str) -> str:
	pattern = re.compile(rf"(let\s+{re.escape(variable_name)}\s*=\s*)([^\r\n]+)")
	updated, count = pattern.subn(rf"\g<1>{rhs_value}", content, count=1)
	if count != 1:
		raise ValueError(f"Could not update variable '{variable_name}' in ft_and_percentage.js")
	return updated


def update_js_file(
	js_path: Path,
	levels: Dict[str, str],
	percentages: Dict[str, float],
	last_year_levels: Dict[str, float],
	avg5_year_levels: Dict[str, float],
	variation5_year: Dict[str, str],
	variation5_year_arrow: Dict[str, str],
	variation5_year_trend: Dict[str, str],
	indian_snapshot_values: Optional[Dict[str, Dict[str, float]]],
	dry_run: bool,
) -> None:
	content = js_path.read_text(encoding="utf-8")

	replacements = {
		"val_Tarbela": f"'{levels['Tarbela']}'",
		"val_Mangla": f"'{levels['Mangla']}'",
		"val_Chashma": f"'{levels['Chashma']}'",
		"lastYearLevel_Tarbela": format_js_numeric(last_year_levels["Tarbela"]),
		"lastYearLevel_Mangla": format_js_numeric(last_year_levels["Mangla"]),
		"lastYearLevel_Chashma": format_js_numeric(last_year_levels["Chashma"]),
		"avg5YearLevel_Tarbela": format_js_numeric(avg5_year_levels["Tarbela"]),
		"avg5YearLevel_Mangla": format_js_numeric(avg5_year_levels["Mangla"]),
		"avg5YearLevel_Chashma": format_js_numeric(avg5_year_levels["Chashma"]),
		"variation5Year_Tarbela": variation5_year["Tarbela"],
		"variation5Year_Mangla": variation5_year["Mangla"],
		"variation5Year_Chashma": variation5_year["Chashma"],
		"variation5YearArrow_Tarbela": f"'{variation5_year_arrow['Tarbela']}'",
		"variation5YearArrow_Mangla": f"'{variation5_year_arrow['Mangla']}'",
		"variation5YearArrow_Chashma": f"'{variation5_year_arrow['Chashma']}'",
		"variation5YearTrend_Tarbela": f"'{variation5_year_trend['Tarbela']}'",
		"variation5YearTrend_Mangla": f"'{variation5_year_trend['Mangla']}'",
		"variation5YearTrend_Chashma": f"'{variation5_year_trend['Chashma']}'",
		"fillPercentage_Tarbela": format_js_numeric(percentages["Tarbela"]),
		"fillPercentage_Mangla": format_js_numeric(percentages["Mangla"]),
		"fillPercentage_Chashma": format_js_numeric(percentages["Chashma"]),
	}

	for var_name, rhs in replacements.items():
		content = replace_js_variable(content, var_name, rhs)

	if indian_snapshot_values is not None:
		indian_replacements: Dict[str, str] = {}
		for js_dam_name, snapshot_values in indian_snapshot_values.items():
			indian_replacements[f"val_{js_dam_name}"] = f"'{snapshot_values['current_reservoir_level_ft']:.2f}'"
			indian_replacements[f"fillPercentage_{js_dam_name}"] = format_js_numeric(snapshot_values["current_year"])
			indian_replacements[f"fillPercentage_{js_dam_name}_last_year"] = format_js_numeric(snapshot_values["last_year"])
			indian_replacements[f"fillPercentage_{js_dam_name}_normal"] = format_js_numeric(snapshot_values["normal_storage"])

		for var_name, rhs in indian_replacements.items():
			content = replace_js_variable(content, var_name, rhs)

	if dry_run:
		print("[DRY-RUN] ft_and_percentage.js update skipped.")
		return

	tmp_path = js_path.with_suffix(js_path.suffix + ".tmp")
	tmp_path.write_text(content, encoding="utf-8")
	try:
		tmp_path.replace(js_path)
	except PermissionError:
		js_path.write_text(content, encoding="utf-8")
		try:
			tmp_path.unlink()
		except OSError:
			pass


def main() -> int:
	parser = argparse.ArgumentParser(
		description="Extract Tarbela/Mangla/Chashma levels + storage percentages from Daily Water Situation PDF."
	)
	parser.add_argument(
		"--pdf",
		default=str(Path(__file__).resolve().parent / "Daily Water Situation.pdf"),
		help="Path to Daily Water Situation.pdf",
	)
	parser.add_argument(
		"--js",
		default=str(Path(__file__).resolve().parent.parent / "script" / "ft_and_percentage.js"),
		help="Path to ft_and_percentage.js",
	)
	parser.add_argument(
		"--snapshot-json",
		default=str(DEFAULT_SNAPSHOT_JSON),
		help="Path to current_reservoir_snapshot.json for Indian dam updates",
	)
	parser.add_argument("--dry-run", action="store_true", help="Extract and calculate without writing JS file")
	args = parser.parse_args()

	pdf_path = Path(args.pdf)
	js_path = Path(args.js)
	snapshot_json_path = Path(args.snapshot_json)

	if not pdf_path.exists():
		raise FileNotFoundError(f"PDF not found: {pdf_path}")
	if not js_path.exists():
		raise FileNotFoundError(f"JS file not found: {js_path}")

	print(f"[INFO] Reading PDF: {pdf_path}")
	(
		levels,
		storage_today,
		storage_max,
		last_year_levels,
		avg5_year_levels,
		variation5_year,
		variation5_year_arrow,
		variation5_year_trend,
	) = extract_from_pdf_tables(pdf_path)

	if missing_required_values(
		levels,
		storage_today,
		storage_max,
		last_year_levels,
		avg5_year_levels,
		variation5_year,
		variation5_year_arrow,
		variation5_year_trend,
	):
		print("[WARN] Table extraction incomplete. Trying OCR fallback...")
		(
			ocr_levels,
			ocr_storage_today,
			ocr_storage_max,
			ocr_last_year_levels,
			ocr_avg5_year_levels,
			ocr_variation5_year,
			ocr_variation5_year_arrow,
			ocr_variation5_year_trend,
		) = extract_with_ocr(pdf_path)

		if not (
			ocr_levels
			or ocr_storage_today
			or ocr_storage_max
			or ocr_last_year_levels
			or ocr_avg5_year_levels
			or ocr_variation5_year
			or ocr_variation5_year_arrow
			or ocr_variation5_year_trend
		):
			print(
				"[WARN] OCR fallback unavailable. Install optional dependencies for OCR: "
				"pip install pymupdf pytesseract pillow"
			)

		for dam in DAM_KEYS:
			if dam not in levels and ocr_levels.get(dam):
				levels[dam] = ocr_levels[dam]
			if dam not in storage_today and ocr_storage_today.get(dam):
				storage_today[dam] = ocr_storage_today[dam]
			if dam not in storage_max and ocr_storage_max.get(dam):
				storage_max[dam] = ocr_storage_max[dam]
			if dam not in last_year_levels and ocr_last_year_levels.get(dam):
				last_year_levels[dam] = ocr_last_year_levels[dam]
			if dam not in avg5_year_levels and ocr_avg5_year_levels.get(dam):
				avg5_year_levels[dam] = ocr_avg5_year_levels[dam]
			if dam not in variation5_year and ocr_variation5_year.get(dam):
				variation5_year[dam] = ocr_variation5_year[dam]
			if dam not in variation5_year_arrow and ocr_variation5_year_arrow.get(dam):
				variation5_year_arrow[dam] = ocr_variation5_year_arrow[dam]
			if dam not in variation5_year_trend and ocr_variation5_year_trend.get(dam):
				variation5_year_trend[dam] = ocr_variation5_year_trend[dam]

	validate_extraction(
		levels,
		storage_today,
		storage_max,
		last_year_levels,
		avg5_year_levels,
		variation5_year,
		variation5_year_arrow,
		variation5_year_trend,
	)
	percentages = compute_percentages(storage_today, storage_max)
	last_year_percentages = compute_percentages(last_year_levels, storage_max)
	avg5_year_percentages = compute_percentages(avg5_year_levels, storage_max)

	print("[INFO] Extracted reservoir levels (ft):")
	for dam in DAM_KEYS:
		print(f"  {dam}: {levels[dam]}")

	print("[INFO] Extracted storages (Today / Max):")
	for dam in DAM_KEYS:
		print(f"  {dam}: {storage_today[dam]} / {storage_max[dam]}")

	print("[INFO] Computed fill percentages:")
	for dam in DAM_KEYS:
		print(f"  {dam}: {percentages[dam]}%")

	print("[INFO] Computed historical storage fill percentages and variation:")
	for dam in DAM_KEYS:
		console_arrow = "up" if variation5_year_trend[dam] == "increase" else "down"
		print(
			f"  {dam}: Last Year={last_year_percentages[dam]}%, "
			f"Avg5Years={avg5_year_percentages[dam]}%, Variation={variation5_year[dam]} {console_arrow}"
		)

	indian_snapshot_values = load_indian_snapshot_values(snapshot_json_path)
	if indian_snapshot_values is None:
		print("[WARN] Indian dam values kept as-is in ft_and_percentage.js")
	else:
		print(f"[INFO] Loaded Indian dam snapshot data: {snapshot_json_path}")

	update_js_file(
		js_path,
		levels,
		percentages,
		last_year_percentages,
		avg5_year_percentages,
		variation5_year,
		variation5_year_arrow,
		variation5_year_trend,
		indian_snapshot_values,
		dry_run=args.dry_run,
	)
	if not args.dry_run:
		print(f"[INFO] Updated JS: {js_path}")

	return 0


if __name__ == "__main__":
	try:
		raise SystemExit(main())
	except Exception as exc:
		print(f"[ERROR] {exc}")
		raise SystemExit(1)
