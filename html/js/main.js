// If you serve from project root, change to '../metadata/barbero.json'
const JSON_PATH = "data/barbero.json";
const ENTITIES_PATH = "data/entities-authoritative.json";

let DATA = [];
let ENTITIES_DATA = [];
let ENTITIES_VARIANTS = {}; // Map Name -> List of Variants
let fuse = null;
let activeFilters = {
  place: null,
  person: null,
};

// Elements
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const resultCountEl = document.getElementById("result-count");
const geoFiltersContainer = document.getElementById("collapseGeo");
const personFiltersContainer = document.getElementById("collapsePerson");

// Checkboxes
const checkAll = document.getElementById("check-all");
const searchFieldChecks = Array.from(document.querySelectorAll(".search-field"));

async function loadData() {
  const res = await fetch(JSON_PATH);
  if (!res.ok) throw new Error("Impossibile caricare il JSON");
  DATA = await res.json();
}

async function loadEntities() {
  try {
    const res = await fetch(ENTITIES_PATH + '?dt=' + new Date().getTime());
    if (!res.ok) throw new Error("Impossibile caricare le entità");
    ENTITIES_DATA = await res.json();

    // Build Variants Map
    // Build Variants Map
    ENTITIES_VARIANTS = {};
    ENTITIES_DATA.forEach(e => {
      const variants = Array.isArray(e.entity) ? e.entity : [e.entity];

      // Map aliases
      variants.forEach(name => {
        ENTITIES_VARIANTS[name] = variants;
      });

      // Map title
      if (e.title) {
        ENTITIES_VARIANTS[e.title] = variants;
      }
    });

  } catch (e) {
    console.error(e);
  }
}

function getSelectedKeys() {
  if (checkAll && checkAll.checked) {
    return ['lectio_title', 'keywords', 'entities', 'semantic_filename'];
  }
  return searchFieldChecks.filter(c => c.checked).map(c => c.value);
}

function rebuildFuse() {
  const keys = getSelectedKeys();
  if (keys.length === 0) {
    fuse = null; // No keys selected matches nothing? or everything? Logic decision.
    return;
  }

  fuse = new Fuse(DATA, {
    keys,
    threshold: 0.3,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

function render(items) {
  if (!resultsEl) return;

  if (resultCountEl) {
    resultCountEl.textContent = `${items.length} results`;
  }

  if (!items || items.length === 0) {
    resultsEl.innerHTML = '<div class="col-12"><p class="text-white">No result.</p></div>';
    return;
  }

  resultsEl.innerHTML = items
    .map(
      (item) => `
          <div class="col-md-6 col-lg-4">
            <div class="card h-100 bg-secondary text-white border-0 shadow-sm entry">
              <div class="card-body">
                <h5 class="card-title text-white font-kabel">${item.lectio_title}</h5>
                <h6 class="card-subtitle mb-3 text-light opacity-75">${item.event_year
        } – ${item.event}</h6>
                ${item.macrotheme_title
          ? `<p class="card-text small mb-2"><strong>${item.macrotheme_title}</strong></p>`
          : ""
        }
                
                <div class="mb-2">
                  <small class="d-block text-white opacity-75">Keywords:</small>
                  <span class="small">${item.keywords.join(", ")}</span>
                </div>

                <div class="mb-3">
                   <small class="d-block text-white opacity-75">Entities:</small>
                   <span class="small">${item.entities.join(", ")}</span>
                </div>

                <a href="${item.source_url}" target="_blank" class="btn btn-outline-light btn-sm position-relative" style="z-index: 2;">Watch on YouTube</a>
                <a href="lection.html?id=${item.semantic_filename}" class="stretched-link"></a>
              </div>
            </div>
          </div>
        `
    )
    .join("");
}

// Helper to parse SRT time string (00:00:00,000) to seconds
function parseTime(timeStr) {
  if (!timeStr) return 0;
  const [time, ms] = timeStr.split(',');
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s + (parseInt(ms, 10) / 1000);
}

function parseSRT(srtData) {
  const blocks = srtData.trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split('\n');
    if (lines.length < 3) return null;

    // Line 1: Index (ignored)
    // Line 2: Time range 00:00:00,000 --> 00:00:00,000
    const timeLine = lines[1];
    const [startStr, endStr] = timeLine.split(' --> ');

    // Line 3+: Text (joined)
    const text = lines.slice(2).join(' ');

    return {
      start: parseTime(startStr),
      end: parseTime(endStr),
      text: text
    };
  }).filter(x => x !== null);
}

async function loadLection() {
  const audioSection = document.getElementById("audio");
  const transcriptionSection = document.getElementById("transcription-content");
  const searchInput = document.getElementById("transcription-search");
  const searchCounter = document.getElementById("search-counter");
  const prevBtn = document.getElementById("btn-search-prev");
  const nextBtn = document.getElementById("btn-search-next");
  const clearBtn = document.getElementById("btn-search-clear");
  const detailsContent = document.getElementById("lesson-details-content");
  const relatedContainer = document.getElementById("related-lessons-container");
  const relatedContent = document.getElementById("related-lessons-content");

  if (!audioSection || !transcriptionSection) return;

  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');

  if (!id) {
    audioSection.innerHTML = "<p>No lesson ID provided.</p>";
    return;
  }

  // Load Data if not loaded
  if (DATA.length === 0) {
    try {
      await loadData();
    } catch (e) {
      console.error("Failed to load metadata", e);
    }
  }

  // Find lesson data
  const item = DATA.find(d => d.semantic_filename === id);

  // Render Details
  if (detailsContent && item) {
    detailsContent.innerHTML = `
            <div class="card bg-secondary text-white border-0 shadow-sm mt-4">
                <div class="card-body">
                    <h5 class="card-title text-white font-kabel">${item.lectio_title}</h5>
                    <h6 class="card-subtitle mb-3 text-light opacity-75">${item.event_year} – ${item.event}</h6>
                    ${item.macrotheme_title ? `<p class="card-text small mb-2"><strong>${item.macrotheme_title}</strong></p>` : ""}
                    
                    <div class="mb-2">
                        <small class="d-block text-white opacity-75">Keywords:</small>
                        <span class="small">${item.keywords.join(", ")}</span>
                    </div>

                    <div class="mb-3">
                        <small class="d-block text-white opacity-75">Entities:</small>
                        <span class="small">${item.entities.join(", ")}</span>
                    </div>
                </div>
            </div>
        `;

    // Render Related Lessons
    if (item.macrotheme_title && relatedContainer && relatedContent) {
      const relatedItems = DATA.filter(d =>
        d.macrotheme_title === item.macrotheme_title &&
        d.semantic_filename !== item.semantic_filename
      );

      if (relatedItems.length > 0) {
        relatedContainer.classList.remove("d-none");
        relatedContent.innerHTML = relatedItems.map(r => `
                    <div class="card mb-3 bg-secondary text-white border-0 shadow-sm position-relative">
                        <div class="card-body p-3">
                            <h6 class="card-title font-kabel mb-1">${r.lectio_title}</h6>
                            <small class="d-block text-light opacity-75">${r.event_year} – ${r.event}</small>
                            <a href="lection.html?id=${r.semantic_filename}" class="stretched-link"></a>
                        </div>
                    </div>
                `).join('');
      } else {
        relatedContainer.classList.add("d-none");
      }
    }
  }

  // 1. Render Audio
  audioSection.innerHTML = `
        <h2>Audio</h2>
        <audio id="lection-audio" controls class="w-100" style="outline: none;">
            <source src="../audio/${id}.m4a" type="audio/mp4">
            Your browser does not support the audio element.
        </audio>
    `;

  const audioEl = document.getElementById("lection-audio");

  // 2. Render Transcription (SRT based)
  try {
    const response = await fetch(`../transcripts/${id}.srt`);

    if (!response.ok) {
      throw new Error("Transcription not found");
    }

    const srtText = await response.text();
    const segments = parseSRT(srtText);

    // Render segments
    const html = segments.map(seg =>
      `<span class="transcript-segment" data-start="${seg.start}" data-end="${seg.end}">${seg.text} </span>`
    ).join('');

    transcriptionSection.innerHTML = `
            <div id="transcript-container" class="bg-secondary bg-opacity-10 p-4 rounded border border-secondary" style="max-height: 500px; overflow-y: auto;">
                ${html}
            </div>
        `;

    const container = document.getElementById("transcript-container");
    const segmentEls = Array.from(document.querySelectorAll('.transcript-segment'));

    // Store original text for search (to avoid dirty markup)
    segmentEls.forEach(el => el.dataset.originalText = el.textContent);

    // === Logic: Search Transcription ===
    let currentMatchIndex = -1;
    let currentMatches = [];

    const updateSearchCounter = () => {
      if (!searchCounter) return;
      if (currentMatches.length === 0) {
        searchCounter.textContent = "0";
        searchCounter.classList.add('opacity-50'); // Dim if no results
      } else {
        searchCounter.textContent = `${currentMatchIndex + 1}/${currentMatches.length}`;
        searchCounter.classList.remove('opacity-50');
      }
    };

    const updateMatchHighlight = () => {
      // Reset specific active highlight
      currentMatches.forEach((m, idx) => {
        if (idx === currentMatchIndex) {
          m.classList.remove('bg-warning', 'text-dark');
          m.classList.add('bg-danger', 'text-white'); // Active match: Red/White
        } else {
          m.classList.remove('bg-danger', 'text-white');
          m.classList.add('bg-warning', 'text-dark'); // Inactive match: Yellow/Dark
        }
      });
      updateSearchCounter();
    };

    const scrollToMatch = (index) => {
      if (index >= 0 && index < currentMatches.length) {
        currentMatchIndex = index;
        updateMatchHighlight();
        currentMatches[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    const performTranscriptionSearch = (scrollToFirst = false) => {
      if (!searchInput) return;
      const query = searchInput.value.toLowerCase();

      // Reset state
      currentMatchIndex = -1;
      currentMatches = [];

      segmentEls.forEach(el => {
        const original = el.dataset.originalText;
        if (!query) {
          el.innerHTML = original;
          el.classList.remove('bg-warning', 'text-dark'); // Remove active match style if any
          return;
        }

        if (original.toLowerCase().includes(query)) {
          // Highlight match
          const regex = new RegExp(`(${query})`, 'gi');
          el.innerHTML = original.replace(regex, '<mark class="bg-warning text-dark">$1</mark>');
        } else {
          el.innerHTML = original;
        }
      });

      // Collect all new matches
      currentMatches = Array.from(container.querySelectorAll('mark'));

      // Update counter immediately
      if (!query) {
        if (searchCounter) searchCounter.classList.add('d-none');
      } else {
        if (searchCounter) searchCounter.classList.remove('d-none');
        updateSearchCounter();
      }

      if (scrollToFirst && currentMatches.length > 0) {
        scrollToMatch(0);
      }
    };

    if (searchInput) {
      // Trigger on Enter key
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          performTranscriptionSearch(true);
        }
      });

      searchInput.addEventListener('input', (e) => {
        // Real-time update, auto-scroll to first match
        performTranscriptionSearch(true);
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentMatches.length === 0) return;
        let newIndex = currentMatchIndex - 1;
        if (newIndex < 0) newIndex = currentMatches.length - 1; // Loop to end
        scrollToMatch(newIndex);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentMatches.length === 0) return;
        let newIndex = currentMatchIndex + 1;
        if (newIndex >= currentMatches.length) newIndex = 0; // Loop to start
        scrollToMatch(newIndex);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          performTranscriptionSearch(false);
          searchInput.focus();
        }
      });
    }

    // === Logic: Text -> Audio (Click to seek) ===
    container.addEventListener('click', (e) => {
      const segment = e.target.closest('.transcript-segment');
      if (segment) {
        const start = parseFloat(segment.getAttribute('data-start'));
        audioEl.currentTime = start;
        audioEl.play();
      }
    });

    // === Logic: Audio -> Text (Highlight on timeupdate) ===
    audioEl.addEventListener('timeupdate', () => {
      const t = audioEl.currentTime;

      const activeSeg = segmentEls.find(el => {
        const s = parseFloat(el.getAttribute('data-start'));
        const e = parseFloat(el.getAttribute('data-end'));
        return t >= s && t < e;
      });

      const currentActive = container.querySelector('.transcript-segment.active');

      if (activeSeg && activeSeg !== currentActive) {
        if (currentActive) currentActive.classList.remove('active');
        activeSeg.classList.add('active');

        // Auto-scroll logic: keep active element centered if possible
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeSeg.getBoundingClientRect();

        // If element is out of view or close to edges, scroll
        if (activeRect.bottom > containerRect.bottom || activeRect.top < containerRect.top) {
          activeSeg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });

  } catch (err) {
    transcriptionSection.innerHTML = `
            <h2>Transcription</h2>
            <p class="text-secondary">Transcription not available or format error.</p>
        `;
    console.warn("Transcription load error:", err);
  }
}



function populateGeoFilters() {
  if (!geoFiltersContainer) return;

  // 1. Get all places, sort by Title (or entity if missing) alpha
  const places = ENTITIES_DATA
    .filter(e => e.type === "place")
    .sort((a, b) => {
      const valA = a.title || (Array.isArray(a.entity) ? a.entity[0] : a.entity);
      const valB = b.title || (Array.isArray(b.entity) ? b.entity[0] : b.entity);
      return valA.localeCompare(valB);
    });

  // 2. Build HTML: "All Places" + places
  const allOption = `
    <div class="form-check">
      <input class="form-check-input bg-dark border-secondary filter-geo" type="radio" name="geoFilter" value="" id="geo-all" checked>
      <label class="form-check-label" for="geo-all">
        All Places
      </label>
    </div>
  `;

  const placeOptions = places.map(p => {
    // USE TITLE AS VALUE (fallback to entity)
    const val = p.title || (Array.isArray(p.entity) ? p.entity[0] : p.entity);
    return `
    <div class="form-check">
      <input class="form-check-input bg-dark border-secondary filter-geo" type="radio" name="geoFilter" value="${val}" id="geo-${val.replace(/\s+/g, '')}">
      <label class="form-check-label" for="geo-${val.replace(/\s+/g, '')}">
        ${p.title || val}
      </label>
    </div>
  `}).join('');

  // 3. Inject
  const container = geoFiltersContainer.querySelector('.accordion-body');
  if (container) {
    container.innerHTML = allOption + placeOptions;
  }

  // 4. Listeners
  document.querySelectorAll('.filter-geo').forEach(rb => {
    rb.addEventListener('change', (e) => {
      if (e.target.checked) {
        activeFilters.place = e.target.value || null; // "" becomes null
        doSearch();
      }
    });
  });
}

function populatePersonFilters() {
  if (!personFiltersContainer) return;

  // 1. Get all persons, sort by Title (or entity) alpha
  const persons = ENTITIES_DATA
    .filter(e => e.type === "person")
    .sort((a, b) => {
      const valA = a.title || (Array.isArray(a.entity) ? a.entity[0] : a.entity);
      const valB = b.title || (Array.isArray(b.entity) ? b.entity[0] : b.entity);
      return valA.localeCompare(valB);
    });

  // 2. Build HTML: "All Persons" + persons
  const allOption = `
    <div class="form-check">
      <input class="form-check-input bg-dark border-secondary filter-person" type="radio" name="personFilter" value="" id="person-all" checked>
      <label class="form-check-label" for="person-all">
        All Persons
      </label>
    </div>
  `;

  const personOptions = persons.map(p => {
    // USE TITLE AS VALUE (fallback to entity)
    const val = p.title || (Array.isArray(p.entity) ? p.entity[0] : p.entity);
    return `
    <div class="form-check">
      <input class="form-check-input bg-dark border-secondary filter-person" type="radio" name="personFilter" value="${val}" id="person-${val.replace(/\s+/g, '')}">
      <label class="form-check-label" for="person-${val.replace(/\s+/g, '')}">
        ${p.title || val}
      </label>
    </div>
  `}).join('');

  // 3. Inject
  const container = personFiltersContainer.querySelector('.accordion-body');
  if (container) {
    container.innerHTML = allOption + personOptions;
  }

  // 4. Listeners
  document.querySelectorAll('.filter-person').forEach(rb => {
    rb.addEventListener('change', (e) => {
      if (e.target.checked) {
        activeFilters.person = e.target.value || null; // "" becomes null
        doSearch();
      }
    });
  });
}



function doSearch() {
  if (!searchInput) return;

  let filteredData = DATA;

  // 1. Apply Filters (Exact Match or Variant Match)
  // Logic: activeFilter value (e.g. "mare Adriatico") -> lookup variants -> check if lesson has ANY of those variants

  if (activeFilters.place) {
    const variants = ENTITIES_VARIANTS[activeFilters.place] || [activeFilters.place];
    filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
  }

  if (activeFilters.person) {
    const variants = ENTITIES_VARIANTS[activeFilters.person] || [activeFilters.person];
    filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
  }

  // 2. Fuzzy Search
  const q = searchInput.value.trim();

  // If search key selection changed, fuse might be null.
  if (!fuse && q !== "") {
    resultsEl.innerHTML = '<div class="col-12"><p class="text-white">Select at least a field to refine the search by.</p></div>';
    if (resultCountEl) resultCountEl.textContent = "0 results";
    return;
  }

  if (q !== "" && fuse) {
    // Fuse search returns { item, score, ... }
    let searchResults = fuse.search(q).map(r => r.item);

    // Now intersect searchResults with active filters
    if (activeFilters.place) {
      const variants = ENTITIES_VARIANTS[activeFilters.place] || [activeFilters.place];
      searchResults = searchResults.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
    }

    if (activeFilters.person) {
      const variants = ENTITIES_VARIANTS[activeFilters.person] || [activeFilters.person];
      searchResults = searchResults.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
    }

    render(searchResults);
    return;
  }

  // No text search, just rendering filtered data

  if (activeFilters.place) {
    const variants = ENTITIES_VARIANTS[activeFilters.place] || [activeFilters.place];
    filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
  }

  if (activeFilters.person) {
    const variants = ENTITIES_VARIANTS[activeFilters.person] || [activeFilters.person];
    filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
  }



  render(filteredData);
}

// simple debounce
function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function setupCheckboxLogic() {
  if (!checkAll) return;

  // "All fields" behavior
  checkAll.addEventListener('change', () => {
    const isChecked = checkAll.checked;
    searchFieldChecks.forEach(cb => {
      cb.checked = isChecked;
      // Optional: disable them if All is checked? Standard UI usually just syncs them.
      // Let's just sync state.
    });
    rebuildFuse();
    doSearch();
  });

  // Individual checks behavior
  searchFieldChecks.forEach(cb => {
    cb.addEventListener('change', () => {
      // If any unchecked, uncheck All. If all checked, check All.
      const allChecked = searchFieldChecks.every(c => c.checked);
      checkAll.checked = allChecked;

      rebuildFuse();
      doSearch();
    });
  });
}

async function main() {
  try {
    // === Collection Page Logic ===
    // Only run this if we are on the collection page (results element exists)
    if (resultsEl) {
      await loadData();
      await loadEntities();
      rebuildFuse();

      populateGeoFilters();
      populatePersonFilters();

      render(DATA);
      setupCheckboxLogic();

      if (searchInput) {
        searchInput.addEventListener("input", debounce(doSearch, 150));
      }

      // Clear button logic (Collection Page)
      const clearBtn = document.getElementById("clear-search");
      if (clearBtn && searchInput) {
        clearBtn.addEventListener("click", () => {
          searchInput.value = "";
          searchInput.focus();
          doSearch();
        });
      }

      // Search button logic (Collection Page)
      const searchBtn = document.getElementById("btn-search");
      if (searchBtn) {
        searchBtn.addEventListener("click", doSearch);
      }

      // Check for URL query parameter (from landing page)
      if (searchInput) {
        const urlParams = new URLSearchParams(window.location.search);

        // Handle Text Search (q)
        const qParam = urlParams.get('q');
        if (qParam) {
          searchInput.value = qParam;
        }



        // Handle Person Filter (person)
        const personParam = urlParams.get('person');
        if (personParam) {
          const radio = document.querySelector(`.filter-person[value="${personParam}"]`);
          if (radio) {
            radio.checked = true;
            activeFilters.person = personParam;

            // Expand Accordion
            if (personFiltersContainer) {
              const bsCollapse = new bootstrap.Collapse(personFiltersContainer, { toggle: false });
              bsCollapse.show();
            }
          }
        }

        // Handle Place Filter (place)
        const placeParam = urlParams.get('place');
        if (placeParam) {
          const radio = document.querySelector(`.filter-geo[value="${placeParam}"]`);
          if (radio) {
            radio.checked = true;
            activeFilters.place = placeParam;

            // Expand Accordion
            if (geoFiltersContainer) {
              const bsCollapse = new bootstrap.Collapse(geoFiltersContainer, { toggle: false });
              bsCollapse.show();
            }
          }
        }

        // Trigger search if either param exists
        if (qParam || personParam || placeParam) {
          doSearch();
        }
      }
    }

    // === Landing Page / Global Search Logic ===
    const landingInput = document.getElementById("landing-search-input");
    const landingClear = document.getElementById("landing-clear-search");

    if (landingInput) {
      // Redirect on Enter
      landingInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const term = landingInput.value.trim();
          // Redirect to collection.html with query param if term exists, else just collection.html
          if (term) {
            window.location.href = `collection.html?q=${encodeURIComponent(term)}`;
          } else {
            window.location.href = `collection.html`;
          }
        }
      });

      // Clear functionality
      if (landingClear) {
        landingClear.addEventListener("click", () => {
          landingInput.value = "";
          landingInput.focus();
        });
      }

      // Search button functionality
      const landingBtn = document.getElementById("landing-btn-search");
      if (landingBtn) {
        landingBtn.addEventListener("click", () => {
          const term = landingInput.value.trim();
          if (term) {
            window.location.href = `collection.html?q=${encodeURIComponent(term)}`;
          } else {
            window.location.href = `collection.html`;
          }
        });
      }
    }

    // === Lection Page Logic ===
    await loadLection();

  } catch (err) {
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="col-12"><div class="alert alert-danger">Errore: ${err.message}</div></div>`;
    }
    console.error(err);
  }
}

main();
