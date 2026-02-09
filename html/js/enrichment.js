/**
 * Enriches the transcription text by adding icons next to identified entities and keywords.
 * 
 * @param {string} containerId - The ID of the container element holding the transcription segments.
 * @param {object} lessonItem - The current lesson data object (contains entities and keywords).
 * @param {array} entitiesData - The full entities authoritative list.
 * @param {object} entitiesVariants - Map of entity variants to their canonical forms/data.
 */
function enrichTranscription(containerId, lessonItem, entitiesData, entitiesVariants) {
    // console.log("enrichTranscription called", { lessonItem, entitiesDataLength: entitiesData?.length });

    const container = document.getElementById(containerId);
    if (!container) return;

    if (!entitiesData || entitiesData.length === 0) {
        console.warn("enrichTranscription: entitiesData is empty. Icons will default to keywords.");
    }

    // 0. Build a fast Type Lookup Map (Name -> Type)
    // We normalize keys to lowercase for case-insensitive matching if needed, 
    // but usually entities match exact casing in lesson data.
    // Let's store both exact and lowercase to be safe.
    const typeMap = new Map();

    if (entitiesData) {
        entitiesData.forEach(entry => {
            const type = entry.type ? entry.type.toLowerCase() : '';

            // Add entity name(s)
            const variants = Array.isArray(entry.entity) ? entry.entity : [entry.entity];
            variants.forEach(v => {
                if (v) {
                    typeMap.set(v, type);
                    typeMap.set(v.toLowerCase(), type);
                }
            });

            // Add title
            if (entry.title) {
                typeMap.set(entry.title, type);
                typeMap.set(entry.title.toLowerCase(), type);
            }
        });
    }

    // 1. Build a map of terms to look for
    // Term -> { type: 'person'|'place'|'keyword', display: 'Original Term' }
    const termsMap = new Map();

    // Helper to add term
    const addTerm = (term, source) => {
        if (!term) return;
        const normalized = term.trim().toLowerCase();
        if (normalized.length < 2) return;

        // Determine type
        let type = '';
        // Check lookup map first
        // We check exact match of the term passed from lessonItem
        if (typeMap.has(term)) {
            type = typeMap.get(term);
        } else if (typeMap.has(normalized)) {
            type = typeMap.get(normalized);
        } else {
            // Fallback: If source claims it's an entity, maybe we missed it in authoritative?
            // If unknown entity type, we do NOT add an icon.
        }

        // type determination happens above.
        // If 'source' is 'entity_list', we tried to find a specific type (person/place).
        // If 'source' is 'keyword_list', it is a keyword.

        // However, a word might be in both lists. 
        // We want the most specific type (Person/Place > Keyword).

        if (source === 'keyword_list') {
            type = 'keyword';
        }

        //prioritize Entity info.

        const existing = termsMap.get(normalized);
        if (existing) {
            // If existing is keyword, and new is person/place, update.
            if (existing.type === 'keyword' && type !== 'keyword') {
                termsMap.set(normalized, { type, display: term });
            }
        } else {
            termsMap.set(normalized, { type, display: term });
        }
    };

    // A. Process Entities
    if (lessonItem.entities) {
        lessonItem.entities.forEach(entityName => {
            // Resolve type using our map
            let type = '';
            if (typeMap.has(entityName)) type = typeMap.get(entityName);
            else if (typeMap.has(entityName.toLowerCase())) type = typeMap.get(entityName.toLowerCase());

            // Add to terms
            const normalized = entityName.trim().toLowerCase();
            termsMap.set(normalized, { type, display: entityName });
        });
    }

    // B. Process Keywords
    if (lessonItem.keywords) {
        lessonItem.keywords.forEach(kw => {
            addTerm(kw, 'keyword_list');
        });
    }

    // 2. Prepare Terms for Regex
    const sortedTerms = Array.from(termsMap.keys()).sort((a, b) => b.length - a.length);

    if (sortedTerms.length === 0) return;

    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b(${sortedTerms.map(escapeRegExp).join('|')})\\b`, 'gi');

    // 3. Process Segments
    const segments = container.querySelectorAll('.transcript-segment');

    segments.forEach(segment => {
        let html = segment.innerHTML;

        // Perform replacement
        html = html.replace(pattern, (match) => {
            const key = match.toLowerCase();
            const info = termsMap.get(key);
            if (!info || !info.type) return match;

            let iconClass = '';
            let colorClass = '';

            if (info.type === 'person') {
                iconClass = 'bi bi-person';
                colorClass = 'text-danger';
            } else if (info.type === 'place') {
                iconClass = 'bi bi-geo-alt';
                colorClass = 'text-primary';
            } else if (info.type === 'keyword') {
                iconClass = 'bi bi-key';
                colorClass = 'text-success';
            }

            if (!iconClass) return match;

            return `${match}<sup class=""><i class="${iconClass} ${colorClass}"></i></sup>`;
        });

        segment.innerHTML = html;
    });
}
