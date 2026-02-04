"""
Convert entities metadata from CSV to JSON format.
"""

from pathlib import Path
import csv
import json

ROOT_DIR = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT_DIR / "metadata" / "entities-authoritative.csv"
JSON_FILE = ROOT_DIR / "html" / "data" / "entities-authoritative.json"


def main():
    data = []
    existing_entities = set()

    # Load existing data if available
    if JSON_FILE.exists():
        try:
            with JSON_FILE.open(encoding="utf-8") as json_file:
                existing_data = json.load(json_file)
                if isinstance(existing_data, list):
                    data = existing_data
                    # Create a set of existing entity names for fast lookup
                    for item in data:
                        if "entity" in item:
                            existing_entities.add(item["entity"])
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
                
                # If entity already exists, skip it
                if entity_name and entity_name in existing_entities:
                    continue

                # Add row to data list. 
                # DictReader reads values as strings, which is appropriate here.
                data.append(row)
                new_count += 1
                
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
