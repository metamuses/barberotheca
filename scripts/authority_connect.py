"""
Connect English Wikipedia pages to their corresponding Wikidata and VIAF entries.
"""

import csv
import sys
from urllib.parse import urlparse, unquote
import requests

HEADERS = {"User-Agent": "barberotheca bot/1.0"}
TIMEOUT = 10


def get_wikidata_and_viaf(en_wiki_url):
    """
    Extracts Wikidata URL and VIAF URL using the English Wikipedia page title.
    """
    if not en_wiki_url:
        return "", ""

    # Extract the title from the English Wikipedia URL
    parsed = urlparse(en_wiki_url)
    # unquote handles URL-encoded characters like %20 or non-ASCII chars
    title = unquote(parsed.path.split("/wiki/")[-1])

    qid = None
    wd_url = ""
    viaf_url = ""

    # Get Wikidata Q-ID from Wikipedia API
    try:
        r = requests.get(
            "https://en.wikipedia.org/w/api.php",
            headers=HEADERS,
            timeout=TIMEOUT,
            params={
                "action": "query",
                "prop": "pageprops",
                "titles": title,
                "format": "json",
                "redirects": 1,  # Follow redirects if the title changed
            },
        )
        r.raise_for_status()
        data = r.json()
        pages = data.get("query", {}).get("pages", {})

        # Get the first page in the result
        page = next(iter(pages.values()))
        qid = page.get("pageprops", {}).get("wikibase_item")

        if qid:
            wd_url = f"https://www.wikidata.org/wiki/{qid}"
    except Exception as e:
        print(f"Error fetching Wikidata ID for {title}: {e}")

    # Get VIAF ID from Wikidata API (Property P214)
    if qid:
        try:
            r2 = requests.get(
                "https://www.wikidata.org/w/api.php",
                headers=HEADERS,
                timeout=TIMEOUT,
                params={
                    "action": "wbgetclaims",
                    "entity": qid,
                    "property": "P214",
                    "format": "json",
                },
            )
            r2.raise_for_status()
            claims = r2.json().get("claims", {})
            if "P214" in claims:
                viaf_id = claims["P214"][0]["mainsnak"]["datavalue"]["value"]
                viaf_url = f"https://viaf.org/viaf/{viaf_id}/"
        except Exception as e:
            print(f"Error fetching VIAF for {qid}: {e}")

    return wd_url, viaf_url


def enrich_csv(input_csv, output_csv):
    with open(input_csv, newline="", encoding="utf-8") as f_in, open(
        output_csv, "w", newline="", encoding="utf-8"
    ) as f_out:

        # Input columns: entity, wikipedia_it, wikipedia_en
        reader = csv.DictReader(f_in)
        fieldnames = ["entity", "wikipedia_it", "wikipedia_en", "wikidata", "viaf"]
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            en_url = row.get("wikipedia_en", "").strip()
            print(f"Processing: {en_url}...")

            wd, viaf = get_wikidata_and_viaf(en_url)

            writer.writerow(
                {
                    "entity": row.get("entity", ""),
                    "wikipedia_it": row.get("wikipedia_it", ""),
                    "wikipedia_en": en_url,
                    "wikidata": wd,
                    "viaf": viaf,
                }
            )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python authority_connect.py input.csv output.csv")
        sys.exit(1)

    enrich_csv(sys.argv[1], sys.argv[2])
