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
import { getOrientation } from './exifUtil'

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
    // First call: model needs to be downloaded and initialised.
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
  } else {
    // Model is already cached — fast path. Emit 'model-init' so the UI
    // immediately advances past the download stage without waiting for the
    // resolved promise (microtask) to fire.
    onProgress?.({ stage: 'model-init' })
  }
  return extractorPromise
}

const CACHE_NAME = 'photocard-search-index-v1'

async function fetchWithCache(url: string): Promise<Response> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(url)
      if (cached) return cached

      const res = await fetch(url)
      if (res.ok) {
        await cache.put(url, res.clone())
      }
      return res
    } catch {
      // Fallback to normal fetch if CacheStorage fails or is unavailable
    }
  }
  return fetch(url)
}

function getIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [binRes, metaRes] = await Promise.all([
        fetchWithCache('/search/index.bin'),
        fetchWithCache('/search/index.json'),
      ])
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
 * Per-channel histogram stretch (equivalent to sharp().normalize()).
 * Reads the canvas pixels, finds the min/max for each of R, G, B independently,
 * then linearly remaps each channel so its darkest pixel becomes 0 and its
 * brightest becomes 255. Alpha is left untouched.
 *
 * This matches the `.normalize()` call in `scripts/rebuild-index.mjs` that was
 * applied to every index image. Without it, query crops from real-world photos
 * (dark sleeve background, low ambient light) sit in a very different region of
 * pixel-value space from the blurred CDN thumbnails in the index, depressing
 * cosine similarity even when the visual content is identical.
 *
 * Operates in-place on the canvas context. Skips channels where min === max
 * (flat plane, e.g. fully transparent crops) to avoid division by zero.
 */
function normalizeImageData(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data  // Uint8ClampedArray, layout: R G B A R G B A …

  let rMin = 255, rMax = 0
  let gMin = 255, gMax = 0
  let bMin = 255, bMax = 0

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!
    if (r < rMin) rMin = r; if (r > rMax) rMax = r
    if (g < gMin) gMin = g; if (g > gMax) gMax = g
    if (b < bMin) bMin = b; if (b > bMax) bMax = b
  }

  const rRange = rMax - rMin || 1
  const gRange = gMax - gMin || 1
  const bRange = bMax - bMin || 1

  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.round(((d[i]!     - rMin) / rRange) * 255)
    d[i + 1] = Math.round(((d[i + 1]! - gMin) / gRange) * 255)
    d[i + 2] = Math.round(((d[i + 2]! - bMin) / bRange) * 255)
    // d[i + 3] = alpha — untouched
  }

  ctx.putImageData(imageData, 0, 0)
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
 *
 * EXIF orientation is read and applied manually via canvas so that photos
 * taken with a phone camera are rotated/flipped before cropping — both
 * createImageBitmap (Chrome/Edge) and HTMLImageElement (Safari) can ignore
 * the orientation tag, which would produce a landscape crop from a portrait
 * shot and embed completely different features from the index vectors.
 */
async function preprocessQueryCrops(file: Blob): Promise<Blob[]> {
  // Read EXIF orientation before decoding — the raw bytes are still intact here.
  const orientation = await getOrientation(file).catch(() => 1)

  // Attempt to create an ImageBitmap; fallback to HTMLImageElement for browsers
  // where createImageBitmap fails (e.g., certain JPEGs with EXIF orientation in Edge)
  let img: ImageBitmap | HTMLImageElement
  let isBitmap = false
  try {
    img = await createImageBitmap(file)
    isBitmap = true
  } catch {
    // Fallback: load via an object URL into an HTMLImageElement
    const url = URL.createObjectURL(file)
    try {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Failed to load image for preprocessing'))
        image.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const srcW = img.width || (img as HTMLImageElement).naturalWidth || 1
  const srcH = img.height || (img as HTMLImageElement).naturalHeight || 1

  // Determine if this orientation requires swapping width/height axes.
  // EXIF orientations 5–8 involve a 90° or 270° rotation that transposes axes.
  const swapAxes = orientation >= 5 && orientation <= 8

  // Logical (post-rotation) dimensions used for all crop calculations.
  const logicalW = swapAxes ? srcH : srcW
  const logicalH = swapAxes ? srcW : srcH

  /**
   * Draw a crop of the *raw* image (pre-rotation) onto an output canvas that
   * represents the *rotated* view, applying the EXIF transform on the fly.
   *
   * The EXIF orientation values and the matching canvas transforms are:
   *  1 – no-op
   *  2 – flip horizontal
   *  3 – rotate 180°
   *  4 – flip vertical
   *  5 – transpose (rotate 90° CW + flip horizontal)
   *  6 – rotate 90° CW
   *  7 – rotate 90° CW + flip horizontal (= rotate 270° + flip)
   *  8 – rotate 90° CCW (= rotate 270° CW)
   */
  const render = async (
    lx: number, ly: number, lw: number, lh: number, outW: number, outH: number,
  ): Promise<Blob> => {
    // Use OffscreenCanvas when available, fall back to regular <canvas>
    let canvas: OffscreenCanvas | HTMLCanvasElement
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(outW, outH)
      ctx = canvas.getContext('2d')!
    } else {
      canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      ctx = canvas.getContext('2d')!
    }

    // Map logical crop coords back to raw source coords, then draw with the
    // rotation/flip transform so the output is always correctly oriented.
    // sx/sy/sw/sh are the raw pixel rectangle to pull from the source image.
    let sx: number, sy: number, sw: number, sh: number
    if (swapAxes) {
      // Axes are transposed — logical (lx,ly,lw,lh) maps to raw (ly,lx,lh,lw)
      sx = ly; sy = lx; sw = lh; sh = lw
    } else {
      sx = lx; sy = ly; sw = lw; sh = lh
    }

    ctx.save()
    ctx.translate(outW / 2, outH / 2)
    switch (orientation) {
      case 2: ctx.scale(-1, 1); break
      case 3: ctx.rotate(Math.PI); break
      case 4: ctx.scale(1, -1); break
      case 5: ctx.rotate(Math.PI / 2); ctx.scale(-1, 1); break
      case 6: ctx.rotate(Math.PI / 2); break
      case 7: ctx.rotate(-Math.PI / 2); ctx.scale(-1, 1); break
      case 8: ctx.rotate(-Math.PI / 2); break
      // case 1 and default: no transform needed
    }
    // After rotation, draw the source crop centred at origin, scaled to output.
    if (swapAxes) {
      // For 90°/270° rotations the source sw/sh map to output outH/outW
      ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, -outH / 2, -outW / 2, outH, outW)
    } else {
      ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, -outW / 2, -outH / 2, outW, outH)
    }
    ctx.restore()

    // Auto-normalize: stretch per-channel histogram to [0, 255], matching the
    // `sharp().normalize()` step used when building the index. Without this,
    // real-world photos with large dark backgrounds (table, sleeve) have a very
    // different pixel-value distribution from the index images (blurred CDN
    // thumbnails with auto-contrast applied), which pushes cosine scores down
    // regardless of visual similarity. Doing it on the final outW×outH crop
    // (after draw) is equivalent to doing it on the source and avoids a second
    // canvas allocation.
    normalizeImageData(ctx, outW, outH)

    if (canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.80 })
    }
    // HTMLCanvasElement fallback — toBlob is callback-based
    return new Promise<Blob>((resolve, reject) => {
      ;(canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))),
        'image/jpeg',
        0.80,
      )
    })
  }

  // 2:3 view (using logical/post-rotation dimensions)
  const targetAR = 2 / 3
  let cropW: number, cropH: number
  if (logicalW / logicalH > targetAR) {
    cropH = logicalH
    cropW = Math.round(logicalH * targetAR)
  } else {
    cropW = logicalW
    cropH = Math.round(logicalW / targetAR)
  }
  const outH = 224
  const outW = Math.round(outH * targetAR) // ≈149

  const crops: Blob[] = [
    await render(Math.round((logicalW - cropW) / 2), Math.round((logicalH - cropH) / 2), cropW, cropH, outW, outH),
  ]

  // Zoomed centre squares. Real-world photocard photos typically frame the
  // card inside a larger background (table, sleeve, hand). Five zoom levels
  // cover the range from "card fills ~80% of frame" down to "card is small in
  // the centre" — at least one crop should land squarely on the card itself
  // regardless of how close the camera was. Each crop is embedded separately
  // (see embedImage) so a well-targeted crop is not diluted by wider views
  // that still carry background texture.
  //
  // 0.75 → card fills most of frame (close-up shot)
  // 0.55 → moderate distance
  // 0.40 → card is mid-size in frame (like these WhatsApp photos)
  // 0.25 → card is small, lots of background — very aggressive zoom to face
  const base = Math.max(1, Math.min(logicalW, logicalH))
  for (const frac of [0.75, 0.55, 0.40, 0.25]) {
    const s = Math.max(1, Math.round(base * frac))
    const lx = Math.max(0, Math.round((logicalW - s) / 2))
    const ly = Math.max(0, Math.round((logicalH - s) / 2))
    crops.push(await render(lx, ly, Math.min(s, logicalW - lx), Math.min(s, logicalH - ly), 224, 224))
  }

  // Only ImageBitmap has .close(); HTMLImageElement does not
  if (isBitmap && 'close' in img) {
    ;(img as ImageBitmap).close()
  }
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

/** Embed a single blob as a normalised 512-d CLIP vector. */
async function embedOne(
  blob: Blob,
  extractor: any,
): Promise<Float32Array> {
  const out = await extractor([blob], {})
  const dim = out.dims[out.dims.length - 1]
  return l2normalize(Float32Array.from(out.data.subarray(0, dim)))
}

/**
 * Search strategy: embed every crop independently, run top-K cosine on each,
 * then keep the *best score seen per card* across all crops (max-pool).
 *
 * Why not average the crop embeddings?
 *   Averaging worked when the card filled most of the frame. For photos where
 *   the card is small — surrounded by table/sleeve background — the 2:3 and
 *   wider square crops are dominated by background texture, so averaging pulls
 *   the query vector away from any card in the index. With max-pool, whichever
 *   crop landed squarely on the card wins; the crops that missed contribute
 *   nothing (their lower scores for that card are ignored).
 *
 * The extractor must be called with batch=1 per crop. transformers.js changes
 * per-image output for batch>1 (batch-dependent resize), which flips near-tie
 * rankings — this constraint existed before and is preserved here.
 */
async function embedAndSearch(
  file: Blob,
  extractor: any,
  index: ReturnType<typeof parseIndexBin>,
  cards: IndexCard[],
  k: number,
  groupFilter?: string | null,
): Promise<SearchHit[]> {
  const crops = await preprocessQueryCrops(file)

  // Pre-build id → row index map so accumulation is O(1) per hit instead of O(n).
  const idToRow = new Map<string, number>(cards.map((c, i) => [c.id, i]))

  // Score accumulator: card row index → best cosine score across all crops.
  const best = new Float64Array(index.n)

  for (const crop of crops) {
    const vec = await embedOne(crop, extractor)
    const hits = searchTopK(vec, index, cards, k, groupFilter)
    for (const hit of hits) {
      const row = idToRow.get(hit.id)
      if (row !== undefined && hit.score > best[row]!) best[row] = hit.score
    }
  }

  // Rebuild top-K from the accumulated best scores.
  const order: Array<{ idx: number; score: number }> = []
  for (let i = 0; i < index.n; i++) {
    if (!best[i]) continue
    if (order.length < k) {
      order.push({ idx: i, score: best[i]! })
      order.sort((a, b) => b.score - a.score)
    } else if (best[i]! > order[order.length - 1]!.score) {
      order[order.length - 1] = { idx: i, score: best[i]! }
      order.sort((a, b) => b.score - a.score)
    }
  }

  return order.map(({ idx, score }) => ({ ...cards[idx]!, score }))
}

export async function searchByPhoto(
  file: Blob,
  onProgress?: SearchStageListener,
  groupFilter?: string | null,
): Promise<PhotoSearchResult> {
  const indexLoaded = getIndex()
  const extractor = await getExtractor(onProgress)
  onProgress?.({ stage: 'index' })
  const { cards, index } = await indexLoaded

  onProgress?.({ stage: 'analyze' })
  const hits = await embedAndSearch(file, extractor, index, cards, TOP_K, groupFilter)
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
