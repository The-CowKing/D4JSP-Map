// Layer definitions, marker creation, sidebar panel
import icons from './icons.js'

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

// Build rotation groups: buildId -> L.layerGroup
export const rotationGroups = {}

export async function initLayers(map) {
  const enabledByDefault = new Set(['waypoints'])

  for (const config of LAYER_CONFIGS) {
    const group = L.layerGroup()
    layerGroups[config.id] = group

    // Load data
    let data = []
    try {
      const res = await fetch(`./src/data/${config.file}`)
      data = await res.json()
    } catch (e) {
      console.warn(`Failed to load ${config.file}:`, e)
      continue
    }

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

    if (enabledByDefault.has(config.id)) {
      group.addTo(map)
    }
  }

  buildSidebarPanel(map, enabledByDefault)
}

function buildSidebarPanel(map, enabledByDefault) {
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
      if (enabled) {
        group.addTo(map)
      } else {
        map.removeLayer(group)
      }
    })

    list.appendChild(item)
  }

  // All On / All Off — handles both static layers and build rotations
  document.getElementById('btn-all-on')?.addEventListener('click', () => {
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.add('checked')
      const id = item.dataset.layerId
      const rotId = item.dataset.rotationId
      if (id) layerGroups[id]?.addTo(map)
      if (rotId) rotationGroups[rotId]?.addTo(map)
    })
  })

  document.getElementById('btn-all-off')?.addEventListener('click', () => {
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.remove('checked')
      const id = item.dataset.layerId
      const rotId = item.dataset.rotationId
      if (id && layerGroups[id]) map.removeLayer(layerGroups[id])
      if (rotId && rotationGroups[rotId]) map.removeLayer(rotationGroups[rotId])
    })
  })
}

// Rebuild all build rotation layers from localStorage and re-render sidebar section
export function refreshBuildRotationLayers(map) {
  // Remove existing rotation groups from map and clear the registry
  for (const id of Object.keys(rotationGroups)) {
    map.removeLayer(rotationGroups[id])
    delete rotationGroups[id]
  }

  let builds = []
  try { builds = JSON.parse(localStorage.getItem('d4jsp_builds') || '[]') }
  catch { /* ignore corrupt storage */ }

  // Create a layer group per build using the cached dungeon data
  const rotIcon = icons.rotation
  for (const build of builds) {
    if (!build.dungeons?.length) continue
    const group = L.layerGroup()
    rotationGroups[build.id] = group
    group.addTo(map)

    for (const idx of build.dungeons) {
      const d = dungeonsData[idx]
      if (!d) continue
      const name = decodeHtml(d.name || 'Unknown')
      L.marker([d.lat, d.lng], { icon: rotIcon })
        .bindPopup(`
          <div class="d4-popup">
            <div class="d4-popup-header">
              <div class="d4-popup-type" style="color:#D4AF37">ROTATION — ${escapeHtml(build.name.toUpperCase())}</div>
              <div class="d4-popup-name" style="color:#D4AF37">${name}</div>
            </div>
          </div>
        `, { maxWidth: 300, className: '' })
        .addTo(group)
    }
  }

  renderRotationSection(map, builds)
}

function renderRotationSection(map, builds) {
  document.getElementById('rotation-section')?.remove()

  const list = document.getElementById('layer-list')
  if (!list) return

  const section = document.createElement('div')
  section.id = 'rotation-section'

  const header = document.createElement('div')
  header.className = 'layer-section-header'
  header.textContent = 'BUILD ROTATIONS'
  section.appendChild(header)

  if (!builds.length) {
    const empty = document.createElement('div')
    empty.className = 'layer-section-empty'
    empty.textContent = 'No builds saved'
    section.appendChild(empty)
  }

  for (const build of builds) {
    const count = build.dungeons?.length || 0
    const group = rotationGroups[build.id]

    const item = document.createElement('div')
    item.className = 'layer-item checked'
    item.dataset.rotationId = build.id
    item.innerHTML = `
      <div class="layer-checkbox"></div>
      <div class="layer-dot" style="background:#D4AF37;color:#D4AF37"></div>
      <div class="layer-label">${escapeHtml(build.name)}</div>
      <div class="layer-count">${count}</div>
      <button class="rotation-delete" title="Remove build">×</button>
    `

    item.addEventListener('click', e => {
      if (e.target.classList.contains('rotation-delete')) return
      const enabled = item.classList.toggle('checked')
      if (enabled && group) group.addTo(map)
      else if (!enabled && group) map.removeLayer(group)
    })

    item.querySelector('.rotation-delete').addEventListener('click', e => {
      e.stopPropagation()
      const buildName = build.name
      if (confirm(`Remove "${buildName}" from your builds?`)) {
        let saved = []
        try { saved = JSON.parse(localStorage.getItem('d4jsp_builds') || '[]') }
        catch { /* ignore */ }
        localStorage.setItem('d4jsp_builds', JSON.stringify(saved.filter(b => b.id !== build.id)))
        document.dispatchEvent(new CustomEvent('builds-changed'))
      }
    })

    section.appendChild(item)
  }

  list.appendChild(section)
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
