/**
 * Pure core for the photo-identify search: float16 index parsing + top-K cosine.
 * Kept free of browser/DOM/transformers imports so vitest can cover it.
 */

export const INDEX_MAGIC = 'HPCF'
export const INDEX_VERSION = 1
export const INDEX_HEADER_BYTES = 16

export interface IndexCard {
  id: string
  name: string
  group_name: string
  member_name: string
  image: string
}

export interface IndexMeta {
  version: number
  n: number
  dim: number
  cards: IndexCard[]
}

export interface SearchIndex {
  n: number
  dim: number
  /** Row-major gallery vectors (not normalized — use norms for cosine). */
  vectors: Float32Array
  /** L2 norm per row. */
  norms: Float32Array
}

export interface SearchHit extends IndexCard {
  score: number
}

/** IEEE 754 binary16 → number. */
export function decodeF16(h: number): number {
  const sign = h & 0x8000 ? -1 : 1
  const exp = (h >> 10) & 0x1f
  const mant = h & 0x3ff
  if (exp === 0) return sign * Math.pow(2, -14) * (mant / 1024)
  if (exp === 0x1f) return mant ? NaN : sign * Infinity
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024)
}

export function parseIndexBin(buf: ArrayBuffer | Uint8Array): SearchIndex {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)
  if (magic !== INDEX_MAGIC) throw new Error('bad index magic: ' + magic)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== INDEX_VERSION) throw new Error('unsupported index version ' + version)
  const n = view.getUint32(8, true)
  const dim = view.getUint32(12, true)
  if (!n || !dim) throw new Error('bad index header')
  const expected = INDEX_HEADER_BYTES + n * dim * 2
  if (bytes.length < expected) throw new Error(`truncated index: ${bytes.length} < ${expected}`)

  const vectors = new Float32Array(n * dim)
  const norms = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    const row = i * dim
    for (let d = 0; d < dim; d++) {
      const v = decodeF16(view.getUint16(INDEX_HEADER_BYTES + (row + d) * 2, true))
      vectors[row + d] = v
      sum += v * v
    }
    norms[i] = Math.sqrt(sum) || 1
  }
  return { n, dim, vectors, norms }
}

/** Cosine top-K over the gallery. Query is normalized internally. */
export function searchTopK(
  query: Float32Array | number[],
  index: SearchIndex,
  cards: IndexCard[],
  k: number,
): SearchHit[] {
  const { n, dim, vectors, norms } = index
  if (query.length !== dim) throw new Error(`query dim ${query.length} != index dim ${dim}`)
  if (cards.length !== n) throw new Error(`cards ${cards.length} != index n ${n}`)

  let qn = 0
  for (let d = 0; d < dim; d++) qn += query[d]! * query[d]!
  qn = Math.sqrt(qn) || 1

  const scores = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let dot = 0
    const row = i * dim
    for (let d = 0; d < dim; d++) dot += query[d]! * vectors[row + d]!
    scores[i] = dot / (qn * norms[i]!)
  }

  const limit = Math.min(k, n)
  const order: number[] = []
  for (let i = 0; i < n; i++) {
    if (order.length < limit) {
      order.push(i)
      order.sort((a, b) => scores[b]! - scores[a]!)
    } else if (scores[i]! > scores[order[order.length - 1]!]!) {
      order[order.length - 1] = i
      order.sort((a, b) => scores[b]! - scores[a]!)
    }
  }
  return order.map((i) => ({ ...cards[i]!, score: scores[i]! }))
}
