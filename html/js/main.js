// If you serve from project root, change to '../metadata/barbero.json'
const JSON_PATH = "../metadata/barbero.json";

let DATA = [];
let fuse = null;

const searchInput = document.getElementById("search");
const resultsEl = document.getElementById("results");
const keysWarning = document.getElementById("keys-warning");
const fieldCheckboxes = Array.from(
  document.querySelectorAll(".form-check-input")
);

async function loadData() {
  const res = await fetch(JSON_PATH);
  if (!res.ok) throw new Error("Impossibile caricare il JSON");
  DATA = await res.json();
}

function getSelectedKeys() {
  return fieldCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
}

function rebuildFuse() {
  const keys = getSelectedKeys();
  if (keys.length === 0) {
    keysWarning.classList.remove("d-none");
    fuse = null;
    return;
  }
  keysWarning.classList.add("d-none");
  fuse = new Fuse(DATA, {
    keys,
    threshold: 0.3,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

function render(items) {
  if (!items || items.length === 0) {
    resultsEl.innerHTML = '<p class="muted">Nessun risultato.</p>';
    return;
  }
  resultsEl.innerHTML = items
    .map(
      (item) => `
          <div class="col-md-6 col-lg-4">
            <div class="card mb-3 shadow-sm entry">
              <div class="card-body">
                <h5 class="card-title">${item.lectio_title}</h5>
                <h6 class="card-subtitle mb-2 text-muted">${
                  item.event_year
                } – ${item.event}</h6>
                ${
                  item.macrotheme_title
                    ? `<p class="card-text"><strong>${item.macrotheme_title}</strong></p>`
                    : ""
                }
                <p class="mb-1"><span class="muted">File:</span> ${
                  item.semantic_filename
                }</p>
                <p class="mb-1"><span class="muted">Keywords:</span> ${item.keywords.join(
                  ", "
                )}</p>
                <p class="mb-2"><span class="muted">Entità:</span> ${item.entities.join(
                  ", "
                )}</p>
                <a href="${
                  item.source_url
                }" target="_blank" class="card-link">YouTube</a>
              </div>
            </div>
          </div>
        `
    )
    .join("");
}

function doSearch() {
  const q = searchInput.value.trim();
  if (!fuse) {
    render([]); // no keys selected
    return;
  }
  if (q === "") {
    render(DATA);
    return;
  }
  const results = fuse.search(q).map((r) => r.item);
  render(results);
}

// simple debounce
function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

async function main() {
  await loadData();
  rebuildFuse();
  render(DATA);

  searchInput.addEventListener("input", debounce(doSearch, 150));
  fieldCheckboxes.forEach((cb) =>
    cb.addEventListener("change", () => {
      rebuildFuse();
      doSearch();
    })
  );
}

main().catch((err) => {
  resultsEl.innerHTML = `<div class="alert alert-danger">Errore: ${err.message}</div>`;
});
