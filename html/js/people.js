// people.js - Handles People Carousel on Index Page

const ENTITIES_JSON_PATH = "data/entities-authoritative.json";

async function initPeople() {
    const container = document.getElementById("people-scroll-container");
    if (!container) return; // Not on index page or structure missing

    try {
        const response = await fetch(ENTITIES_JSON_PATH);
        if (!response.ok) throw new Error("Failed to load entities data");

        const data = await response.json();

        // Filter for type 'person'
        const people = data.filter(item => item.type === 'person');

        // Format data: Use 'title' from JSON for display, 'entity' for ID/Link
        const processedPeople = people.map(p => {
            // "entity" might be a string ("Abbone") OR a list (["Giovanna", "Giovanna d'Arco"])
            // For logic, we pick the first one as ID
            const entityId = Array.isArray(p.entity) ? p.entity[0] : p.entity;

            return {
                name: p.title || entityId, // Display Name (Italian Title)
                id: entityId,              // Filter ID (matches barbero.json and radio values)
                image: p.image_url || 'https://placehold.co/400x400/grey/white?text=No+Image',
                original_link: p.wikipedia_it
            };
        });

        // Shuffle the array for random order
        for (let i = processedPeople.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [processedPeople[i], processedPeople[j]] = [processedPeople[j], processedPeople[i]];
        }

        renderCarousel(processedPeople, container);

    } catch (err) {
        console.error("People Init Error:", err);
        container.innerHTML = `<p class="text-danger">Error loading people.</p>`;
    }
}

function renderCarousel(people, container) {
    if (people.length === 0) {
        container.innerHTML = `<p class="text-muted">No people found.</p>`;
        return;
    }

    container.innerHTML = people.map(p => `
        <div class="flex-shrink-0 person-carousel-item">
             <!-- Card: Link uses ID (for corect filtering), Display uses Name (Title) -->
             <a href="collection.html?person=${encodeURIComponent(p.id)}" class="text-decoration-none">
                 <div class="card h-100 bg-secondary text-white border-0 shadow-sm person-card">
                    <div class="overflow-hidden rounded-top bg-dark" style="aspect-ratio: 1 / 1;">
                        <img src="${p.image}" class="card-img-top w-100 h-100 object-fit-cover" 
                             alt="${p.name}" loading="lazy" 
                             style="object-fit: cover;"
                             onerror="this.src='https://placehold.co/400x400/grey/white?text=No+Image'">
                    </div>
                    <div class="card-body p-2 d-flex align-items-center justify-content-center text-center">
                        <h6 class="card-title font-kabel mb-0 text-truncate w-100 text-white" title="${p.name}">
                            ${p.name}
                        </h6>
                    </div>
                 </div>
             </a>
        </div>
    `).join('');

    setupControls(container, people.length);
}

function setupControls(container, itemCount) {
    const prevBtn = document.getElementById("btn-prev");
    const nextBtn = document.getElementById("btn-next");
    const pagination = document.getElementById("people-pagination");

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener("click", () => {
            const firstItem = container.querySelector('.person-carousel-item');
            // Measure width effectively
            const itemWidth = firstItem ? firstItem.offsetWidth : 200;
            container.scrollBy({ left: -container.clientWidth / 2, behavior: 'smooth' });
        });
        nextBtn.addEventListener("click", () => {
            container.scrollBy({ left: container.clientWidth / 2, behavior: 'smooth' });
        });
    }

    // Pagination
    if (pagination) {
        const updatePagination = () => {
            // Measure actual width from DOM
            const firstItem = container.querySelector('.person-carousel-item');
            // If checking on invisible/collapsed, measurement might be 0, fallback to 200
            const cardWidth = (firstItem && firstItem.offsetWidth > 0) ? firstItem.offsetWidth : 200;
            const gap = 16; // 1rem gap
            const effectiveItemWidth = cardWidth + gap;

            const containerWidth = container.clientWidth;
            const itemsPerPage = Math.floor(containerWidth / effectiveItemWidth) || 1;
            const totalPages = Math.ceil(itemCount / itemsPerPage);

            // Removed cap to allow reaching all items
            const actualPagesToShow = totalPages;

            // Current Page
            const scrollLeft = container.scrollLeft;
            const maxScrollLeft = container.scrollWidth - container.clientWidth;

            // Standard calculation
            let currentPage = Math.round(scrollLeft / (itemsPerPage * effectiveItemWidth));

            // If strictly at end (tolerance 5px), select the last dot
            if (maxScrollLeft > 0 && Math.abs(scrollLeft - maxScrollLeft) < 5) {
                currentPage = totalPages - 1;
            }

            let dotsHtml = '';
            for (let i = 0; i < actualPagesToShow; i++) {
                dotsHtml += `<button class="btn btn-sm p-1 rounded-circle border-0 ${i === currentPage ? 'bg-white' : 'bg-secondary'}" 
                                      style="width: 10px; height: 10px;" 
                                      aria-label="Go to page ${i + 1}"
                                      data-page="${i}"></button>`;
            }
            pagination.innerHTML = dotsHtml;

            // Click events
            pagination.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const page = parseInt(e.target.dataset.page);

                    // If clicking the last dot, go to maxScroll
                    if (page === totalPages - 1) {
                        container.scrollTo({ left: maxScrollLeft, behavior: 'smooth' });
                    } else {
                        const scrollPos = page * itemsPerPage * effectiveItemWidth;
                        container.scrollTo({ left: scrollPos, behavior: 'smooth' });
                    }
                });
            });
        };

        // Initial update
        window.requestAnimationFrame(updatePagination);

        // Update on scroll
        container.addEventListener('scroll', () => {
            if (!container.dataset.ticking) {
                window.requestAnimationFrame(() => {
                    updatePagination();
                    container.dataset.ticking = "";
                });
                container.dataset.ticking = "true";
            }
        });

        // Update on resize
        window.addEventListener('resize', updatePagination);
    }
}

// Auto-run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPeople);
} else {
    initPeople();
}
