from pathlib import Path
import csv
import re
from rdflib import Graph, URIRef, Literal
from rdflib.namespace import DCTERMS, OWL, RDF, RDFS, SDO, XSD

# Folders and files
ROOT_DIR = Path(__file__).resolve().parent.parent
LESSONS_CSV = ROOT_DIR / "metadata" / "barbero.csv"
ENTITIES_CSV = ROOT_DIR / "metadata" / "entities-authoritative.csv"
CATALOG_TTL = ROOT_DIR / "metadata" / "rdf" / "catalog.ttl"

# Prefixes and namespaces
BASE_URI = "https://github.com/metamuses/barberotheca/"
ENTITY_TYPES = {
    "person": SDO.Person,
    "place": SDO.Place,
    "organization": SDO.Organization,
    "event": SDO.Event,
}

# Initialize RDF graph
g = Graph()

# TODO: read each lesson and for each entity in the lesson, check if it is in the authoritative list and add triples accordingly instead of reading the authoritative list separately and adding all entities without checking if they are actually used in the lessons
# Use dcterms:title, dcterms:source, dcterms:identifier, dcterms:issued (YYYY), dcterms:language, dcterms:publisher, dcterms:references. isPartOf se c'è macrotheme?

# ===== ENTITIES =========================
# Load entities from authoritative CSV
with open(ENTITIES_CSV, mode="r", encoding="utf-8") as f:
    # Read CSV to a dictionary
    reader = csv.DictReader(f)

    for row in reader:
        entity_name = row["entity"].strip()

        # Skip element if entity name is empty
        if not entity_name:
            continue

        # Remove punctuation and split into words
        clean_text = re.sub(r"[^\w\s]", "", entity_name)
        words = clean_text.split()

        # Skip element if no valid words remain after cleaning
        if not words:
            continue

        # Create entity slug by lowercasing the first word and capitalizing subsequent words
        slug = words[0].lower() + "".join(word.capitalize() for word in words[1:])

        # Construct the entity URI under the "entity" path
        subject_uri = URIRef(f"entity/{slug}")

        # Add triple for entity type
        entity_type = row.get("type", "").strip().lower()
        rdf_type = ENTITY_TYPES.get(entity_type, SDO.Thing)
        g.add((subject_uri, RDF.type, rdf_type))

        # Add triple for the entity label
        g.add((subject_uri, RDFS.label, Literal(entity_name, lang="it")))

        # Add triples for external links if present
        for source in ["wikidata", "viaf", "geonames"]:
            link = row.get(source, "").strip()
            if link:
                g.add((subject_uri, OWL.sameAs, URIRef(link)))

# Serialize graph to Turtle file
g.serialize(destination=CATALOG_TTL, format="turtle", base=BASE_URI)
