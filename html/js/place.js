// place.js - Handles Map on Index Page

const ENTITIES_GEO_PATH = "data/entities-authoritative.json";

async function initMap() {
    const mapElement = document.getElementById("map");
    if (!mapElement) return;

    // Initialize Map centered on Mediterranean
    const map = L.map('map').setView([41.9028, 12.4964], 5); // Rome, Zoom 5

    // Dark Mode Tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    try {
        const response = await fetch(ENTITIES_GEO_PATH);
        if (!response.ok) throw new Error("Failed to load entities data");

        const data = await response.json();

        // Filter for type 'place' AND has coordinates
        const places = data.filter(item =>
            item.type === 'place' &&
            item.coordinates &&
            Array.isArray(item.coordinates) &&
            item.coordinates.length === 2
        );

        // Add Markers
        places.forEach(p => {
            // Coordinate format in JSON: [lat, lon] -> Leaflet expects [lat, lon]
            const lat = p.coordinates[0];
            const lon = p.coordinates[1];

            // Use Title for value (fallback to entity[0] or entity string)
            const val = p.title || (Array.isArray(p.entity) ? p.entity[0] : p.entity);

            const marker = L.marker([lat, lon]).addTo(map);

            // Popup Content
            const popupContent = `
                <div class="text-center">
                    <h6 class="mb-1 text-dark">${p.title || val}</h6>
                    ${p.image_url ? `<img src="${p.image_url}" class="img-fluid rounded mb-2" style="max-height: 100px;">` : ''}
                    <br>
                    <a href="collection.html?place=${encodeURIComponent(val)}" class="btn btn-sm btn-primary text-white">View Lessons</a>
                </div>
             `;

            marker.bindPopup(popupContent);
        });

    } catch (err) {
        console.error("Map Init Error:", err);
        mapElement.innerHTML = `<p class="text-danger p-3">Error loading map data.</p>`;
    }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initMap);
