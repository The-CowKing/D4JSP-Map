// D4JSP Interactive Map — main entry point
// Stack: Leaflet + Fuse.js + Vite (no frameworks)
//
// 2026-04-29: Region toggle (top-center) lets the user fly to a specific
// region. Tile layers stay loaded so cross-region transitions are smooth.
// Nahantu+Skovos converted from imageOverlay → tileLayer (correct
// rendering primitive: lazy-load only visible tiles).

import { initLayers, dungeonsData, refreshBuildRotationLayers, setParentBuilds } from './layers.js'
import { initSearch } from './search.js'
import { initPlanner } from './planner.js'

const TILE_MAX_NATIVE_ZOOM = 4
const TILE_MAX_ZOOM = 6

const WORLD_BOUNDS = L.latLngBounds(
  L.latLng(-360, -230),
  L.latLng(0, 210)
)
const MAP_BOUNDS = WORLD_BOUNDS

const REGIONS = {
  Sanctuary: {
    label: 'Sanctuary',
    tileUrl: './tiles/Sanctuary/{z}/{x}/{y}.webp',
    bounds: L.latLngBounds(L.latLng(-185, 5), L.latLng(-5, 185)),
    flyView: { center: [-95, 95], zoom: 2 },
  },
  Nahantu: {
    label: 'Nahantu',
    tileUrl: './tiles/Nahantu/{z}/{x}/{y}.webp',
    bounds: L.latLngBounds(L.latLng(-230.13, -2.08), L.latLng(-135.66, 91.83)),
    flyView: { center: [-183, 45], zoom: 3 },
  },
  Skovos: {
    label: 'Skovos',
    tileUrl: './tiles/Skovos/{z}/{x}/{y}.webp',
    bounds: L.latLngBounds(L.latLng(-330, -210), L.latLng(-200, -50)),
    flyView: { center: [-265, -130], zoom: 3 },
  },
}

const REGION_ORDER = ['Sanctuary', 'Nahantu', 'Skovos']

const map = new L.Map('map', {
  minZoom: 1,
  maxZoom: TILE_MAX_ZOOM,
  crs: L.CRS.Simple,
  attributionControl: true,
  zoomControl: false,
  preferCanvas: false,
  maxBounds: MAP_BOUNDS,
  maxBoundsViscosity: 1.0,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
}).setView([-180, -10], 1)

requestAnimationFrame(() => {
  if (map.getSize().x > 0) map.fitBounds(WORLD_BOUNDS, { animate: false })
})

const regionTileLayers = {}
for (const name of REGION_ORDER) {
  const cfg = REGIONS[name]
  const isSanctuary = name === 'Sanctuary'
  regionTileLayers[name] = L.tileLayer(cfg.tileUrl, {
    minZoom: 0,
    maxZoom: TILE_MAX_ZOOM,
    maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
    noWrap: true,
    tms: false,
    bounds: cfg.bounds,
    attribution: isSanctuary
      ? 'Map data: <a href="https://github.com/shalzuth/SanctuaryMaps" target="_blank">SanctuaryMaps</a> | Nahantu/Skovos: D4JSP | <a href="https://d4jsp.com" target="_blank">D4JSP</a>'
      : null,
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  }).addTo(map)
}

L.control.zoom({ position: 'bottomright' }).addTo(map)

function buildRegionToggle() {
  const wrap = document.createElement('div')
  wrap.id = 'region-toggle'
  wrap.className = 'region-toggle'
  for (const name of REGION_ORDER) {
    const btn = document.createElement('button')
    btn.className = 'region-btn' + (name === 'Sanctuary' ? ' active' : '')
    btn.dataset.region = name
    btn.textContent = REGIONS[name].label
    btn.addEventListener('click', () => switchRegion(name))
    wrap.appendChild(btn)
  }
  document.body.appendChild(wrap)
}

let activeRegion = 'Sanctuary'
function switchRegion(name) {
  if (!REGIONS[name]) return
  activeRegion = name
  document.querySelectorAll('.region-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.region === name)
  })
  const titleEl = document.querySelector('.panel-title')
  if (titleEl) titleEl.textContent = REGIONS[name].label.toUpperCase()
  const cfg = REGIONS[name]
  map.flyToBounds(cfg.bounds, { padding: [40, 40], duration: 0.6 })
  console.log('[MAP-REGION] switch -> ' + name)
}

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

async function boot() {
  buildRegionToggle()
  await initLayers(map)
  initSearch(map)
  refreshBuildRotationLayers(map)
  initPlanner(dungeonsData)

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

  console.log('[D4JSP Map] Ready — Sanctuary + Nahantu + Skovos as proper tile pyramids.')
}

boot().catch(console.error)

export { REGIONS, REGION_ORDER, switchRegion }
