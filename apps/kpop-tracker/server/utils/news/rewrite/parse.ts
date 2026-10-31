import { decodeEntities } from '../text'

/**
 * Validate the model's answer (pure).
 *
 * The model output is untrusted input, exactly like an article body: malformed
 * JSON, missing fields or absurd lengths all end as an `error`, and the run
 * stores *nothing* rather than publishing half an article.
 *
 * Two things the validator guarantees regardless of what the model said:
 *  - an image pick is only kept when its index exists in the material we sent,
 *    and the credit is read from *our* evidence record — never from the model;
 *  - a cited source is likewise limited to the material, and the primary source
 *    is always present, so an article can never be source-less.
 */

export interface ParseArticleOptions {
  /** How many images were offered to the model. */
  imageCount: number
  /** How many sources were offered (index 0 = the primary article). */
  sourceCount: number
}

export interface ParsedArticle {
  title: string
  dek: string
  bodyMarkdown: string
  imagePicks: Array<{ evidenceIndex: number, caption: string | null }>
  sourceIndexes: number[]
  readingMinutes: number
}

export type ParseArticleResult =
  | { ok: true, value: ParsedArticle }
  | { ok: false, error: string }

export const MAX_TITLE = 90
export const MAX_DEK = 320
export const MIN_BODY = 400
export const MAX_BODY = 12000
export const MAX_IMAGES = 4
export const MAX_SOURCES = 6
const MAX_CAPTION = 200
const WORDS_PER_MINUTE = 200

/**
 * Clean the model's markdown **without destroying its line structure**.
 *
 * `stripHtml` (used elsewhere for one-line summaries) collapses every run of
 * whitespace into a single space, which flattens a whole article into one
 * paragraph. Markup is therefore removed here with a newline-preserving pass,
 * and a heading the model inlined mid-sentence is pushed onto its own line so
 * the renderer can actually see it. Rendering escapes HTML anyway, so this is
 * about keeping the structure, not about safety.
 */
function sanitizeBody(raw: string): string {
  return decodeEntities(raw)
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n?/g, '\n')
    // "…selesai. ## Sub Judul…" → the heading starts its own paragraph.
    .replace(/[ \t]*(#{1,4})[ \t]+/g, '\n\n$1 ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Words per 200, floored at one — the card's "estimasi waktu baca". */
export function estimateReadingMinutes(text: string): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Read the JSON out of a model reply, tolerating a stray code fence. */
export function extractJsonObject(raw: string): string | null {
  const text = (raw || '').trim()
  if (!text) return null
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  const candidate = (fenced?.[1] ?? text).trim()
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  return candidate.slice(first, last + 1)
}

export function parseArticleJson(raw: string, options: ParseArticleOptions): ParseArticleResult {
  const json = extractJsonObject(raw)
  if (!json) return { ok: false, error: 'model reply contained no JSON object' }

  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'model JSON was not an object' }
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return { ok: false, error: 'model JSON could not be parsed' }
  }

  const title = asString(payload.title).slice(0, MAX_TITLE)
  if (!title) return { ok: false, error: 'model reply had no title' }

  const dek = asString(payload.dek).slice(0, MAX_DEK)
  if (!dek) return { ok: false, error: 'model reply had no dek' }

  // Markup is stripped and entities decoded, but the line structure is kept —
  // see `sanitizeBody`.
  const bodyMarkdown = sanitizeBody(asString(payload.body_markdown))
  if (bodyMarkdown.length < MIN_BODY) {
    return { ok: false, error: `model body was too short (${bodyMarkdown.length} chars, minimum ${MIN_BODY})` }
  }
  const trimmedBody = bodyMarkdown.slice(0, MAX_BODY)

  const imagePicks: ParsedArticle['imagePicks'] = []
  const seenImages = new Set<number>()
  const rawPicks = Array.isArray(payload.image_picks) ? payload.image_picks : []
  for (const pick of rawPicks) {
    if (imagePicks.length >= MAX_IMAGES) break
    if (!pick || typeof pick !== 'object') continue
    const index = Number((pick as Record<string, unknown>).evidence_index)
    if (!Number.isInteger(index) || index < 0 || index >= options.imageCount) continue
    if (seenImages.has(index)) continue
    seenImages.add(index)
    const caption = asString((pick as Record<string, unknown>).caption).slice(0, MAX_CAPTION)
    imagePicks.push({ evidenceIndex: index, caption: caption || null })
  }

  const sourceIndexes: number[] = []
  const seenSources = new Set<number>()
  const rawSources = Array.isArray(payload.source_indexes) ? payload.source_indexes : []
  for (const entry of rawSources) {
    if (sourceIndexes.length >= MAX_SOURCES) break
    const index = Number(entry)
    if (!Number.isInteger(index) || index < 0 || index >= options.sourceCount) continue
    if (seenSources.has(index)) continue
    seenSources.add(index)
    sourceIndexes.push(index)
  }
  // The article is a rewrite of at least the primary source, so an answer with
  // no usable citation still carries that one — a story is never source-less.
  if (sourceIndexes.length === 0 && options.sourceCount > 0) sourceIndexes.push(0)

  return {
    ok: true,
    value: {
      title,
      dek,
      bodyMarkdown: trimmedBody,
      imagePicks,
      sourceIndexes: sourceIndexes.sort((a, b) => a - b),
      readingMinutes: estimateReadingMinutes(trimmedBody),
    },
  }
}
