// Convert all PNG/JPG assets under public/ to WebP, archiving originals.
//
//   public/tiles/<region>/{z}/{x}/{y}.png  -> .webp  (q=85, lossy, alpha kept)
//   public/icons/*.png                     -> .webp  (q=90, lossy, alpha kept)
//   public/maps/*.png|jpg                  -> .webp  (q=88, lossy)
//
// Originals are moved to agent-outputs/png-archive/<same relative path>.<orig-ext>
// (gitignored). Keep them for ~1 week as a rollback safety net.
//
// Usage: node scripts/convert-to-webp.mjs
//        node scripts/convert-to-webp.mjs --dry-run

import sharp from 'sharp'
import { readdir, mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'

const DRY = process.argv.includes('--dry-run')
const ROOTS = [
  { dir: 'public/tiles',   exts: ['.png'],         quality: 85 },
  { dir: 'public/icons',   exts: ['.png'],         quality: 90 },
  { dir: 'public/maps',    exts: ['.png', '.jpg'], quality: 88 },
]
const ARCHIVE = 'agent-outputs/png-archive'

async function* walk(dir) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

let totalIn = 0, totalOut = 0, count = 0
for (const root of ROOTS) {
  for await (const file of walk(root.dir)) {
    const ext = path.extname(file).toLowerCase()
    if (!root.exts.includes(ext)) continue

    const webpPath = file.slice(0, -ext.length) + '.webp'
    const archivePath = path.join(ARCHIVE, file)

    if (DRY) {
      console.log(`[dry] ${file}  ->  ${webpPath}  (archive ${archivePath})`)
      continue
    }

    // Encode WebP next to original
    const inputBuf = await sharp(file).webp({ quality: root.quality, alphaQuality: 100, effort: 4 }).toBuffer()
    const inSize = (await stat(file)).size
    const outSize = inputBuf.length

    await mkdir(path.dirname(webpPath), { recursive: true })
    await (await import('node:fs/promises')).writeFile(webpPath, inputBuf)

    // Archive original (move, not copy)
    await mkdir(path.dirname(archivePath), { recursive: true })
    await rename(file, archivePath)

    totalIn += inSize; totalOut += outSize; count++
    if (count % 50 === 0 || count <= 5) {
      const ratio = ((1 - outSize / inSize) * 100).toFixed(0)
      console.log(`  [${count}] ${file} : ${(inSize / 1024).toFixed(0)}KB -> ${(outSize / 1024).toFixed(0)}KB (-${ratio}%)`)
    }
  }
}

if (!DRY) {
  console.log(`\nDone. Converted ${count} files`)
  console.log(`  total in : ${(totalIn / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  total out: ${(totalOut / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  saved    : ${((1 - totalOut / totalIn) * 100).toFixed(1)}%`)
}
