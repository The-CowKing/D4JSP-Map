#!/usr/bin/env node
// Slice a single source image into a Leaflet tile pyramid that matches
// the Sanctuary layout: 512x512 PNG tiles, z=0..4 native.
//
// Sanctuary reference (exact match):
//   z=0: 1x1   (1 tile)
//   z=1: 2x2   (4 tiles)
//   z=2: 4x4   (16 tiles)
//   z=3: 7x7   (49 tiles)
//   z=4: 13x13 (169 tiles)   <-- max native, content fills 6656x6656
// Total: 239 tiles per region (matches public/tiles/Sanctuary).
//
// Usage:
//   node scripts/slice-region-tiles.js --input <path> --region <Nahantu|Skovos>
//   node scripts/slice-region-tiles.js --input ./foo.png --region Skovos --output public/tiles/Skovos
//
// The source image is resized preserving aspect with transparent letterbox
// to fill the content area. Bigger source = sharper tiles. Recommended
// minimum 4096x4096; ideal 6656x6656 or larger.

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const TILE = 512
const CONTENT_AT_MAX_Z = 6656         // 13 tiles * 512 px (matches Sanctuary z=4 native)
const TILES_PER_SIDE = { 0: 1, 1: 2, 2: 4, 3: 7, 4: 13 }
const MAX_Z = 4

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--input')        args.input  = argv[++i]
    else if (a === '--region')  args.region = argv[++i]
    else if (a === '--output')  args.output = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/slice-region-tiles.js --input <path> --region <Name> [--output <dir>]
  --input   Source image (PNG/JPG). Larger is better; min ~4096px square.
  --region  Region label (Nahantu, Skovos, etc). Determines default output dir.
  --output  Override output dir. Default: public/tiles/<region>`)
      process.exit(0)
    }
  }
  if (!args.input)  { console.error('ERROR: --input required'); process.exit(1) }
  if (!args.region) { console.error('ERROR: --region required'); process.exit(1) }
  if (!existsSync(args.input)) { console.error(`ERROR: input not found: ${args.input}`); process.exit(1) }
  args.output ??= path.join('public', 'tiles', args.region)
  return args
}

async function main() {
  const args = parseArgs()
  console.log(`Slicing ${args.input} -> ${args.output}`)

  // Step 1: resize source to CONTENT_AT_MAX_Z square, preserving aspect, transparent letterbox
  const meta = await sharp(args.input).metadata()
  console.log(`  source: ${meta.width}x${meta.height} ${meta.format}`)
  if (Math.min(meta.width, meta.height) < 2048) {
    console.warn(`  ⚠ source is small (${meta.width}x${meta.height}); high-zoom tiles will look soft`)
  }
  const masterBuf = await sharp(args.input)
    .ensureAlpha()
    .resize(CONTENT_AT_MAX_Z, CONTENT_AT_MAX_Z, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  console.log(`  master rendered at ${CONTENT_AT_MAX_Z}x${CONTENT_AT_MAX_Z}`)

  // Step 2: for each zoom level, scale master to content size, pad to tile-grid raster, slice
  let totalWritten = 0
  for (let z = 0; z <= MAX_Z; z++) {
    const tilesPerSide = TILES_PER_SIDE[z]
    const contentSize  = CONTENT_AT_MAX_Z >> (MAX_Z - z)   // 416, 832, 1664, 3328, 6656
    const rasterSize   = tilesPerSide * TILE               // 512, 1024, 2048, 3584, 6656

    // Scale master down to contentSize and pad to rasterSize (transparent right+bottom)
    const padBottom = rasterSize - contentSize
    const padRight  = rasterSize - contentSize
    const zoomBuf = await sharp(masterBuf)
      .resize(contentSize, contentSize)
      .extend({
        top: 0, left: 0,
        bottom: padBottom, right: padRight,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()

    for (let x = 0; x < tilesPerSide; x++) {
      const colDir = path.join(args.output, String(z), String(x))
      await mkdir(colDir, { recursive: true })
      for (let y = 0; y < tilesPerSide; y++) {
        const tileBuf = await sharp(zoomBuf)
          .extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE })
          .png({ compressionLevel: 9 })
          .toBuffer()
        await writeFile(path.join(colDir, `${y}.png`), tileBuf)
        totalWritten++
      }
    }
    console.log(`  z=${z}: ${tilesPerSide}x${tilesPerSide} = ${tilesPerSide * tilesPerSide} tiles (raster ${rasterSize}px, content ${contentSize}px)`)
  }
  console.log(`Done. Wrote ${totalWritten} tiles to ${args.output}`)
}

main().catch(e => { console.error(e); process.exit(1) })
