#!/usr/bin/env node
/**
 * Rebuild the search index: download blurred images from Pocamarket CDN,
 * sharpen them, embed with CLIP, and write public/search/{index.bin,index.json}.
 *
 * Supports resuming — progress is saved to .index-checkpoint.json after each
 * batch.  Re-run the script to continue from where it left off.
 *
 * Usage:
 *   node scripts/rebuild-index.mjs              # full rebuild
 *   node scripts/rebuild-index.mjs --resume     # resume from checkpoint
 *   node scripts/rebuild-index.mjs --force      # ignore checkpoint, start fresh
 *
 * Env: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN come from apps/kpop-tracker/.env
 * or, when that file is absent (CI), from the process environment.
 */

import { createClient } from '@libsql/client'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = join(__dirname, '..')

// ── Config ──────────────────────────────────────────────────────────
const BATCH_SIZE = 50          // images per batch before checkpointing
const CONCURRENCY = 4          // parallel downloads
const SHARPEN_SIGMA = 1.5      // unsharp-mask sigma
const SHARPEN_FLAT = 1.0       // unsharp-mask flat parameter
const SHARPEN_JAGGED = 0.5     // unsharp-mask jagged parameter
const DIM = 512                // CLIP embedding dimension
const CHECKPOINT_FILE = join(appDir, '.index-checkpoint.json')
const OUTPUT_DIR = join(appDir, 'public', 'search')

// ── Args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const forceFresh = args.includes('--force')
const doResume = args.includes('--resume')

// ── Load env ────────────────────────────────────────────────────────
const ENV_KEYS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']

function loadEnv() {
  const env = {}
  const envPath = join(appDir, '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line.includes('=') || line.startsWith('#')) continue
      const i = line.indexOf('=')
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  // CI (GitHub Actions) passes the secrets as environment variables; there is
  // no .env file in the runner because it is gitignored.
  for (const key of ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]
  }
  const missing = ENV_KEYS.filter(k => !env[k])
  if (missing.length) {
    console.error(`Missing ${missing.join(' and ')} — set them in apps/kpop-tracker/.env or in the environment.`)
    process.exit(1)
  }
  return env
}

// ── Checkpoint helpers ──────────────────────────────────────────────
function loadCheckpoint() {
  if (forceFresh) return null
  if (!existsSync(CHECKPOINT_FILE)) return null
  try {
    return JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8'))
  } catch { return null }
}

function saveCheckpoint(data) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(data))
}

// ── float32 → float16 ──────────────────────────────────────────────
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

// ── Run fn over items with at most `limit` in flight ────────────────
// Never rejects: settles every item like Promise.allSettled, so callers can
// keep processing the rest of the batch after a single card fails.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv()
  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  // 1. Load all cards with images
  console.log('Fetching card metadata from Turso...')
  const res = await db.execute(
    "SELECT id, name, group_name, member_name, image FROM cards WHERE image IS NOT NULL AND image != '' ORDER BY id"
  )
  const cards = res.rows
  console.log(`Found ${cards.length} cards with images.`)

  // 2. Load or init checkpoint
  let checkpoint = loadCheckpoint()
  let embeddings = new Map()  // cardId → Float32Array

  if (checkpoint && doResume) {
    console.log(`Resuming from checkpoint: ${checkpoint.done}/${cards.length} done`)
    // Load saved embeddings
    const embPath = join(appDir, '.index-embeddings.bin')
    if (existsSync(embPath)) {
      const buf = readFileSync(embPath)
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
      let offset = 0
      const count = view.getUint32(offset, true); offset += 4
      for (let i = 0; i < count; i++) {
        const id = view.getUint32(offset, true); offset += 4
        const vec = new Float32Array(DIM)
        for (let d = 0; d < DIM; d++) {
          vec[d] = view.getFloat32(offset, true); offset += 4
        }
        embeddings.set(id, vec)
      }
      console.log(`Loaded ${embeddings.size} embeddings from checkpoint file.`)
    }
  } else {
    checkpoint = { done: 0, failed: [] }
  }
  if (!checkpoint || typeof checkpoint !== 'object') checkpoint = { done: 0, failed: [] }
  if (!Array.isArray(checkpoint.failed)) checkpoint.failed = []

  // card id → last error, so a retried card replaces its entry instead of
  // stacking a duplicate every run (ids are normalised: libsql may hand back bigint)
  const failedById = new Map(checkpoint.failed.map(f => [Number(f.id), f.error ?? 'unknown']))

  const doneSet = new Set(embeddings.keys())

  // 3. Load CLIP model
  console.log('Loading CLIP model (this may download ~90MB on first run)...')
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', { dtype: 'q8' })
  console.log('CLIP model loaded.')

  // 4. Process cards in batches
  const todo = cards.filter(c => !doneSet.has(Number(c.id)))
  console.log(`Processing ${todo.length} remaining cards...`)

  let processed = embeddings.size
  const startCount = processed
  const startTime = Date.now()

  for (let batchStart = 0; batchStart < todo.length; batchStart += BATCH_SIZE) {
    const batch = todo.slice(batchStart, batchStart + BATCH_SIZE)
    const batchResults = await mapLimit(batch, CONCURRENCY, card => processCard(card, extractor))

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i]
      const card = batch[i]
      const id = Number(card.id)
      if (result.status === 'fulfilled' && result.value) {
        embeddings.set(id, result.value)
        failedById.delete(id)
      } else {
        failedById.set(
          id,
          result.status === 'rejected'
            ? (result.reason?.message ?? String(result.reason))
            : 'no image',
        )
      }
      processed++
    }

    // Save checkpoint
    checkpoint.done = processed
    checkpoint.failed = [...failedById].map(([id, error]) => ({ id, error }))
    saveCheckpoint(checkpoint)

    // Save embeddings binary
    saveEmbeddingsBinary(embeddings)

    const elapsedSec = (Date.now() - startTime) / 1000
    const rate = elapsedSec > 0 ? ((processed - startCount) / elapsedSec).toFixed(1) : '0'
    console.log(`[${processed}/${cards.length}] batch done (${elapsedSec.toFixed(0)}s elapsed, ~${rate}/s, ${failedById.size} failed)`)
  }

  // 5. Build final index
  console.log('\nBuilding index files...')
  buildIndex(cards, embeddings)

  console.log(`\nDone! ${embeddings.size} cards indexed, ${failedById.size} failed.`)
  if (failedById.size > 0) {
    console.log('Failed cards:', [...failedById.keys()].slice(0, 10).join(', '), failedById.size > 10 ? '...' : '')
  }
}

// ── Process single card: download → sharpen → embed ─────────────────
async function processCard(card, extractor) {
  const imageUrl = card.image
  if (!imageUrl) return null

  // Download image with retry
  let imageBuffer
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      imageBuffer = Buffer.from(await res.arrayBuffer())
      break
    } catch (e) {
      if (attempt === 2) throw new Error(`Download failed for ${card.id}: ${e.message}`)
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }

  // Sharpen image
  const sharpened = await sharp(imageBuffer)
    .resize(149, 224, { fit: 'cover', position: 'centre' })
    .sharpen(SHARPEN_SIGMA, SHARPEN_FLAT, SHARPEN_JAGGED)
    .normalize()  // auto-adjust contrast
    .jpeg({ quality: 85 })
    .toBuffer()

  // Embed with CLIP
  const blob = new Blob([sharpened], { type: 'image/jpeg' })
  const out = await extractor([blob], {})
  const dim = out.dims[out.dims.length - 1]
  return Float32Array.from(out.data.subarray(0, dim))
}

// ── Save embeddings to binary file ──────────────────────────────────
function saveEmbeddingsBinary(embeddings) {
  const buf = Buffer.alloc(4 + embeddings.size * (4 + DIM * 4))
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let offset = 0
  view.setUint32(offset, embeddings.size, true); offset += 4
  for (const [id, vec] of embeddings) {
    view.setUint32(offset, id, true); offset += 4
    for (let d = 0; d < DIM; d++) {
      view.setFloat32(offset, vec[d], true); offset += 4
    }
  }
  writeFileSync(join(appDir, '.index-embeddings.bin'), buf)
}

// ── Build index.bin + index.json ────────────────────────────────────
function buildIndex(cards, embeddings) {
  // Filter to cards that have embeddings
  const indexedCards = cards.filter(c => embeddings.has(Number(c.id)))
  const n = indexedCards.length

  // Build index.bin
  const header = Buffer.alloc(16)
  header.write('HPCF', 0, 'ascii')
  header.writeUInt32LE(1, 4)   // version
  header.writeUInt32LE(n, 8)   // n
  header.writeUInt32LE(DIM, 12) // dim

  const vecs = Buffer.alloc(n * DIM * 2)
  for (let i = 0; i < n; i++) {
    const vec = embeddings.get(Number(indexedCards[i].id))
    for (let d = 0; d < DIM; d++) {
      vecs.writeUInt16LE(f32ToF16(vec[d]), (i * DIM + d) * 2)
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(join(OUTPUT_DIR, 'index.bin'), Buffer.concat([header, vecs]))

  // Build index.json
  const indexJson = {
    version: 1,
    n,
    dim: DIM,
    cards: indexedCards.map(c => ({
      id: String(c.id),
      name: c.name,
      group_name: c.group_name,
      member_name: c.member_name || '',
      image: c.image,
    })),
  }
  writeFileSync(join(OUTPUT_DIR, 'index.json'), JSON.stringify(indexJson))

  console.log(`Index built: ${n} cards, ${DIM} dim → ${OUTPUT_DIR}`)
  console.log(`  index.bin: ${((header.length + vecs.length) / 1048576).toFixed(1)} MB`)
  console.log(`  index.json: ${(JSON.stringify(indexJson).length / 1024).toFixed(0)} KB`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })