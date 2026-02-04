"""
Enrich entities JSON with images and coordinates from Wikidata.
"""

from pathlib import Path
import json
import urllib.request
import urllib.parse
import time
import re

ROOT_DIR = Path(__file__).resolve().parent.parent
JSON_FILE = ROOT_DIR / "html" / "data" / "entities-authoritative.json"

USER_AGENT = 'BarberothequeEntityExpansionScript/1.0 (mailto:your_email@example.com)'

def get_image(wikidata_url):
    """
    Fetches the image URL (P18) for a Wikidata entity.
    """
    try:
        if 'wikidata.org/wiki/' not in wikidata_url:
            return None
            
        qid = wikidata_url.split('/')[-1]
        
        query = f"""
        SELECT ?image WHERE {{
          wd:{qid} wdt:P18 ?image .
        }}
        LIMIT 1
        """
        
        encoded_query = urllib.parse.quote(query)
        url = f"https://query.wikidata.org/sparql?query={encoded_query}&format=json"
        
        req = urllib.request.Request(url)
        req.add_header('User-Agent', USER_AGENT)
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            results = data.get('results', {}).get('bindings', [])
            if results:
                return results[0].get('image', {}).get('value')
            return None
            
    except Exception as e:
        print(f"Error fetching image for {wikidata_url}: {e}")
        return None
    finally:
        time.sleep(0.5)

def get_coordinates(wikidata_url):
    """
    Fetches coordinates (P625) for a Wikidata entity.
    Returns [lat, lon] array.
    """
    try:
        if 'wikidata.org/wiki/' not in wikidata_url:
            return None
            
        qid = wikidata_url.split('/')[-1]
        
        query = f"""
        SELECT ?coord WHERE {{
          wd:{qid} wdt:P625 ?coord .
        }}
        LIMIT 1
        """
        
        encoded_query = urllib.parse.quote(query)
        url = f"https://query.wikidata.org/sparql?query={encoded_query}&format=json"
        
        req = urllib.request.Request(url)
        req.add_header('User-Agent', USER_AGENT)
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            results = data.get('results', {}).get('bindings', [])
            if results:
                # Value is typically "Point(lon lat)"
                wkt = results[0].get('coord', {}).get('value', '')
                match = re.search(r'Point\(([-0-9\.]+) ([-0-9\.]+)\)', wkt)
                if match:
                    lon = float(match.group(1))
                    lat = float(match.group(2))
                    return [lat, lon] # Return as [lat, lon] for Leaflet
            return None
            
    except Exception as e:
        print(f"Error fetching coord for {wikidata_url}: {e}")
        return None
    finally:
        time.sleep(0.5)

def main():
    if not JSON_FILE.exists():
        print(f"Error: File not found at {JSON_FILE}")
        return

    try:
        with JSON_FILE.open(encoding="utf-8") as json_file:
            data = json.load(json_file)
            
        updated_count = 0
        
        print(f"Processing {len(data)} entities...")
        
        for item in data:
            entity_type = item.get('type')
            wikidata_url = item.get('wikidata')
            
            if not wikidata_url:
                continue

            if entity_type == 'person':
                # Check if image already exists
                if 'image_url' not in item and 'image' not in item:
                    print(f"Fetching image for {item.get('entity')}...")
                    image_url = get_image(wikidata_url)
                    if image_url:
                        item['image_url'] = image_url
                        updated_count += 1
                        print(f"  Found: {image_url}")
                    else:
                        # Mark as none to avoid re-fetching? 
                        # Or just leave missing to retry next time?
                        # User requirement: "if entity entry in json already have the key... dont re run"
                        # So if we don't find it, we don't add the key, so next time it WILL re-run.
                        # This is usually safer unless we want to cache 'not found'.
                        print("  No image found.")
            
            elif entity_type == 'place':
                # Check if coordinates already exists
                if 'coordinates' not in item:
                    print(f"Fetching coords for {item.get('entity')}...")
                    coords = get_coordinates(wikidata_url)
                    if coords:
                        item['coordinates'] = coords
                        updated_count += 1
                        print(f"  Found: {coords}")
                    else:
                        print("  No coordinates found.")
                        
        # Write updates back to file
        with JSON_FILE.open("w", encoding="utf-8") as json_file:
            json.dump(data, json_file, ensure_ascii=False, indent=2)
            
        print(f"Finished. Updated {updated_count} entities.")
        
    except Exception as e:
        print(f"Error processing JSON: {e}")

if __name__ == "__main__":
    main()
