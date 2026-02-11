import csv
import os
import urllib.request
import json
import time


def is_human(wikidata_url):
    """
    Checks if a Wikidata entity is an instance of human (Q5).
    """
    try:
        # Extract QID from URL (e.g., https://www.wikidata.org/entity/Q306658 -> Q306658)
        if "wikidata.org/entity/" not in wikidata_url:
            return False

        qid = wikidata_url.split("/")[-1]

        # SPARQL query to check if instance of (P31) human (Q5)
        query = f"""
        ASK {{
          wd:{qid} wdt:P31 wd:Q5 .
        }}
        """

        # URL encode the query
        encoded_query = urllib.parse.quote(query)
        url = f"https://query.wikidata.org/sparql?query={encoded_query}&format=json"

        # Create request with a User-Agent (required by Wikidata policy)
        req = urllib.request.Request(url)
        req.add_header(
            "User-Agent",
            "BarberothequeEntityExpansionScript/1.0 (mailto:your_email@example.com)",
        )

        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return data.get("boolean", False)

    except Exception as e:
        print(f"Error checking Wikidata for {wikidata_url}: {e}")
        return False
    finally:
        # Be polite to the API
        time.sleep(0.5)


def main():
    # Determine the absolute path to the CSV file
    # Assumes the script is in 'scripts/' and csv is in 'metadata/' sibling directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    csv_path = os.path.join(project_root, "metadata", "entities-authoritative.csv")

    print(f"Processing file: {csv_path}")

    rows = []
    header = []

    # Read the CSV
    try:
        with open(csv_path, mode="r", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            header = reader.fieldnames

            if not header:
                print("Error: CSV file is empty or has no header.")
                return

            if "type" not in header:
                header.append("type")

            for row in reader:
                # Check if type is already populated, if so, skip processing
                current_type = (row.get("type") or "").strip()
                if current_type:
                    rows.append(row)
                    continue

                # Check for existing place type from geonames
                is_place = False
                if row.get("geonames") and row["geonames"].strip():
                    row["type"] = "place"
                    is_place = True

                # If not a place, check if it is a person via Wikidata
                # Only check if type is empty or we are overwriting empty default

                if not is_place and (not current_type or current_type == "person"):
                    wikidata_url = row.get("wikidata", "").strip()
                    if wikidata_url:
                        if is_human(wikidata_url):
                            row["type"] = "person"
                            print(f"Identified person: {row['entity']}")
                        else:
                            # If we checked and it's not human, leave as is (likely empty)
                            pass

                # Ensure type key exists if it was missing
                if "type" not in row:
                    row["type"] = ""

                rows.append(row)
    except FileNotFoundError:
        print(f"Error: File not found at {csv_path}")
        return

    # Write the updated CSV
    try:
        with open(csv_path, mode="w", encoding="utf-8", newline="") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=header)
            writer.writeheader()
            writer.writerows(rows)
        print("Completed. Added 'type' column and populated 'place' where applicable.")
    except Exception as e:
        print(f"Error writing to file: {e}")


if __name__ == "__main__":
    main()
