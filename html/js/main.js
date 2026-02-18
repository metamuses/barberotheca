// If you serve from project root, change to '../metadata/barbero.json'
const JSON_PATH = "data/barbero.json";
const ENTITIES_PATH = "data/entities-authoritative.json";

let DATA = [];
let ENTITIES_DATA = [];
let ENTITIES_VARIANTS = {}; // Map Name -> List of Variants
let fuse = null;
let activeFilters = {
  place: [],
  person: [],
  keyword: [],
};

// Elements
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const resultCountEl = document.getElementById("result-count");


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
    return ['lectio_title', 'keywords', 'entities'];
  }
  return searchFieldChecks.filter(c => c.checked).map(c => c.value);
}

function rebuildFuse() {
  const keys = getSelectedKeys();
  if (keys.length === 0) {
    fuse = null;
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
    resultsEl.innerHTML = '<div class="col-12"><p class="text-white">Nessun risultato</p></div>';
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
                  <small class="d-block text-white opacity-75">Parole chiave:</small>
                  <span class="small">${item.keywords.join(", ")}</span>
                </div>

                <div class="mb-3">
                   <small class="d-block text-white opacity-75">Entità:</small>
                   <span class="small">${item.entities.join(", ")}</span>
                </div>

                <a href="${item.source_url}" target="_blank" class="btn btn-outline-light btn-sm position-relative" style="z-index: 2;">Guarda su YouTube</a>
                <a href="lection.html?id=${item.id}" class="stretched-link"></a>
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
  const headerSection = document.getElementById("lection-header");
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

  if (ENTITIES_DATA.length === 0) {
    await loadEntities();
  }

  // Find lesson data
  // Try finding by numeric ID first (fast check), then fallback to semantic_filename string match
  let item = DATA.find(d => d.id == id);
  if (!item) {
    item = DATA.find(d => d.semantic_filename === id);
  }

  if (!item) {
    audioSection.innerHTML = "<p>Lesson not found.</p>";
    return;
  }

  // Use semantic_filename from the found item for resources
  const resourceId = item.semantic_filename;

  // Setup Download Button
  const downloadBtn = document.getElementById("download-transcript-btn");
  if (downloadBtn) {
    downloadBtn.href = `../transcripts/${resourceId}.txt`;
  }

  // Render Header
  if (headerSection && item) {
    const numBadge = item.lectio_num ? `<span class="float-end text-secondary fw-light">#${item.lectio_num}</span>` : '';
    headerSection.innerHTML = `
        <h2 class="display-5 font-kabel mb-3 text-white">
            ${item.lectio_title}
            ${numBadge}
        </h2>
        ${item.macrotheme_title ? `<h4 class="text-white opacity-75 mb-2">Fa parte della serie: ${item.macrotheme_title}</h4>` : ''}
        <p class="lead text-secondary mb-0 fw-light">${item.event} ${item.event_year ? `(${item.event_year})` : ''}</p>
   `;
  }

  // Render Details (Sidebar)
  if (detailsContent && item) {
    // Helper to find entity URL
    const findEntityUrl = (name) => {
      const entry = ENTITIES_DATA.find(e => {
        const variants = Array.isArray(e.entity) ? e.entity : [e.entity];
        return variants.includes(name);
      });
      return entry ? entry.wikipedia_it : null;
    };

    const entitiesHtml = item.entities.map(name => {
      const url = findEntityUrl(name);
      if (url) {
        return `<a href="${url}" target="_blank" class="badge bg-secondary text-decoration-none border border-light border-opacity-25 me-1 mb-1 text-white">${name}</a>`;
      }
      return `<span class="badge bg-secondary border border-light border-opacity-25 me-1 mb-1 text-white opacity-75">${name}</span>`;
    }).join('');

    detailsContent.innerHTML = `
        <div class="card bg-secondary text-white border-0 shadow-sm">
            <div class="card-body">
                <h5 class="card-title font-kabel mb-3">Fonte</h5>
                <div class="mb-4">
                    <a href="${item.source_url}" target="_blank" class="btn btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2">
                        <i class="bi bi-youtube"></i>
                        Video Youtube
                    </a>
                </div>

                <div>
                    <h6 class="text-white opacity-75 mb-2">Wikipedia</h6>
                    <div class="d-flex flex-wrap">
                        ${entitiesHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Render Keywords (Outside Card)
    const keywordsContent = document.getElementById("lesson-keywords-content");
    if (keywordsContent && item.keywords && item.keywords.length > 0) {
      keywordsContent.innerHTML = `
            <div class="d-flex flex-wrap">
                ${item.keywords.map(k => `
                    <a href="collection.html?keyword=${encodeURIComponent(k)}" class="badge rounded-pill bg-secondary text-decoration-none text-white fw-normal me-1 mb-1 border border-light border-opacity-25 shadow-sm">${k}</a>
                `).join('')}
            </div>
        `;
    }

    // Render Related Lessons
    if (item.macrotheme_title && relatedContainer && relatedContent) {
      const relatedItems = DATA.filter(d =>
        d.macrotheme_title === item.macrotheme_title &&
        d.semantic_filename !== item.semantic_filename
      );

      if (relatedItems.length > 0) {
        relatedContainer.classList.remove("d-none");
        relatedContent.innerHTML = relatedItems.map(r => {
          const rNum = r.lectio_num ? `<span class="float-end text-white-50">#${r.lectio_num}</span>` : '';
          return `
                <div class="card mb-3 bg-secondary text-white border-0 shadow-sm position-relative">
                    <div class="card-body p-3">
                        <h6 class="card-title font-kabel mb-1">
                            ${r.lectio_title}
                            ${rNum}
                        </h6>
                        <small class="d-block text-light opacity-75">${r.event_year} – ${r.event}</small>
                        <a href="lection.html?id=${r.id}" class="stretched-link"></a>
                    </div>
                </div>
            `;
        }).join('');
      } else {
        relatedContainer.classList.add("d-none");
      }
    }
  }

  // 1. Render Audio
  audioSection.innerHTML = `
        <h2>Audio</h2>
        <audio id="lection-audio" controls class="w-100" style="outline: none;">
            <source src="../audio/${resourceId}.m4a" type="audio/mp4">
            Your browser does not support the audio element.
        </audio>
    `;

  const audioEl = document.getElementById("lection-audio");

  // 2. Render Transcription (SRT based)
  try {
    const response = await fetch(`../transcripts/${resourceId}.srt`);

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

    // Enrich Transcription with Icons
    if (typeof enrichTranscription === 'function') {
      enrichTranscription("transcript-container", item, ENTITIES_DATA, ENTITIES_VARIANTS);
    }

    // Store original text for search (to avoid dirty markup)
    // We store InnerHTML to preserve icons added by enrichment
    segmentEls.forEach(el => el.dataset.originalText = el.innerHTML);

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
        // Restore original HTML first
        el.innerHTML = el.dataset.originalText;

        if (!query) {
          el.classList.remove('bg-warning', 'text-dark');
          return;
        }

        // Recursive function to highlight text nodes
        const highlightTextNodes = (node) => {
          if (node.nodeType === 3) { // Text node
            const text = node.nodeValue;
            const regex = new RegExp(`(${query})`, 'gi');

            if (regex.test(text)) {
              const fragment = document.createDocumentFragment();
              let lastIndex = 0;
              let match;

              // Reset regex lastIndex
              regex.lastIndex = 0;

              while ((match = regex.exec(text)) !== null) {
                // Text before match
                if (match.index > lastIndex) {
                  fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                }

                // Match wrapped in mark
                const mark = document.createElement('mark');
                mark.className = 'bg-warning text-dark';
                mark.textContent = match[0];
                fragment.appendChild(mark);

                lastIndex = regex.lastIndex;
              }

              // Remaining text
              if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
              }

              node.parentNode.replaceChild(fragment, node);
            }
          } else if (node.nodeType === 1) { // Element node
            // Skip existing marks or script/style tags if any (though unlikely here)
            if (node.nodeName !== 'MARK' && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
              Array.from(node.childNodes).forEach(child => highlightTextNodes(child));
            }
          }
        };

        highlightTextNodes(el);
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


function renderActiveFilters() {
  const container = document.getElementById("active-filters");
  if (!container) return;
  container.innerHTML = "";

  let hasFilter = false;

  // Helper to create chip
  const createChip = (type, value) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm rounded-pill d-inline-flex align-items-center";
    btn.innerHTML = `<span>${value}</span> <i class="bi bi-x ms-2"></i>`;
    btn.onclick = () => {
      // Update state
      activeFilters[type] = activeFilters[type].filter(v => v !== value);
      doSearch();
    };
    container.appendChild(btn);
    hasFilter = true;
  };

  activeFilters.place.forEach(val => createChip('place', val));
  activeFilters.person.forEach(val => createChip('person', val));
  activeFilters.keyword.forEach(val => createChip('keyword', val));

  if (hasFilter) {
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn btn-link btn-sm text-white text-decoration-none";
    clearBtn.innerHTML = `Pulisci <i class="bi bi-x"></i>`;
    clearBtn.onclick = () => {
      activeFilters.place = [];
      activeFilters.person = [];
      activeFilters.keyword = [];
      doSearch();
    };
    container.appendChild(clearBtn);
  }
}

function doSearch() {
  if (!searchInput) return;

  let filteredData = DATA;

  // 1. Apply Filters (Exact Match or Variant Match)
  if (activeFilters.place.length > 0) {
    activeFilters.place.forEach(pFilter => {
      const variants = ENTITIES_VARIANTS[pFilter] || [pFilter];
      filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
    });
  }

  if (activeFilters.person.length > 0) {
    activeFilters.person.forEach(pFilter => {
      const variants = ENTITIES_VARIANTS[pFilter] || [pFilter];
      filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
    });
  }

  // 2. Fuzzy Search
  const q = searchInput.value.trim();

  // If search key selection changed, fuse might be null.
  if (!fuse && q !== "") {
    resultsEl.innerHTML = '<div class="col-12"><p class="text-white">Seleziona almeno un filtro per affinare la ricerca.</p></div>';
    if (resultCountEl) resultCountEl.textContent = "0 results";
    return;
  }

  if (q !== "" && fuse) {
    // Fuse search returns { item, score, ... }
    let searchResults = fuse.search(q).map(r => r.item);

    // Now intersect searchResults with active filters
    if (activeFilters.place.length > 0) {
      activeFilters.place.forEach(pFilter => {
        const variants = ENTITIES_VARIANTS[pFilter] || [pFilter];
        searchResults = searchResults.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
      });
    }

    if (activeFilters.person.length > 0) {
      activeFilters.person.forEach(pFilter => {
        const variants = ENTITIES_VARIANTS[pFilter] || [pFilter];
        searchResults = searchResults.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
      });
    }

    if (activeFilters.keyword.length > 0) {
      activeFilters.keyword.forEach(kFilter => {
        searchResults = searchResults.filter(item => item.keywords && item.keywords.some(k => k.toLowerCase() === kFilter.toLowerCase()));
      });
    }

    // Valid match
    render(searchResults);
    renderActiveFilters();
    return;
  }

  // No text search, just rendering filtered data
  if (activeFilters.place.length > 0) {
    activeFilters.place.forEach(pFilter => {
      const variants = ENTITIES_VARIANTS[pFilter] || [pFilter];
      filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
    });
  }

  if (activeFilters.person.length > 0) {
    activeFilters.person.forEach(pFilter => {
      const variants = ENTITIES_VARIANTS[pFilter] || [pFilter];
      filteredData = filteredData.filter(item => item.entities && item.entities.some(e => variants.includes(e)));
    });
  }

  if (activeFilters.keyword.length > 0) {
    activeFilters.keyword.forEach(kFilter => {
      filteredData = filteredData.filter(item => item.keywords && item.keywords.some(k => k.toLowerCase() === kFilter.toLowerCase()));
    });
  }

  render(filteredData);
  renderActiveFilters();
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

function populateKeywordCloud() {
  const container = document.getElementById("keyword-cloud-container");
  if (!container) return;

  // Responsive limit: 25 for mobile (<768px), 50 for desktop
  const isMobile = window.innerWidth < 768;
  const limit = isMobile ? 25 : 50;

  // 1. Calculate Frequency
  const freqMap = {};
  DATA.forEach(item => {
    if (item.keywords && Array.isArray(item.keywords)) {
      item.keywords.forEach(k => {
        const key = k.trim();
        if (key) {
          freqMap[key] = (freqMap[key] || 0) + 1;
        }
      });
    }
  });

  // 2. Sort by Frequency (Descending)
  const sortedKeywords = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit); // Apply limit

  if (sortedKeywords.length === 0) {
    container.innerHTML = '<span class="text-secondary">No keywords found.</span>';
    return;
  }

  // 3. Middle-out Sort (Center the most frequent)
  const middleOut = [];
  let left = Math.floor(sortedKeywords.length / 2);
  let right = left + 1;

  // Create a new array and alternate adding largest to middle
  const centeredList = [];
  sortedKeywords.forEach((kw, i) => {
    if (i % 2 === 0) {
      centeredList.push(kw); // Right side
    } else {
      centeredList.unshift(kw); // Left side
    }
  });

  // 4. Render
  const maxFreq = sortedKeywords[0][1];
  const minFreq = sortedKeywords[sortedKeywords.length - 1][1];

  const getFsClass = (freq) => {
    if (maxFreq === minFreq) return "fs-3";
    const percent = (freq - minFreq) / (maxFreq - minFreq); // 0 to 1
    if (percent > 0.9) return "fs-1";
    if (percent > 0.7) return "fs-2";
    if (percent > 0.5) return "fs-3";
    if (percent > 0.3) return "fs-4";
    if (percent > 0.1) return "fs-5";
    return "fs-6";
  };

  container.innerHTML = centeredList.map(([word, freq]) => {
    const fsClass = getFsClass(freq);
    const opacity = 0.8;

    return `
        <a href="collection.html?keyword=${encodeURIComponent(word)}"
           class="badge rounded-pill bg-secondary text-decoration-none text-white fw-normal m-1 py-2 px-3 border border-light border-opacity-25 shadow-sm ${fsClass}"
           style="opacity: ${opacity}; transition: all 0.2s;"
           onmouseover="this.style.opacity=1; this.style.transform='scale(1.1)'"
           onmouseout="this.style.opacity=${opacity}; this.style.transform='scale(1)'"
           title="${freq} occurrences">
           ${word}
        </a>
      `;
  }).join("");
}

// === Enrichment Logic ===
function enrichTranscription(containerId, lessonItem, entitiesData, entitiesVariants) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!entitiesData || entitiesData.length === 0) return;

  const typeMap = new Map();
  entitiesData.forEach(entry => {
    const type = entry.type ? entry.type.toLowerCase() : '';
    const variants = Array.isArray(entry.entity) ? entry.entity : [entry.entity];
    variants.forEach(v => {
      if (v) { typeMap.set(v, type); typeMap.set(v.toLowerCase(), type); }
    });
    if (entry.title) {
      typeMap.set(entry.title, type);
      typeMap.set(entry.title.toLowerCase(), type);
    }
  });

  const termsMap = new Map();
  const addTerm = (term, source) => {
    if (!term) return;
    const normalized = term.trim().toLowerCase();
    if (normalized.length < 2) return;
    let type = '';
    if (typeMap.has(term)) type = typeMap.get(term);
    else if (typeMap.has(normalized)) type = typeMap.get(normalized);
    if (source === 'keyword_list') type = 'keyword';
    const existing = termsMap.get(normalized);
    if (existing) {
      if (existing.type === 'keyword' && type !== 'keyword') {
        termsMap.set(normalized, { type, display: term });
      }
    } else {
      termsMap.set(normalized, { type, display: term });
    }
  };

  if (lessonItem.entities) {
    lessonItem.entities.forEach(entityName => {
      let type = '';
      if (typeMap.has(entityName)) type = typeMap.get(entityName);
      else if (typeMap.has(entityName.toLowerCase())) type = typeMap.get(entityName.toLowerCase());
      const normalized = entityName.trim().toLowerCase();
      termsMap.set(normalized, { type, display: entityName });
    });
  }
  if (lessonItem.keywords) lessonItem.keywords.forEach(kw => addTerm(kw, 'keyword_list'));

  const sortedTerms = Array.from(termsMap.keys()).sort((a, b) => b.length - a.length);
  if (sortedTerms.length === 0) return;

  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(${sortedTerms.map(escapeRegExp).join('|')})\\b`, 'gi');

  const segments = container.querySelectorAll('.transcript-segment');
  segments.forEach(segment => {
    let html = segment.innerHTML;
    html = html.replace(pattern, (match) => {
      const key = match.toLowerCase();
      const info = termsMap.get(key);
      if (!info || !info.type) return match;
      let iconClass = '', colorClass = '';
      if (info.type === 'person') { iconClass = 'bi bi-person'; colorClass = 'text-danger'; }
      else if (info.type === 'place') { iconClass = 'bi bi-geo-alt'; colorClass = 'text-primary'; }
      else if (info.type === 'keyword') { iconClass = 'bi bi-key'; colorClass = 'text-success'; }

      if (!iconClass) return match;

      // Find original entity data if possible for coordinates or images
      let entityDataAttr = '';

      // Look up in authoritative data if available
      if (entitiesData && (info.type === 'place' || info.type === 'person')) {
        const entry = entitiesData.find(e => {
          if (e.type !== info.type) return false;
          const variants = Array.isArray(e.entity) ? e.entity : [e.entity];
          if (e.title) variants.push(e.title);
          return variants.some(v => v && v.toLowerCase() === key);
        });

        if (entry) {
          const title = entry.title || (Array.isArray(entry.entity) ? entry.entity[0] : entry.entity);
          let extra = '';

          if (info.type === 'place' && entry.coordinates) {
            const lat = entry.coordinates[0];
            const lon = entry.coordinates[1];
            extra = `data-lat="${lat}" data-lon="${lon}"`;
          } else if (info.type === 'person' && entry.image_url) {
            extra = `data-image="${entry.image_url}"`;
          }

          entityDataAttr = `data-type="${info.type}" data-title="${title}" ${extra}`;
        }
      }

      // Add generic type/title if not filtered above
      if (!entityDataAttr) {
        // Use info.display if available to ensure canonical casing for filters
        const displayTitle = (info && info.display) ? info.display : match;
        entityDataAttr = `data-type="${info.type}" data-title="${displayTitle}"`;
      }

      return `${match}<sup class="entity-icon pointer" ${entityDataAttr}><i class="${iconClass} ${colorClass}"></i></sup>`;
    });
    segment.innerHTML = html;
  });

  // Initialize Tooltip Handler (only once)
  if (!window.tooltipInitialized) {
    setupEntityTooltip();
    window.tooltipInitialized = true;
  }
}

function setupEntityTooltip() {
  let tooltip = document.createElement('div');
  tooltip.className = 'entity-tooltip d-none';
  document.body.appendChild(tooltip);

  let currentMap = null; // Store map instance

  const isMobile = () => window.innerWidth < 768;

  // Helper to hide tooltip
  const hideTooltip = () => {
    tooltip.classList.add('d-none');
    if (currentMap) {
      currentMap.off();
      currentMap.remove();
      currentMap = null;
    }
  };

  // Helper to show tooltip content
  const showContent = (target, isMobileMode) => {
    const type = target.dataset.type;
    const title = target.dataset.title;
    const lat = target.dataset.lat;
    const lon = target.dataset.lon;
    const image = target.dataset.image;

    let content = '';
    // Close button for mobile
    if (isMobileMode) {
      content += `<button class="tooltip-close" aria-label="Close">&times;</button>`;
    }

    if (type === 'keyword') {
      content += `
          <div class="text-center mobile-redirect-target" style="cursor: pointer;">
            <span class="badge rounded-pill bg-secondary text-white fw-normal py-2 px-3 border border-secondary border-opacity-25 shadow-sm fs-6">
              ${title}
            </span>
          </div>
        `;
    } else {
      // Title is clickable on mobile
      content += `<h6 class="${isMobileMode ? 'mobile-redirect-target user-select-none' : ''}" style="${isMobileMode ? 'cursor:pointer;' : ''}">${title}</h6>`;

      if (type === 'place' && lat && lon) {
        content += `<div id="tooltip-map-container" class="tooltip-map mobile-redirect-target" style="cursor: pointer;"></div>`;
      } else if (type === 'person' && image) {
        content += `<div class="tooltip-image-container mobile-redirect-target" style="cursor: pointer;"><img src="${image}" class="tooltip-image" alt="${title}" onerror="this.style.display='none'"></div>`;
      } else {
        content += `<span class="badge bg-secondary mobile-redirect-target" style="cursor: pointer;">${type}</span>`;
      }
    }

    tooltip.innerHTML = content;
    tooltip.classList.remove('d-none');

    // Add Close Listener (Mobile)
    if (isMobileMode) {
      const closeBtn = tooltip.querySelector('.tooltip-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent bubbling to document
          hideTooltip();
        });
      }

      // Add Redirect Listeners for internal elements (Map, Image, Title)
      const redirectTargets = tooltip.querySelectorAll('.mobile-redirect-target');
      redirectTargets.forEach(el => {
        el.addEventListener('click', () => {
          triggerRedirect(type, title);
        });
      });
    }

    // Initialize Map if needed
    if (type === 'place' && lat && lon) {
      // Delay slightly to ensure DOM is ready
      setTimeout(() => {
        const container = document.getElementById('tooltip-map-container');
        if (container) {
          if (currentMap) {
            currentMap.off();
            currentMap.remove();
            currentMap = null;
          }
          currentMap = L.map('tooltip-map-container', {
            zoomControl: false,
            attributionControl: false,
            dragging: !isMobileMode, // Disable dragging on mobile to prevent scroll issues? Or allow it. Let's allow it but maybe prevent click propagation if dragging.
            tap: !isMobileMode
          }).setView([lat, lon], 5);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            subdomains: 'abc',
            maxZoom: 19
          }).addTo(currentMap);

          const marker = L.marker([lat, lon]).addTo(currentMap);

          if (isMobileMode) {
            currentMap.on('click', () => triggerRedirect(type, title));
            marker.on('click', () => triggerRedirect(type, title));
          }
        }
      }, 50);
    }
  };

  const triggerRedirect = (type, title) => {
    if (type && title) {
      let url = 'collection.html';
      if (type === 'person') url += `?person=${encodeURIComponent(title)}`;
      else if (type === 'place') url += `?place=${encodeURIComponent(title)}`;
      else if (type === 'keyword') url += `?keyword=${encodeURIComponent(title)}`;
      window.location.href = url;
    }
  };

  // Click Handler
  document.addEventListener('click', (e) => {
    if (tooltip.contains(e.target) && !e.target.closest('.mobile-redirect-target')) {
      return;
    }

    const target = e.target.closest('.entity-icon');

    if (isMobile()) {
      if (target) {
        // Mobile: Open Tooltip (Bottom Sheet)
        e.preventDefault();
        e.stopPropagation();
        showContent(target, true);
      } else {
        // Mobile: Click outside closes tooltip
        if (!tooltip.classList.contains('d-none')) {
          hideTooltip();
        }
      }
    } else {
      // Desktop: Click redirects
      if (target) {
        const type = target.dataset.type;
        const title = target.dataset.title;
        triggerRedirect(type, title);
      }
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (isMobile()) return; // Disable hover on mobile

    const target = e.target.closest('.entity-icon');
    if (!target) return;

    showContent(target, false);

    // Initial Position
    positionTooltip(e, tooltip);
  });

  document.addEventListener('mousemove', (e) => {
    if (isMobile()) return;
    const target = e.target.closest('.entity-icon');
    if (target) {
      positionTooltip(e, tooltip);
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (isMobile()) return;
    const target = e.target.closest('.entity-icon');
    if (target) {
      hideTooltip();
    }
  });
}

function positionTooltip(e, tooltip) {
  const x = e.pageX;
  const y = e.pageY;

  // Check bounds (simple logic)
  const winWidth = window.innerWidth;
  let left = x + 15;
  if (left + 300 > winWidth) {
    left = x - 315; // Show to left
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${y + 15}px`;
}

// === Map Logic ===
function initMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;
  if (mapElement._leaflet_id) return; // Already initialized

  const map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19
  }).addTo(map);

  if (!ENTITIES_DATA || ENTITIES_DATA.length === 0) return;

  const places = ENTITIES_DATA.filter(item =>
    item.type === 'place' && item.coordinates &&
    Array.isArray(item.coordinates) && item.coordinates.length === 2
  );

  places.forEach(p => {
    const lat = p.coordinates[0];
    const lon = p.coordinates[1];
    const val = p.title || (Array.isArray(p.entity) ? p.entity[0] : p.entity);
    const marker = L.marker([lat, lon]).addTo(map);
    const popupContent = `
            <div class="text-center">
                <h6 class="mb-1 text-dark">${p.title || val}</h6>
                ${p.image_url ? `<img src="${p.image_url}" class="img-fluid rounded mb-2" style="max-height: 100px;">` : ''}
                <br>
                <a href="collection.html?place=${encodeURIComponent(val)}" class="btn btn-sm btn-secondary text-white">View Lessons</a>
            </div>
         `;
    marker.bindPopup(popupContent);
  });
}

// === People Carousel Logic ===
function initPeople() {
  const container = document.getElementById("people-scroll-container");
  if (!container) return;
  if (!ENTITIES_DATA || ENTITIES_DATA.length === 0) return;

  try {
    const people = ENTITIES_DATA.filter(item => item.type === 'person');
    const processedPeople = people.map(p => {
      const entityId = Array.isArray(p.entity) ? p.entity[0] : p.entity;
      return {
        name: p.title || entityId,
        id: p.title || entityId,
        image: p.image_url || 'https://placehold.co/400x400/grey/white?text=No+Image',
        original_link: p.wikipedia_it
      };
    });

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
             <a href="collection.html?person=${encodeURIComponent(p.id)}" class="text-decoration-none">
                 <div class="card h-100 bg-secondary text-white border-0 shadow-sm person-card">
                    <div class="overflow-hidden rounded-top bg-dark" style="aspect-ratio: 1 / 1;">
                        <img src="${p.image}" class="card-img-top w-100 h-100 object-fit-cover"
                             alt="${p.name}" loading="lazy" style="object-fit: cover;"
                             onerror="this.src='https://placehold.co/400x400/grey/white?text=No+Image'">
                    </div>
                    <div class="card-body p-2 d-flex align-items-center justify-content-center text-center">
                        <h6 class="card-title font-kabel mb-0 text-truncate w-100 text-white" title="${p.name}">${p.name}</h6>
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
      // Re-query to ensure accurate measurement in case of layout shifts
      const firstItem = container.querySelector('.person-carousel-item');
      container.scrollBy({ left: -container.clientWidth / 2, behavior: 'smooth' });
    });
    nextBtn.addEventListener("click", () => {
      container.scrollBy({ left: container.clientWidth / 2, behavior: 'smooth' });
    });
  }

  if (pagination) {
    const updatePagination = () => {
      const firstItem = container.querySelector('.person-carousel-item');
      const cardWidth = (firstItem && firstItem.offsetWidth > 0) ? firstItem.offsetWidth : 200;
      const gap = 16;
      const effectiveItemWidth = cardWidth + gap;
      const containerWidth = container.clientWidth;
      const itemsPerPage = Math.floor(containerWidth / effectiveItemWidth) || 1;
      const totalPages = Math.ceil(itemCount / itemsPerPage);
      const actualPagesToShow = totalPages;
      const scrollLeft = container.scrollLeft;
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      let currentPage = Math.round(scrollLeft / (itemsPerPage * effectiveItemWidth));
      if (maxScrollLeft > 0 && Math.abs(scrollLeft - maxScrollLeft) < 5) currentPage = totalPages - 1;

      let dotsHtml = '';
      for (let i = 0; i < actualPagesToShow; i++) {
        dotsHtml += `<button class="btn btn-sm p-1 rounded-circle border-0 ${i === currentPage ? 'bg-white' : 'bg-secondary'}" style="width: 10px; height: 10px;" aria-label="Go to page ${i + 1}" data-page="${i}"></button>`;
      }
      pagination.innerHTML = dotsHtml;

      pagination.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const page = parseInt(e.target.dataset.page);
          if (page === totalPages - 1) container.scrollTo({ left: maxScrollLeft, behavior: 'smooth' });
          else {
            const scrollPos = page * itemsPerPage * effectiveItemWidth;
            container.scrollTo({ left: scrollPos, behavior: 'smooth' });
          }
        });
      });
    };
    window.requestAnimationFrame(updatePagination);
    container.addEventListener('scroll', () => {
      if (!container.dataset.ticking) {
        window.requestAnimationFrame(() => {
          updatePagination();
          container.dataset.ticking = "";
        });
        container.dataset.ticking = "true";
      }
    });
    window.addEventListener('resize', updatePagination);
  }
}

// === Showcase Logic ===
function initShowcase() {
  const container = document.getElementById("showcase-container");
  if (!container) return;

  if (!DATA || DATA.length === 0) {
    container.innerHTML = '<div class="col-12 text-center text-secondary">Nessuna lezione disponibile.</div>';
    return;
  }

  // Pick 3 random lessons
  const indices = new Set();
  const max = DATA.length;
  // Safety check if we have less than 3 items
  const count = Math.min(3, max);

  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * max));
  }

  const selectedLessons = Array.from(indices).map(i => DATA[i]);

  container.innerHTML = selectedLessons.map(item => `
    <div class="col-md-4">
      <div class="card h-100 bg-secondary text-white border-0 shadow-sm entry">
        <div class="card-body">
          <h5 class="card-title text-white font-kabel">${item.lectio_title}</h5>
          <h6 class="card-subtitle mb-3 text-light opacity-75">
            ${item.event_year ? item.event_year + ' – ' : ''}${item.event}
          </h6>
          ${item.macrotheme_title
      ? `<p class="card-text small mb-2"><strong>${item.macrotheme_title}</strong></p>`
      : ""
    }

          <div class="mb-2">
            <small class="d-block text-white opacity-75">Parole chiave:</small>
            <span class="small">${item.keywords.join(", ")}</span>
          </div>

          <div class="mb-3">
             <small class="d-block text-white opacity-75">Entità:</small>
             <span class="small">${item.entities.join(", ")}</span>
          </div>

          <a href="${item.source_url}" target="_blank" class="btn btn-outline-light btn-sm position-relative" style="z-index: 2;">Guarda su YouTube</a>
          <a href="lection.html?id=${item.id}" class="stretched-link"></a>
        </div>
      </div>
    </div>
  `).join('');
}


// Function to inject Knowledge Graph link in header nav
function injectKnowledgeGraphLink() {
  const nav = document.querySelector('header nav');
  if (!nav) return;

  // Check if already exists to avoid duplicates
  if (nav.querySelector('a[href*="knowledge-graph.ttl"]')) return;

  const link = document.createElement('a');
  link.href = "https://github.com/metamuses/barberotheca/blob/main/metadata/knowledge-graph.ttl";
  link.className = "text-white text-decoration-none me-4";
  link.setAttribute("download", "");
  link.textContent = "Knowledge Graph";

  const searchBtn = nav.querySelector('.btn-outline-light');
  if (searchBtn) {
    nav.insertBefore(link, searchBtn);
  } else {
    nav.appendChild(link);
  }
}

injectKnowledgeGraphLink();

async function main() {
  try {
    // 1. Load Data (Metadata & Entities)
    await loadData();
    await loadEntities();

    // === Collection Page Logic ===
    if (resultsEl) {
      rebuildFuse();
      render(DATA);
      setupCheckboxLogic();
      populateKeywordCloud();

      // Re-render cloud on resize (debounced)
      window.addEventListener('resize', debounce(() => {
        populateKeywordCloud();
      }, 250));

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
          if (!activeFilters.person.includes(personParam)) {
            activeFilters.person.push(personParam);
          }
        }

        // Handle Place Filter (place)
        const placeParam = urlParams.get('place');
        if (placeParam) {
          if (!activeFilters.place.includes(placeParam)) {
            activeFilters.place.push(placeParam);
          }
        }

        // Handle Keyword Filter (keyword)
        const keywordParam = urlParams.get('keyword');
        if (keywordParam) {
          if (!activeFilters.keyword.includes(keywordParam)) {
            activeFilters.keyword.push(keywordParam);
          }
        }

        // Trigger search if either param exists
        if (qParam || personParam || placeParam || keywordParam) {
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

    // === Keyword Cloud (Index Page fallback) ===
    // If not on collection page (resultsEl check above), but cloud container exists
    if (!resultsEl && document.getElementById("keyword-cloud-container")) {
      populateKeywordCloud();
      window.addEventListener('resize', debounce(() => {
        populateKeywordCloud();
      }, 250));
    }

    // === Lection Page Logic ===
    await loadLection();

    // === Index Page Specifics (Map & People & Showcase) ===
    initMap();
    initPeople();
    initShowcase();

  } catch (err) {
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="col-12"><div class="alert alert-danger">Errore: ${err.message}</div></div>`;
    }
    console.error(err);
  }
}

main();
