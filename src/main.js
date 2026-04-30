// D4JSP Interactive Map — main entry point
// Stack: Leaflet + Fuse.js + Vite (no frameworks)
//
// 2026-04-29 Phase Y: switched to maxroll's unified tile pyramid via direct
// CDN hot-link. Single world map (Sanctuary + VoH/Nahantu + LoH/Skovos +
// Hell + Kehj zones) at z=0..5. Maxroll's URL format is {z}_{x}_{y}.webp
// (zoom first — verified by inspecting their captures: z=0 has only
// `0_0_0.webp`, z=1 has `1_0_0`/`1_1_0`/`1_0_1`/`1_1_1` — so the leading
// number is z, not x). Phase Y.4 fixed this — earlier passes had {x}_{y}_{z}
// which produced the "completely cut in half + Skovos upside down" view.
//
// Custom branding overlay is added via CSS in index.html so we own the
// frame around the map even though the bytes are hot-linked.
//
// Phase Y.1: removed the zone selector — it's one unified pyramid now.
// Coord system uses Leaflet's project/unproject at maxNativeZoom so the
// world bounds line up with the actual 8192×8192 pixel pyramid.

import { initLayers, dungeonsData, refreshBuildRotationLayers, setParentBuilds } from './layers.js'
import { initSearch } from './search.js'
import { initPlanner } from './planner.js'

// --- Maxroll tile pyramid -----------------------------------------------
// Verified live: assets-ng.maxroll.gg/d4-tools/map6/webp/{x}_{y}_{z}.webp
// z=0 → 1 tile, z=5 → 32×32 = 1024 tiles, z=6 returns 404. Max native = 5.
const TILE_BASE = 'https://assets-ng.maxroll.gg/d4-tools/map6/webp'
const TILE_MAX_NATIVE_ZOOM = 5
const TILE_MAX_ZOOM = 7  // allow over-zoom on top of native, Leaflet upscales
const TILE_PIXEL_SIZE = 256
const NATIVE_WIDTH = TILE_PIXEL_SIZE * (1 << TILE_MAX_NATIVE_ZOOM)  // 8192

// --- Leaflet map setup --------------------------------------------------
// CRS.Simple: lng = +x_pixel, lat = -y_pixel (so the world ends up in
// negative-lat space which is fine).
const map = new L.Map('map', {
  minZoom: 1,
  maxZoom: TILE_MAX_ZOOM,
  crs: L.CRS.Simple,
  attributionControl: false,    // Adam: kill the Leaflet/maxroll attribution bar
  zoomControl: false,
  preferCanvas: false,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
})

// World bounds: at max-native zoom (5), the pyramid is 8192×8192 pixels.
// Convert pixel corners → latLng via unproject so the bounds match what
// Leaflet expects given its CRS.Simple setup.
const NW = map.unproject([0, 0], TILE_MAX_NATIVE_ZOOM)
const SE = map.unproject([NATIVE_WIDTH, NATIVE_WIDTH], TILE_MAX_NATIVE_ZOOM)
const WORLD_BOUNDS = L.latLngBounds(NW, SE)

// Phase Y.8: tighten the bounds so users can't pan past the map content
// (Adam: there should never be black outside the map). Padding negative so
// the user gets a small "snap-back" feel when they hit the edge.
map.setMaxBounds(WORLD_BOUNDS)
map.options.maxBoundsViscosity = 1.0
map.fitBounds(WORLD_BOUNDS, { animate: false, padding: [0, 0] })

// --- Unified tile layer (maxroll CDN, x_y_z.webp ordering) --------------
// L.TileLayer.extend so we can override getTileUrl and map Leaflet's
// {z, x, y} into maxroll's {x}_{y}_{z}.webp filename.
const MaxrollTileLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    // Maxroll's filename order is {z}_{x}_{y}.webp — verified from their
    // own captures (z=0 has only "0_0_0", z=1 has "1_0_0"/"1_1_0" etc.)
    return `${TILE_BASE}/${coords.z}_${coords.x}_${coords.y}.webp`
  },
})

const worldLayer = new MaxrollTileLayer('', {
  minZoom: 0,
  maxZoom: TILE_MAX_ZOOM,
  maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
  noWrap: true,
  tms: false,
  bounds: WORLD_BOUNDS,
  attribution: '',
  errorTileUrl:
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
}).addTo(map)

// Phase Y.8 (Adam): brand frame is back to a CSS-positioned div inside the
// #map-shell square wrapper — it's fixed inside the shell so it does NOT
// pan with the map. See index.html (#brand-frame div) and style.css.

L.control.zoom({ position: 'bottomright' }).addTo(map)

// --- Coordinate display -------------------------------------------------
const coordsText = document.getElementById('coords-text')
map.on('mousemove', e => {
  if (coordsText) {
    coordsText.textContent = 'Map: ' + e.latlng.lat.toFixed(2) + ', ' + e.latlng.lng.toFixed(2)
  }
})
map.on('mouseout', () => {
  if (coordsText) coordsText.textContent = 'Hover map for coordinates'
})

function updateZoomClass() { document.body.dataset.zoom = String(Math.floor(map.getZoom())) }
map.on('zoomend', updateZoomClass)
updateZoomClass()

// Hide any leftover region-toggle DOM that older builds may have rendered.
function hideLegacyRegionToggle() {
  document.querySelectorAll('#region-toggle, .region-toggle').forEach(el => {
    el.style.display = 'none'
  })
}

async function boot() {
  hideLegacyRegionToggle()

  // Phase Y: POI layers FULLY disabled — old data uses coordinates tied to
  // the old painted tiles, so loading them onto the new unified pyramid
  // dumps every dungeon/altar/waypoint icon into the wrong spot (Adam saw
  // a cluster of icons stacked on Skovos on 2026-04-29). Re-enable once
  // we've ported maxroll's map.min.json POI data with proper coords.
  initSearch(map)

  document.addEventListener('builds-changed', () => {
    refreshBuildRotationLayers(map)
  })

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'd4jsp:builds') {
      setParentBuilds(e.data.builds || [], map)
    }
  })
  window.parent.postMessage({ type: 'd4jsp:map-ready' }, '*')

  const layerPanel    = document.getElementById('layer-panel')
  const closePanelBtn = document.getElementById('panel-close-btn')
  const toggleBtn     = document.getElementById('panel-toggle-btn')

  function closePanel() {
    if (layerPanel) layerPanel.classList.add('panel-hidden')
    if (toggleBtn) toggleBtn.style.display = 'flex'
  }
  function openPanel() {
    if (layerPanel) layerPanel.classList.remove('panel-hidden')
    if (toggleBtn) toggleBtn.style.display = 'none'
  }
  if (closePanelBtn) closePanelBtn.addEventListener('click', e => { e.stopPropagation(); closePanel() })
  if (toggleBtn) toggleBtn.addEventListener('click', openPanel)
  map.on('click', closePanel)

  function openPlanner() {
    const m = document.getElementById('planner-modal')
    if (m) m.classList.add('open')
  }
  const pb = document.getElementById('btn-plan-builds')
  const nb = document.getElementById('btn-new-build')
  if (pb) pb.addEventListener('click', openPlanner)
  if (nb) nb.addEventListener('click', openPlanner)

  console.log('[D4JSP Map] Ready — unified Blizzard tile pyramid (via maxroll CDN).')
}

boot().catch(console.error)

// Re-export shims for any callers that still reference the old region API.
export const REGIONS = {}
export const REGION_ORDER = []
export function switchRegion() { /* deprecated — single unified world */ }
