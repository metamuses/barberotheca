"""
Convert entities metadata from CSV to JSON format.
"""

from pathlib import Path
import csv
import json

ROOT_DIR = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT_DIR / "metadata" / "entities-authoritative.csv"
JSON_FILE = ROOT_DIR / "website" / "data" / "entities-authoritative.json"


def main():
    data = []
    # Map wikidata URL to index in data list
    wikidata_map = {}

    # Load existing data if available
    if JSON_FILE.exists():
        try:
            with JSON_FILE.open(encoding="utf-8") as json_file:
                existing_data = json.load(json_file)
                if isinstance(existing_data, list):
                    data = existing_data
                    # Build index
                    for i, item in enumerate(data):

                        if "wikidata" in item and item["wikidata"]:
                            wikidata_map[item["wikidata"]] = i

            print(f" Loaded {len(data)} existing entities.")
        except json.JSONDecodeError:
            print(" Error decoding existing JSON. Starting fresh.")
        except Exception as e:
            print(f" Error loading existing JSON: {e}")

    try:
        new_count = 0
        with CSV_FILE.open(encoding="utf-8") as csv_file:
            # simple conversion: read all columns dynamically
            csv_reader = csv.DictReader(csv_file)

            for row in csv_reader:
                entity_name = row.get("entity")
                wikidata_url = row.get("wikidata")

                # Check for duplicates by Wikidata ID
                if wikidata_url and wikidata_url in wikidata_map:
                    # Duplicate found: Merge into 'entity'
                    idx = wikidata_map[wikidata_url]
                    existing_item = data[idx]

                    current_entity_val = existing_item["entity"]

                    # Convert to list if it's a string
                    if isinstance(current_entity_val, str):
                        existing_item["entity"] = [current_entity_val]

                    # Add new name if not present
                    if entity_name and entity_name not in existing_item["entity"]:
                        existing_item["entity"].append(entity_name)
                        print(
                            f"Merged '{entity_name}' into existing entity list: {existing_item['entity']}"
                        )

                    continue

                # New Item
                # data.append(row) -> row['entity'] is a string initially.
                # structure is fine.

                # Add row to data list.
                data.append(row)
                new_count += 1

                if wikidata_url:
                    wikidata_map[wikidata_url] = len(data) - 1

                if wikidata_url:
                    wikidata_map[wikidata_url] = len(data) - 1

        # Ensure the directory exists
        JSON_FILE.parent.mkdir(parents=True, exist_ok=True)

        with JSON_FILE.open("w", encoding="utf-8") as json_file:
            json.dump(data, json_file, ensure_ascii=False, indent=2)

        print(f" Converted. Added {new_count} new rows. Total entities: {len(data)}")

    except FileNotFoundError:
        print(f" Error: File not found at {CSV_FILE}")
    except Exception as e:
        print(f" Error converting file: {e}")


if __name__ == "__main__":
    main()
