// Custom SVG divIcon markers for each POI category
// Uses Leaflet L.divIcon with inline SVG

const icons = {}

// Invisible click-hotspot — used when the underlying tile already has the
// marker painted on (e.g. Nahantu source image with diamond waypoints baked in).
// Same hit area as a normal marker so popups still open on click/hover.
icons.hotspot = L.divIcon({
  html: '<div class="d4-hotspot" style="width:36px;height:36px;cursor:pointer"></div>',
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
})

function makeDivIcon(svgContent, color, size = 32) {
  const half = size / 2
  return L.divIcon({
    html: `<div class="d4-marker" style="width:${size}px;height:${size}px;--mc:${color}">${svgContent}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half - 4],
  })
}

// Branded D4JSP icon set (PNG, served from /icons/<name>.png).
//   anchor:'center' — symmetric icons (circle, radial burst)
//   anchor:'bottom' — icons whose visual tip points down to the location
function makeImgIcon(url, { size = 36, anchor = 'center' } = {}) {
  const half = size / 2
  const ay = anchor === 'bottom' ? size : half
  return L.icon({
    iconUrl: url,
    iconSize: [size, size],
    iconAnchor: [half, ay],
    popupAnchor: [0, -ay - 4],
    className: 'd4-img-marker',
  })
}

// Branded PNG icons (D4JSP-supplied)
icons.waypoints = makeImgIcon('./icons/waypoint.png',         { size: 36, anchor: 'center' })
icons.dungeons  = makeImgIcon('./icons/dungeon.png',          { size: 36, anchor: 'bottom' })
icons.altars    = makeImgIcon('./icons/altar_of_lilith.png',  { size: 36, anchor: 'bottom' })

// Cellar — brown wooden door
icons.cellars = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#0f0800" stroke="#92400e" stroke-width="1.5"/>
    <rect x="11" y="11" width="10" height="13" rx="1" fill="#78350f" stroke="#92400e" stroke-width="1"/>
    <line x1="16" y1="11" x2="16" y2="24" stroke="#451a03" stroke-width="1"/>
    <line x1="11" y1="15" x2="21" y2="15" stroke="#451a03" stroke-width="0.7"/>
    <circle cx="19" cy="17.5" r="1" fill="#D4AF37"/>
    <circle cx="13" cy="17.5" r="1" fill="#D4AF37"/>
  </svg>
`, '#92400e', 30)

// Helltide Chest — branded PNG (D4JSP-supplied)
icons.chests = makeImgIcon('./icons/helltide_chest.png', { size: 36, anchor: 'bottom' })

// Living Steel — silver/blue chest
icons.livingsteel = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#000a14" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="9" y="16" width="14" height="9" rx="1" fill="#1e3a5f" stroke="#38bdf8" stroke-width="1"/>
    <path d="M9 14 Q9 11 16 11 Q23 11 23 14 L23 17 L9 17 Z" fill="#1e4976" stroke="#38bdf8" stroke-width="1"/>
    <rect x="13" y="15" width="6" height="4" rx="1" fill="#38bdf8"/>
    <circle cx="16" cy="17" r="1.2" fill="#000a14"/>
    <line x1="9" y1="17" x2="23" y2="17" stroke="#38bdf8" stroke-width="0.8"/>
  </svg>
`, '#38bdf8', 32)

// Branded PNG icons (D4JSP-supplied)
icons.events     = makeImgIcon('./icons/event.png', { size: 36, anchor: 'center' })
icons.sidequests = makeImgIcon('./icons/quest.png', { size: 36, anchor: 'bottom' })

// Build Rotation — gold dungeon arch with star (used for saved build rotation markers)
icons.rotation = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#1a1400" stroke="#D4AF37" stroke-width="2"/>
    <rect x="10" y="16" width="12" height="9" rx="1" fill="#5b4500" stroke="#D4AF37" stroke-width="1"/>
    <path d="M10 16 Q16 9 22 16" fill="#7c6000" stroke="#D4AF37" stroke-width="1"/>
    <rect x="14.5" y="18" width="3" height="5" rx="1" fill="#1a1400"/>
    <polygon points="16,3 17,6 20,6 17.5,7.8 18.5,11 16,9 13.5,11 14.5,7.8 12,6 15,6"
             fill="#D4AF37" stroke="#b8941e" stroke-width="0.4"/>
  </svg>
`, '#D4AF37', 32)

// Stronghold — branded PNG (D4JSP-supplied)
icons.strongholds = makeImgIcon('./icons/stronghold.png', { size: 36, anchor: 'bottom' })

// World Boss — red skull
icons.world_bosses = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#1a0000" stroke="#dc2626" stroke-width="2"/>
    <path d="M16 7 C10 7 7 11 7 15 C7 18 8.5 20 11 21 L11 24 L21 24 L21 21 C23.5 20 25 18 25 15 C25 11 22 7 16 7Z"
          fill="#4b0808" stroke="#dc2626" stroke-width="1"/>
    <ellipse cx="12.5" cy="15" rx="2.5" ry="2.5" fill="#1a0000"/>
    <ellipse cx="19.5" cy="15" rx="2.5" ry="2.5" fill="#1a0000"/>
    <ellipse cx="12.5" cy="15" rx="1.5" ry="1.5" fill="#ef4444"/>
    <ellipse cx="19.5" cy="15" rx="1.5" ry="1.5" fill="#ef4444"/>
    <path d="M13 21.5 L13 24 M16 21 L16 24 M19 21.5 L19 24" stroke="#dc2626" stroke-width="1.2"/>
  </svg>
`, '#dc2626', 36)

// CSS for marker hover glow
const style = document.createElement('style')
style.textContent = `
  .d4-marker {
    filter: drop-shadow(0 0 4px var(--mc, #D4AF37));
    transition: filter 0.2s, transform 0.15s;
    cursor: pointer;
  }
  .d4-marker:hover {
    filter: drop-shadow(0 0 10px var(--mc, #D4AF37)) brightness(1.3);
    transform: scale(1.18);
  }
  .d4-marker svg { width: 100%; height: 100%; }

  /* Branded PNG markers — drop-shadow so they sit cleanly over the map */
  .d4-img-marker {
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.85));
    transition: filter 0.18s, transform 0.15s;
    cursor: pointer;
  }
  .d4-img-marker:hover {
    filter: drop-shadow(0 0 8px rgba(212,175,55,0.7)) brightness(1.15);
    transform: scale(1.15);
  }
`
document.head.appendChild(style)

export default icons
