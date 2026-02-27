document.addEventListener('DOMContentLoaded', async () => {
    const peopleAccordionId = 'people-accordion';
    const placesAccordionId = 'places-accordion';

    let entities = [];
    let lessons = [];

    // Load Data
    try {
        const [entitiesRes, lessonsRes] = await Promise.all([
            fetch('data/entities-authoritative.json'),
            fetch('data/barbero.json')
        ]);

        if (!entitiesRes.ok || !lessonsRes.ok) {
            throw new Error('Error loading data');
        }

        entities = await entitiesRes.json();
        lessons = await lessonsRes.json();

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById(peopleAccordionId).innerHTML = '<div class="text-danger p-3">Errore nel caricamento dei dati.</div>';
        document.getElementById(placesAccordionId).innerHTML = '<div class="text-danger p-3">Errore nel caricamento dei dati.</div>';
        return;
    }

    // Process Data
    const people = entities.filter(e => e.type === 'person').sort(sortByTitle);
    const places = entities.filter(e => e.type === 'place').sort(sortByTitle);

    // Populate Tabs
    populateAccordion(peopleAccordionId, people, 'person', lessons);
    populateAccordion(placesAccordionId, places, 'place', lessons);
});

function sortByTitle(a, b) {
    const titleA = (a.title || a.entity || '').toLowerCase();
    const titleB = (b.title || b.entity || '').toLowerCase();
    return titleA.localeCompare(titleB);
}

function populateAccordion(accordionId, items, type, lessons) {
    const container = document.getElementById(accordionId);
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div class="text-muted p-3">Nessun elemento trovato.</div>';
        return;
    }

    container.innerHTML = ''; // Clear loading message

    items.forEach((item, index) => {
        const uniqueId = `${type}-${index}`;
        const headerId = `heading-${uniqueId}`;
        const collapseId = `collapse-${uniqueId}`;

        const displayName = item.title || (Array.isArray(item.entity) ? item.entity[0] : item.entity);

        // Find associated lessons
        const entityVariants = Array.isArray(item.entity) ? item.entity : [item.entity];
        const associatedLessons = lessons.filter(lesson =>
            lesson.entities && lesson.entities.some(e => entityVariants.includes(e))
        );

        // Build Authority Links HTML
        let authorityHtml = '';
        const authorityLinks = [];
        if (item.wikidata) authorityLinks.push(`<a href="${item.wikidata}" target="_blank" class="text-info text-decoration-none me-3"><i class="bi bi-link-45deg"></i> Wikidata</a>`);
        if (item.viaf) authorityLinks.push(`<a href="${item.viaf}" target="_blank" class="text-info text-decoration-none me-3"><i class="bi bi-link-45deg"></i> VIAF</a>`);
        if (item.geonames) authorityLinks.push(`<a href="${item.geonames}" target="_blank" class="text-info text-decoration-none me-3"><i class="bi bi-link-45deg"></i> GeoNames</a>`);

        if (authorityLinks.length > 0) {
            authorityHtml = `
                <div class="mb-3">
                    <h6 class="text-white-50 text-uppercase small ls-1">Controllo autorità</h6>
                    <div class="d-flex flex-wrap">
                        ${authorityLinks.join('')}
                    </div>
                </div>
            `;
        }

        // Build Lessons List HTML
        let lessonsHtml = '';
        if (associatedLessons.length > 0) {
            const lessonsList = associatedLessons.map(l =>
                `<li><a href="lesson.html?id=${l.id}" class="text-info text-decoration-underline">${l.lectio_title}</a> <span class="text-muted small">(${l.event_year})</span></li>`
            ).join('');

            lessonsHtml = `
                <div>
                    <h6 class="text-white-50 text-uppercase small ls-1">Lezioni</h6>
                    <ul class="list-unstyled mb-0">
                        ${lessonsList}
                    </ul>
                </div>
            `;
        } else {
            lessonsHtml = `
                <div>
                    <h6 class="text-white-50 text-uppercase small ls-1">Lezioni</h6>
                    <p class="text-muted small fst-italic">Nessuna lezione associata trovata.</p>
                </div>
            `;
        }

        // Accordion Item Construction
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item bg-dark border-secondary text-white';

        accordionItem.innerHTML = `
            <h2 class="accordion-header" id="${headerId}">
                <button class="accordion-button collapsed bg-dark text-white shadow-none" type="button" data-bs-toggle="collapse"
                    data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                    ${displayName}
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headerId}"
                data-bs-parent="#${accordionId}">
                <div class="accordion-body text-white text-opacity-75">
                   ${authorityHtml}
                   ${lessonsHtml}
                </div>
            </div>
        `;

        container.appendChild(accordionItem);
    });
}
