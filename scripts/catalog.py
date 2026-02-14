"""
Generate RDF dataset catalog of events, lessons and entities from CSV metadata files.
"""

import csv
import re
import unicodedata
from pathlib import Path
from rdflib import Graph, URIRef, Literal
from rdflib.namespace import DCTERMS, OWL, RDF, RDFS, SDO, XSD

# Folders and files
ROOT_DIR = Path(__file__).resolve().parent.parent
LESSONS_CSV = ROOT_DIR / "metadata" / "barbero.csv"
ENTITIES_CSV = ROOT_DIR / "metadata" / "entities-authoritative.csv"
CATALOG_TTL = ROOT_DIR / "metadata" / "rdf" / "catalog.ttl"

# Prefixes and namespaces
BASE_URI = "https://github.com/metamuses/barberotheca/"

EVENT_PREFIX = "event"
LESSON_PREFIX = "lesson"
ENTITY_PREFIX = "entity"

ENTITY_TYPES = {
    "person": SDO.Person,
    "place": SDO.Place,
    "organization": SDO.Organization,
    "event": SDO.Event,
}

# Initialize RDF graph
g = Graph()

# Extract entities from authoritative CSV into a dictionary for quick lookup
with open(ENTITIES_CSV, mode="r", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    entities = {row["entity"]: row for row in reader}

# Iterate lessons CSV and build RDF graph
with open(LESSONS_CSV, mode="r", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    for row in reader:
        # ===== EVENT SERIES =====================
        # Create EventSeries element for each unique event-year combination
        event_slug = f"{row["event"]} {row["event_year"]}".title().replace(" ", "")
        event_uri = URIRef(f"{EVENT_PREFIX}/{event_slug}")
        g.add((event_uri, RDF.type, SDO.EventSeries))

        # Add event name and year
        g.add((event_uri, SDO.name, Literal(row["event"], lang="it")))
        g.add((event_uri, DCTERMS.date, Literal(row["event_year"], datatype=XSD.gYear)))

        # Add event title if available
        is_series = bool(row.get("macrotheme_title"))
        if is_series:
            g.add((event_uri, DCTERMS.title, Literal(row["macrotheme_title"], lang="it")))

        # ===== LESSONS ==========================
        # Create a lesson element for each row as AudioObject and LearningResource
        lesson_slug = row["rdf_name"]
        lesson_uri = URIRef(f"{LESSON_PREFIX}/{lesson_slug}")
        g.add((lesson_uri, RDF.type, SDO.AudioObject))
        g.add((lesson_uri, RDF.type, SDO.LearningResource))

        # Add lesson title, year, language, source URL, and identifier (filename)
        g.add((lesson_uri, DCTERMS.title, Literal(row["lectio_title"], lang="it")))
        g.add((lesson_uri, DCTERMS.language, Literal("it")))
        g.add((lesson_uri, DCTERMS.source, URIRef(row["source_url"])))
        g.add((lesson_uri, DCTERMS.identifier, Literal(row["semantic_filename"])))

        # Add part-of relationship to the EventSeries and relative position
        g.add((lesson_uri, DCTERMS.isPartOf, event_uri))
        g.add((lesson_uri, SDO.position, Literal(int(row["lectio_num"]), datatype=XSD.integer)))

        # Add all keywords as separate triples
        for keyword in row["keywords"].split(","):
            g.add((lesson_uri, SDO.keywords, Literal(keyword, lang="it")))

        # ===== ENTITIES =========================
        for entity in row["entities"].split(","):
            # Get entity details from the authoritative list
            entity_ref = entities[entity]
            entity_name = entity_ref["entity"]

            # Build the entity URI as normalized PascalCase from the entity name
            entity_normalized = unicodedata.normalize("NFKD", entity_name).encode("ascii", "ignore").decode()
            entity_words = re.split(r"[\s']+", entity_normalized)
            entity_slug = "".join(word.capitalize() for word in entity_words if word)
            entity_uri = URIRef(f"{ENTITY_PREFIX}/{entity_slug}")

            # Add RDF type based on the entity type in the authoritative list
            entity_type = entity_ref.get("type", "").lower()
            rdf_type = ENTITY_TYPES.get(entity_type, SDO.Thing)
            g.add((entity_uri, RDF.type, rdf_type))

            # Add the original name as label with language tag
            g.add((entity_uri, RDFS.label, Literal(entity_name, lang="it")))

            # Add sameAs links for external identifiers if available
            for source in ["wikidata", "viaf", "geonames"]:
                link = entity_ref.get(source, "")
                if link:
                    g.add((entity_uri, OWL.sameAs, URIRef(link)))

            # Add reference from the lesson to the entity
            g.add((lesson_uri, DCTERMS.references, entity_uri))

# Serialize graph to Turtle file
g.serialize(destination=CATALOG_TTL, format="turtle", base=BASE_URI)
