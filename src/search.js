// Fuzzy search using Fuse.js across all POI data
// Keyboard: / to focus, Escape to close, Arrow keys to navigate
import Fuse from 'fuse.js'
import { allPOIs } from './layers.js'

let fuse = null
let map = null
let selectedIndex = -1
let currentResults = []

export function initSearch(mapInstance) {
  map = mapInstance

  const input = document.getElementById('search-input')
  const results = document.getElementById('search-results')
  const clearBtn = document.getElementById('search-clear')

  if (!input || !results) return

  // Init Fuse after layers are loaded (call this after initLayers).
  // 2026-05-01 (Y.34bc): track the index size we built against so the
  // input handler can rebuild after maxroll-map.json POIs land in
  // allPOIs (~600ms after page load). Adam: "search doesnt search" —
  // happened because Fuse was built at t=500ms when allPOIs only had
  // the static Nahantu/Skovos data; the 2,384 maxroll POIs (bulk of
  // Sanctuary including "Hanged Man's Hall") arrived after.
  let fuseSize = 0
  function buildFuse() {
    fuse = new Fuse(allPOIs, {
      keys: ['name', 'desc'],
      threshold: 0.3,
      distance: 200,
      minMatchCharLength: 2,
      includeMatches: true,
    })
    fuseSize = allPOIs.length
  }
  function ensureFreshFuse() {
    if (!fuse || allPOIs.length !== fuseSize) buildFuse()
  }

  // Build fuse index after a short delay to ensure layers are loaded
  setTimeout(buildFuse, 500)

  // Keyboard shortcut: / to focus search
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault()
      input.focus()
      input.select()
    }
    if (e.key === 'Escape') {
      closeSearch()
      input.blur()
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      navigateResults(1)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      navigateResults(-1)
    }
    if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      selectResult(selectedIndex)
    }
  })

  input.addEventListener('input', () => {
    const query = input.value.trim()
    clearBtn.style.display = query ? 'block' : 'none'

    if (!query) {
      closeResults()
      return
    }

    // Y.34bc: rebuild if maxroll POIs landed after the initial build.
    ensureFreshFuse()
    if (!fuse) return  // safety — can only happen pre-init

    const raw = fuse.search(query, { limit: 10 })
    currentResults = raw
    renderResults(raw, query)
  })

  input.addEventListener('focus', () => {
    if (input.value.trim() && currentResults.length > 0) {
      results.style.display = 'block'
    }
  })

  clearBtn.addEventListener('click', () => {
    input.value = ''
    clearBtn.style.display = 'none'
    closeResults()
    input.focus()
  })

  // Y.34o (Adam: "searching that toast stays popped up can't get rid of
  // it.. it should have x and off click and timer 2 seconds"):
  //  - close X button on the dropdown
  //  - off-click anywhere outside dismisses it
  //  - "No results" auto-dismisses after 2s
  let noResultsTimer = null
  function clearNoResultsTimer() {
    if (noResultsTimer) { clearTimeout(noResultsTimer); noResultsTimer = null }
  }

  function renderResults(fuseResults, query) {
    selectedIndex = -1
    clearNoResultsTimer()

    if (fuseResults.length === 0) {
      results.style.display = 'block'
      results.innerHTML =
        `<button class="search-results-close" title="Close" aria-label="Close">&times;</button>` +
        `<div class="search-no-results">No results for "${escapeHtml(query)}"</div>`
      // Auto-dismiss after 2s
      noResultsTimer = setTimeout(closeResults, 2000)
      results.querySelector('.search-results-close')?.addEventListener('click', e => {
        e.stopPropagation()
        closeResults()
      })
      return
    }

    results.style.display = 'block'
    results.innerHTML =
      `<button class="search-results-close" title="Close" aria-label="Close">&times;</button>` +
      fuseResults.map((r, i) => {
        const poi = r.item
        const displayName = highlightMatch(poi.name, r.matches?.find(m => m.key === 'name'))
        return `
          <div class="search-result-item" data-index="${i}">
            <div class="search-result-dot" style="background:${poi.config.color};box-shadow:0 0 6px ${poi.config.color}"></div>
            <div class="search-result-name">${displayName}</div>
            <div class="search-result-type" style="color:${poi.config.color}">${poi.config.label}</div>
          </div>
        `
      }).join('')

    // Click handlers
    results.querySelector('.search-results-close')?.addEventListener('click', e => {
      e.stopPropagation()
      closeResults()
    })
    results.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index)
        selectResult(idx)
      })
    })
  }

  // Off-click to dismiss — anywhere outside the search input + results.
  document.addEventListener('click', (e) => {
    if (results.style.display === 'none') return
    if (results.contains(e.target)) return
    if (e.target === input) return
    closeResults()
  })

  function selectResult(idx) {
    if (idx < 0 || idx >= currentResults.length) return
    const poi = currentResults[idx].item

    // Fly to location
    map.flyTo([poi.lat, poi.lng], 5, { duration: 1.2 })

    // Open popup — need a short delay for fly animation
    setTimeout(() => {
      poi.marker.openPopup()
    }, 400)

    // Update input
    input.value = poi.name
    closeResults()
  }

  function navigateResults(dir) {
    const items = results.querySelectorAll('.search-result-item')
    if (items.length === 0) return

    items[selectedIndex]?.classList.remove('selected')
    selectedIndex = Math.max(0, Math.min(items.length - 1, selectedIndex + dir))
    items[selectedIndex].classList.add('selected')
    items[selectedIndex].scrollIntoView({ block: 'nearest' })
  }

  function closeResults() {
    results.style.display = 'none'
    results.innerHTML = ''
    selectedIndex = -1
    currentResults = []
  }

  function closeSearch() {
    input.value = ''
    clearBtn.style.display = 'none'
    closeResults()
  }
}

function highlightMatch(text, match) {
  if (!match || !match.indices?.length) return escapeHtml(text)

  const escaped = escapeHtml(text)
  // Build highlighted string from match indices
  let result = ''
  let lastEnd = 0
  const indices = match.indices.sort((a, b) => a[0] - b[0])

  for (const [start, end] of indices) {
    result += escaped.slice(lastEnd, start)
    result += `<b>${escaped.slice(start, end + 1)}</b>`
    lastEnd = end + 1
  }
  result += escaped.slice(lastEnd)
  return result
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Style for selected result
const style = document.createElement('style')
style.textContent = `
  .search-result-item.selected {
    background: var(--bg-hover);
    outline: 1px solid var(--border);
  }
`
document.head.appendChild(style)
