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
  // Y.11/Y.13: zoom animations off so frame can't drift during transitions.
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
  // Y.13 (Adam: it moves around): disable dragging at all zoom levels.
  // The map content + frame are locked in alignment now. Zoom is the only
  // interaction. (We can re-enable panning later when zoomed in past min.)
  dragging: false,
  touchZoom: true,
  doubleClickZoom: true,
  scrollWheelZoom: true,
  boxZoom: false,
  keyboard: false,
  inertia: false,
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
// Y.25 (Adam: zoom is still way in, even after Y.23 fitBounds padding).
// fitBounds was computing a tighter zoom than expected on mobile because
// the viewport is square but the world content is wider than tall. Set
// explicit zoom 1 on init so we always start at the fully-zoomed-out view
// that shows the entire fog-of-war edge inside the frame.
map.setMaxBounds(WORLD_BOUNDS)
map.options.maxBoundsViscosity = 1.0
const center = map.unproject([NATIVE_WIDTH / 2, NATIVE_WIDTH / 2], TILE_MAX_NATIVE_ZOOM)
map.setView(center, 1, { animate: false })

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

// Phase Y.27 (Adam: "embed the fucking thing into the map at the edge of
// fog of war ... litterly part of the fuckin map. that way when I zoom in
// on middle of map it's not even there"). Brand frame is a Leaflet
// ImageOverlay — it IS part of the map.
//
// Phase Y.29 (Adam: "closer just need to get it that little bit to the
// edges properly ... this time get it right and don't shrink it"). The
// branding-frame.png has the gold scrollwork art INSET within the PNG
// canvas with parchment-tan matting around it. At WORLD_BOUNDS the
// visible art sits ~7% inward of the pyramid edge, leaving a gap. Outset
// the overlay bounds 7% past WORLD_BOUNDS so the visible art lines up
// with the pyramid (and therefore the fog) edge. The outer parchment
// matting extends past the viewport at zoom 1 and gets clipped —
// invisible. Frame appears LARGER (visible art at shell edge) not
// smaller. Tunable.
// Y.30 split into X/Y outsets. Y.31 (Adam: "sooooo close top and bottom
// need a few pixels smaller"): Y was clipping the D4JSP banner at top
// and the corner ornament at bottom. Drop Y 7%->5%.
const FRAME_OUTSET_X = 0.04
const FRAME_OUTSET_Y = 0.05
const FRAME_NW = map.unproject(
  [-NATIVE_WIDTH * FRAME_OUTSET_X, -NATIVE_WIDTH * FRAME_OUTSET_Y],
  TILE_MAX_NATIVE_ZOOM,
)
const FRAME_SE = map.unproject(
  [NATIVE_WIDTH * (1 + FRAME_OUTSET_X), NATIVE_WIDTH * (1 + FRAME_OUTSET_Y)],
  TILE_MAX_NATIVE_ZOOM,
)
const FRAME_BOUNDS = L.latLngBounds(FRAME_NW, FRAME_SE)
const brandFrameOverlay = L.imageOverlay('./branding-frame.png', FRAME_BOUNDS, {
  opacity: 1,
  interactive: false,
  className: 'd4jsp-brand-frame',
}).addTo(map)
// Belt-and-suspenders: keep the overlay above tiles even if Leaflet's pane
// stacking changes. overlayPane sits above tilePane by default but a high
// z-index inside it puts the frame above any future POI markers too.
if (brandFrameOverlay._image) {
  brandFrameOverlay._image.style.pointerEvents = 'none'
  brandFrameOverlay._image.style.zIndex = '500'
}

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

// Y.15 (Adam: zoom is pinch — pinch makes it move): block browser-native
// pinch-zoom at the document level. user-scalable=no in viewport meta is
// not enough — Chrome and Safari often ignore it in iframes/PWAs. Capturing
// gesturestart/gesturechange/gestureend (Safari) + touchmove with 2+
// fingers (Chrome) prevents the page from scaling while still letting
// Leaflet's touchZoom handler receive the pinch and zoom the map content.
function blockBrowserPinchZoom() {
  const stop = (e) => {
    if (e.touches && e.touches.length >= 2) e.preventDefault()
  }
  document.addEventListener('touchstart', stop, { passive: false })
  document.addEventListener('touchmove', stop, { passive: false })
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false })
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false })
  // Block Ctrl+wheel page zoom on desktop too
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault()
  }, { passive: false })
}

async function boot() {
  blockBrowserPinchZoom()
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
