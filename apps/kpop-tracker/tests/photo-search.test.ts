import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INDEX_HEADER_BYTES,
  INDEX_MAGIC,
  decodeF16,
  parseIndexBin,
  searchTopK,
  type IndexCard,
} from '../app/lib/photoSearchCore'

function makeIndex(values: number[][]): { buf: Uint8Array } {
  const n = values.length
  const dim = values[0].length
  const buf = new Uint8Array(INDEX_HEADER_BYTES + n * dim * 2)
  const view = new DataView(buf.buffer)
  for (let i = 0; i < 4; i++) buf[i] = INDEX_MAGIC.charCodeAt(i)
  view.setUint32(4, 1, true)
  view.setUint32(8, n, true)
  view.setUint32(12, dim, true)
  values.forEach((row, i) => {
    row.forEach((v, d) => {
      const idx = INDEX_HEADER_BYTES + (i * dim + d) * 2
      view.setUint16(idx, floatToF16(v), true)
    })
  })
  return { buf }
}

function floatToF16(val: number): number {
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

const cards = (ids: string[]): IndexCard[] =>
  ids.map((id) => ({ id, name: 'card ' + id, group_name: 'G', member_name: '', image: 'x' }))

describe('decodeF16', () => {
  it('decodes common values', () => {
    expect(decodeF16(0x3c00)).toBe(1)
    expect(decodeF16(0xbc00)).toBe(-1)
    expect(decodeF16(0x0000)).toBe(0)
    expect(decodeF16(0x3800)).toBe(0.5)
    expect(decodeF16(0xc000)).toBe(-2)
    expect(decodeF16(0x7c00)).toBe(Infinity)
  })

  it('roundtrips float32 values at float16 precision', () => {
    for (const v of [0.75, -0.3125, 12.5, -0.0009765625]) {
      expect(decodeF16(floatToF16(v))).toBeCloseTo(v, 5)
    }
  })
})

describe('parseIndexBin', () => {
  it('parses vectors and row norms', () => {
    const { buf } = makeIndex([
      [3, 4],
      [0, 2],
    ])
    const index = parseIndexBin(buf)
    expect(index.n).toBe(2)
    expect(index.dim).toBe(2)
    expect(index.vectors[0]).toBeCloseTo(3, 3)
    expect(index.vectors[1]).toBeCloseTo(4, 3)
    expect(index.norms[0]).toBeCloseTo(5, 3)
    expect(index.norms[1]).toBeCloseTo(2, 3)
  })

  it('rejects a bad magic', () => {
    const { buf } = makeIndex([[1, 2]])
    buf[0] = 'X'.charCodeAt(0)
    expect(() => parseIndexBin(buf)).toThrow(/magic/)
  })

  it('rejects a truncated buffer', () => {
    const { buf } = makeIndex([[1, 2]])
    expect(() => parseIndexBin(buf.slice(0, buf.length - 1))).toThrow(/truncated/)
  })
})

describe('searchTopK', () => {
  it('ranks by cosine similarity, not by vector length', () => {
    const { buf } = makeIndex([
      [1, 0],
      [0.6, 0.8],
      [-1, 0],
    ])
    const index = parseIndexBin(buf)
    const hits = searchTopK([10, 0.1], index, cards(['a', 'b', 'c']), 3)
    expect(hits.map((h) => h.id)).toEqual(['a', 'b', 'c'])
    expect(hits[0].score).toBeCloseTo(1, 2)
    expect(hits[1].score).toBeGreaterThan(hits[2].score)
  })

  it('respects k and validates dims', () => {
    const { buf } = makeIndex([
      [1, 0],
      [0, 1],
    ])
    const index = parseIndexBin(buf)
    expect(searchTopK([1, 0], index, cards(['a', 'b']), 1)).toHaveLength(1)
    expect(() => searchTopK([1, 0, 0], index, cards(['a', 'b']), 1)).toThrow(/dim/)
    expect(() => searchTopK([1, 0], index, cards(['a']), 1)).toThrow(/cards/)
  })
})

describe('shipped index artifacts', () => {
  const dir = fileURLToPath(new URL('../public/search/', import.meta.url))

  it('index.json is well-formed and aligned', () => {
    const meta = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    expect(meta.version).toBe(1)
    expect(meta.n).toBe(meta.cards.length)
    expect(meta.n).toBeGreaterThan(10000)
    const first = meta.cards[0]
    expect(first.id).toBeTruthy()
    expect(first.image).toMatch(/^https?:\/\//)
    expect(new Set(meta.cards.map((c: IndexCard) => c.id)).size).toBe(meta.n)
  })

  it('index.bin parses and matches index.json', () => {
    const meta = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    const index = parseIndexBin(readFileSync(join(dir, 'index.bin')))
    expect(index.n).toBe(meta.n)
    expect(index.dim).toBe(meta.dim)
    expect(Number.isFinite(index.norms[0])).toBe(true)
    expect(Number.isFinite(index.norms[index.n - 1])).toBe(true)
    // a real search behaves: near-duplicate query returns itself first
    const row = 42
    const query = Array.from(
      { length: index.dim },
      (_, d) => index.vectors[row * index.dim + d],
    )
    const hits = searchTopK(query, index, meta.cards, 5)
    expect(hits[0].id).toBe(meta.cards[row].id)
    expect(hits[0].score).toBeGreaterThan(0.999)
  })
})
