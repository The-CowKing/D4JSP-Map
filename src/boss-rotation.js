// Boss rotation queue + map markers — #110
//
// Reads public.boss_rotations from Supabase via PostgREST (anon key, RLS
// policy allows public SELECT on active=true rows). Renders:
//   - a right-side floating dock listing the next 6 spawns with countdowns
//     that tick every second
//   - a Leaflet layerGroup of red-skull pins on the map at each boss's
//     lat/lng with a popup showing name + tier + countdown
//
// The cadence is synthetic: the seed staggers spawns 30 min apart and a
// pg_cron job advances any expired row by the full 180-min cycle. Sync to
// the real helltide cycle is a follow-up.
//
// Tolerant of every failure mode (404, network error, table empty, RLS
// blocks): on failure the dock collapses to a small "Boss rotation
// unavailable" line and no markers are drawn. The app's first paint is
// never blocked on this fetch.

import icons from './icons.js'

const SUPABASE_URL = 'https://isjkdbmfxpxuuloqosib.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzamtkYm1meHB4dXVsb3Fvc2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDk4MDcsImV4cCI6MjA5MDIyNTgwN30.UdzV7PkGnEo0jgnViPzif13kaS88MeAnhHYsbbg2ugA'

const REST_URL = `${SUPABASE_URL}/rest/v1/boss_rotations?select=*&active=eq.true&order=next_spawn_at.asc&limit=6`
const REFETCH_INTERVAL_MS = 60_000

let bossLayer = null
let dockEl = null
let bossRows = []   // [{ id, boss_name, world_tier, region_zone, lat, lng, next_spawn_at:Date }]
let tickerHandle = null
let refetchHandle = null

function fmtCountdown(targetDate) {
  const ms = targetDate.getTime() - Date.now()
  if (ms <= 0) return 'spawning…'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function buildDockShell() {
  if (dockEl) return dockEl
  const el = document.createElement('div')
  el.id = 'boss-rotation-dock'
  el.innerHTML = `
    <div class="boss-dock-header">
      <span class="boss-dock-title">BOSS ROTATION</span>
      <span class="boss-dock-subtitle">Next 6 spawns</span>
    </div>
    <div id="boss-dock-list" class="boss-dock-list"></div>
  `
  document.body.appendChild(el)
  dockEl = el
  return el
}

function renderDockEmpty(message) {
  buildDockShell()
  const list = document.getElementById('boss-dock-list')
  if (!list) return
  list.innerHTML = `<div class="boss-row-empty">${message}</div>`
}

function renderDockRows() {
  buildDockShell()
  const list = document.getElementById('boss-dock-list')
  if (!list) return

  if (!bossRows.length) {
    list.innerHTML = '<div class="boss-row-empty">No active rotations.</div>'
    return
  }

  list.innerHTML = bossRows.map((b, i) => `
    <div class="boss-row" data-boss-id="${b.id}">
      <div class="boss-row-rank">${i + 1}</div>
      <div class="boss-row-body">
        <div class="boss-row-name">${escapeHtml(b.boss_name)}</div>
        <div class="boss-row-meta">T${b.world_tier} · ${escapeHtml(b.region_zone)}</div>
      </div>
      <div class="boss-row-timer" data-spawn-at="${b.next_spawn_at.toISOString()}">${fmtCountdown(b.next_spawn_at)}</div>
    </div>
  `).join('')

  // Click a dock row → fly to the boss on the map and open its popup.
  list.querySelectorAll('.boss-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.bossId
      const b = bossRows.find(x => x.id === id)
      if (!b || !b._marker || !b._map) return
      b._map.flyTo([b.lat, b.lng], Math.max(b._map.getZoom(), 4), { duration: 0.6 })
      b._marker.openPopup()
    })
  })
}

function tickTimers() {
  if (!dockEl) return
  // Update dock countdown text only — DOM diff is just the text node per row.
  dockEl.querySelectorAll('.boss-row-timer').forEach(el => {
    const iso = el.dataset.spawnAt
    if (!iso) return
    el.textContent = fmtCountdown(new Date(iso))
  })
  // Update any open marker popups.
  for (const b of bossRows) {
    if (!b._marker || !b._marker.isPopupOpen()) continue
    b._marker.setPopupContent(buildPopupHtml(b))
  }
}

function buildPopupHtml(b) {
  return `
    <div class="d4-popup">
      <div class="d4-popup-header">
        <div class="d4-popup-type" style="color:#dc2626">WORLD BOSS · T${b.world_tier}</div>
        <div class="d4-popup-name" style="color:#dc2626">${escapeHtml(b.boss_name)}</div>
      </div>
      <div class="d4-popup-body">
        <div class="d4-popup-desc">${escapeHtml(b.region_zone)}</div>
        <div class="boss-popup-timer">Next spawn: <strong>${fmtCountdown(b.next_spawn_at)}</strong></div>
      </div>
    </div>
  `
}

function renderMarkers(map) {
  if (!bossLayer) {
    bossLayer = L.layerGroup().addTo(map)
  } else {
    bossLayer.clearLayers()
  }
  for (const b of bossRows) {
    const marker = L.marker([b.lat, b.lng], { icon: icons.world_bosses })
      .bindPopup(buildPopupHtml(b), { maxWidth: 300, className: '' })
      .addTo(bossLayer)
    b._marker = marker
    b._map = map
  }
}

async function fetchRotation() {
  const res = await fetch(REST_URL, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('not an array')
  return rows.map(r => ({
    id: r.id,
    boss_name: String(r.boss_name || 'Unknown'),
    world_tier: Number(r.world_tier ?? 4),
    region_zone: String(r.region_zone || ''),
    lat: Number(r.lat),
    lng: Number(r.lng),
    next_spawn_at: new Date(r.next_spawn_at),
  }))
}

async function refresh(map) {
  try {
    bossRows = await fetchRotation()
    renderDockRows()
    renderMarkers(map)
    console.log(`[BOSS-ROTATION] loaded ${bossRows.length} active rotation(s)`)
  } catch (e) {
    console.warn('[BOSS-ROTATION] fetch failed:', e?.message || e)
    bossRows = []
    if (bossLayer) bossLayer.clearLayers()
    renderDockEmpty('Boss rotation unavailable.')
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function initBossRotation(map) {
  buildDockShell()
  renderDockEmpty('Loading rotation…')
  refresh(map)

  if (tickerHandle) clearInterval(tickerHandle)
  tickerHandle = setInterval(tickTimers, 1000)

  if (refetchHandle) clearInterval(refetchHandle)
  refetchHandle = setInterval(() => refresh(map), REFETCH_INTERVAL_MS)
}
