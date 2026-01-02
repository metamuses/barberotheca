"""
Analyze transcripts txts and extract the most mentioned keywords and entities.
"""

from pathlib import Path
from collections import Counter
import csv
import json
import spacy

ROOT_DIR = Path(__file__).resolve().parent.parent
METADATA_CSV = ROOT_DIR / "metadata" / "barbero.csv"
TRANSCRIPTS_DIR = ROOT_DIR / "transcripts"
KEYWORDS_JSON = ROOT_DIR / "metadata" / "generated" / "keywords-entities.json"

KEYWORDS_NUM = 50
ENTITIES_NUM = 30

# Load spaCy NLP model
nlp = spacy.load("it_core_news_lg")

# Load CSV metadata
with METADATA_CSV.open(encoding="utf-8") as csv_file:
    reader = csv.DictReader(csv_file, delimiter=",")
    rows = list(reader)

# Create the root dictionary structure
keywords_dict = {}

for row in rows:
    # Get the semantic filename value
    semantic_filename = row.get("semantic_filename")
    if not semantic_filename:
        continue

    # Locate transcript file associated with semantic filename
    txt_file = TRANSCRIPTS_DIR / f"{semantic_filename}.txt"
    if not txt_file.exists():
        print(f"⚠️ Transcript not found: {semantic_filename}.txt")
        continue

    print(f"🔍 Processing {semantic_filename}...")

    # Read the transcript text
    text = txt_file.read_text(encoding="utf-8").replace("\n", " ").strip()
    if not text:
        print(f"⚠️ Skipping empty file: {semantic_filename}.txt")
        continue

    # Process text with spaCy NLP
    doc = nlp(text)

    # Extract keywords (nouns, proper nouns, adjectives, verbs) and get the top 50
    keywords = [
        token.lemma_.lower()
        for token in doc
        if token.pos_ in {"NOUN", "PROPN", "ADJ", "VERB"}
        and not token.is_stop
        and token.is_alpha
    ]
    keyword_freq = dict(Counter(keywords).most_common(KEYWORDS_NUM))

    # Extract entities (persons, locations, organizations) and get the top 30
    entities = [
        ent.text.strip() for ent in doc.ents if ent.label_ in {"PER", "LOC", "ORG"}
    ]
    entity_freq = dict(Counter(entities).most_common(ENTITIES_NUM))

    # Store keywords and entities for the semantic filename in the root dictionary
    keywords_dict[semantic_filename] = {
        "keywords": keyword_freq,
        "entities": entity_freq,
    }

# Write root dictionary to JSON
with KEYWORDS_JSON.open("w", encoding="utf-8") as json_file:
    json.dump(keywords_dict, json_file, ensure_ascii=False, indent=2)

print(f"✅ Saved {KEYWORDS_JSON}")
