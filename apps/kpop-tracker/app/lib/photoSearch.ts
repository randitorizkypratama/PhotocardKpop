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

export type SearchStage = 'model' | 'index' | 'analyze'
export type SearchStageListener = (stage: SearchStage) => void

export interface PhotoSearchResult {
  hits: SearchHit[]
  topScore: number
}

/** Gallery vectors are embedded one image per call — transformers.js batch>1
 * changes per-image output (batch-dependent resize), which flips near-tie
 * rankings. The query path must stay batch=1 for the same reason. */
const MODEL_ID = 'Xenova/clip-vit-base-patch32'
const TOP_K = 5

let extractorPromise: Promise<any> | null = null
let indexPromise: Promise<{ cards: IndexCard[]; index: ReturnType<typeof parseIndexBin> }> | null = null

function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('image-feature-extraction', MODEL_ID, { dtype: 'q8' }),
    )
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

/** Embed one image (batch of exactly 1) and return the pooled CLIP vector. */
async function embedImage(file: Blob): Promise<Float32Array> {
  const extractor = await getExtractor()
  const out = await extractor([file], {})
  const dim = out.dims[out.dims.length - 1]
  return Float32Array.from(out.data.subarray(0, dim))
}

export async function searchByPhoto(
  file: Blob,
  onStage?: SearchStageListener,
): Promise<PhotoSearchResult> {
  onStage?.('model')
  const indexLoaded = getIndex()
  await getExtractor()
  onStage?.('index')
  const { cards, index } = await indexLoaded

  onStage?.('analyze')
  const query = await embedImage(file)
  const hits = searchTopK(query, index, cards, TOP_K)
  const first = hits[0]
  if (!first) throw new Error('empty index')
  return { hits, topScore: first.score }
}

/** Below this the gallery simply has nothing that looks like the photo. */
export const NOT_FOUND_FLOOR = 0.6
/** Between floor and this, results show with a "not fully sure" hint. */
export const LOW_CONFIDENCE_FLOOR = 0.78
