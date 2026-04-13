// D4JSP Interactive Map — main entry point
// Stack: Leaflet + Fuse.js + Vite (no frameworks)

// ── Tile URL Config ─────────────────────────────────────────
// Change this constant to point tiles at a CDN or remote host
const TILE_URL = './tiles/Sanctuary/{z}/{x}/{y}.png'
const TILE_MAX_NATIVE_ZOOM = 4
const TILE_MAX_ZOOM = 6

// ── Map Bounds (from SanctuaryMaps d4_map.js) ──────────────
const MAP_BOUNDS = L.latLngBounds(
  L.latLng(-800, -500),
  L.latLng(500, 800)
)

const TILE_BOUNDS = L.latLngBounds(
  L.latLng(-185, 5),
  L.latLng(-5, 185)
)

// ── Initialize Map ──────────────────────────────────────────
const map = new L.Map('map', {
  minZoom: 1,
  maxZoom: TILE_MAX_ZOOM,
  crs: L.CRS.Simple,
  attributionControl: true,
  zoomControl: false,
  preferCanvas: false,
  maxBounds: MAP_BOUNDS,
  maxBoundsViscosity: 0.85,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
}).setView([-90, 95], 3)

// ── Tile Layer ──────────────────────────────────────────────
L.tileLayer(TILE_URL, {
  minZoom: 0,
  maxZoom: TILE_MAX_ZOOM,
  maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
  noWrap: true,
  tms: false,
  bounds: TILE_BOUNDS,
  attribution: 'Map data: <a href="https://github.com/shalzuth/SanctuaryMaps" target="_blank">SanctuaryMaps</a> | <a href="https://d4jsp.com" target="_blank">D4JSP</a>',
  errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
}).addTo(map)

// ── Zoom Control (bottom right, styled via CSS) ─────────────
L.control.zoom({ position: 'bottomright' }).addTo(map)

// ── Coordinate Display ──────────────────────────────────────
const coordsText = document.getElementById('coords-text')
map.on('mousemove', e => {
  if (coordsText) {
    // Convert back to approximate game coords for display
    const lat = e.latlng.lat
    const lng = e.latlng.lng
    coordsText.textContent = `Map: ${lat.toFixed(2)}, ${lng.toFixed(2)}`
  }
})

map.on('mouseout', () => {
  if (coordsText) coordsText.textContent = 'Hover map for coordinates'
})

// ── Load Layers + Search ─────────────────────────────────────
import { initLayers } from './layers.js'
import { initSearch } from './search.js'

async function boot() {
  await initLayers(map)
  initSearch(map)
  console.log('[D4JSP Map] Ready — Sanctuary loaded.')
}

boot().catch(console.error)
