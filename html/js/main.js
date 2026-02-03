// If you serve from project root, change to '../metadata/barbero.json'
const JSON_PATH = "data/barbero.json";

let DATA = [];
let fuse = null;
let activeFilters = {
  event: new Set(),
};

// Elements
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const resultCountEl = document.getElementById("result-count");
const eventFiltersContainer = document.getElementById("event-filters");

// Checkboxes
const checkAll = document.getElementById("check-all");
const searchFieldChecks = Array.from(document.querySelectorAll(".search-field"));

async function loadData() {
  const res = await fetch(JSON_PATH);
  if (!res.ok) throw new Error("Impossibile caricare il JSON");
  DATA = await res.json();
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
  const transcriptionSection = document.getElementById("transcription");
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
            <h2>Transcription</h2>
            <div id="transcript-container" class="bg-secondary bg-opacity-10 p-4 rounded border border-secondary" style="max-height: 500px; overflow-y: auto;">
                ${html}
            </div>
        `;

    const container = document.getElementById("transcript-container");
    const segmentEls = Array.from(document.querySelectorAll('.transcript-segment'));

    // === Logic: Text -> Audio (Click to seek) ===
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('transcript-segment')) {
        const start = parseFloat(e.target.getAttribute('data-start'));
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

function populateEventFilters() {
  if (!eventFiltersContainer) return;

  // Extract unique events
  const events = [...new Set(DATA.map(item => item.event))].sort();

  eventFiltersContainer.innerHTML = events.map(evt => `
        <div class="form-check">
            <input class="form-check-input bg-dark border-secondary filter-event" type="checkbox" value="${evt}" id="evt-${evt.replace(/\s+/g, '')}">
            <label class="form-check-label" for="evt-${evt.replace(/\s+/g, '')}">
                ${evt}
            </label>
        </div>
    `).join('');

  // Attach listeners
  document.querySelectorAll('.filter-event').forEach(cb => {
    cb.addEventListener('change', (e) => {
      if (e.target.checked) activeFilters.event.add(e.target.value);
      else activeFilters.event.delete(e.target.value);
      doSearch();
    });
  });
}

function doSearch() {
  if (!searchInput) return;

  let filteredData = DATA;

  // 1. Apply Filters (Exact Match)
  if (activeFilters.event.size > 0) {
    filteredData = filteredData.filter(item => activeFilters.event.has(item.event));
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
    // We need to fuse search ONLY within the filteredData? 
    // Fuse indexes everything. It's better to:
    // Option A: Index everything, search, then filter results.
    // Option B: Create new Fuse index on filtered subset (slow).

    // Going with Option A (Search then Filter) is standard, but Fuse results might include items we filtered out.
    // Better: Filter first -> create temp Fuse? No, too heavy.
    // Standard Approach: Fuse search on whole dataset -> Filter results.

    let searchResults = fuse.search(q).map(r => r.item);

    // Now intersect searchResults with active filters
    if (activeFilters.event.size > 0) {
      searchResults = searchResults.filter(item => activeFilters.event.has(item.event));
    }

    render(searchResults);
    return;
  }

  // No text search, just rendering filtered data
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
      rebuildFuse();
      populateEventFilters();
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
        const qParam = urlParams.get('q');
        if (qParam) {
          searchInput.value = qParam;
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
          // Redirect to collection.html with query param
          // Note: encoding the term ensures special characters don't break the URL
          if (term) {
            window.location.href = `collection.html?q=${encodeURIComponent(term)}`;
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
