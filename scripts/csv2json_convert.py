"""
Convert metadata from CSV to JSON format with column selection and type conversion.
"""

from pathlib import Path
import csv
import json

ROOT_DIR = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT_DIR / "metadata" / "barbero.csv"
JSON_FILE = ROOT_DIR / "metadata" / "barbero.json"

SELECTED_COLUMNS = [
    "event",
    "event_year",
    "macrotheme_title",
    "lectio_num",
    "lectio_title",
    "semantic_filename",
    "source_url",
    "keywords",
    "entities",
]
INT_COLUMNS = ["event_year", "lectio_num"]
ARRAY_COLUMNS = ["keywords", "entities"]

data = []
with CSV_FILE.open(encoding="utf-8") as csv_file:
    csv_reader = csv.DictReader(csv_file, delimiter=",")

    for index, row in enumerate(csv_reader, start=1):
        item = {"id": index}
        for column in SELECTED_COLUMNS:
            value = row.get(column, "")

            if column in INT_COLUMNS:
                value = int(value)
            elif column in ARRAY_COLUMNS:
                value = [v.strip() for v in value.split(",")]

            item[column] = value
        data.append(item)

with JSON_FILE.open("w", encoding="utf-8") as json_file:
    json.dump(data, json_file, ensure_ascii=False, indent=2)

print(f"✅ Converted {len(data)} rows to {JSON_FILE.name}")
