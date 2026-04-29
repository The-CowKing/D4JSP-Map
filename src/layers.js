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

// Nahantu (expansion) POI data
import nahantuWaypointsRaw   from './data/nahantu_waypoints.json'
import nahantuDungeonsRaw    from './data/nahantu_dungeons.json'
import nahantuStrongholdsRaw from './data/nahantu_strongholds.json'
import nahantuCellarsRaw     from './data/nahantu_cellars.json'

const DATA_MAP = {
  'waypoints.json':          waypointsRaw,
  'dungeons.json':           dungeonsRaw,
  'altars.json':             altarsRaw,
  'cellars.json':            cellarsRaw,
  'chests.json':             chestsRaw,
  'livingsteel.json':        livingsteelRaw,
  'events.json':             eventsRaw,
  'sidequests.json':         sideQuestsRaw,
  'nahantu_waypoints.json':  nahantuWaypointsRaw,
  'nahantu_dungeons.json':   nahantuDungeonsRaw,
  'nahantu_strongholds.json':nahantuStrongholdsRaw,
  'nahantu_cellars.json':    nahantuCellarsRaw,
}

// Layer config: id, label, icon key, color, data file name, region
// region groups configs by tile pyramid (Sanctuary, Nahantu, Skovos…)
export const LAYER_CONFIGS = [
  { id: 'waypoints',           region: 'Sanctuary', label: 'Waypoints',           iconKey: 'waypoints',   color: '#D4AF37', file: 'waypoints.json'          },
  { id: 'dungeons',            region: 'Sanctuary', label: 'Dungeons',            iconKey: 'dungeons',    color: '#8b5cf6', file: 'dungeons.json'            },
  { id: 'altars',              region: 'Sanctuary', label: 'Altars of Lilith',    iconKey: 'altars',      color: '#dc2626', file: 'altars.json'              },
  { id: 'cellars',             region: 'Sanctuary', label: 'Cellars',             iconKey: 'cellars',     color: '#92400e', file: 'cellars.json'             },
  { id: 'chests',              region: 'Sanctuary', label: 'Helltide Chests',     iconKey: 'chests',      color: '#D4AF37', file: 'chests.json'              },
  { id: 'livingsteel',         region: 'Sanctuary', label: 'Living Steel',        iconKey: 'livingsteel', color: '#38bdf8', file: 'livingsteel.json'         },
  { id: 'events',              region: 'Sanctuary', label: 'Events',              iconKey: 'events',      color: '#f97316', file: 'events.json'              },
  { id: 'sidequests',          region: 'Sanctuary', label: 'Side Quests',         iconKey: 'sidequests',  color: '#3b82f6', file: 'sidequests.json'          },
  // ── Nahantu (Vessel of Hatred) ──────────────────────────────
  // Nahantu source image has the markers painted on the tiles themselves —
  // we use 'hotspot' (invisible click-target) so popups open without
  // double-rendering the icons.
  { id: 'nahantu_waypoints',   region: 'Nahantu',   label: 'Waypoints',           iconKey: 'waypoints',   color: '#4ade80', file: 'nahantu_waypoints.json'   },
  { id: 'nahantu_dungeons',    region: 'Nahantu',   label: 'Dungeons',            iconKey: 'dungeons',    color: '#c084fc', file: 'nahantu_dungeons.json'    },
  { id: 'nahantu_strongholds', region: 'Nahantu',   label: 'Strongholds',         iconKey: 'strongholds', color: '#f43f5e', file: 'nahantu_strongholds.json' },
  { id: 'nahantu_cellars',     region: 'Nahantu',   label: 'Cellars',             iconKey: 'cellars',     color: '#a16207', file: 'nahantu_cellars.json'     },
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

// ── Default-on layers (unified world) ────────────────────────
// All regions live on one map. POIs from every region render in the same
// coord space. By default the most-used categories are on; the rest are
// off but toggleable from the sidebar panel.
const DEFAULT_ON = new Set([
  'waypoints',
  'nahantu_waypoints',
  'nahantu_dungeons',
  'nahantu_strongholds',
  'nahantu_cellars',
])

// ── initLayers ───────────────────────────────────────────────
export function initLayers(map) {
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

      // City/waypoint name labels — every waypoint gets a permanent tooltip
      // showing its name. Applies to Sanctuary, Nahantu, Skovos waypoint
      // layers. CSS gates visibility by zoom (hidden at zoom <= 2).
      const isWaypointConfig = config.id === 'waypoints' || config.id.endsWith('_waypoints')
      if (isWaypointConfig) {
        marker.bindTooltip(decodeHtml(item.name || ''), {
          permanent: true,
          direction: 'bottom',
          offset: [0, 14],
          className: 'd4-city-label',
        })
      }

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

    const enabled = DEFAULT_ON.has(config.id)
    if (enabled) group.addTo(map)
    console.log(`[MAP-LAYER] init: ${config.id} (${config.region}) — ${data.length} markers, enabled=${enabled}`)
  }

  console.log(`[MAP-LAYER] initLayers complete — ${allPOIs.length} total POIs indexed`)
  buildSidebarPanel(map)
}

// ── buildSidebarPanel ────────────────────────────────────────
function buildSidebarPanel(map) {
  // Sidebar lists every layer across all regions on the unified world map.
  // Group sections by region in the displayed order: Sanctuary, then Nahantu.
  const list = document.getElementById('layer-list')
  if (!list) return
  list.innerHTML = ''

  const titleEl = document.querySelector('.panel-title')
  if (titleEl) titleEl.textContent = 'WORLD MAP'

  let lastRegion = null
  for (const config of LAYER_CONFIGS) {
    // Section header on region transitions
    if (config.region !== lastRegion) {
      const header = document.createElement('div')
      header.className = 'layer-section-header'
      header.textContent = config.region
      list.appendChild(header)
      lastRegion = config.region
    }

    const group = layerGroups[config.id]
    const count = allPOIs.filter(p => p.config.id === config.id).length
    const isEnabled = DEFAULT_ON.has(config.id)

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

// ── parentBuilds — received from main app via postMessage ────
let parentBuilds = []

// Slot label map for display
const SLOT_LABELS = {
  Helm: 'Helm', ChestArmor: 'Chest Armor', Gloves: 'Gloves',
  Legs: 'Legs', Boots: 'Boots', Amulet: 'Amulet',
  Ring1: 'Ring 1', Ring2: 'Ring 2', Weapon: 'Weapon',
  OffHand: 'Off-Hand', Weapon2H: '2H Weapon',
}

// ── renderBuildsTab ──────────────────────────────────────────
function renderBuildsTab(map) {
  const container = document.getElementById('builds-list')
  if (!container) return

  container.innerHTML = ''

  // Source label
  const note = document.createElement('div')
  note.className = 'builds-source-note'
  note.textContent = parentBuilds.length
    ? `${parentBuilds.length} build${parentBuilds.length !== 1 ? 's' : ''} from your Builder`
    : 'No builds yet — save one in the Builder tab'
  container.appendChild(note)

  if (!parentBuilds.length) {
    const empty = document.createElement('div')
    empty.className = 'builds-empty'
    empty.innerHTML = 'Open <b>Character → Builds</b> and save a build to see it here.'
    container.appendChild(empty)
    return
  }

  for (const build of parentBuilds) {
    const equipment = build.equipment || {}
    // Get filled slots
    const slots = Object.entries(equipment)
      .filter(([k]) => !k.startsWith('_'))
      .map(([slotId, item]) => ({ slotId, label: SLOT_LABELS[slotId] || slotId, name: item?.name || item?.cache_key || slotId }))

    const isActive = build.id === activeBuildId

    // 2026-04-28 (Bug 2 fix): the prior label "▶ Show Dungeons" implied a
    // build-specific route, but trade-core BuildPlanner doesn't save a
    // build.dungeons[] route — clicking just toggles the global dungeon +
    // waypoint layers. Use a label that matches actual behavior. When the
    // farm-route feature lands (per agent-outputs/investigations/boss_builds_menu.md),
    // hasRoute will be true and the original label fits.
    const hasRoute = Array.isArray(build.dungeons) && build.dungeons.length > 0
    const inactiveLabel = hasRoute ? '▶ Show Dungeons' : '▶ Highlight Dungeons + Waypoints'

    const item = document.createElement('div')
    item.className = 'build-item' + (isActive ? ' active' : '')
    item.dataset.buildId = build.id

    // Gear expand section
    const gearHtml = slots.length
      ? slots.map(s => `
          <div class="build-gear-slot" data-slot="${escapeHtml(s.slotId)}">
            <div class="build-gear-slot-check"></div>
            <div class="build-gear-slot-name" title="${escapeHtml(s.name)}">${escapeHtml(s.label)}: ${escapeHtml(s.name)}</div>
          </div>`).join('')
      : `<div class="build-gear-empty">No gear saved in this build</div>`

    item.innerHTML = `
      <div class="build-item-dot"></div>
      <div class="build-item-info">
        <div class="build-item-name">${escapeHtml(build.name)}</div>
        <div class="build-item-count">${build.character_class || ''} · ${slots.length} items</div>
      </div>
      <div class="build-gear-expand">
        <div class="build-gear-title">Gear Slots</div>
        ${gearHtml}
        <button class="build-activate-btn${isActive ? ' active-route' : ''}" data-inactive-label="${escapeHtml(inactiveLabel)}">
          ${isActive ? '✓ Active Route' : inactiveLabel}
        </button>
      </div>
    `

    // Header row click → expand/collapse
    const headerRow = item.querySelector('.build-item-dot')?.parentElement
    const infoEl = item.querySelector('.build-item-info')
    const expandEl = item.querySelector('.build-gear-expand')
    const activateBtn = item.querySelector('.build-activate-btn')

    // Click on header (not gear expand) → toggle expand
    const toggleExpand = (e) => {
      if (expandEl?.contains(e.target)) return
      const expanded = item.classList.toggle('expanded')
      console.log(`[MAP-BUILDS] ${expanded ? 'expand' : 'collapse'} "${build.name}"`)
    }
    item.addEventListener('click', toggleExpand)

    // Gear slot checkboxes — select which slots are being farmed
    expandEl?.querySelectorAll('.build-gear-slot').forEach(slotEl => {
      slotEl.addEventListener('click', (e) => {
        e.stopPropagation()
        slotEl.classList.toggle('gear-checked')
      })
    })

    // Activate button → show dungeon markers / route
    activateBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (activeBuildId === build.id) {
        clearBuildRoute(map)
        activateBtn.textContent = inactiveLabel
        activateBtn.classList.remove('active-route')
        document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'))
      } else {
        document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'))
        // 2026-04-28: each button carries its own inactive label (depends on
        // whether the build has a saved dungeon route). Use data-inactive-label
        // so we restore the right text per button, not a hardcoded string.
        document.querySelectorAll('.build-activate-btn').forEach(btn => {
          btn.textContent = btn.dataset.inactiveLabel || '▶ Highlight Dungeons + Waypoints'
          btn.classList.remove('active-route')
        })
        item.classList.add('active')
        activateBtn.textContent = '✓ Active Route'
        activateBtn.classList.add('active-route')
        // Show all dungeons + waypoints on the map for this build
        showBuildDungeons(map, build)
      }
    })

    container.appendChild(item)
  }
}

// Show dungeon layer + nearest waypoints when a build is activated
function showBuildDungeons(map, build) {
  clearBuildRoute(map)
  activeBuildId = build.id

  // Enable dungeons + waypoints layers if not already on
  if (layerGroups.dungeons && !map.hasLayer(layerGroups.dungeons)) {
    layerGroups.dungeons.addTo(map)
    const item = document.querySelector('[data-layer-id="dungeons"]')
    if (item) item.classList.add('checked')
  }
  if (layerGroups.waypoints && !map.hasLayer(layerGroups.waypoints)) {
    layerGroups.waypoints.addTo(map)
    const item = document.querySelector('[data-layer-id="waypoints"]')
    if (item) item.classList.add('checked')
  }

  // If build has a stored dungeon rotation (from the old local planner), use it;
  // otherwise show all dungeons (user can filter visually)
  if (build.dungeons?.length) {
    activateBuildRoute(map, build)
  }
  // Pan map to Sanctuary center
  map.setView([-90, 95], 3)
  console.log(`[MAP-BUILDS] activated "${build.name}" — dungeons visible`)
}

// Called from main.js with builds from parent app via postMessage
export function setParentBuilds(builds, map) {
  parentBuilds = Array.isArray(builds) ? builds : []
  clearBuildRoute(map)
  renderBuildsTab(map)
  console.log(`[MAP-BUILDS] received ${parentBuilds.length} builds from parent`)
}

// Called from main.js when builds-changed fires (local planner compat)
export function refreshBuildRotationLayers(map) {
  clearBuildRoute(map)
  renderBuildsTab(map)
  console.log('[MAP-LAYER] builds-changed — tab re-rendered')
}
