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
 * Preprocess a query photo so its statistics better match the blurred
 * Pocamarket thumbnails in the gallery.
 *
 * Steps:
 *  1. Center-crop to 2:3 aspect ratio (photocard proportions)
 *  2. Downscale to 224px tall (CLIP native resolution)
 *  3. Apply slight Gaussian blur to approximate gallery thumbnail softness
 *  4. Boost contrast so discriminative features survive the blur
 *  5. Export as optimised JPEG
 */
async function preprocessQueryImage(file: Blob): Promise<Blob> {
  const img = await createImageBitmap(file)
  const srcW = img.width
  const srcH = img.height

  // --- 1. Center-crop to 2:3 ---
  const targetAR = 2 / 3
  let cropW: number, cropH: number
  if (srcW / srcH > targetAR) {
    cropH = srcH
    cropW = Math.round(srcH * targetAR)
  } else {
    cropW = srcW
    cropH = Math.round(srcW / targetAR)
  }
  const sx = Math.round((srcW - cropW) / 2)
  const sy = Math.round((srcH - cropH) / 2)

  // --- 2. Downscale to CLIP resolution ---
  const outH = 224
  const outW = Math.round(outH * targetAR) // ≈149

  const canvas = new OffscreenCanvas(outW, outH)
  const ctx = canvas.getContext('2d')!

  // --- 3. Soften to match gallery blur ---
  ctx.filter = 'blur(1px) contrast(1.15) saturate(1.1)'
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH)
  img.close()

  // --- 4. Export optimised JPEG ---
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.80 })
}

/** Embed one image (batch of exactly 1) and return the CLIP vector.
 *  The pipeline may return a pooled [1, 512] tensor or a full sequence
 *  [1, seq_len, 512] tensor — in the latter case we take the first
 *  token (CLS), which is CLIP's image representation. */
async function embedImage(file: Blob): Promise<Float32Array> {
  const preprocessed = await preprocessQueryImage(file)
  const extractor = await getExtractor()
  const out = await extractor([preprocessed], {})
  const dim = out.dims[out.dims.length - 1]
  return Float32Array.from(out.data.subarray(0, dim))
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
