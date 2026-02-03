
// logic for people rendering

const PEOPLE_CSV_PATH = "../metadata/entities-authoritative.csv";
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

let PEOPLE_ENTITIES = [];

async function initPeople() {
    console.log("initPeople called");
    const carouselContainer = document.getElementById("people-scroll-container");
    const filterContainer = document.getElementById("collapsePerson");

    if (carouselContainer) {
        console.log("Index page detected (carousel)");
        // Index Page Logic
        try {
            await loadCSV();
            await filterAndEnrichWithWikidata();
            renderPeople();
        } catch (err) {
            console.error("People logic error:", err);
            carouselContainer.innerHTML = `<p class="text-danger">Error loading people: ${err.message}</p>`;
        }
    } else if (filterContainer) {
        console.log("Collection page detected (filter)");
        // Collection Page Logic
        try {
            // Show loading state explicitly
            const body = filterContainer.querySelector('.accordion-body');
            if (body) body.innerHTML = '<small class="text-muted"><div class="spinner-border spinner-border-sm" role="status"></div> Extracting persons...</small>';

            await loadCSV();
            // Reuse the same logic to get verified humans
            await filterAndEnrichWithWikidata();
            renderPersonFilters(filterContainer);
        } catch (err) {
            console.error("People filter error:", err);
            const body = filterContainer.querySelector('.accordion-body');
            if (body) body.innerHTML = `<p class="text-danger small">Error loading filters: ${err.message}</p>`;
        }
    } else {
        console.log("No people container found");
    }
}

async function loadCSV() {
    console.log("Loading CSV...");
    const res = await fetch(PEOPLE_CSV_PATH);
    if (!res.ok) throw new Error("Failed to load CSV: " + res.statusText);
    const text = await res.text();
    PEOPLE_ENTITIES = parsePeopleCSV(text);
    console.log("CSV Loaded, entries:", PEOPLE_ENTITIES.length);
}

function parsePeopleCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
        // Regex handles quoted commas
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const entry = {};
        headers.forEach((h, i) => {
            let val = values[i] ? values[i].trim() : "";
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            entry[h] = val;
        });
        return entry;
    }).filter(p => p.wikidata && p.wikidata.includes("/Q"));
}

async function filterAndEnrichWithWikidata() {
    if (PEOPLE_ENTITIES.length === 0) return;
    console.log("Enriching with Wikidata...");

    const validEntries = PEOPLE_ENTITIES.filter(p => {
        const parts = p.wikidata.split('/');
        return parts[parts.length - 1].startsWith('Q');
    });

    const qids = validEntries.map(p => {
        const parts = p.wikidata.split('/');
        return parts[parts.length - 1];
    });

    // Wikidata SPARQL to keep only Humans (Q5) and get Images (P18)
    const CHUNK_SIZE = 50;
    const verifiedHumans = new Set();
    const imageMap = {};

    for (let i = 0; i < qids.length; i += CHUNK_SIZE) {
        const chunk = qids.slice(i, i + CHUNK_SIZE);
        const values = chunk.map(q => `wd:${q}`).join(' ');

        const query = `
            SELECT ?item ?image WHERE {
                VALUES ?item { ${values} }
                ?item wdt:P31 wd:Q5 .
                OPTIONAL { ?item wdt:P18 ?image . }
            }
        `;

        try {
            const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
            const res = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
            const json = await res.json();

            json.results.bindings.forEach(b => {
                const qid = b.item.value.split('/').pop();
                verifiedHumans.add(qid);
                if (b.image) {
                    imageMap[qid] = b.image.value;
                }
            });
        } catch (e) {
            console.warn("Chunk failed", e);
        }
    }

    console.log("Verified humans count:", verifiedHumans.size);

    // Filter local list to only those verified as humans
    const seenQIDs = new Set();
    const uniquePeople = [];

    PEOPLE_ENTITIES.forEach(p => {
        const qid = p.wikidata.split('/').pop();
        if (verifiedHumans.has(qid) && !seenQIDs.has(qid)) {
            p.image = imageMap[qid]; // Assign image if exists
            seenQIDs.add(qid);
            uniquePeople.push(p);
        }
    });

    PEOPLE_ENTITIES = uniquePeople;

    // Shuffle the array for random order
    for (let i = PEOPLE_ENTITIES.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [PEOPLE_ENTITIES[i], PEOPLE_ENTITIES[j]] = [PEOPLE_ENTITIES[j], PEOPLE_ENTITIES[i]];
    }
}


function renderPeople() {
    const container = document.getElementById("people-scroll-container");
    if (!container) return;

    if (PEOPLE_ENTITIES.length === 0) {
        container.innerHTML = "<p class='text-white'>No people found.</p>";
        return;
    }

    container.innerHTML = PEOPLE_ENTITIES.map(p => {
        const imgUrl = p.image || 'https://placehold.co/400x400/grey/white?text=No+Image';
        return `
        <div class="flex-shrink-0" style="width: 200px;">
            <a href="collection.html?person=${encodeURIComponent(p.entity)}" class="text-decoration-none">
                <div class="card h-100 bg-secondary text-white border-0 shadow-sm person-card hover-effect">
                    <div class="ratio ratio-1x1 overflow-hidden rounded-top">
                         <img src="${imgUrl}" class="card-img-top object-fit-cover w-100 h-100" alt="${p.entity}" loading="lazy">
                    </div>
                    <div class="card-body p-2 d-flex align-items-center justify-content-center">
                        <h6 class="card-title font-kabel mb-0 text-center text-white text-truncate w-100" title="${p.entity}">${p.entity}</h6>
                    </div>
                </div>
            </a>
        </div>
        `;
    }).join('');

    setupCarouselControls();
}

function setupCarouselControls() {
    const container = document.getElementById("people-scroll-container");
    const prevBtn = document.getElementById("btn-prev");
    const nextBtn = document.getElementById("btn-next");
    const paginationContainer = document.getElementById("people-pagination");

    if (!container || !prevBtn || !nextBtn) return;

    // Scroll Buttons
    prevBtn.addEventListener("click", () => {
        container.scrollBy({ left: -container.clientWidth / 2, behavior: 'smooth' });
    });

    nextBtn.addEventListener("click", () => {
        container.scrollBy({ left: container.clientWidth / 2, behavior: 'smooth' });
    });

    // Pagination Logic
    if (paginationContainer) {
        const updatePagination = () => {
            const totalScroll = container.scrollWidth - container.clientWidth;
            const itemWidth = 200 + 24; // Width + gap (approx)
            const itemsPerPage = Math.max(1, Math.floor(container.clientWidth / itemWidth));
            const totalPages = Math.ceil(PEOPLE_ENTITIES.length / itemsPerPage);

            // Re-render dots if item count or window changed
            if (paginationContainer.children.length !== totalPages) {
                paginationContainer.innerHTML = Array(totalPages).fill(0).map((_, i) =>
                    `<div class="pagination-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`
                ).join('');

                // Add click listeners
                Array.from(paginationContainer.children).forEach(dot => {
                    dot.addEventListener('click', () => {
                        const index = parseInt(dot.getAttribute('data-index'));
                        const scrollPos = index * (container.clientWidth);
                        container.scrollTo({ left: scrollPos, behavior: 'smooth' });
                    });
                });
            }

            // Update active dot based on scroll
            const scrollLeft = container.scrollLeft;
            const activeIndex = Math.round(scrollLeft / container.clientWidth);

            Array.from(paginationContainer.children).forEach((dot, i) => {
                if (i === activeIndex) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        };

        // Initial call and event listeners
        window.addEventListener('resize', updatePagination);
        container.addEventListener('scroll', () => {
            // Debounce or requestAnimationFrame for performance? Simple RAF
            window.requestAnimationFrame(() => {
                const scrollLeft = container.scrollLeft;
                const activeIndex = Math.round(scrollLeft / container.clientWidth);
                Array.from(paginationContainer.children).forEach((dot, i) => {
                    if (i === activeIndex) dot.classList.add('active');
                    else dot.classList.remove('active');
                });
            });
        });

        // Slight delay to allow layout to settle
        setTimeout(updatePagination, 500);
    }
}


// Auto-run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPeople);
} else {
    initPeople();
}
