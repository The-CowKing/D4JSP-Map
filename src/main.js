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

import { initLayers, dungeonsData, refreshBuildRotationLayers, setParentBuilds, LAYER_CONFIGS } from './layers.js'
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
  // Y.34av — smoother tile loading like maxroll's. Y.34at added
  // crossOrigin:'anonymous' which BROKE all tile loads because maxroll's
  // CDN doesn't send the right CORS headers for that mode. Removed.
  // Keep the buffer/eager-load tweaks since those don't need CORS.
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
const containerSize = map.getSize()
const viewportW = containerSize.x || 360 // fallback if container not laid out yet
const frameNativeW = NATIVE_WIDTH * (1 + 2 * FRAME_OUTSET_X)
const zoomToFitWidth = TILE_MAX_NATIVE_ZOOM - Math.log2(frameNativeW / viewportW)
// Y.34ax (Adam: "shouldnt let it zoom out past frame touching screen
// edge on mobile either"): pin minZoom to the frame-fit zoom so users
// can't pinch out past the brand frame and see the dark page behind.
map.options.minZoom = zoomToFitWidth
map.setView(center, zoomToFitWidth, { animate: false })

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
  function poiKey(region, type) { return region + '_' + type }
  async function loadAndRenderPOIs() {
    try {
      const res = await fetch('./maxroll-map.json')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const markers = Array.isArray(data.markers) ? data.markers : []
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
        marker.on('click', function() { this.openTooltip() })
        marker.on('tooltipopen', (ev) => {
          const tipEl = ev.tooltip.getElement()
          if (!tipEl || tipEl._poiBound) return
          tipEl._poiBound = true
          tipEl.addEventListener('click', (e) => {
            e.stopPropagation()
            openPoiInfoModal(marker._poiData)
          })
        })
        poiGroups[key].addLayer(marker)
      }
      poisLoaded = true
      console.log(`[D4JSP Map] loaded ${markers.length} POIs across ${seen.size} region+type groups`)
      // Y.34q: re-apply any toggles that were clicked before the fetch landed.
      document.querySelectorAll('.scroll-layer-item.on').forEach(item => {
        const id = item.dataset.layerId
        const rt = LAYER_ID_TO_REGION_TYPE[id]
        if (rt) setRegionTypeVisible(rt.region, rt.type, true)
      })
    } catch (e) {
      console.error('[D4JSP Map] POI load failed:', e)
    }
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
    if (!poiModal || !p) return
    const cfg = POI_TYPES[p.type] || { label: p.type }
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
