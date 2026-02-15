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

    /**
     * Extracts a property value from the TTL block.
     * @param {string} block The TTL text block.
     * @param {string} predicate The predicate to search for (e.g., "dcterms:title").
     * @returns {string|null} The raw value (including quotes/brackets) or null.
     */
    function extractPropertyRaw(block, predicate) {
        const regex = new RegExp(`${predicate}\\s+([^;,]+)`, 'i');
        const match = block.match(regex);
        return match ? match[1].trim() : null;
    }

    function cleanValue(val) {
        if (!val) return "";
        // Remove language tag @it
        val = val.replace(/@[a-z]{2}$/, '');
        // Remove type ^^xsd:gYear
        val = val.replace(/\^\^xsd:[a-zA-Z0-9]+$/, '');
        // Remove quotes
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
        }
        // Remove angle brackets < >
        if (val.startsWith('<') && val.endsWith('>')) {
            val = val.substring(1, val.length - 1);
        }
        return val;
    }

    function getBlockForSubject(ttlContent, subject) {
        const start = ttlContent.indexOf(subject);
        if (start === -1) return null;

        // Iterate lines to find the end of the block (prop ; prop ; prop .)
        let block = "";
        const lines = ttlContent.substring(start).split('\n');
        for (let line of lines) {
            block += line + "\n";
            if (line.trim().endsWith(" .")) {
                break;
            }
        }
        return block;
    }

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

            // 1. Get Lesson Block
            const lessonSubject = `<lesson/${rdfName}>`;
            const lessonBlock = getBlockForSubject(ttlContent, lessonSubject);

            if (!lessonBlock) {
                console.warn(`TTL block for ${rdfName} not found.`);
                return;
            }

            // 2. Extract Data from Lesson
            const identifierRaw = extractPropertyRaw(lessonBlock, "dcterms:identifier");
            const sourceRaw = extractPropertyRaw(lessonBlock, "dcterms:source");
            const titleRaw = extractPropertyRaw(lessonBlock, "dcterms:title");
            const languageRaw = extractPropertyRaw(lessonBlock, "dcterms:language");
            const isPartOfRaw = extractPropertyRaw(lessonBlock, "dcterms:isPartOf"); // e.g. <event/FestivalDellaMente2008>





            // 4. Clean Values
            const identifier = cleanValue(identifierRaw);
            const title = cleanValue(titleRaw);

            const language = cleanValue(languageRaw);

            // For links, we might keep relative paths or resolve them.
            // TTL base is <https://github.com/metamuses/barberotheca/>
            const BASE = "https://github.com/metamuses/barberotheca/";

            const resolveLink = (raw) => {
                if (!raw) return "";
                let val = raw;
                // Remove < >
                if (val.startsWith('<') && val.endsWith('>')) {
                    val = val.substring(1, val.length - 1);
                }
                if (val.startsWith("http")) return val;
                return BASE + val;
            };

            const sourceUrl = resolveLink(sourceRaw);
            const isPartOfUrl = resolveLink(isPartOfRaw);


            const head = document.head;
            head.setAttribute("prefix", "dcterms: http://purl.org/dc/terms/ owl: http://www.w3.org/2002/07/owl# schema: https://schema.org/ xsd: http://www.w3.org/2001/XMLSchema#");
            head.setAttribute("about", BASE + "lesson/" + rdfName);

            const metas = [
                { property: "dcterms:identifier", content: identifier },
                { property: "dcterms:title", content: title, "xml:lang": "it" }, // Assuming Italian based on TTL

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
                if (m.datatype) meta.setAttribute("datatype", m.datatype);
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
                            const entitySubject = `<entity/${entityRdfName}>`;
                            const entityBlock = getBlockForSubject(ttlContent, entitySubject);

                            // URI for about property
                            const entityUri = BASE + "entity/" + entityRdfName;

                            // Extract Data
                            // We need schema:name (or title in JSON?), type (schema:Person/Place)
                            // The user said: 
                            // 1. property="schema:name" content="Name"
                            // 2. property="typeof" content="schema:Type" (or typeof attribute)
                            // 3. link property="owl:sameAs" resource="..."

                            const name = entityRecord.title || entityName; // Use title from JSON or name

                            // Type: The JSON has "type": "person" or "place".
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
                enrichTranscriptionWithRDFa(lesson.entities, entitiesData, BASE, BASE + "lesson/" + rdfName);

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
                // Transcription loaded!
                // We disconnect to avoid loops if we modify DOM, though we should only modify once.
                // But main.js might re-render. Ideally we want to run this every time main.js renders.
                // For now, let's assume one-time render or we handle re-entrancy.
                // Checking if already enriched could be done, but simple text node traversal is safer.

                // Disconnect temporarily or use a flag? 
                // main.js renders InnerHTML. We should wait for it to finish.
                // One way is to wait a bit or check if "transcript-segment" elements exist.

                if (container.querySelector('.transcript-segment')) {
                    applyRdfaToSegments(container, entityMap, lessonUri);
                    // If we want to support re-rendering (e.g. search clearing might re-render?), 
                    // we might keep observing but filter mutations.
                    // For this task, assuming single load is sufficient.
                    obs.disconnect();
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyRdfaToSegments(container, entityMap, lessonUri) {
        // We need to wrap text occurrences.
        // BEWARE: main.js adds <sup> icons. We must NOT break them.
        // We should walk text nodes of .transcript-segment

        const segments = container.querySelectorAll('.transcript-segment');
        segments.forEach(segment => {
            // We only want to process text nodes that are direct children or within safe tags.
            // But main.js logic is: Text... <sup>icon</sup> ... Text
            // We can iterate childNodes.

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

                // We need to find matches for any entity key.
                // We should match longest keys first to avoid partial replacements?
                // Sorting keys by length desc.
                const keys = Object.keys(entityMap).sort((a, b) => b.length - a.length);

                // We can't easily replace inside a text node without splitting it.
                // Simplest is to check if it contains any entity.

                // Optimization: build a regex for all entities?
                // Special characters in names need escaping? Usually names are safe-ish.
                // let pattern = keys.map(k => escapeRegExp(k)).join('|');

                let hasMatch = false;
                for (const key of keys) {
                    if (text.includes(key)) {
                        hasMatch = true;
                        break;
                    }
                }

                if (hasMatch) {
                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;

                    // Simple replacement approach: 
                    // Split by regex of all keys, keeping delimiters.
                    // But overlapping keys? e.g. "San Francesco" vs "Francesco"
                    // keys are sorted longest first, so regex matching first occurrence usually works.

                    const escapedKeys = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    const regex = new RegExp(`(${escapedKeys.join('|')})`, 'g');

                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        // Text before
                        if (match.index > lastIndex) {
                            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                        }

                        // The Entity
                        const entityName = match[0];
                        const entityUri = entityMap[entityName]; // Might need lookup if case insensitive?
                        // Assuming exact match from keys.

                        const span = document.createElement("span");
                        span.setAttribute("property", "dcterms:references");
                        span.setAttribute("resource", entityUri);
                        span.setAttribute("about", lessonUri);
                        span.textContent = entityName;
                        fragment.appendChild(span);

                        lastIndex = regex.lastIndex;
                    }

                    // Text after
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
