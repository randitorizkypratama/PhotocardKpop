/** Safe matching helpers shared by every release provider. */

export const MATCH_THRESHOLD = 0.72

const NOISE_SUFFIX = /\s*-\s*(ep|single|album|full album|mini album|repackage|ost|remix(es)?)\s*$/i
const BRACKET_NOISE = /\s*[\(\[](ep|single|album|full album|mini album|20\d{2}|vol\.?\s*\d+)[\)\]]\s*/gi

export function normalizeTitle(value?: string | null): string {
  if (!value) return ''
  let text = String(value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(BRACKET_NOISE, ' ')
    .replace(NOISE_SUFFIX, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

export function normalizeArtist(value?: string | null): string {
  if (!value) return ''
  return String(value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): Set<string> {
  return new Set(value.split(' ').filter(Boolean))
}

/** Dice coefficient over tokens, with an extra boost for containment. */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.92

  const setA = tokens(left)
  const setB = tokens(right)
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const token of setA) if (setB.has(token)) shared++
  return (2 * shared) / (setA.size + setB.size)
}

/** Artist equality / containment on normalized names. Unknown candidates are rejected. */
export function artistMatches(expected?: string | null, candidate?: string | null): boolean {
  const a = normalizeArtist(expected)
  const b = normalizeArtist(candidate)
  if (!a) return true
  if (!b) return false
  if (a === b) return true
  return a.includes(b) || b.includes(a)
}

/** Escape the few characters that break MusicBrainz/Lucene query strings. */
export function escapeLucene(value: string): string {
  return String(value)
    .replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
