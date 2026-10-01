/**
 * Rebuild public/search/{index.bin,index.json} — the client-side identify index.
 *
 * The heavy part (CLIP embeddings) runs OUTSIDE this repo on purpose: it needs
 * the model (~30 MB) and the cached card images. Reproduce it like this:
 *
 *   1. Download card images for every `cards.image` row (16k images).
 *   2. Embed each image with Xenova/clip-vit-base-patch32 (q8) via
 *      @huggingface/transformers, pooled output — **ONE IMAGE PER CALL**.
 *      transformers.js changes per-image output when batch > 1 (batch-dependent
 *      resize), which flips near-tie rankings vs single-image queries.
 *   3. Write float32 vectors (N x 512) to embeddings.bin + ids (same order)
 *      to embed-ids.json.
 *   4. Run:  node scripts/build-search-index.mjs --embed embeddings.bin --ids embed-ids.json
 *
 * Output format (index.bin): magic "HPCF" | u32 version | u32 n | u32 dim |
 * n*dim float16 values (row-major). index.json carries aligned card metadata.
 */
import { createClient } from '@libsql/client'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const embedPath = arg('--embed')
const idsPath = arg('--ids')
if (!embedPath || !idsPath) {
  console.error('usage: node scripts/build-search-index.mjs --embed <embeddings.bin> --ids <embed-ids.json>')
  process.exit(1)
}

const dim = 512
const ids = JSON.parse(readFileSync(idsPath, 'utf8'))
const emb = readFileSync(embedPath)
const n = ids.length
if (emb.length !== n * dim * 4) {
  throw new Error(`embeddings size ${emb.length} != ${n} x ${dim} x 4`)
}

const env = Object.fromEntries(
  readFileSync(join(appDir, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
const res = await db.execute("SELECT id, name, group_name, member_name, image FROM cards WHERE image IS NOT NULL AND image != ''")
const byId = new Map(res.rows.map((c) => [String(c.id), c]))
console.log(`turso rows with image: ${byId.size}`)

function f32ToF16(val) {
  const f = new Float32Array(1)
  const u = new Uint32Array(f.buffer)
  f[0] = val
  const x = u[0]
  const sign = (x >> 16) & 0x8000
  let exp = (x >> 23) & 0xff
  const mant = x & 0x7fffff
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 1 : 0)
  exp = exp - 127 + 15
  if (exp >= 0x1f) return sign | 0x7c00
  if (exp <= 0) {
    if (exp < -10) return sign
    const m = mant | 0x800000
    return sign | (m >> (14 - exp))
  }
  return sign | (exp << 10) | (mant >> 13)
}

const header = Buffer.alloc(16)
header.write('HPCF', 0, 'ascii')
header.writeUInt32LE(1, 4)
header.writeUInt32LE(n, 8)
header.writeUInt32LE(dim, 12)
const vecs = Buffer.alloc(n * dim * 2)
for (let i = 0; i < n * dim; i++) vecs.writeUInt16LE(f32ToF16(emb.readFloatLE(i * 4)), i * 2)

const cards = ids.map((id) => {
  const c = byId.get(String(id))
  if (!c) throw new Error(`card ${id} missing in Turso`)
  return { id: String(c.id), name: c.name, group_name: c.group_name, member_name: c.member_name || '', image: c.image }
})

const outDir = join(appDir, 'public', 'search')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'index.bin'), Buffer.concat([header, vecs]))
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version: 1, n, dim, cards }))
console.log(`OK n=${n} dim=${dim} -> public/search/index.bin (${(vecs.length / 1048576).toFixed(1)} MB vectors) + index.json`)
