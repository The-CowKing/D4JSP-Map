// Layer definitions, marker creation, sidebar panel
import icons from './icons.js'

// Static JSON imports — Vite bundles these at build time (fixes count=0 in dist)
import waypointsRaw   from './data/waypoints.json'
import dungeonsRaw    from './data/dungeons.json'
import altarsRaw      from './data/altars.json'
import cellarsRaw     from './data/cellars.json'
import chestsRaw      from './data/chests.json'
import livingsteelRaw from './data/livingsteel.json'
import eventsRaw      from './data/events.json'
import sideQuestsRaw  from './data/sidequests.json'

const DATA_MAP = {
  'waypoints.json':   waypointsRaw,
  'dungeons.json':    dungeonsRaw,
  'altars.json':      altarsRaw,
  'cellars.json':     cellarsRaw,
  'chests.json':      chestsRaw,
  'livingsteel.json': livingsteelRaw,
  'events.json':      eventsRaw,
  'sidequests.json':  sideQuestsRaw,
}

// Layer config: id, label, icon key, color, data file name
export const LAYER_CONFIGS = [
  { id: 'waypoints',    label: 'Waypoints',         iconKey: 'waypoints',    color: '#D4AF37', file: 'waypoints.json'    },
  { id: 'dungeons',     label: 'Dungeons',           iconKey: 'dungeons',     color: '#8b5cf6', file: 'dungeons.json'     },
  { id: 'altars',       label: 'Altars of Lilith',   iconKey: 'altars',       color: '#dc2626', file: 'altars.json'       },
  { id: 'cellars',      label: 'Cellars',            iconKey: 'cellars',      color: '#92400e', file: 'cellars.json'      },
  { id: 'chests',       label: 'Helltide Chests',    iconKey: 'chests',       color: '#D4AF37', file: 'chests.json'       },
  { id: 'livingsteel',  label: 'Living Steel',       iconKey: 'livingsteel',  color: '#38bdf8', file: 'livingsteel.json'  },
  { id: 'events',       label: 'Events',             iconKey: 'events',       color: '#f97316', file: 'events.json'       },
  { id: 'sidequests',   label: 'Side Quests',        iconKey: 'sidequests',   color: '#3b82f6', file: 'sidequests.json'   },
]

// Decode HTML entities from source data
function decodeHtml(str) {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/<\/br>/g, ' — ')
    .replace(/<br\s*\/?>/gi, ' — ')
    .replace(/<[^>]+>/g, '')
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPopupHtml(item, config) {
  const name = decodeHtml(item.name || 'Unknown')
  const desc = item.description ? decodeHtml(item.description) : null
  const shortDesc = desc ? desc.split(' — ')[0] : null

  return `
    <div class="d4-popup">
      <div class="d4-popup-header">
        <div class="d4-popup-type" style="color:${config.color}">${config.label.toUpperCase()}</div>
        <div class="d4-popup-name" style="color:${config.color}">${name}</div>
      </div>
      ${shortDesc ? `<div class="d4-popup-body"><div class="d4-popup-desc">${shortDesc}</div></div>` : ''}
    </div>
  `
}

// Global POI index for search
export const allPOIs = []

// layerGroups map: id -> L.layerGroup
export const layerGroups = {}

// Dungeon data cache (populated during initLayers, used by Build Planner)
export const dungeonsData = []

// ── Route visualization state ────────────────────────────────
let activeRoutePolyline = null
let activeRouteHighlightGroup = null
let activeBuildId = null

function distSq(a, b) {
  const dlat = a.lat - b.lat
  const dlng = a.lng - b.lng
  return dlat * dlat + dlng * dlng
}

// Nearest-neighbor TSP: start from `start`, greedily visit each point in `pts`
function nearestNeighborTSP(start, pts) {
  const route = [start]
  const remaining = [...pts]
  let current = start
  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = distSq(current, remaining[0])
    for (let i = 1; i < remaining.length; i++) {
      const d = distSq(current, remaining[i])
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    current = remaining.splice(bestIdx, 1)[0]
    route.push(current)
  }
  return route
}

function clearBuildRoute(map) {
  if (activeRoutePolyline)      { map.removeLayer(activeRoutePolyline);      activeRoutePolyline = null }
  if (activeRouteHighlightGroup){ map.removeLayer(activeRouteHighlightGroup); activeRouteHighlightGroup = null }
  activeBuildId = null
}

function activateBuildRoute(map, build) {
  clearBuildRoute(map)
  if (!build) return

  activeBuildId = build.id

  const dungeonPts = (build.dungeons || [])
    .map(idx => dungeonsData[idx])
    .filter(Boolean)

  if (!dungeonPts.length) return

  // Centroid of the dungeon cluster
  const centLat = dungeonPts.reduce((s, p) => s + p.lat, 0) / dungeonPts.length
  const centLng = dungeonPts.reduce((s, p) => s + p.lng, 0) / dungeonPts.length
  const centroid = { lat: centLat, lng: centLng }

  // Nearest waypoint to centroid
  let nearestWp = waypointsRaw[0]
  let nearestDist = distSq(centroid, waypointsRaw[0])
  for (const wp of waypointsRaw) {
    const d = distSq(centroid, wp)
    if (d < nearestDist) { nearestDist = d; nearestWp = wp }
  }

  // Run nearest-neighbor TSP starting from that waypoint
  const routePts = nearestNeighborTSP(
    { lat: nearestWp.lat, lng: nearestWp.lng },
    dungeonPts.map(d => ({ lat: d.lat, lng: d.lng }))
  )

  // Draw gold dashed polyline
  activeRoutePolyline = L.polyline(
    routePts.map(p => [p.lat, p.lng]),
    { color: '#D4AF37', weight: 2, opacity: 0.7, dashArray: '6 4' }
  ).addTo(map)

  // Highlight dungeon markers
  activeRouteHighlightGroup = L.layerGroup().addTo(map)
  for (const d of dungeonPts) {
    L.circleMarker([d.lat, d.lng], {
      radius: 9,
      fillColor: '#D4AF37',
      color: '#D4AF37',
      weight: 2,
      opacity: 0.85,
      fillOpacity: 0.25,
    }).addTo(activeRouteHighlightGroup)
  }

  console.log(`[MAP-LAYER] route activated: "${build.name}" — ${dungeonPts.length} dungeons, start WP: ${nearestWp.name}`)
}

// ── initLayers ───────────────────────────────────────────────
export function initLayers(map) {
  const enabledByDefault = new Set(['waypoints'])

  for (const config of LAYER_CONFIGS) {
    const data = DATA_MAP[config.file] || []
    const group = L.layerGroup()
    layerGroups[config.id] = group

    // Cache dungeon data with stable indices for the Build Planner
    if (config.id === 'dungeons') {
      data.forEach((d, i) => dungeonsData.push({ ...d, _idx: i }))
    }

    const icon = icons[config.iconKey] || icons.waypoints

    for (const item of data) {
      const name = decodeHtml(item.name || 'Unknown')
      const desc = item.description ? decodeHtml(item.description) : null

      const marker = L.marker([item.lat, item.lng], { icon })
        .bindPopup(buildPopupHtml(item, config), {
          maxWidth: 300,
          className: '',
        })

      marker.addTo(group)

      // Index for search
      allPOIs.push({
        name,
        desc: desc ? desc.split(' — ')[0] : '',
        lat: item.lat,
        lng: item.lng,
        config,
        marker,
      })
    }

    const enabled = enabledByDefault.has(config.id)
    if (enabled) group.addTo(map)
    console.log(`[MAP-LAYER] init: ${config.id} — ${data.length} markers, enabled=${enabled}`)
  }

  console.log(`[MAP-LAYER] initLayers complete — ${allPOIs.length} total POIs indexed`)
  buildSidebarPanel(map, enabledByDefault)
}

// ── buildSidebarPanel ────────────────────────────────────────
function buildSidebarPanel(map, enabledByDefault) {
  // ── LAYERS tab: layer checkboxes ──────────────────────────
  const list = document.getElementById('layer-list')
  if (!list) return

  for (const config of LAYER_CONFIGS) {
    const group = layerGroups[config.id]
    const count = allPOIs.filter(p => p.config.id === config.id).length
    const isEnabled = enabledByDefault.has(config.id)

    const item = document.createElement('div')
    item.className = 'layer-item' + (isEnabled ? ' checked' : '')
    item.dataset.layerId = config.id
    item.innerHTML = `
      <div class="layer-checkbox"></div>
      <div class="layer-dot" style="background:${config.color};color:${config.color}"></div>
      <div class="layer-label">${config.label}</div>
      <div class="layer-count">${count}</div>
    `

    item.addEventListener('click', () => {
      const enabled = item.classList.toggle('checked')
      console.log(`[MAP-LAYER] toggle: ${config.id} → ${enabled ? 'on' : 'off'}`)
      if (enabled) group.addTo(map)
      else map.removeLayer(group)
    })

    list.appendChild(item)
  }

  // All On / All Off (LAYERS tab only)
  document.getElementById('btn-all-on')?.addEventListener('click', () => {
    document.querySelectorAll('#tab-layers .layer-item').forEach(item => {
      item.classList.add('checked')
      const id = item.dataset.layerId
      if (id) layerGroups[id]?.addTo(map)
    })
  })

  document.getElementById('btn-all-off')?.addEventListener('click', () => {
    document.querySelectorAll('#tab-layers .layer-item').forEach(item => {
      item.classList.remove('checked')
      const id = item.dataset.layerId
      if (id && layerGroups[id]) map.removeLayer(layerGroups[id])
    })
  })

  // ── Tab switching ─────────────────────────────────────────
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab
      document.querySelectorAll('.panel-tab').forEach(b => b.classList.toggle('active', b === btn))
      const layersTab = document.getElementById('tab-layers')
      const buildsTab = document.getElementById('tab-builds')
      if (layersTab) layersTab.classList.toggle('hidden', tab !== 'layers')
      if (buildsTab) buildsTab.classList.toggle('hidden', tab !== 'builds')
    })
  })

  // Initial render of BUILDS tab
  renderBuildsTab(map)
}

// ── renderBuildsTab ──────────────────────────────────────────
function renderBuildsTab(map) {
  const container = document.getElementById('builds-list')
  if (!container) return

  let builds = []
  try { builds = JSON.parse(localStorage.getItem('d4jsp_builds') || '[]') } catch { /* ignore */ }

  container.innerHTML = ''

  if (!builds.length) {
    const empty = document.createElement('div')
    empty.className = 'builds-empty'
    empty.textContent = 'No builds saved. Use Plan Builds to create one.'
    container.appendChild(empty)
    return
  }

  for (const build of builds) {
    const count = build.dungeons?.length || 0
    const isActive = build.id === activeBuildId

    const item = document.createElement('div')
    item.className = 'build-item' + (isActive ? ' active' : '')
    item.dataset.buildId = build.id
    item.innerHTML = `
      <div class="build-item-dot"></div>
      <div class="build-item-info">
        <div class="build-item-name">${escapeHtml(build.name)}</div>
        <div class="build-item-count">${count} dungeon${count !== 1 ? 's' : ''}</div>
      </div>
    `

    item.addEventListener('click', () => {
      if (activeBuildId === build.id) {
        // Deselect — clear route
        clearBuildRoute(map)
        item.classList.remove('active')
      } else {
        // Select — activate route
        document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'))
        item.classList.add('active')
        activateBuildRoute(map, build)
      }
    })

    container.appendChild(item)
  }
}

// Called from main.js when builds-changed fires
export function refreshBuildRotationLayers(map) {
  clearBuildRoute(map)
  renderBuildsTab(map)
  console.log('[MAP-LAYER] builds-changed — tab re-rendered')
}
