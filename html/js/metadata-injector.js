/**
 * Metadata Injector
 * 
 * Fetches barbero.json to find the current lesson's RDF name.
 * Fetches knowledge-graph.ttl to extract RDfa compliant metadata.
 * Injects the metadata into the <head> of the document.
 */

(async function () {
    const JSON_PATH = "data/barbero.json";
    const TTL_PATH = "../metadata/knowledge-graph.ttl";

    async function fetchJson(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to fetch ${path}`);
        return await res.json();
    }

    async function fetchText(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to fetch ${path}`);
        return await res.text();
    }

    function getLessonIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // Assuming N3 is loaded via <script> tag creates a global `N3` object.
    const { DataFactory } = N3;
    const { namedNode, literal, defaultGraph, quad } = DataFactory;


    async function injectMetadata() {
        try {
            const id = getLessonIdFromUrl();
            if (!id) return;

            const data = await fetchJson(JSON_PATH);

            // Find lesson
            let lesson = data.find(d => d.id == id);
            if (!lesson) {
                lesson = data.find(d => d.semantic_filename === id);
            }

            if (!lesson || !lesson.rdf_name) {
                console.warn("Lesson not found or no RDF name.");
                return;
            }

            const rdfName = lesson.rdf_name;
            const ttlContent = await fetchText(TTL_PATH);

            // Initialize N3 Parser and Store
            const store = new N3.Store();
            const parser = new N3.Parser({ baseIRI: 'https://github.com/metamuses/barberotheca/' });

            await new Promise((resolve, reject) => {
                parser.parse(ttlContent, (error, quad, prefixes) => {
                    if (error) reject(error);
                    if (quad) store.addQuad(quad);
                    else resolve(prefixes); // Done
                });
            });

            const BASE = "https://github.com/metamuses/barberotheca/";
            const lessonSubject = namedNode(BASE + "lesson/" + rdfName);

            // Helper to get one object value
            const getOne = (subject, predicate) => {
                const quads = store.getQuads(subject, namedNode(predicate), null, defaultGraph());
                if (quads.length > 0) return quads[0].object.value;
                return null;
            };

            const identifier = getOne(lessonSubject, "http://purl.org/dc/terms/identifier");
            const title = getOne(lessonSubject, "http://purl.org/dc/terms/title");
            const language = getOne(lessonSubject, "http://purl.org/dc/terms/language");
            const sourceUrl = getOne(lessonSubject, "http://purl.org/dc/terms/source");

            const head = document.head;
            head.setAttribute("prefix", "dcterms: http://purl.org/dc/terms/ owl: http://www.w3.org/2002/07/owl# schema: https://schema.org/ xsd: http://www.w3.org/2001/XMLSchema#");
            head.setAttribute("about", lessonSubject.value);

            const metas = [
                { property: "dcterms:identifier", content: identifier },
                { property: "dcterms:title", content: title, "xml:lang": "it" },
                { property: "dcterms:language", content: language },
            ];

            const links = [
                { rel: "dcterms:source", href: sourceUrl }
            ];

            metas.forEach(m => {
                if (!m.content) return;
                const meta = document.createElement("meta");
                meta.setAttribute("property", m.property);
                meta.setAttribute("content", m.content);
                if (m["xml:lang"]) meta.setAttribute("xml:lang", m["xml:lang"]);
                head.appendChild(meta);
            });

            links.forEach(l => {
                if (!l.href) return;
                const link = document.createElement("link");
                link.setAttribute("rel", l.rel);
                link.setAttribute("href", l.href);
                head.appendChild(link);
            });

            // --- Entity Injection ---
            try {
                const ENTITIES_PATH = "data/entities-authoritative.json";
                const entitiesData = await fetchJson(ENTITIES_PATH);

                if (lesson.entities && Array.isArray(lesson.entities)) {
                    for (const entityName of lesson.entities) {
                        // Find entity in JSON to get rdf_name
                        const entityRecord = entitiesData.find(e => {
                            if (Array.isArray(e.entity)) return e.entity.includes(entityName);
                            return e.entity === entityName;
                        });

                        if (entityRecord && entityRecord.rdf_name) {
                            const entityRdfName = entityRecord.rdf_name;
                            const entityUri = BASE + "entity/" + entityRdfName;

                            // Extract Data
                            const name = entityRecord.title || entityName;

                            // Map to schema.org
                            let schemaType = "schema:Thing";
                            if (entityRecord.type === "person") schemaType = "schema:Person";
                            if (entityRecord.type === "place") schemaType = "schema:Place";

                            // Inject Meta Tags for Entity
                            const metaName = document.createElement("meta");
                            metaName.setAttribute("about", entityUri);
                            metaName.setAttribute("property", "schema:name");
                            metaName.setAttribute("content", name);
                            head.appendChild(metaName);

                            const metaType = document.createElement("meta");
                            metaType.setAttribute("about", entityUri);
                            metaType.setAttribute("typeof", schemaType);
                            head.appendChild(metaType);

                            // Links (owl:sameAs)
                            const sameAsLinks = [];
                            if (entityRecord.wikidata) sameAsLinks.push(entityRecord.wikidata);
                            if (entityRecord.viaf) sameAsLinks.push(entityRecord.viaf);
                            if (entityRecord.geonames) sameAsLinks.push(entityRecord.geonames);

                            sameAsLinks.forEach(url => {
                                if (!url) return;
                                const metaSame = document.createElement("meta");
                                metaSame.setAttribute("about", entityUri);
                                metaSame.setAttribute("property", "owl:sameAs");
                                metaSame.setAttribute("resource", url);
                                head.appendChild(metaSame);
                            });

                        }
                    }
                }

                // --- Transcription Enrichment (RDFa spans) ---
                enrichTranscriptionWithRDFa(lesson.entities, entitiesData, BASE, lessonSubject.value);

            } catch (err) {
                console.error("Error injecting entity metadata:", err);
            }

            console.log("Metadata injected successfully.");

        } catch (e) {
            console.error("Error injecting metadata:", e);
        }

    }

    /**
     * Watches for the transcription container to be populated, then wraps entities in RDFa spans.
     * @param {string[]} lessonEntities List of entity names for this lesson.
     * @param {Array} entitiesData Full entities authoritative data.
     * @param {string} baseUri Base URI for RDF.
     */
    function enrichTranscriptionWithRDFa(lessonEntities, entitiesData, baseUri, lessonUri) {
        if (!lessonEntities || lessonEntities.length === 0) return;

        // Map entity names to their RDF URI
        const entityMap = {};
        for (const name of lessonEntities) {
            const record = entitiesData.find(e => {
                if (Array.isArray(e.entity)) return e.entity.includes(name);
                return e.entity === name;
            });
            if (record && record.rdf_name) {
                entityMap[name] = baseUri + "entity/" + record.rdf_name;
            }
        }

        const observer = new MutationObserver((mutations, obs) => {
            const container = document.getElementById("transcript-container");
            if (container && container.children.length > 0) {
                if (container.querySelector('.transcript-segment')) {
                    applyRdfaToSegments(container, entityMap, lessonUri);
                    obs.disconnect();
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyRdfaToSegments(container, entityMap, lessonUri) {
        const segments = container.querySelectorAll('.transcript-segment');
        segments.forEach(segment => {
            const walker = document.createTreeWalker(segment, NodeFilter.SHOW_TEXT, null, false);
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }

            // Iterate text nodes and replace matches
            for (const textNode of textNodes) {
                const text = textNode.nodeValue;
                if (!text.trim()) continue;

                // Match longest keys first to avoid partial replacements
                const keys = Object.keys(entityMap).sort((a, b) => b.length - a.length);

                let hasMatch = false;
                for (const key of keys) {
                    if (text.toLowerCase().includes(key.toLowerCase())) {
                        hasMatch = true;
                        break;
                    }
                }

                if (hasMatch) {
                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;

                    const escapedKeys = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    // Use case-sensitive flag 'gi'
                    const regex = new RegExp(`(${escapedKeys.join('|')})`, 'gi');

                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        if (match.index > lastIndex) {
                            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                        }

                        const matchText = match[0];
                        // Find the original key (canonical name) case-insensitively to look up the URI
                        const originalKey = keys.find(k => k.toLowerCase() === matchText.toLowerCase());
                        const entityUri = entityMap[originalKey];
                        const displayText = matchText;

                        const span = document.createElement("span");
                        span.setAttribute("property", "dcterms:references");
                        span.setAttribute("resource", entityUri);
                        span.setAttribute("about", lessonUri);
                        span.textContent = displayText;
                        fragment.appendChild(span);

                        lastIndex = regex.lastIndex;
                    }

                    if (lastIndex < text.length) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                    }

                    textNode.parentNode.replaceChild(fragment, textNode);
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectMetadata);
    } else {
        injectMetadata();
    }

})();
