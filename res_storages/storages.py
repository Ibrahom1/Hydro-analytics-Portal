import argparse
import importlib
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


def extract_from_pdf_tables(pdf_path: Path) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
	levels: Dict[str, str] = {}
	storage_today: Dict[str, str] = {}
	storage_max: Dict[str, str] = {}

	with pdfplumber.open(str(pdf_path)) as pdf:
		for page in pdf.pages:
			tables = page.extract_tables() or []
			for table in tables:
				rows = [[normalize_cell(cell) for cell in row] for row in table if row]
				if not rows:
					continue

				today_idx = find_today_index(rows)

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

						max_match = re.search(r"\bmax\s*([\d,]+\.?\d*)", first_cell, flags=re.IGNORECASE)
						if max_match:
							storage_max[dam] = max_match.group(1).replace(",", "")
							pending_max_for = None
						else:
							pending_max_for = dam

	return levels, storage_today, storage_max


def extract_with_ocr(pdf_path: Path) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
	try:
		fitz = importlib.import_module("fitz")  # PyMuPDF
		pytesseract = importlib.import_module("pytesseract")
		image_module = importlib.import_module("PIL.Image")
	except ImportError:
		return {}, {}, {}

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


def parse_ocr_text(text: str) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
	levels: Dict[str, str] = {}
	storage_today: Dict[str, str] = {}
	storage_max: Dict[str, str] = {}

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
			numbers = re.findall(r"\d[\d,]*\.?\d*", dam_block_match.group(0))
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
			all_numbers = re.findall(r"\d[\d,]*\.?\d*", block)

			if all_numbers:
				storage_today[dam] = all_numbers[-1].replace(",", "")
			if max_match:
				storage_max[dam] = max_match.group(1).replace(",", "")

	return levels, storage_today, storage_max


def validate_extraction(levels: Dict[str, str], storage_today: Dict[str, str], storage_max: Dict[str, str]) -> None:
	missing = []
	for dam in DAM_KEYS:
		if dam not in levels or not levels[dam].strip():
			missing.append(f"level:{dam}")
		if dam not in storage_today or not storage_today[dam].strip():
			missing.append(f"storage_today:{dam}")
		if dam not in storage_max or not storage_max[dam].strip():
			missing.append(f"storage_max:{dam}")
	if missing:
		raise ValueError("Could not extract required values: " + ", ".join(missing))


def compute_percentages(storage_today: Dict[str, str], storage_max: Dict[str, str]) -> Dict[str, int]:
	percentages: Dict[str, int] = {}
	for dam in DAM_KEYS:
		today = safe_float(storage_today[dam])
		max_value = safe_float(storage_max[dam])
		if max_value <= 0:
			raise ValueError(f"Invalid Max storage for {dam}: {storage_max[dam]}")
		percentages[dam] = int(round((today / max_value) * 100))
	return percentages


def replace_js_variable(content: str, variable_name: str, rhs_value: str) -> str:
	pattern = re.compile(rf"(let\s+{re.escape(variable_name)}\s*=\s*)([^\r\n]+)")
	updated, count = pattern.subn(rf"\g<1>{rhs_value}", content, count=1)
	if count != 1:
		raise ValueError(f"Could not update variable '{variable_name}' in ft_and_percentage.js")
	return updated


def update_js_file(js_path: Path, levels: Dict[str, str], percentages: Dict[str, int], dry_run: bool) -> None:
	content = js_path.read_text(encoding="utf-8")

	replacements = {
		"val_Tarbela": f"'{levels['Tarbela']}'",
		"val_Mangla": f"'{levels['Mangla']}'",
		"val_Chashma": f"'{levels['Chashma']}'",
		"fillPercentage_Tarbela": str(percentages["Tarbela"]),
		"fillPercentage_Mangla": str(percentages["Mangla"]),
		"fillPercentage_Chashma": str(percentages["Chashma"]),
	}

	for var_name, rhs in replacements.items():
		content = replace_js_variable(content, var_name, rhs)

	if dry_run:
		print("[DRY-RUN] ft_and_percentage.js update skipped.")
		return

	tmp_path = js_path.with_suffix(js_path.suffix + ".tmp")
	tmp_path.write_text(content, encoding="utf-8")
	tmp_path.replace(js_path)


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
	parser.add_argument("--dry-run", action="store_true", help="Extract and calculate without writing JS file")
	args = parser.parse_args()

	pdf_path = Path(args.pdf)
	js_path = Path(args.js)

	if not pdf_path.exists():
		raise FileNotFoundError(f"PDF not found: {pdf_path}")
	if not js_path.exists():
		raise FileNotFoundError(f"JS file not found: {js_path}")

	print(f"[INFO] Reading PDF: {pdf_path}")
	levels, storage_today, storage_max = extract_from_pdf_tables(pdf_path)

	if any(dam not in levels or dam not in storage_today or dam not in storage_max for dam in DAM_KEYS):
		print("[WARN] Table extraction incomplete. Trying OCR fallback...")
		ocr_levels, ocr_storage_today, ocr_storage_max = extract_with_ocr(pdf_path)

		if not (ocr_levels or ocr_storage_today or ocr_storage_max):
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

	validate_extraction(levels, storage_today, storage_max)
	percentages = compute_percentages(storage_today, storage_max)

	print("[INFO] Extracted reservoir levels (ft):")
	for dam in DAM_KEYS:
		print(f"  {dam}: {levels[dam]}")

	print("[INFO] Extracted storages (Today / Max):")
	for dam in DAM_KEYS:
		print(f"  {dam}: {storage_today[dam]} / {storage_max[dam]}")

	print("[INFO] Computed fill percentages:")
	for dam in DAM_KEYS:
		print(f"  {dam}: {percentages[dam]}%")

	update_js_file(js_path, levels, percentages, dry_run=args.dry_run)
	if not args.dry_run:
		print(f"[INFO] Updated JS: {js_path}")

	return 0


if __name__ == "__main__":
	try:
		raise SystemExit(main())
	except Exception as exc:
		print(f"[ERROR] {exc}")
		raise SystemExit(1)
