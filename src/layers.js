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
  const shortDesc = desc ? desc.split(' — ')[0] : null // first sentence only

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

export async function initLayers(map) {
  const enabledByDefault = new Set(['waypoints', 'dungeons', 'altars', 'cellars', 'events'])

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

  // All On / All Off buttons
  document.getElementById('btn-all-on')?.addEventListener('click', () => {
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.add('checked')
      const id = item.dataset.layerId
      layerGroups[id]?.addTo(map)
    })
  })

  document.getElementById('btn-all-off')?.addEventListener('click', () => {
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.remove('checked')
      const id = item.dataset.layerId
      if (layerGroups[id]) map.removeLayer(layerGroups[id])
    })
  })
}
