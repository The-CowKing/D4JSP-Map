// Render the world ocean+fog base layer as a single PNG.
// Sized to roughly match WORLD_BOUNDS aspect (440 lng / 360 lat ≈ 1.22:1).
// Composited via SVG: deep navy radial gradient + subtle diagonal grain
// + dark vignette at the edges (fog-of-war framing).
import sharp from 'sharp'

const W = 1280, H = 1040    // ~1.23:1, divisible cleanly

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Deep ocean radial — slightly lighter in the middle, deeper at edges -->
    <radialGradient id="ocean" cx="50%" cy="48%" r="65%">
      <stop offset="0%"   stop-color="#2c4970"/>
      <stop offset="40%"  stop-color="#1d3454"/>
      <stop offset="80%"  stop-color="#10223b"/>
      <stop offset="100%" stop-color="#08182c"/>
    </radialGradient>

    <!-- Warm sepia hint (parchment edge feel where Sanctuary tiles will sit) -->
    <radialGradient id="sepia" cx="72%" cy="22%" r="48%">
      <stop offset="0%"   stop-color="#7a5028" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#7a5028" stop-opacity="0"/>
    </radialGradient>

    <!-- Fog vignette — only the far edges get heavy darkness -->
    <radialGradient id="fog" cx="50%" cy="50%" r="62%">
      <stop offset="55%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="82%"  stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
    </radialGradient>

    <!-- Subtle diagonal "wave/grain" pattern -->
    <pattern id="grain" patternUnits="userSpaceOnUse" width="140" height="140" patternTransform="rotate(45)">
      <line x1="0" y1="0"   x2="140" y2="0"   stroke="rgba(255,255,255,0.025)" stroke-width="1"/>
      <line x1="0" y1="70"  x2="140" y2="70"  stroke="rgba(0,0,0,0.05)"        stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="100%" height="100%" fill="url(#ocean)"/>
  <rect width="100%" height="100%" fill="url(#sepia)"/>
  <rect width="100%" height="100%" fill="url(#grain)"/>
  <rect width="100%" height="100%" fill="url(#fog)"/>

  <!-- Ornate gold corner brackets (faint) — admiralty-map feel -->
  <g stroke="#8a6a28" stroke-width="2" fill="none" opacity="0.45">
    <path d="M30 30 L30 90 M30 30 L90 30"/>
    <path d="M${W - 30} 30 L${W - 30} 90 M${W - 30} 30 L${W - 90} 30"/>
    <path d="M30 ${H - 30} L30 ${H - 90} M30 ${H - 30} L90 ${H - 30}"/>
    <path d="M${W - 30} ${H - 30} L${W - 30} ${H - 90} M${W - 30} ${H - 30} L${W - 90} ${H - 30}"/>
  </g>
</svg>
`

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile('public/maps/ocean.png')

const meta = await sharp('public/maps/ocean.png').metadata()
console.log(`ocean.png: ${meta.width}x${meta.height}, ${meta.size ?? '?'} bytes`)
