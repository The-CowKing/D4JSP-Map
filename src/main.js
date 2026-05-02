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

import { initLayers, dungeonsData, refreshBuildRotationLayers, setParentBuilds, LAYER_CONFIGS, allPOIs } from './layers.js'
import { initSearch } from './search.js'
import { initPlanner } from './planner.js'

// Y.34bi — pre-Y.34 static data files (Helltide chests, Living Steel,
// cellars, events). Adam: "we have the helltide and living steel we had
// it on our first map". Bundled at build time. Each row has {x, y, name,
// id} — we feed the x/y through the current worldToLatLng() so they line
// up with the maxroll pyramid + everything else.
import _chestsData      from './data/chests.json'
import _livingsteelData from './data/livingsteel.json'
import _cellarsData     from './data/cellars.json'
import _eventsData      from './data/events.json'

// 2026-05-01: full unified pyramid (1365 tiles) freshly scraped from
// maxroll into /opt/d4jsp-map/dist/tiles/Sanctuary/{z}/{x}/{y}.webp.
// No more maxroll URL leak.
// 2026-05-01: stay on maxroll CDN for now — local tiles are Sanctuary-only
// while maxroll's URL serves the unified multi-region pyramid Adam wants.
const TILE_BASE = 'https://assets-ng.maxroll.gg/d4-tools/map6/webp'
const TILE_MAX_NATIVE_ZOOM = 5
const TILE_MAX_ZOOM = 7
const TILE_PIXEL_SIZE = 256
const NATIVE_WIDTH = TILE_PIXEL_SIZE * (1 << TILE_MAX_NATIVE_ZOOM)  // 8192

// --- Leaflet map setup --------------------------------------------------
// CRS.Simple: lng = +x_pixel, lat = -y_pixel (so the world ends up in
// negative-lat space which is fine).
const map = new L.Map('map', {
  // Y.32 (Adam: "we need to fix it so default viewport shows the entire
  // border zoomed out"). Drop minZoom to 0 so the initial fitBounds can
  // pick a fractional zoom below 1. Tighten zoomSnap to 0.25 so the snap
  // can land closer to the ideal frame-fit zoom.
  minZoom: 0,
  maxZoom: TILE_MAX_ZOOM,
  crs: L.CRS.Simple,
  attributionControl: false,    // Adam: kill the Leaflet/maxroll attribution bar
  zoomControl: false,
  preferCanvas: false,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  // Y.11/Y.13: zoom animations off so frame can't drift during transitions.
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
  // Y.34g (Adam: "in the map 1 finger should let you move left right up
  // down.. right now it doesn't"): re-enable dragging now that the frame
  // is part of the map (zooms/pans WITH content) so panning no longer
  // breaks frame alignment.
  dragging: true,
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

// --- Unified tile layer (self-hosted, /{z}/{x}/{y}.webp pyramid) --------
// L.TileLayer.extend so we can override getTileUrl with the standard
// Leaflet z/x/y directory pyramid we serve from /map/tiles/Sanctuary/.
const WorldTileLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    return `${TILE_BASE}/${coords.z}_${coords.x}_${coords.y}.webp`
  },
})

const worldLayer = new WorldTileLayer('', {
  minZoom: 0,
  maxZoom: TILE_MAX_ZOOM,
  maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
  noWrap: true,
  tms: false,
  bounds: WORLD_BOUNDS,
  attribution: '',
  // Y.34av — smoother tile loading. Y.34at added crossOrigin:'anonymous'
  // which BROKE all tile loads because the upstream CDN didn't send the
  // right CORS headers for that mode. Removed (now self-hosted, but keep
  // it removed for compatibility). Keep the buffer/eager-load tweaks.
  keepBuffer: 6,
  updateWhenIdle: false,
  updateWhenZooming: true,
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
// Y.34m (Adam: "the border image loads slow as fuck fix it"): switched
// from PNG (909KB) to WebP q=85 (200KB, ~4.5x smaller). All target
// browsers (Chrome/Safari/Firefox/Edge) support WebP. Preload link
// in index.html starts the fetch in parallel with the JS bundle.
// 2026-05-01 (Adam: "that frame took 6 hours to place"): restoring the
// brand-frame ImageOverlay. Adam confirmed the parchment in his earlier
// screenshots was a tile-background bleed (#c5b78f), not the frame
// matting. With the tile bg now transparent, the frame can render
// without competing with empty-tile parchment.
const brandFrameOverlay = L.imageOverlay('./branding-frame.webp', FRAME_BOUNDS, {
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

// Y.33 (Adam: "border perfect. view port default is a bit small it
// should pack the width for mobile pc we will have to tune size
// later"). fitBounds(FRAME_BOUNDS) chose a zoom that fit BOTH the
// frame width and height inside the shell — leaving empty bands on
// the sides because the frame is slightly taller than wide. Pack the
// WIDTH instead: compute zoom so the frame's outer width = container
// width. Top/bottom of the frame may bleed slightly past the shell on
// portrait mobile (Adam's OK with that on mobile). PC will be tuned
// later with a width clamp.
function fitFrameToViewport(animate = false) {
  const sz = map.getSize()
  // 2026-05-01 (Adam: "fog of war hits all 4 edges like before"): fit
  // WORLD width to viewport (not the slightly-bigger frame). The brand-
  // frame.webp ImageOverlay extends past world bounds via FRAME_OUTSET,
  // so the gold scrollwork still surrounds the world but the world tiles
  // themselves fill the viewport edge-to-edge with fog-of-war touching
  // all four sides. Use the smaller of width/height so the world is
  // never narrower than the viewport on any aspect.
  const viewportEdge = Math.max(sz.x, sz.y) || 360
  const z = TILE_MAX_NATIVE_ZOOM - Math.log2(NATIVE_WIDTH / viewportEdge)
  // Y.34ax: pin minZoom so users can't pinch out past the world.
  map.options.minZoom = z
  map.setView(center, z, { animate })
}
fitFrameToViewport(false)

// 2026-05-01 (Adam: "maps still fucked" — iframe with aspect-ratio:1/1 lays
// out AFTER leaflet inits, so the initial getSize() returns a size that
// doesn't match the final iframe dimensions. The map locks in to that
// stale viewport and the world tiles render too small relative to the
// iframe. Re-fit on every resize so the frame always matches the iframe.
const ro = new ResizeObserver(() => {
  map.invalidateSize()
  fitFrameToViewport(false)
})
ro.observe(document.getElementById('map'))
window.addEventListener('resize', () => {
  map.invalidateSize()
  fitFrameToViewport(false)
})

L.control.zoom({ position: 'bottomright' }).addTo(map)

// --- Coordinate display ---------------------------------------------------
// Y.34am: shows latLng under the cursor (desktop) or last tap (mobile).
const coordsText = document.getElementById('coords-text')
function setCoordText(latlng) {
  if (!coordsText) return
  if (!latlng) { coordsText.textContent = 'tap map for coordinates'; return }
  coordsText.textContent = `lat ${latlng.lat.toFixed(2)}  lng ${latlng.lng.toFixed(2)}`
}
map.on('mousemove', e => setCoordText(e.latlng))
map.on('click', e => setCoordText(e.latlng))
map.on('mouseout', () => setCoordText(null))
setCoordText(null)

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

// ── Y.34: in-scroll menu — anchored to the parchment scroll graphic ──
// The scroll graphic occupies the upper-left ~3-50% × 5-30% of the brand
// frame PNG. Convert that fractional region into pyramid pixel coords →
// latLng, then on every map zoom/move recompute container points and
// position the #scroll-menu div there. Font-size scales with the map
// zoom so text stays proportional to the scroll texture.
// Y.34b nudged right+down. Y.34e overshot at 0.43 (past bottom roller).
// Y.34h pulled to 0.31. Y.34l (Adam: "the length of the thing is too
// short.. look at where living steel is cutoff the container needs to
// go lower"): bump y1 0.31 -> 0.38 to use the empty parchment area
// below the layer list, while staying inside the bottom roller.
const SCROLL_FRAC = { x0: 0.09, y0: 0.12, x1: 0.50, y1: 0.38 }
const FRAME_W_PX = NATIVE_WIDTH * (1 + 2 * FRAME_OUTSET_X)
const FRAME_H_PX = NATIVE_WIDTH * (1 + 2 * FRAME_OUTSET_Y)
const SCROLL_NW_PX = [
  -NATIVE_WIDTH * FRAME_OUTSET_X + SCROLL_FRAC.x0 * FRAME_W_PX,
  -NATIVE_WIDTH * FRAME_OUTSET_Y + SCROLL_FRAC.y0 * FRAME_H_PX,
]
const SCROLL_SE_PX = [
  -NATIVE_WIDTH * FRAME_OUTSET_X + SCROLL_FRAC.x1 * FRAME_W_PX,
  -NATIVE_WIDTH * FRAME_OUTSET_Y + SCROLL_FRAC.y1 * FRAME_H_PX,
]
const SCROLL_NW_LL = map.unproject(SCROLL_NW_PX, TILE_MAX_NATIVE_ZOOM)
const SCROLL_SE_LL = map.unproject(SCROLL_SE_PX, TILE_MAX_NATIVE_ZOOM)

function repositionScrollMenu() {
  const el = document.getElementById('scroll-menu')
  if (!el) return
  const nw = map.latLngToContainerPoint(SCROLL_NW_LL)
  const se = map.latLngToContainerPoint(SCROLL_SE_LL)
  const w = se.x - nw.x
  const h = se.y - nw.y
  if (w < 30 || h < 20) {
    // scroll has zoomed out of usefulness — hide
    el.style.display = 'none'
    return
  }
  el.style.display = 'block'
  el.style.left = nw.x + 'px'
  el.style.top = nw.y + 'px'
  el.style.width = w + 'px'
  el.style.height = h + 'px'
  // Base font-size scales with the scroll's rendered width. At ~340px wide
  // we want ~13px text; smaller scrolls shrink text proportionally with a
  // floor so it stays readable.
  const base = Math.max(8, Math.min(22, w / 26))
  el.style.fontSize = base + 'px'
}

async function boot() {
  blockBrowserPinchZoom()
  hideLegacyRegionToggle()

  // Phase Y: POI layers FULLY disabled — old data uses coordinates tied to
  // the old painted tiles. Re-enable once we've ported maxroll's POI data.
  initSearch(map)

  document.addEventListener('builds-changed', () => {
    refreshBuildRotationLayers(map)
  })

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'd4jsp:builds') {
      setParentBuilds(e.data.builds || [], map)
    }
    // 2026-05-02 — aspect-ship Show-on-Map loop: trade-app's BuildGuideView
    // posts {type:'d4jsp:focus-dungeon', name:'<dungeon name>'} when the
    // user clicks "Show on Map" from an aspect's detail tooltip. Iframe may
    // already be mounted (user revisits the Map subtab from a different
    // aspect), so the URL-based deep-link path can't fire — postMessage is
    // the in-flight signal. If POIs aren't loaded yet, queue the request
    // so loadAndRenderPOIs can apply it once allPOIs is populated.
    if (e.data && e.data.type === 'd4jsp:focus-dungeon') {
      const name = e.data.name
      if (!name) return
      if (!poisLoaded) {
        pendingFocusDungeon = name
      } else {
        enterFocusDungeonMode(name)
      }
    }
  })
  window.parent.postMessage({ type: 'd4jsp:map-ready' }, '*')

  // ── In-scroll menu wiring ──
  repositionScrollMenu()
  map.on('zoom move resize zoomend moveend', repositionScrollMenu)
  // Reposition once tiles+layout settle (frame ImageOverlay sizing can
  // shift on first paint); use multiple frames + a setTimeout fallback.
  requestAnimationFrame(() => requestAnimationFrame(repositionScrollMenu))
  setTimeout(repositionScrollMenu, 200)

  // Tab switching
  const tabButtons = document.querySelectorAll('.scroll-tab')
  const tabContents = document.querySelectorAll('.scroll-tab-content')
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab
      tabButtons.forEach(b => b.classList.toggle('active', b === btn))
      tabContents.forEach(c => c.classList.toggle('hidden', c.id !== `tab-${id}`))
    })
  })

  // ── Y.34p: POI loading + rendering ──────────────────────────
  // Maxroll's map.min.json lives in /public. We fetch it once at boot,
  // transform world coords -> pyramid pixel coords -> latLng, group by
  // marker type, and stash L.layerGroups in poiGroups. Layer toggles in
  // the menu add/remove the groups from the map.
  //
  // Y.34z — landmark-calibrated affine transform. Solved from 3 known
  // waypoints whose world coords are in the data and whose pyramid
  // pixel positions I estimated visually from the maxroll tile:
  //   Kyovashad  (-1398,  154) -> pyramid (4400, 2200)  // NW Fractured Peaks
  //   Gea Kul    (  680, -418) -> pyramid (6500, 3200)  // E Kehjistan coast
  //   Ked Bardu  ( -886, -989) -> pyramid (5000, 2700)  // N central Dry Steppes
  // Affine: px = a*wx + b*wy + c, py = d*wx + e*wy + f
  // Solved by least-squares on those 3 points.
  // Y.34af — extracted the EXACT world(x,y) -> lat/lng transform from
  // src/data/waypoints.json (the old map's hand-calibrated POIs that
  // Adam said "were lined up"). Linear regression on all 35 samples
  // gives ZERO residual:
  //   lat = -0.035724 * (wx + wy) - 137.7816
  //   lng =  0.035724 * (wy - wx) +  68.6388
  // At zoom 5 (CRS.Simple), pyramid pixel = (lng * 32, -lat * 32).
  // Then Adam's instruction: "rotate it over 90 degrees clock wise"
  // applied around pyramid center: (px, py) -> (NATIVE - py, px).
  function buildPoiTransform(/* markers */) { /* derived from data */ }
  function worldToLatLng(wx, wy) {
    // Y.34as — back to the clean Y.34ap calibration. The Y.34aq dLat=-15
    // shift was too aggressive and pushed Gea Kul south of where Adam
    // pinned it (-145.82, 127.76). Use the two-point calibration as-is.
    // Tunable from console if Adam wants to override later:
    //   setPoiOffset({dLat: -8, dLng: 0})
    const dLat = (window.__poiOffset && window.__poiOffset.dLat != null) ? window.__poiOffset.dLat : 0
    const dLng = (window.__poiOffset && window.__poiOffset.dLng != null) ? window.__poiOffset.dLng : 0
    const lat = -0.02942 * (wx + wy) - 138.12 + dLat
    const lng =  0.02942 * (wy - wx) + 160.08 + dLng
    return L.latLng(lat, lng)
  }
  window.setPoiOffset = (off) => {
    window.__poiOffset = { ...(window.__poiOffset || {}), ...off }
    try { localStorage.setItem('poi_offset', JSON.stringify(window.__poiOffset)) } catch {}
    location.reload()
  }
  try {
    const stored = localStorage.getItem('poi_offset')
    if (stored) window.__poiOffset = JSON.parse(stored)
  } catch {}
  // Y.34au — Adam's pre-existing D4 icon WebPs in /public/icons/.
  const POI_TYPES = {
    waypoint:   { label: 'Waypoint',        size: 22, icon: 'waypoint.webp' },
    dungeon:    { label: 'Dungeon',         size: 20, icon: 'dungeon.webp' },
    altar:      { label: 'Altar of Lilith', size: 18, icon: 'altar_of_lilith.webp' },
    stronghold: { label: 'Stronghold',      size: 22, icon: 'stronghold.webp' },
    quest:      { label: 'Side Quest',      size: 18, icon: 'quest.webp' },
    // Y.34bi — Helltide / Living Steel / Cellars / Events from the
    // pre-Y.34 src/data/ JSON drops. Loaded into the same render pipeline
    // as the maxroll markers via a static import (see loadAndRenderPOIs).
    chest:        { label: 'Helltide Chest',  size: 16, icon: 'dungeon.webp' },
    livingsteel:  { label: 'Living Steel',    size: 18, icon: 'dungeon.webp' },
    cellar:       { label: 'Cellar',          size: 14, icon: 'dungeon.webp' },
    event:        { label: 'Event',           size: 14, icon: 'quest.webp' },
    // Y.34bg (renamed from boss_key per Adam: "should be under ubers").
    // Covers BOTH the Uber boss arenas (Hanged Man's Hall, Darkened Way,
    // etc.) AND the Uber-key farm sources (Tree of Whispers, Pit Entrance,
    // Iron Wolves Camp). Each marker can override its display label via a
    // `typeLabel` field on the marker JSON ("Boss" vs "Uber Farm"). Falls
    // back to dungeon.webp icon at size 22 until we cut a dedicated glyph.
    uber:       { label: 'Uber',            size: 22, icon: 'dungeon.webp' },
    // NPCs don't have a dedicated icon — render as a small dim dot below.
    npc:        { label: 'NPC',             size: 10, icon: null },
  }
  // Y.34ah (Adam: "hook up the pois to their switches... expansions to
  // their expansion tab and the rest to sanctuary tab"). Each layer id
  // maps to a (region, type) pair. Each (region, type) gets its own
  // L.layerGroup so toggles on different tabs don't share state.
  // Y.34aw: single Layers tab — these IDs map to a TYPE only; the
  // click handler activates that type across every region.
  const LAYER_ID_TO_REGION_TYPE = {
    'waypoints':   { type: 'waypoint'   },
    'dungeons':    { type: 'dungeon'    },
    'altars':      { type: 'altar'      },
    'strongholds': { type: 'stronghold' },
    'sidequests':  { type: 'quest'      },
    'cellars':     { type: 'cellar'     }, // no data yet
    'chests':      { type: 'chest'      }, // no data yet
    'livingsteel': { type: 'livingsteel' }, // no data yet
    'events':      { type: 'event'      }, // no data yet
    'ubers':       { type: 'uber'       }, // Y.34bg — Uber boss arenas + key farm sources
  }
  // Region classification — Y.34ak. 3-way split based on world coords:
  //   Skovos    : y > 800  (Backwater 1286, Tidal Burrow 1359, etc. —
  //               far south of the unified map)
  //   Nahantu   : x+y > 350 (Kurast Bazaar 1190, Kichuk 489, Athulua 2173)
  //   Sanctuary : everything else (Kyo -1244, Gea Kul 262, Imperial Library -414)
  function regionForMarker(m) {
    if (m.y > 800) return 'Skovos'
    if (m.x + m.y > 350) return 'Nahantu'
    return 'Sanctuary'
  }
  // Y.34ah: poiGroups indexed by "region_type" so each tab can toggle
  // its region's groups independently. Key format: "Sanctuary_waypoint",
  // "Nahantu_dungeon", etc.
  const poiGroups = {}
  let poisLoaded = false
  // 2026-05-02 — focus_dungeon mode state. Set by enterFocusDungeonMode() and
  // cleared by exitFocusDungeonMode(). pendingFocusDungeon holds the name
  // when a postMessage arrives BEFORE POIs finish loading; loadAndRenderPOIs
  // applies it once allPOIs is populated.
  let pendingFocusDungeon = null
  let focusDungeonName = null
  const hiddenDungeonMarkers = []  // markers temporarily hidden by focus mode
  let focusResetControl = null     // Leaflet control instance ("Show all dungeons")
  function poiKey(region, type) { return region + '_' + type }

  // Y.34ba (2026-05-01): two-step name → modal that ACTUALLY works on mobile.
  //
  // Adam wants:  tap marker → tooltip shows gold name → tap name → modal opens.
  //
  // The earlier per-tooltip listener (Y.34av) and WeakMap+capture-phase
  // approach (Y.34ay) both failed because Leaflet's `tooltipPane` has
  // `pointer-events: none` by default and the tooltip's children inherit
  // that on iOS Safari and mobile Chrome — synthetic clicks from touch never
  // reach our listener. Y.34az dodged it by opening the modal on the marker
  // tap, which Adam doesn't want.
  //
  // Y.34ba fix:
  //   1. Multi-event delegated handler at document level (capture phase)
  //      listens for 'click', 'touchend', AND 'pointerup'. At least one of
  //      those reliably fires on every mobile browser even when synthetic
  //      click is suppressed.
  //   2. CSS forces pointer-events:auto on the tooltip pane AND the tooltip
  //      element AND their children, so the touch reaches our handler.
  //   3. WeakMap maps tooltip element → marker._poiData. Refreshed on every
  //      tooltipopen so re-used tooltip elements always have current data.
  //
  // Tested resilient: stopPropagation+preventDefault means Leaflet's map tap
  // handler doesn't get to close the tooltip before we open the modal.
  const _poiTipDataByEl = new WeakMap()
  const _poiHandledTimes = new WeakMap()  // de-dup: click + touchend can both fire
  function _handlePoiTipTap(e) {
    const tipEl = (e.target && e.target.closest && e.target.closest('.d4-poi-name-tip'))
    if (!tipEl) return
    const data = _poiTipDataByEl.get(tipEl)
    if (!data) return
    // de-dup: ignore if same tooltip handled within last 400ms
    const now = Date.now()
    const last = _poiHandledTimes.get(tipEl) || 0
    if (now - last < 400) return
    _poiHandledTimes.set(tipEl, now)
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()
    openPoiInfoModal(data)
  }
  document.addEventListener('click',     _handlePoiTipTap, true)
  document.addEventListener('touchend',  _handlePoiTipTap, true)
  document.addEventListener('pointerup', _handlePoiTipTap, true)

  async function loadAndRenderPOIs() {
    try {
      // Y.34bf — boss-keys.json is a small companion file with hand-curated
      // boss summoning material sources. Loaded in parallel and merged into
      // the same marker pipeline so the Sanctuary "Boss Keys" toggle just
      // flips a layerGroup like everything else.
      const [res, bkRes] = await Promise.all([
        fetch('./world-pois.json'),
        fetch('./boss-keys.json').catch(() => null),
      ])
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const baseMarkers = Array.isArray(data.markers) ? data.markers : []
      let bossKeyMarkers = []
      if (bkRes && bkRes.ok) {
        try {
          const bk = await bkRes.json()
          if (Array.isArray(bk?.markers)) bossKeyMarkers = bk.markers
        } catch (_) { /* boss-keys is optional */ }
      }
      // Y.34bi — merge in the static src/data/ JSONs (Helltide chests,
      // Living Steel, cellars, events). Each row is {x, y, name, id} —
      // tag with the right type so POI_TYPES picks the right icon and
      // the Sanctuary tab toggle wires up. We strip the `</br>...`
      // descriptive HTML from the name and pull it into `desc` so the
      // tooltip stays compact.
      const _splitName = (raw) => {
        const s = String(raw || '')
        const i = s.indexOf('</br>')
        if (i < 0) return { name: s, desc: '' }
        return { name: s.slice(0, i), desc: s.slice(i + 5).replace(/<\/?br\s*\/?>(?:\s*)/gi, ' • ') }
      }
      const _tag = (rows, type) => (rows || []).map(r => {
        const { name, desc } = _splitName(r.name)
        return { ...r, type, name, desc }
      })
      const helltideMarkers     = _tag(_chestsData,      'chest')
      const livingsteelMarkers  = _tag(_livingsteelData, 'livingsteel')
      const cellarMarkers       = _tag(_cellarsData,     'cellar')
      const eventMarkers        = _tag(_eventsData,      'event')

      const markers = baseMarkers
        .concat(bossKeyMarkers)
        .concat(helltideMarkers)
        .concat(livingsteelMarkers)
        .concat(cellarMarkers)
        .concat(eventMarkers)
      buildPoiTransform(markers)
      const seen = new Set()
      for (const m of markers) {
        const t = m.type
        if (!POI_TYPES[t]) continue
        const region = regionForMarker(m)
        const key = poiKey(region, t)
        if (!poiGroups[key]) poiGroups[key] = L.layerGroup()
        seen.add(key)
        const ll = worldToLatLng(m.x, m.y)
        const cfg = POI_TYPES[t]
        const safeName = escapeHtml(m.name || cfg.label)
        // Y.34au — D4 icon WebPs from /public/icons/. NPC keeps a tiny dot.
        const iconHtml = cfg.icon
          ? `<img src="./icons/${cfg.icon}" alt="" width="${cfg.size}" height="${cfg.size}" />`
          : `<span class="d4-poi-dot"></span>`
        const marker = L.marker(ll, {
          icon: L.divIcon({
            className: `d4-poi d4-poi-${t}`,
            html: iconHtml,
            iconSize: [cfg.size, cfg.size],
            iconAnchor: [cfg.size / 2, cfg.size / 2],
          }),
          riseOnHover: true,
        })
        // Y.34at: bare gold name tip. Y.34av: name itself is clickable
        // and opens the info modal with type/desc/region (and loot from
        // our DB once wired).
        marker.bindTooltip(safeName, {
          direction: 'top',
          offset: [0, -cfg.size / 2],
          opacity: 1,
          className: 'd4-poi-name-tip',
          permanent: false,
          sticky: false,
          interactive: true,
        })
        marker._poiData = { ...m, region }
        // Y.34bj (2026-05-01) — PC: single click → modal directly (hover
        // already shows the name tooltip). Mobile: two-step (tap marker →
        // gold name appears → tap name → modal). Adam: "on pc map should
        // open modal single click on marker because mouse over shows name..
        // mobile works great". Detect hover capability via matchMedia.
        marker.on('click', function() {
          const hoverCapable = (typeof window !== 'undefined' && window.matchMedia
            && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
          if (hoverCapable) {
            // Desktop — straight to modal.
            openPoiInfoModal(marker._poiData);
          } else {
            // Mobile/touch — show the gold name tip first; the tap on the
            // name fires the document-level multi-event handler that opens
            // the modal.
            this.openTooltip();
          }
        })
        marker.on('tooltipopen', (ev) => {
          const tipEl = ev.tooltip.getElement()
          if (tipEl) _poiTipDataByEl.set(tipEl, marker._poiData)
        })
        poiGroups[key].addLayer(marker)

        // Y.34bc (2026-05-01): index this POI for the search bar. The
        // search.js Fuse index is built from layers.js → allPOIs, but
        // those are the static src/data/*.json files (Nahantu/Skovos
        // only). The maxroll-map.json POIs (the bulk — 2,384 markers
        // including all of Sanctuary) were NEVER pushed to allPOIs, so
        // typing "Hanged" returned 0 hits even though the POI was on the
        // map. Push them here. Shape matches what search.js expects:
        // {name, desc, lat, lng, config, marker}.
        const llObj = ll && typeof ll.lat === 'number' ? ll : { lat: m.y, lng: m.x };
        allPOIs.push({
          name: m.name || cfg.label,
          desc: m.desc || '',
          lat: llObj.lat,
          lng: llObj.lng,
          config: {
            id: t,
            label: cfg.label,
            color: cfg.color || '#D4AF37',
          },
          marker,
        });
      }
      poisLoaded = true
      console.log(`[D4JSP Map] loaded ${markers.length} POIs across ${seen.size} region+type groups; allPOIs total=${allPOIs.length}`)
      // Y.34q: re-apply any toggles that were clicked before the fetch landed.
      document.querySelectorAll('.scroll-layer-item.on').forEach(item => {
        const id = item.dataset.layerId
        const rt = LAYER_ID_TO_REGION_TYPE[id]
        if (rt) setRegionTypeVisible(rt.region, rt.type, true)
      })
      // 2026-05-01 (Adam: "find now bring into map proper position still
      // doesn't engage the specific dungeon"). When the iframe was loaded
      // with ?items=<name>, look up which POIs drop that item, force-enable
      // their layers, highlight them, and fitBounds on the matches.
      tryItemsHighlight()
      // 2026-05-02 — aspect-ship Show-on-Map loop: if the iframe was loaded
      // with ?focus_dungeon=<name>, isolate that single dungeon. Runs AFTER
      // tryItemsHighlight so a coincidental items= can't fight us for the
      // viewport (focus_dungeon is the more specific intent — last write
      // wins on the flyTo). Also drain any pending postMessage that
      // arrived before POIs finished loading.
      tryFocusDungeon()
      if (pendingFocusDungeon) {
        const queued = pendingFocusDungeon
        pendingFocusDungeon = null
        enterFocusDungeonMode(queued)
      }
    } catch (e) {
      console.error('[D4JSP Map] POI load failed:', e)
    }
  }

  // Read ?items=<name> from the iframe URL, find matching POIs by name
  // (boss / dungeon / stronghold), highlight them, and pan/zoom.
  async function tryItemsHighlight() {
    let itemName
    try {
      const params = new URLSearchParams(window.location.search)
      itemName = params.get('items')
    } catch { return }
    if (!itemName) return
    console.log(`[D4JSP Map] ?items=${itemName} — looking up drop sources`)

    // 1. Pull the item's drop sources from the trade core widget API
    //    (already returns dropSources with rarity-aware defaults).
    let sources = []
    try {
      const slug = String(itemName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const r = await fetch(`https://trade.d4jsp.org/api/widget/item/${encodeURIComponent(slug)}`, { credentials: 'omit' })
      if (r.ok) {
        const d = await r.json()
        sources = (d.dropSources || []).map(s => s.name).filter(Boolean)
      }
    } catch (e) {
      console.warn('[D4JSP Map] item lookup failed:', e?.message || e)
    }
    if (sources.length === 0) {
      console.log('[D4JSP Map] no drop sources for', itemName)
      return
    }

    // 2. Force-enable the relevant POI layers (Bosses, Dungeons,
    //    Strongholds, Ubers — anything that holds named encounters).
    const layersToEnable = ['bosses', 'dungeons', 'strongholds', 'ubers']
    for (const lid of layersToEnable) {
      const item = document.querySelector(`.scroll-layer-item[data-layer-id="${lid}"]`)
      if (item && !item.classList.contains('on')) item.click()
    }

    // 3. Find matching markers in allPOIs.
    //    Strategy: try drop sources first; fall back to item name tokens.
    //    Many uniques are named after the boss they drop from (e.g.
    //    Rakanoth's Wake → boss Rakanoth, Andariel's Visage → Andariel).
    //    If the API returns generic layer labels like "Tormented Bosses",
    //    we tokenise the ITEM name and try to match POIs by those tokens.
    // Adam 2026-05-02: "I hit find for harlequin crest and all markers
    // activated". The previous matcher used bidirectional includes
    // (pname.includes(t) || t.includes(pname)) which lit up every short-
    // named POI ("Pit", "Cellar", "Spire") because those substrings appear
    // inside almost any source token. Tightened to one-way contains, with
    // a minimum target length so single-letter / 2-char artifacts can't
    // match anything. Empty / overly-generic sources also bail out.
    const STOP = new Set([
      'the','of','a','an','and','at','in','on','by','to','from','with',
      'sanctuary','dungeon','dungeons','boss','bosses','altar','altars',
      'stronghold','strongholds','region','tier','tormented','uber',
      'wake','visage','will','crest','might','grandfather','talisman',
      'ring','skies','starless','crown','blade','shield','plate','helm',
    ])
    const target = sources
      .map(s => String(s || '').toLowerCase().trim())
      .filter(s => s.length >= 4)
    const itemTokens = String(itemName)
      .toLowerCase()
      .split(/[\s'']+/)
      .map(t => t.replace(/[^a-z]/g, ''))
      .filter(t => t.length >= 5 && !STOP.has(t))
    const allTargets = [...target, ...itemTokens].filter(t => t.length >= 4)
    if (allTargets.length === 0) {
      console.log('[D4JSP Map] no usable target tokens — skipping highlight')
      return
    }
    const matches = []
    for (const p of allPOIs) {
      const pname = String(p.name || '').toLowerCase().trim()
      if (pname.length < 3) continue
      // One-way contains only: POI name must contain a target token.
      // The reverse (target contains pname) was the bug — caused short
      // POI names to match every long target token.
      if (allTargets.some(t => pname.includes(t))) {
        matches.push(p)
      }
    }
    console.log(`[D4JSP Map] matched ${matches.length} POIs (sources=${target.length} tokens=${itemTokens.length}: ${itemTokens.join(',')})`)
    if (matches.length === 0) return

    // 4. fitBounds on the matched markers, then open name tooltips for the
    //    visible ones so the user sees them highlighted.
    const latlngs = matches.filter(p => p.marker?.getLatLng).map(p => p.marker.getLatLng())
    if (latlngs.length > 0) {
      const bounds = L.latLngBounds(latlngs)
      try { map.fitBounds(bounds, { padding: [80, 80], maxZoom: 4, animate: true }) } catch {}
    }
    setTimeout(() => {
      for (const p of matches) {
        try { p.marker?.openTooltip?.() } catch {}
        try { p.marker?._icon?.classList?.add('d4-poi-highlight') } catch {}
      }
    }, 300)
  }
  // ── 2026-05-02 — focus_dungeon mode ─────────────────────────────────────
  // BuildGuideView's aspect-detail "Show on Map" CTA navigates the trade-core
  // to ?tab=character&map=1&focus_dungeon=<name>. ProfileView reads the param,
  // forwards it as a prop to MapIframe, which appends it to the iframe URL
  // (initial load) AND postMessages it on subsequent prop changes (already-
  // loaded iframe). Either way the map ends up here:
  //
  //   1. Force-enable the Dungeons layer (so the matched marker is on map).
  //   2. Find the matched dungeon marker in allPOIs (case-insensitive).
  //   3. Hide every OTHER dungeon marker (marker.setOpacity(0) + pointer-
  //      events:none on _icon, so the lone visible marker isn't competing
  //      with the rest of Sanctuary's dungeon density).
  //   4. flyTo + auto-open the trade-core DungeonInfoModal via the same
  //      postMessage path search.js uses (d4jsp:open-poi-info).
  //   5. Add a "Show all dungeons" Leaflet control so the user can exit
  //      focus mode without reloading.
  function isDungeonPoi(p) {
    return p && p.config && p.config.id === 'dungeon'
  }
  function findDungeonByName(name) {
    const target = String(name || '').toLowerCase().trim()
    if (!target) return null
    // Exact (case-insensitive) match first — most aspect→dungeon links
    // pass the canonical dungeon display name straight through.
    const exact = allPOIs.find(p => isDungeonPoi(p) &&
      String(p.name || '').toLowerCase().trim() === target)
    if (exact) return exact
    // POI name contains target (e.g. data has "Lost Archives — Dry Steppes",
    // CTA passes "Lost Archives").
    const sub = allPOIs.find(p => isDungeonPoi(p) &&
      String(p.name || '').toLowerCase().includes(target))
    if (sub) return sub
    // Target contains POI name (rare; e.g. CTA passes "Lost Archives Dungeon"
    // and data is "Lost Archives"). Filter to length >= 4 to avoid trivial
    // substring matches like "the".
    const rev = allPOIs.find(p => isDungeonPoi(p) &&
      String(p.name || '').toLowerCase().trim().length >= 4 &&
      target.includes(String(p.name || '').toLowerCase().trim()))
    return rev || null
  }
  function ensureFocusResetControl() {
    if (focusResetControl) return
    focusResetControl = L.control({ position: 'topright' })
    focusResetControl.onAdd = function () {
      const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control d4jsp-focus-reset')
      c.style.cssText = [
        'padding:6px 10px',
        'background:rgba(8,6,8,0.92)',
        'color:#D4AF37',
        'font-family:Cinzel,serif',
        'font-size:11px',
        'font-weight:700',
        'letter-spacing:0.05em',
        'text-transform:uppercase',
        'border:1px solid #D4AF37',
        'cursor:pointer',
        'user-select:none',
        'box-shadow:0 2px 8px rgba(0,0,0,0.5)',
      ].join(';')
      c.textContent = '✕ Show all dungeons'
      c.title = 'Exit focus mode and re-show every dungeon marker'
      L.DomEvent.disableClickPropagation(c)
      L.DomEvent.on(c, 'click', () => exitFocusDungeonMode())
      return c
    }
  }
  function showFocusResetControl() {
    ensureFocusResetControl()
    try { focusResetControl.addTo(map) } catch (_) {}
  }
  function hideFocusResetControl() {
    if (!focusResetControl) return
    try { focusResetControl.remove() } catch (_) {}
  }
  function enterFocusDungeonMode(name) {
    if (!name) return false
    // Idempotent: both the URL parse (tryFocusDungeon) and the parent's
    // MapIframe useEffect can fire for the same dungeon — bail if we're
    // already focused on it. Compare case-insensitively for safety.
    if (focusDungeonName &&
        String(focusDungeonName).toLowerCase().trim() ===
        String(name).toLowerCase().trim()) {
      return true
    }
    // 1. Force-enable the Dungeons layer toggle so the matched marker is
    //    on the map. The layer-list click handler flips visibility for
    //    every region's dungeon group at once.
    const dungeonsToggle = document.querySelector(
      '.scroll-layer-item[data-layer-id="dungeons"]')
    if (dungeonsToggle && !dungeonsToggle.classList.contains('on')) {
      try { dungeonsToggle.click() } catch (_) {}
    }
    // 2. Locate the matched dungeon in allPOIs.
    const matched = findDungeonByName(name)
    if (!matched) {
      console.warn('[D4JSP Map] focus_dungeon: no match for', name)
      return false
    }
    focusDungeonName = name
    // 3. Hide every OTHER dungeon. Defer one rAF so Leaflet has had a
    //    frame to actually render markers from the layer we just enabled
    //    (their `_icon` element doesn't exist until then, and we want to
    //    null pointer-events on it so an invisible marker can't be tapped).
    const applyHide = () => {
      hiddenDungeonMarkers.length = 0
      for (const p of allPOIs) {
        if (!isDungeonPoi(p) || p === matched) continue
        const m = p.marker
        if (!m) continue
        try { m.setOpacity?.(0) } catch (_) {}
        const ic = m._icon
        if (ic) ic.style.pointerEvents = 'none'
        const tt = m._tooltip && m._tooltip._container
        if (tt) tt.style.display = 'none'
        hiddenDungeonMarkers.push(m)
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(applyHide))
    // 4. Pan/zoom to the matched marker.
    const TARGET_ZOOM = Math.min(5, (map.getMaxZoom?.() ?? 5))
    try { map.flyTo([matched.lat, matched.lng], TARGET_ZOOM, { duration: 0.8 }) } catch (_) {}
    // 5. After camera settles, post the dungeon-info to the parent so the
    //    trade-core opens its full-screen DungeonInfoModal — same payload
    //    shape openPoiInfoModal() builds, same shape search.js posts.
    setTimeout(() => {
      const poiData = matched.marker?._poiData
      if (!poiData) return
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'd4jsp:open-poi-info',
            poi: {
              name: poiData.name || matched.name,
              type: poiData.type || 'dungeon',
              typeLabel: matched.config?.label || 'Dungeon',
              region: poiData.region || '',
              desc: poiData.desc || '',
              x: poiData.x, y: poiData.y,
            },
          }, '*')
        } else {
          // Standalone /map/ visit (no parent) — open the in-iframe modal
          // by simulating the marker click handler path.
          matched.marker.openTooltip?.()
        }
      } catch (_) {}
    }, 900)
    // 6. Show the reset control.
    showFocusResetControl()
    return true
  }
  function exitFocusDungeonMode() {
    focusDungeonName = null
    for (const m of hiddenDungeonMarkers) {
      try { m.setOpacity?.(1) } catch (_) {}
      const ic = m._icon
      if (ic) ic.style.pointerEvents = ''
      const tt = m._tooltip && m._tooltip._container
      if (tt) tt.style.display = ''
    }
    hiddenDungeonMarkers.length = 0
    hideFocusResetControl()
  }
  // URL-driven entry: on initial load (or after loadAndRenderPOIs lands),
  // if ?focus_dungeon=<name> is present, apply it.
  function tryFocusDungeon() {
    let name = null
    try {
      const params = new URLSearchParams(window.location.search)
      name = params.get('focus_dungeon')
    } catch (_) { return }
    if (!name) return
    enterFocusDungeonMode(name)
  }
  // Expose for console debugging + so the postMessage handler at boot scope
  // can invoke them by reference even if it was registered before this
  // function-block ran (function declarations are hoisted within boot()).
  window.__focusDungeon = {
    enter: enterFocusDungeonMode,
    exit: exitFocusDungeonMode,
    tryFromUrl: tryFocusDungeon,
  }

  // Toggle a (region, type) group on/off. Each tab now controls only
  // its own region's POIs.
  function setRegionTypeVisible(region, type, on) {
    const g = poiGroups[poiKey(region, type)]
    if (!g) return
    if (on) g.addTo(map)
    else map.removeLayer(g)
  }

  // Y.34j: per-region tabs, each toggles only its own POIs. Phase 1:
  // toggle by type (no per-region split yet — see LAYER_ID_TO_TYPES).
  function renderLayerList(rootId, items) {
    const root = document.getElementById(rootId)
    if (!root) return
    const html = items.map(cfg =>
      `<div class="scroll-layer-item" data-layer-id="${cfg.id}">` +
      `<span class="check"></span>${cfg.label}</div>`
    ).join('')
    root.innerHTML = html
    root.addEventListener('click', e => {
      const item = e.target.closest('.scroll-layer-item')
      if (!item) return
      item.classList.toggle('on')
      const on = item.classList.contains('on')
      const id = item.dataset.layerId
      const rt = LAYER_ID_TO_REGION_TYPE[id]
      if (!rt) { console.log(`[D4JSP Map] no region/type mapping for ${id}`); return }
      // Y.34aw (Adam: "sanctuary tab should engage all pois all expansions"):
      // single Layers tab now controls every region's group of that type.
      ;['Sanctuary', 'Nahantu', 'Skovos'].forEach(region =>
        setRegionTypeVisible(region, rt.type, on)
      )
    })
  }
  // Y.34aw — single Layers tab covering every region. Items are the
  // common type set; toggles activate that type across all regions
  // (Sanctuary + Nahantu + Skovos via the renderLayerList click handler).
  renderLayerList('layer-list-sanctuary', [
    { id: 'waypoints',     label: 'Waypoints'        },
    { id: 'dungeons',      label: 'Dungeons'         },
    { id: 'altars',        label: 'Altars of Lilith' },
    { id: 'strongholds',   label: 'Strongholds'      },
    { id: 'sidequests',    label: 'Side Quests'      },
    { id: 'ubers',         label: 'Ubers'            },
    { id: 'cellars',       label: 'Cellars'          },
    { id: 'chests',        label: 'Helltide Chests'  },
    { id: 'livingsteel',   label: 'Living Steel'     },
    { id: 'events',        label: 'Events'           },
  ])

  // Kick off POI load (non-blocking).
  loadAndRenderPOIs()

  // Y.34av: POI info modal — opened when user clicks a name tooltip.
  // Shows name + type + description from maxroll data; queries our
  // Supabase d4_equipment table for any drops associated with the
  // dungeon name (same pattern the trade core uses).
  const poiModal      = document.getElementById('poi-info-modal')
  const poiModalType  = document.getElementById('poi-info-type')
  const poiModalName  = document.getElementById('poi-info-name')
  const poiModalRegion = document.getElementById('poi-info-region')
  const poiModalDesc  = document.getElementById('poi-info-desc')
  const poiModalLoot  = document.getElementById('poi-info-loot')
  const poiModalClose = document.getElementById('poi-info-close')
  function openPoiInfoModal(p) {
    if (!p) return
    const cfg = POI_TYPES[p.type] || { label: p.type }
    // Y.34bg — markers can override the displayed type label per row
    // (e.g. an Uber-tagged marker sets typeLabel: "Boss" so the modal
    // header reads "BOSS · SANCTUARY" instead of "UBER · SANCTUARY").
    const displayLabel = p.typeLabel || cfg.label

    // Y.34bb (2026-05-01): when running inside an iframe, post the dungeon
    // info to the parent so it can open a FULL-SCREEN modal in the trade
    // core's chrome (matching the rest of the site). Drops are fetched
    // there.
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'd4jsp:open-poi-info',
          poi: {
            name: p.name || cfg.label,
            type: p.type,
            typeLabel: displayLabel,
            region: p.region || '',
            desc: p.desc || '',
            x: p.x, y: p.y,
            // Y.34bh — required summoning materials per marker
            // (boss-keys.json `keys` array). Modal renders these as icon
            // chips with Buy/Find buttons.
            keys: Array.isArray(p.keys) ? p.keys : null,
          },
        }, '*')
        return  // parent handles it; do NOT show the in-iframe modal
      }
    } catch (_) { /* fall through to in-iframe modal if postMessage fails */ }

    if (!poiModal) return
    poiModalType.textContent = cfg.label
    poiModalName.textContent = p.name || cfg.label
    poiModalRegion.textContent = p.region || ''
    poiModalDesc.textContent = p.desc || ''
    poiModalDesc.style.display = p.desc ? 'block' : 'none'
    poiModalLoot.innerHTML = ''
    poiModal.classList.add('open')
    if (p.type === 'dungeon' && p.name) {
      poiModalLoot.innerHTML =
        `<div class="poi-info-loot-title">Drops</div>` +
        `<div class="poi-info-loot-loading">loading from D4JSP database…</div>`
      fetchDungeonLoot(p.name).then(rows => {
        if (!poiModal.classList.contains('open')) return
        if (!rows || rows.length === 0) {
          poiModalLoot.innerHTML =
            `<div class="poi-info-loot-title">Drops</div>` +
            `<div class="poi-info-loot-loading">no drops recorded for this dungeon yet</div>`
          return
        }
        poiModalLoot.innerHTML =
          `<div class="poi-info-loot-title">Drops</div>` +
          `<div class="poi-info-loot-list">` +
          rows.map(r => `<div class="poi-info-loot-item"><span>${escapeHtml(r.name)}</span><span class="loot-rarity">${escapeHtml(r.rarity || '')}</span></div>`).join('') +
          `</div>`
      }).catch(err => {
        console.warn('[D4JSP Map] dungeon loot fetch failed:', err)
        poiModalLoot.innerHTML =
          `<div class="poi-info-loot-title">Drops</div>` +
          `<div class="poi-info-loot-loading">drops lookup unavailable</div>`
      })
    }
  }
  function closePoiInfoModal() { if (poiModal) poiModal.classList.remove('open') }
  if (poiModalClose) poiModalClose.addEventListener('click', closePoiInfoModal)
  if (poiModal) poiModal.addEventListener('click', (e) => {
    if (e.target === poiModal) closePoiInfoModal()
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePoiInfoModal() })

  // Query the trade core's loot endpoint. Falls back to empty list if
  // the endpoint isn't reachable from the iframe origin.
  async function fetchDungeonLoot(dungeonName) {
    try {
      // Try a JSON endpoint on the trade core. If we don't have one yet
      // this returns empty and the modal shows "no drops recorded".
      const url = `https://trade.d4jsp.org/api/d4/dungeon-loot?name=${encodeURIComponent(dungeonName)}`
      const r = await fetch(url, { credentials: 'omit' })
      if (!r.ok) return []
      const data = await r.json()
      return Array.isArray(data) ? data : (data?.items || [])
    } catch { return [] }
  }

  // ── Y.34k: Custom waypoints ────────────────────────────────────
  // Long-press / right-click map → context menu → "Save waypoint" →
  // modal with name + description → persists to localStorage and
  // renders as marker + list item.
  const STORAGE_KEY = 'd4jsp.map.waypoints.v1'
  const waypointLayer = L.layerGroup().addTo(map)
  let waypoints = []
  let pendingWp = null

  function loadWaypoints() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      waypoints = raw ? JSON.parse(raw) : []
    } catch { waypoints = [] }
  }
  function saveWaypoints() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(waypoints)) } catch {}
  }
  function renderWaypoints() {
    waypointLayer.clearLayers()
    for (const wp of waypoints) {
      const m = L.marker([wp.lat, wp.lng], {
        icon: L.divIcon({
          className: 'd4jsp-user-waypoint',
          // Y.34au: ornate gold star icon (Adam's PNG, converted to WebP)
          html: '<img class="d4jsp-wp-pin-img" src="./icons/custom-waypoint.webp" alt="Waypoint" width="22" height="22"/>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
      m.bindPopup(
        `<div class="d4jsp-wp-popup"><strong>${escapeHtml(wp.name)}</strong>` +
        (wp.desc ? `<div class="d4jsp-wp-popup-desc">${escapeHtml(wp.desc)}</div>` : '') +
        `<button class="d4jsp-wp-delete" data-wp-id="${wp.id}">remove</button></div>`,
        { autoClose: true, closeOnClick: true },
      )
      m.addTo(waypointLayer)
    }
    const list = document.getElementById('custom-waypoints-list')
    if (!list) return
    if (waypoints.length === 0) {
      list.innerHTML = '<div class="scroll-empty">right-click map<br/>to save a spot</div>'
      return
    }
    list.innerHTML = waypoints.map(wp =>
      `<div class="scroll-waypoint-row" data-wp-id="${wp.id}">` +
        `<div class="scroll-waypoint-item">` +
          `<span class="dot"></span>${escapeHtml(wp.name)}` +
        `</div>` +
        `<div class="scroll-waypoint-drawer">` +
          (wp.desc
            ? `<div class="wp-note">${escapeHtml(wp.desc)}</div>`
            : `<div class="wp-note empty">— no note —</div>`) +
          `<div class="wp-drawer-coords">lat ${wp.lat.toFixed(2)}, lng ${wp.lng.toFixed(2)}</div>` +
          `<div class="wp-drawer-actions">` +
            `<button class="wp-goto" data-wp-id="${wp.id}">Go to</button>` +
            `<button class="wp-remove" data-wp-id="${wp.id}">Remove</button>` +
          `</div>` +
        `</div>` +
      `</div>`
    ).join('')
  }
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  // Y.34n (Adam: "clicking waypoint should expand drawer to see notes"):
  // tapping a waypoint name toggles an inline drawer showing the note +
  // Go-to / Remove buttons. Only one drawer open at a time.
  const wpList = document.getElementById('custom-waypoints-list')
  function flyToWaypoint(id) {
    const wp = waypoints.find(w => w.id === id)
    if (!wp) return
    map.flyTo([wp.lat, wp.lng], Math.max(map.getZoom(), 3), { duration: 0.5 })
  }
  if (wpList) {
    wpList.addEventListener('click', e => {
      // Goto button inside the drawer
      const goto = e.target.closest('.wp-goto')
      if (goto) { flyToWaypoint(goto.dataset.wpId); return }
      // Remove button inside the drawer
      const rm = e.target.closest('.wp-remove')
      if (rm) {
        waypoints = waypoints.filter(w => w.id !== rm.dataset.wpId)
        saveWaypoints()
        renderWaypoints()
        return
      }
      // Otherwise — toggle the drawer for the clicked waypoint name row.
      const item = e.target.closest('.scroll-waypoint-item')
      if (!item) return
      const row = item.closest('.scroll-waypoint-row')
      if (!row) return
      const wasOpen = row.classList.contains('open')
      // Close all other open drawers (one at a time).
      wpList.querySelectorAll('.scroll-waypoint-row.open').forEach(r => r.classList.remove('open'))
      if (!wasOpen) row.classList.add('open')
    })
  }
  // Marker popup remove button
  map.on('popupopen', (e) => {
    const root = e.popup.getElement()
    if (!root) return
    root.querySelectorAll('.d4jsp-wp-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.wpId
        waypoints = waypoints.filter(w => w.id !== id)
        saveWaypoints()
        renderWaypoints()
        map.closePopup()
      })
    })
  })

  // Context menu (right-click / long-press)
  const ctxMenu = document.getElementById('map-context-menu')
  function showCtxMenu(latlng, containerPoint) {
    pendingWp = latlng
    ctxMenu.style.left = containerPoint.x + 'px'
    ctxMenu.style.top  = containerPoint.y + 'px'
    ctxMenu.classList.add('open')
  }
  function hideCtxMenu() {
    pendingWp = null
    ctxMenu.classList.remove('open')
  }
  // Right-click on the map (desktop)
  map.on('contextmenu', (e) => {
    if (e.originalEvent) e.originalEvent.preventDefault()
    showCtxMenu(e.latlng, e.containerPoint)
  })
  // Long-press on touch (mobile) — Leaflet doesn't fire contextmenu on
  // touch reliably, so detect a touchstart that holds for 600ms without
  // moving more than a few pixels.
  let lpTimer = null
  let lpStart = null
  const mapEl = map.getContainer()
  mapEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { clearTimeout(lpTimer); return }
    const t = e.touches[0]
    lpStart = { x: t.clientX, y: t.clientY }
    clearTimeout(lpTimer)
    lpTimer = setTimeout(() => {
      const rect = mapEl.getBoundingClientRect()
      const cp = L.point(t.clientX - rect.left, t.clientY - rect.top)
      const ll = map.containerPointToLatLng(cp)
      showCtxMenu(ll, cp)
    }, 600)
  }, { passive: true })
  mapEl.addEventListener('touchmove', (e) => {
    if (!lpStart) return
    const t = e.touches[0]
    if (Math.abs(t.clientX - lpStart.x) > 8 || Math.abs(t.clientY - lpStart.y) > 8) {
      clearTimeout(lpTimer)
      lpStart = null
    }
  }, { passive: true })
  mapEl.addEventListener('touchend', () => { clearTimeout(lpTimer); lpStart = null }, { passive: true })

  // Hide ctx menu on map click or escape
  map.on('click movestart zoomstart', hideCtxMenu)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu() })

  // Context menu action — open the waypoint dialog
  ctxMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('.ctx-item')
    if (!btn) return
    if (btn.dataset.action === 'save-waypoint' && pendingWp) {
      openWaypointDialog(pendingWp)
    }
    hideCtxMenu()
  })

  // Waypoint dialog
  const wpDialog   = document.getElementById('waypoint-dialog')
  const wpName     = document.getElementById('wp-name-input')
  const wpDesc     = document.getElementById('wp-desc-input')
  const wpCancel   = document.getElementById('wp-cancel-btn')
  const wpSave     = document.getElementById('wp-save-btn')
  const wpCoords   = document.getElementById('wp-coords-display')
  let dialogLatLng = null
  function openWaypointDialog(latlng) {
    dialogLatLng = latlng
    wpName.value = ''
    wpDesc.value = ''
    if (wpCoords && latlng) {
      wpCoords.textContent = `lat ${latlng.lat.toFixed(2)}  lng ${latlng.lng.toFixed(2)}`
    }
    wpDialog.classList.add('open')
    setTimeout(() => wpName.focus(), 50)
  }
  function closeWaypointDialog() {
    wpDialog.classList.remove('open')
    dialogLatLng = null
  }
  wpCancel.addEventListener('click', closeWaypointDialog)
  wpDialog.addEventListener('click', (e) => { if (e.target === wpDialog) closeWaypointDialog() })
  wpSave.addEventListener('click', () => {
    const name = wpName.value.trim() || 'Untitled'
    const desc = wpDesc.value.trim()
    if (!dialogLatLng) return
    waypoints.push({
      id: 'wp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      lat: dialogLatLng.lat,
      lng: dialogLatLng.lng,
      name,
      desc,
      created: new Date().toISOString(),
    })
    saveWaypoints()
    renderWaypoints()
    closeWaypointDialog()
  })

  // + button in the My Waypoints title — drops a pin at current map center
  const addWpBtn = document.getElementById('add-waypoint-btn')
  if (addWpBtn) addWpBtn.addEventListener('click', () => openWaypointDialog(map.getCenter()))

  // Boot the persisted list
  loadWaypoints()
  renderWaypoints()

  // Y.34d (Adam: "when you click the invisible card it should take you
  // centered zoomed in on the menu"). Map-level click handler — when the
  // user taps an empty area of the scroll menu (pointer-events:none on
  // the wrapper means non-interactive parts pass through to the map),
  // fitBounds the scroll's latLng bounds so the menu fills the viewport.
  // Skip if already zoomed in past the threshold (don't trap zooms).
  const SCROLL_BOUNDS_LL = L.latLngBounds(SCROLL_NW_LL, SCROLL_SE_LL)
  function jumpToMenu() {
    // Y.34g (Adam: "barely changes... should take you to a view like this"
    // [target screenshot showed scroll filling viewport]): use inside:true
    // so viewport fits INSIDE scroll bounds — zooms tighter than the default
    // fitBounds which leaves padding around the bounds.
    map.fitBounds(SCROLL_BOUNDS_LL, { padding: [4, 4], maxZoom: 5, animate: true })
    // Force a closer zoom on top of fitBounds so the scroll fills the viewport.
    setTimeout(() => {
      const containerW = map.getSize().x || 360
      const scrollNativeW = (SCROLL_FRAC.x1 - SCROLL_FRAC.x0) * FRAME_W_PX
      const targetZoom = TILE_MAX_NATIVE_ZOOM - Math.log2(scrollNativeW / (containerW * 0.92))
      if (targetZoom > map.getZoom()) {
        map.setView(SCROLL_BOUNDS_LL.getCenter(), targetZoom, { animate: true })
      }
    }, 50)
  }
  map.on('click', (e) => {
    const cp = e.containerPoint
    const nw = map.latLngToContainerPoint(SCROLL_NW_LL)
    const se = map.latLngToContainerPoint(SCROLL_SE_LL)
    const inScroll = cp.x >= nw.x && cp.x <= se.x && cp.y >= nw.y && cp.y <= se.y
    if (inScroll) jumpToMenu()
  })
  // Y.34f: hamburger to the left of the zoom buttons jumps to the menu,
  // so the user can return from a zoomed-in view of the map quickly.
  const menuJumpBtn = document.getElementById('menu-jump-btn')
  if (menuJumpBtn) menuJumpBtn.addEventListener('click', jumpToMenu)

  console.log('[D4JSP Map] Ready — unified Blizzard tile pyramid (via maxroll CDN).')
}

boot().catch(console.error)

// Re-export shims for any callers that still reference the old region API.
export const REGIONS = {}
export const REGION_ORDER = []
export function switchRegion() { /* deprecated — single unified world */ }
