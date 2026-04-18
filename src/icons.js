// Custom SVG divIcon markers for each POI category
// Uses Leaflet L.divIcon with inline SVG

const icons = {}

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

// Waypoint — gold portal star
icons.waypoints = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#1a1400" stroke="#D4AF37" stroke-width="1.5"/>
    <polygon points="16,4 18.9,12.1 27.4,12.1 20.8,17.3 23.2,25.5 16,20.6 8.8,25.5 11.2,17.3 4.6,12.1 13.1,12.1"
             fill="#D4AF37" stroke="#b8941e" stroke-width="0.5"/>
  </svg>
`, '#D4AF37', 32)

// Dungeon — purple doorway arch
icons.dungeons = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#0e0018" stroke="#8b5cf6" stroke-width="1.5"/>
    <rect x="10" y="15" width="12" height="10" rx="1" fill="#5b2d8e" stroke="#8b5cf6" stroke-width="1"/>
    <path d="M10 15 Q16 8 22 15" fill="#7c3aed" stroke="#8b5cf6" stroke-width="1"/>
    <rect x="14.5" y="17" width="3" height="5" rx="1" fill="#1e0033"/>
  </svg>
`, '#8b5cf6', 32)

// Altar of Lilith — red flame
icons.altars = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#1a0000" stroke="#dc2626" stroke-width="1.5"/>
    <path d="M16 6 C14 10 11 11 12 15 C13 18 15 17 15 20 C15 22 13.5 23 13 25 C14.5 24 18 22 18 18 C18 15 20 14 19 11 C18.5 14 17 14 17 12 C17 10 18 8 16 6Z"
          fill="#ef4444" stroke="#dc2626" stroke-width="0.5"/>
    <path d="M16 12 C15 14 14 15 15 17 C15.5 18.5 16.5 18 17 19 C17 17 18 16 17.5 14 C17.2 15 16.5 15 16.5 13.5Z"
          fill="#fca5a5"/>
    <rect x="12" y="24" width="8" height="2" rx="1" fill="#7f1d1d" stroke="#dc2626" stroke-width="0.5"/>
  </svg>
`, '#dc2626', 32)

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

// Helltide Chest — gold treasure chest
icons.chests = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#1a1000" stroke="#D4AF37" stroke-width="1.5"/>
    <rect x="9" y="16" width="14" height="9" rx="1" fill="#78350f" stroke="#D4AF37" stroke-width="1"/>
    <path d="M9 14 Q9 11 16 11 Q23 11 23 14 L23 17 L9 17 Z" fill="#92400e" stroke="#D4AF37" stroke-width="1"/>
    <rect x="13" y="15" width="6" height="4" rx="1" fill="#D4AF37"/>
    <circle cx="16" cy="17" r="1.2" fill="#1a1000"/>
    <line x1="9" y1="17" x2="23" y2="17" stroke="#D4AF37" stroke-width="0.8"/>
  </svg>
`, '#D4AF37', 32)

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

// Event — orange lightning bolt
icons.events = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#120800" stroke="#f97316" stroke-width="1.5"/>
    <path d="M18 6 L11 17 L15.5 17 L14 26 L21 15 L16.5 15 Z"
          fill="#f97316" stroke="#c2410c" stroke-width="0.5"/>
  </svg>
`, '#f97316', 30)

// Side Quest — blue scroll
icons.sidequests = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#00040f" stroke="#3b82f6" stroke-width="1.5"/>
    <rect x="10" y="10" width="12" height="14" rx="2" fill="#1e3a5f" stroke="#3b82f6" stroke-width="1"/>
    <line x1="12.5" y1="14" x2="19.5" y2="14" stroke="#93c5fd" stroke-width="1"/>
    <line x1="12.5" y1="17" x2="19.5" y2="17" stroke="#93c5fd" stroke-width="1"/>
    <line x1="12.5" y1="20" x2="16" y2="20" stroke="#93c5fd" stroke-width="1"/>
    <path d="M10 10 Q10 8 12 8 Q14 8 14 10" fill="#2563eb" stroke="#3b82f6" stroke-width="1"/>
    <path d="M10 24 Q10 26 12 26 Q14 26 14 24" fill="#2563eb" stroke="#3b82f6" stroke-width="1"/>
  </svg>
`, '#3b82f6', 30)

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

// Stronghold — red fortress
icons.strongholds = makeDivIcon(`
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" fill="#140000" stroke="#dc2626" stroke-width="1.5"/>
    <rect x="9" y="14" width="14" height="11" fill="#7f1d1d" stroke="#dc2626" stroke-width="1"/>
    <rect x="9" y="11" width="3" height="4" fill="#991b1b" stroke="#dc2626" stroke-width="1"/>
    <rect x="20" y="11" width="3" height="4" fill="#991b1b" stroke="#dc2626" stroke-width="1"/>
    <rect x="14.5" y="11" width="3" height="4" fill="#991b1b" stroke="#dc2626" stroke-width="1"/>
    <rect x="13" y="19" width="6" height="6" rx="1" fill="#0f0000"/>
  </svg>
`, '#dc2626', 32)

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
  .d4-marker svg {
    width: 100%;
    height: 100%;
  }
`
document.head.appendChild(style)

export default icons
