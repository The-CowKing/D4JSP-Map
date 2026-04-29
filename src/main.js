// D4JSP Interactive Map — main entry point
// Stack: Leaflet + Fuse.js + Vite (no frameworks)
//
// Unified world model: Sanctuary's tile pyramid is the base layer and its
// lat/lng range IS the world coord system. Nahantu and Skovos are placed
// as L.imageOverlay on top — Nahantu matched to the empty silhouette
// already drawn on Sanctuary's south-west tiles, Skovos placed in the
// bottom-left ocean. POIs from every region all live in this same coord
// space and render side-by-side. No region toggle.

const TILE_URL = './tiles/Sanctuary/{z}/{x}/{y}.png'
const TILE_MAX_NATIVE_ZOOM = 4
const TILE_MAX_ZOOM = 6

// World pan-bounds (generous; the visible content sits inside)
const MAP_BOUNDS = L.latLngBounds(
  L.latLng(-800, -500),
  L.latLng(500, 800)
)

// Sanctuary's painted-tile coverage — also the canonical world tile bounds
const TILE_BOUNDS = L.latLngBounds(
  L.latLng(-185, 5),
  L.latLng(-5, 185)
)

// Painted-image overlays placed in the unified Sanctuary coord space.
// Nahantu bbox derived from the 3-anchor affine (Kurast Docks / Kichuk /
// Gates of Necropolis) — the painted silhouette aligns with the empty
// Nahantu shape on Sanctuary's existing tiles.
// Skovos bbox is a free-placement bottom-left island chain; tweak by eye.
const REGION_OVERLAYS = [
  {
    name: 'Nahantu',
    url: './maps/nahantu.jpg',
    bounds: L.latLngBounds(L.latLng(-230.13, -2.08), L.latLng(-135.66, 91.83)),
  },
  {
    name: 'Skovos',
    url: './maps/skovos.png',
    bounds: L.latLngBounds(L.latLng(-330, -210), L.latLng(-200, -50)),
  },
]

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

// ── Sanctuary base tile layer ───────────────────────────────
L.tileLayer(TILE_URL, {
  minZoom: 0,
  maxZoom: TILE_MAX_ZOOM,
  maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
  noWrap: true,
  tms: false,
  bounds: TILE_BOUNDS,
  attribution: 'Map data: <a href="https://github.com/shalzuth/SanctuaryMaps" target="_blank">SanctuaryMaps</a> | Nahantu/Skovos: D4JSP | <a href="https://d4jsp.com" target="_blank">D4JSP</a>',
  errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
}).addTo(map)

// ── Region image overlays (Nahantu, Skovos) ─────────────────
for (const r of REGION_OVERLAYS) {
  L.imageOverlay(r.url, r.bounds, { opacity: 1, interactive: false }).addTo(map)
}

// ── Zoom Control (bottom right, styled via CSS) ─────────────
L.control.zoom({ position: 'bottomright' }).addTo(map)

// ── Coordinate Display ──────────────────────────────────────
const coordsText = document.getElementById('coords-text')
map.on('mousemove', e => {
  if (coordsText) {
    coordsText.textContent = `Map: ${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)}`
  }
})
map.on('mouseout', () => {
  if (coordsText) coordsText.textContent = 'Hover map for coordinates'
})

// Track current zoom on body so CSS can show/hide labels by zoom
function updateZoomClass() { document.body.dataset.zoom = String(Math.floor(map.getZoom())) }
map.on('zoomend', updateZoomClass)
updateZoomClass()

// ── Load Layers + Search + Build Planner ────────────────────
import { initLayers, dungeonsData, refreshBuildRotationLayers, setParentBuilds } from './layers.js'
import { initSearch } from './search.js'
import { initPlanner } from './planner.js'

async function boot() {
  await initLayers(map)
  initSearch(map)
  refreshBuildRotationLayers(map)
  initPlanner(dungeonsData)

  document.addEventListener('builds-changed', () => {
    refreshBuildRotationLayers(map)
  })

  // postMessage bridge: receive builds from parent app
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'd4jsp:builds') {
      setParentBuilds(e.data.builds || [], map)
    }
  })
  window.parent.postMessage({ type: 'd4jsp:map-ready' }, '*')

  // ── Layer panel show/hide ───────────────────────────────────
  const layerPanel    = document.getElementById('layer-panel')
  const closePanelBtn = document.getElementById('panel-close-btn')
  const toggleBtn     = document.getElementById('panel-toggle-btn')

  function closePanel() {
    layerPanel?.classList.add('panel-hidden')
    if (toggleBtn) toggleBtn.style.display = 'flex'
  }
  function openPanel() {
    layerPanel?.classList.remove('panel-hidden')
    if (toggleBtn) toggleBtn.style.display = 'none'
  }
  closePanelBtn?.addEventListener('click', e => { e.stopPropagation(); closePanel() })
  toggleBtn?.addEventListener('click', openPanel)
  map.on('click', closePanel)

  // ── Plan Builds / New Build → open planner modal ───────────
  function openPlanner() {
    document.getElementById('planner-modal')?.classList.add('open')
  }
  document.getElementById('btn-plan-builds')?.addEventListener('click', openPlanner)
  document.getElementById('btn-new-build')?.addEventListener('click', openPlanner)

  console.log('[D4JSP Map] Ready — unified world (Sanctuary + Nahantu + Skovos overlays).')
}

boot().catch(console.error)
