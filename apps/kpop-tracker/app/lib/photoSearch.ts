/**
 * Client-side photocard identify: CLIP image embedding (transformers.js,
 * runs fully in the browser) + cosine search over the prebuilt index in
 * /search/. Everything is lazy — nothing loads until the first search.
 */
import {
  parseIndexBin,
  searchTopK,
  type IndexCard,
  type IndexMeta,
  type SearchHit,
} from './photoSearchCore'

export type SearchStage = 'model-download' | 'model-init' | 'index' | 'analyze'

export interface SearchProgress {
  stage: SearchStage
  /** 0-100, available during model-download */
  percent?: number
  /** Human-readable detail (e.g. file name being downloaded) */
  detail?: string
}

export type SearchStageListener = (progress: SearchProgress) => void

export interface PhotoSearchResult {
  hits: SearchHit[]
  topScore: number
}

/** Gallery vectors are embedded one image per call — transformers.js batch>1
 * changes per-image output (batch-dependent resize), which flips near-tie
 * rankings. The query path must stay batch=1 for the same reason. */
const MODEL_ID = 'Xenova/clip-vit-base-patch32'
const TOP_K = 8

let extractorPromise: Promise<any> | null = null
let indexPromise: Promise<{ cards: IndexCard[]; index: ReturnType<typeof parseIndexBin> }> | null = null

/** Per-file download tracking for progress reporting. */
const fileProgress = new Map<string, { loaded: number; total: number }>()

function getExtractor(onProgress?: SearchStageListener): Promise<any> {
  if (!extractorPromise) {
    fileProgress.clear()
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('image-feature-extraction', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (evt: any) => {
          if (evt.status === 'initiate') {
            fileProgress.set(evt.file, { loaded: 0, total: evt.total ?? 0 })
          } else if (evt.status === 'progress') {
            const entry = fileProgress.get(evt.file)
            if (entry) entry.loaded = evt.loaded
            // Report overall download %
            let totalLoaded = 0, totalBytes = 0
            for (const f of fileProgress.values()) {
              totalLoaded += f.loaded
              totalBytes += f.total
            }
            const pct = totalBytes > 0 ? Math.round((totalLoaded / totalBytes) * 100) : 0
            const fileName = (evt.file as string).split('/').pop() ?? evt.file
            onProgress?.({ stage: 'model-download', percent: pct, detail: fileName })
          } else if (evt.status === 'done') {
            const entry = fileProgress.get(evt.file)
            if (entry && entry.total > 0) entry.loaded = entry.total
          }
        },
      }),
    ).then((extractor) => {
      onProgress?.({ stage: 'model-init' })
      return extractor
    })
  }
  return extractorPromise
}

function getIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [binRes, metaRes] = await Promise.all([fetch('/search/index.bin'), fetch('/search/index.json')])
      if (!binRes.ok) throw new Error('index.bin HTTP ' + binRes.status)
      if (!metaRes.ok) throw new Error('index.json HTTP ' + metaRes.status)
      const [buf, meta] = await Promise.all([binRes.arrayBuffer(), metaRes.json() as Promise<IndexMeta>])
      const index = parseIndexBin(buf)
      if (meta.n !== index.n || meta.dim !== index.dim) {
        throw new Error(`index meta mismatch: meta ${meta.n}x${meta.dim} vs bin ${index.n}x${index.dim}`)
      }
      if (meta.cards.length !== index.n) throw new Error('cards length mismatch')
      return { cards: meta.cards, index }
    })()
    indexPromise.catch(() => {
      indexPromise = null
    })
  }
  return indexPromise
}

/**
 * Render the query crops used for embedding:
 *  1. Center-crop to 2:3 (photocard proportions) → 149×224
 *  2. Center square at 75% and 55% of the shorter edge → 224×224
 * Physical-card photos frame the card inside a larger background (table,
 * sleeve); averaging a wider 2:3 view with two zoomed squares keeps the
 * embedding dominated by the card rather than the surroundings. No
 * photometric filters — blur/contrast on the query only drifted it away
 * from the index (measured: higher self-similarity and better top-1
 * accuracy without them).
 */
async function preprocessQueryCrops(file: Blob): Promise<Blob[]> {
  const img = await createImageBitmap(file)
  const srcW = img.width
  const srcH = img.height

  const render = async (
    sx: number, sy: number, sw: number, sh: number, outW: number, outH: number,
  ): Promise<Blob> => {
    const canvas = new OffscreenCanvas(outW, outH)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.80 })
  }

  // 2:3 view
  const targetAR = 2 / 3
  let cropW: number, cropH: number
  if (srcW / srcH > targetAR) {
    cropH = srcH
    cropW = Math.round(srcH * targetAR)
  } else {
    cropW = srcW
    cropH = Math.round(srcW / targetAR)
  }
  const outH = 224
  const outW = Math.round(outH * targetAR) // ≈149

  const crops: Blob[] = [
    await render(Math.round((srcW - cropW) / 2), Math.round((srcH - cropH) / 2), cropW, cropH, outW, outH),
  ]

  // zoomed centre squares (exact 224×224 so the CLIP processor's own
  // resize+centre-crop becomes a no-op and each zoom reaches the model)
  const base = Math.max(1, Math.min(srcW, srcH))
  for (const frac of [0.75, 0.55]) {
    const s = Math.max(1, Math.round(base * frac))
    const sx = Math.max(0, Math.round((srcW - s) / 2))
    const sy = Math.max(0, Math.round((srcH - s) / 2))
    crops.push(await render(sx, sy, Math.min(s, srcW - sx), Math.min(s, srcH - sy), 224, 224))
  }

  img.close()
  return crops
}

function l2normalize(v: Float32Array): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!
  const n = Math.sqrt(sum) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n
  return out
}

/** Embed the query as the average of its crops (each crop embedded alone —
 *  transformers.js batch>1 changes per-image output, which flips near-tie
 *  rankings). The pipeline may return a pooled [1, 512] tensor or a full
 *  sequence [1, seq_len, 512]; in the latter case we take the first token
 *  (CLS), CLIP's image representation. */
async function embedImage(file: Blob): Promise<Float32Array> {
  const crops = await preprocessQueryCrops(file)
  const extractor = await getExtractor()
  let acc: Float64Array | null = null
  for (const crop of crops) {
    const out = await extractor([crop], {})
    const dim = out.dims[out.dims.length - 1]
    const vec = l2normalize(Float32Array.from(out.data.subarray(0, dim)))
    if (!acc) acc = new Float64Array(dim)
    for (let d = 0; d < dim; d++) acc[d] = (acc[d] ?? 0) + vec[d]!
  }
  return l2normalize(Float32Array.from(acc!))
}

export async function searchByPhoto(
  file: Blob,
  onProgress?: SearchStageListener,
): Promise<PhotoSearchResult> {
  const indexLoaded = getIndex()
  await getExtractor(onProgress)
  onProgress?.({ stage: 'index' })
  const { cards, index } = await indexLoaded

  onProgress?.({ stage: 'analyze' })
  const query = await embedImage(file)
  const hits = searchTopK(query, index, cards, TOP_K)
  const first = hits[0]
  if (!first) throw new Error('empty index')
  return { hits, topScore: first.score }
}

/** Below this the gallery simply has nothing that looks like the photo.
 *  Gallery images are blurred Pocamarket thumbnails while queries are clear
 *  real-world photos, so cosine similarities are systematically lower than
 *  same-quality matching — thresholds must be set accordingly. */
export const NOT_FOUND_FLOOR = 0.35
/** Between floor and this, results show with a "not fully sure" hint. */
export const LOW_CONFIDENCE_FLOOR = 0.55
