"""
Generate full RDF knowledge graph of events, lessons and entities from CSV metadata files.
"""

import csv
from pathlib import Path
from rdflib import Graph, URIRef, Literal
from rdflib.namespace import DCTERMS, OWL, RDF, SDO, XSD

# Folders and files
ROOT_DIR = Path(__file__).resolve().parent.parent
LESSONS_CSV = ROOT_DIR / "metadata" / "barbero.csv"
ENTITIES_CSV = ROOT_DIR / "metadata" / "entities-authoritative.csv"
KNOWLEDGE_GRAPH_TTL = ROOT_DIR / "metadata" / "knowledge-graph.ttl"

# Prefixes, namespaces and mappings
BASE_URI = "https://github.com/metamuses/barberotheca/"
LESSON_WEB_BASE = "https://metamuses.github.io/barberotheca/lesson.html"

EVENT_PREFIX = "event"
LESSON_PREFIX = "lesson"
ENTITY_PREFIX = "entity"

ENTITY_TYPES = {
    "person": SDO.Person,
    "place": SDO.Place,
    "organization": SDO.Organization,
    "event": SDO.Event,
}

AUTHORITY_SOURCES = [
    "wikidata",
    "viaf",
    "geonames"
]

# Initialize RDF graph
g = Graph()

# Extract entities from authoritative CSV into a dictionary for quick lookup
with open(ENTITIES_CSV, mode="r", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    entities = {row["entity"]: row for row in reader}

# Iterate lessons CSV and build RDF graph
with open(LESSONS_CSV, mode="r", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    for row_num, row in enumerate(reader, start=1):
        # ===== EVENT SERIES =====================
        # Create EventSeries element for each unique event-year combination
        event_slug = f"{row['event']} {row['event_year']}".title().replace(" ", "")
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

        # Link lesson to its page URL as mainEntityOfPage
        lesson_web_uri = URIRef(f"{LESSON_WEB_BASE}?id={row_num}")
        g.add((lesson_uri, SDO.mainEntityOfPage, URIRef(lesson_web_uri)))

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
            entity_slug = entity_ref["rdf_name"]
            entity_uri = URIRef(f"{ENTITY_PREFIX}/{entity_slug}")

            # Add RDF type based on the entity type in the authoritative list
            entity_type = entity_ref.get("type", "").lower()
            rdf_type = ENTITY_TYPES.get(entity_type, SDO.Thing)
            g.add((entity_uri, RDF.type, rdf_type))

            # Add the original name as label with language tag
            g.add((entity_uri, SDO.name, Literal(entity_ref["entity"], lang="it")))

            # Add sameAs links for external identifiers if available
            for source in AUTHORITY_SOURCES:
                link = entity_ref.get(source, "")
                if link:
                    g.add((entity_uri, OWL.sameAs, URIRef(link)))

            # Add reference from the lesson to the entity
            g.add((lesson_uri, DCTERMS.references, entity_uri))

# Serialize graph to Turtle file
g.serialize(destination=KNOWLEDGE_GRAPH_TTL, format="turtle", base=BASE_URI)
