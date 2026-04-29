// D4JSP Interactive Map — main entry point
// Stack: Leaflet + Fuse.js + Vite (no frameworks)

// ── Region Config ───────────────────────────────────────────
// Each region has its own tile pyramid + Leaflet bounds.
// Bounds for Nahantu were derived from the painted source image affine
// (3 anchor waypoints → 6 px/lat-lng = ~11.3 px per unit, near-zero rotation),
// expanded to the canvas extents after fit-contain to a 6656x6656 master.
const REGIONS = {
  Sanctuary: {
    label: 'Sanctuary',
    tileUrl: './tiles/Sanctuary/{z}/{x}/{y}.png',
    tileBounds: L.latLngBounds(L.latLng(-185, 5),       L.latLng(-5, 185)),
    initialView: { center: [-90, 95], zoom: 3 },
  },
  Nahantu: {
    label: 'Nahantu',
    tileUrl: './tiles/Nahantu/{z}/{x}/{y}.png',
    tileBounds: L.latLngBounds(L.latLng(-230.13, -2.08), L.latLng(-135.66, 91.83)),
    initialView: { center: [-183, 45], zoom: 3 },
  },
  // Skovos (Lord of Hatred — launched 2026-04-28). Base tiles only for v1;
  // POI data pending CASC .mrk MarkerSet decoder. Bounds are placeholder
  // pixel-space (1203x752 source -> 6656x6656 canvas with letterbox);
  // when real game-coord waypoints land we'll re-anchor via affine.
  Skovos: {
    label: 'Skovos',
    tileUrl: './tiles/Skovos/{z}/{x}/{y}.png',
    tileBounds: L.latLngBounds(L.latLng(-185, 5), L.latLng(-5, 185)),
    initialView: { center: [-95, 95], zoom: 3 },
  },
}

const TILE_MAX_NATIVE_ZOOM = 4
const TILE_MAX_ZOOM = 6

// Generous map pan bounds (covers all regions; per-region tile bounds clip
// the imagery itself).
const MAP_BOUNDS = L.latLngBounds(
  L.latLng(-800, -500),
  L.latLng(500, 800)
)

let activeRegion = 'Sanctuary'

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
}).setView(REGIONS[activeRegion].initialView.center, REGIONS[activeRegion].initialView.zoom)

// ── Tile Layer ──────────────────────────────────────────────
const tileLayer = L.tileLayer(REGIONS[activeRegion].tileUrl, {
  minZoom: 0,
  maxZoom: TILE_MAX_ZOOM,
  maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
  noWrap: true,
  tms: false,
  bounds: REGIONS[activeRegion].tileBounds,
  attribution: 'Map data: <a href="https://github.com/shalzuth/SanctuaryMaps" target="_blank">SanctuaryMaps</a> | Nahantu: D4JSP | <a href="https://d4jsp.com" target="_blank">D4JSP</a>',
  errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
}).addTo(map)

// ── Zoom Control (bottom right, styled via CSS) ─────────────
L.control.zoom({ position: 'bottomright' }).addTo(map)

// ── Coordinate Display ──────────────────────────────────────
const coordsText = document.getElementById('coords-text')
map.on('mousemove', e => {
  if (coordsText) {
    const lat = e.latlng.lat
    const lng = e.latlng.lng
    coordsText.textContent = `Map: ${lat.toFixed(2)}, ${lng.toFixed(2)}`
  }
})

map.on('mouseout', () => {
  if (coordsText) coordsText.textContent = 'Hover map for coordinates'
})

// Track current zoom on body so CSS can show/hide region + city labels
function updateZoomClass() { document.body.dataset.zoom = String(Math.floor(map.getZoom())) }
map.on('zoomend', updateZoomClass)
updateZoomClass()

// ── Region Switcher ─────────────────────────────────────────
function switchRegion(name) {
  if (!REGIONS[name] || name === activeRegion) return
  const r = REGIONS[name]
  activeRegion = name
  tileLayer.options.bounds = r.tileBounds
  tileLayer.setUrl(r.tileUrl)   // also redraws
  map.setView(r.initialView.center, r.initialView.zoom)
  setActiveRegion(name, map)    // swap visible POI layers + re-render panel
  // Update visual state of region buttons
  document.querySelectorAll('[data-region]').forEach(el => {
    el.classList.toggle('active', el.dataset.region === name)
  })
  console.log(`[MAP] region -> ${name}`)
}

function buildRegionSwitcher() {
  let bar = document.getElementById('region-switcher')
  if (bar) return
  bar = document.createElement('div')
  bar.id = 'region-switcher'
  bar.innerHTML = Object.entries(REGIONS).map(([name, cfg]) =>
    `<button data-region="${name}" class="region-btn${name === activeRegion ? ' active' : ''}">${cfg.label}</button>`
  ).join('')
  document.body.appendChild(bar)
  bar.addEventListener('click', e => {
    const name = e.target?.dataset?.region
    if (name) switchRegion(name)
  })
}

// ── Load Layers + Search + Build Planner ────────────────────
import { initLayers, dungeonsData, refreshBuildRotationLayers, setParentBuilds, setActiveRegion } from './layers.js'
import { initSearch } from './search.js'
import { initPlanner } from './planner.js'

async function boot() {
  await initLayers(map)
  initSearch(map)
  refreshBuildRotationLayers(map)
  initPlanner(dungeonsData)
  buildRegionSwitcher()

  document.addEventListener('builds-changed', () => {
    refreshBuildRotationLayers(map)
  })

  // ── postMessage bridge: receive builds from parent app ──────
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'd4jsp:builds') {
      setParentBuilds(e.data.builds || [], map)
    }
  })
  // Tell parent we're ready to receive builds
  window.parent.postMessage({ type: 'd4jsp:map-ready' }, '*')

  // ── Layer panel show/hide ───────────────────────────────────
  const layerPanel   = document.getElementById('layer-panel')
  const closePanelBtn = document.getElementById('panel-close-btn')
  const toggleBtn    = document.getElementById('panel-toggle-btn')

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

  // Click anywhere on the map closes the panel
  map.on('click', closePanel)

  // ── Plan Builds / New Build → open planner modal ───────────
  function openPlanner() {
    document.getElementById('planner-modal')?.classList.add('open')
  }
  document.getElementById('btn-plan-builds')?.addEventListener('click', openPlanner)
  document.getElementById('btn-new-build')?.addEventListener('click', openPlanner)

  console.log(`[D4JSP Map] Ready — ${activeRegion} loaded.`)
}

boot().catch(console.error)
