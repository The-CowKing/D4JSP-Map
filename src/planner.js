// Build Planner — localStorage CRUD + modal UI for dungeon rotation builds

const STORAGE_KEY = 'd4jsp_builds'

function getBuilds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function saveBuilds(builds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(builds))
  document.dispatchEvent(new CustomEvent('builds-changed'))
}

function upsertBuild(build) {
  const builds = getBuilds()
  const idx = builds.findIndex(b => b.id === build.id)
  if (idx >= 0) builds[idx] = build
  else builds.push(build)
  saveBuilds(builds)
}

function deleteBuild(id) {
  saveBuilds(getBuilds().filter(b => b.id !== id))
}

// ── UI ────────────────────────────────────────────────────────

let allDungeons = []

export function initPlanner(dungeonsData) {
  // Sort once alphabetically for the picker
  allDungeons = [...dungeonsData].sort((a, b) =>
    decodeName(a).localeCompare(decodeName(b))
  )

  document.getElementById('btn-plan-builds')?.addEventListener('click', openModal)
  document.getElementById('planner-close')?.addEventListener('click', closeModal)
  document.getElementById('planner-modal')?.addEventListener('click', e => {
    if (e.target.id === 'planner-modal') closeModal()
  })

  // Keep modal list fresh when builds change externally (e.g., sidebar delete button)
  document.addEventListener('builds-changed', () => {
    const modal = document.getElementById('planner-modal')
    const listView = document.getElementById('planner-list-view')
    if (modal?.classList.contains('open') && !listView?.classList.contains('hidden')) {
      renderBuildList()
    }
  })
}

function openModal() {
  document.getElementById('planner-modal')?.classList.add('open')
  showList()
}

function closeModal() {
  document.getElementById('planner-modal')?.classList.remove('open')
}

function showList() {
  document.getElementById('planner-list-view')?.classList.remove('hidden')
  document.getElementById('planner-form-view')?.classList.add('hidden')
  renderBuildList()
}

function showForm(existing = null) {
  document.getElementById('planner-list-view')?.classList.add('hidden')
  document.getElementById('planner-form-view')?.classList.remove('hidden')
  renderForm(existing)
}

function renderBuildList() {
  const container = document.getElementById('planner-builds')
  if (!container) return
  const builds = getBuilds()

  if (!builds.length) {
    container.innerHTML = '<div class="planner-empty">No builds saved yet. Create one to add a dungeon rotation layer to the map.</div>'
  } else {
    container.innerHTML = builds.map(b => `
      <div class="planner-card">
        <div class="planner-card-info">
          <div class="planner-card-name">${escapeHtml(b.name)}</div>
          <div class="planner-card-meta">${b.dungeons?.length || 0} dungeons in rotation</div>
        </div>
        <div class="planner-card-btns">
          <button class="planner-edit-btn" data-id="${b.id}">Edit</button>
          <button class="planner-del-btn" data-id="${b.id}">×</button>
        </div>
      </div>
    `).join('')

    container.querySelectorAll('.planner-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const build = getBuilds().find(b => b.id === btn.dataset.id)
        if (build) showForm(build)
      })
    })

    container.querySelectorAll('.planner-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const build = getBuilds().find(b => b.id === btn.dataset.id)
        if (build && confirm(`Delete "${build.name}"?`)) deleteBuild(build.id)
      })
    })
  }

  // Re-bind new-build button each render
  const newBtn = document.getElementById('planner-new-btn')
  if (newBtn) {
    newBtn.onclick = () => showForm(null)
  }
}

function renderForm(existing = null) {
  const nameInput = document.getElementById('planner-name-input')
  const filterInput = document.getElementById('planner-dungeon-filter')
  const dungeonList = document.getElementById('planner-dungeon-list')
  const formTitle = document.getElementById('planner-form-title')
  const saveBtn = document.getElementById('planner-save-btn')
  const backBtn = document.getElementById('planner-back-btn')
  if (!nameInput || !dungeonList) return

  formTitle.textContent = existing ? 'EDIT BUILD' : 'NEW BUILD'
  nameInput.value = existing?.name || ''
  filterInput.value = ''

  const selected = new Set(existing?.dungeons || [])

  function updateCountBadge() {
    const badge = document.getElementById('planner-selected-count')
    if (badge) badge.textContent = selected.size ? `${selected.size} selected` : ''
  }

  function renderList(filter = '') {
    const q = filter.toLowerCase()
    const visible = q
      ? allDungeons.filter(d => decodeName(d).toLowerCase().includes(q))
      : allDungeons

    dungeonList.innerHTML = visible.map(d => {
      const name = escapeHtml(decodeName(d))
      const checked = selected.has(d._idx)
      return `<div class="planner-dungeon-row${checked ? ' checked' : ''}" data-idx="${d._idx}">
        <div class="layer-checkbox"></div>
        <span class="planner-dungeon-name">${name}</span>
      </div>`
    }).join('')

    dungeonList.querySelectorAll('.planner-dungeon-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.idx)
        const nowChecked = row.classList.toggle('checked')
        if (nowChecked) selected.add(idx)
        else selected.delete(idx)
        updateCountBadge()
      })
    })
  }

  renderList()
  updateCountBadge()

  filterInput.oninput = () => renderList(filterInput.value)

  backBtn.onclick = () => showList()

  saveBtn.onclick = () => {
    const name = nameInput.value.trim()
    if (!name) { nameInput.focus(); return }
    upsertBuild({
      id: existing?.id || `build_${Date.now()}`,
      name,
      dungeons: [...selected],
    })
    showList()
  }
}

function decodeName(d) {
  return (d.name || 'Unknown')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/<\/br>/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
