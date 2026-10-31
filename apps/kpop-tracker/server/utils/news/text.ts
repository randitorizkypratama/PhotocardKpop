import { createHash } from 'node:crypto'

/**
 * Text utilities shared by discovery, duplicate detection and claim
 * extraction. All of them are pure so the duplicate and injection tests can
 * run without a network or a database.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is',
  'are', 'was', 'were', 'be', 'by', 'with', 'from', 'as', 'it', 'its', 'this',
  'that', 'these', 'those', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'new', 'after', 'before', 'over', 'into', 'about', 'than', 'then',
  'their', 'they', 'them', 'he', 'she', 'his', 'her', 'who', 'what', 'when',
  'why', 'how', 'not', 'no', 'you', 'your', 'we', 'our', 'us', 'more', 'most',
])

export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
}

/** Remove markup and executable content; the result is display *data* only. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lowercased, punctuation-light title form used for similarity and grouping.
 * Publisher suffixes ("Headline - Soompi") are dropped when the caller knows
 * the publisher, so the same story from the same wire does not look novel.
 */
export function normalizeNewsTitle(title: string, publisherName?: string | null): string {
  let value = decodeEntities(title || '').normalize('NFKC').toLowerCase()
  if (publisherName) {
    const suffix = ` - ${publisherName.toLowerCase()}`
    if (value.endsWith(suffix)) value = value.slice(0, -suffix.length)
  }
  return value
    .replace(/[“”"‘’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalizeNewsTitle(text)
    .split(' ')
    .filter(token => token.length > 1 && !STOPWORDS.has(token))
}

/** Core (stopword-free) tokens — the part of a headline that identifies it. */
export function coreTokens(text: string): string[] {
  return tokenize(text)
}

function bigrams(tokens: string[]): string[] {
  if (tokens.length < 2) return tokens
  const pairs: string[] = []
  for (let i = 0; i < tokens.length - 1; i++) pairs.push(`${tokens[i]} ${tokens[i + 1]}`)
  return pairs
}

/**
 * Sørensen–Dice similarity over token bigrams: 1.0 = same wording. Thresholds
 * used by duplicate detection are asserted in tests so a future tweak cannot
 * silently start merging unrelated stories.
 */
export function newsTitleSimilarity(a: string, b: string): number {
  const left = bigrams(tokenize(a))
  const right = bigrams(tokenize(b))
  if (left.length === 0 || right.length === 0) return 0
  const counts = new Map<string, number>()
  for (const gram of left) counts.set(gram, (counts.get(gram) || 0) + 1)
  let shared = 0
  for (const gram of right) {
    const available = counts.get(gram) || 0
    if (available > 0) {
      shared++
      counts.set(gram, available - 1)
    }
  }
  return (2 * shared) / (left.length + right.length)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Stable story identity: same artist + same event wording ⇒ same story. */
export function storyKey(artistId: string, title: string): string {
  return sha256(`${artistId}|${coreTokens(title).join(' ')}`).slice(0, 32)
}

export function articleIdFor(canonicalUrl: string): string {
  return sha256(canonicalUrl).slice(0, 32)
}

const INJECTION_PATTERNS: Array<{ name: string, pattern: RegExp }> = [
  { name: 'ignore_previous_instructions', pattern: /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+instructions/i },
  { name: 'disregard_instructions', pattern: /disregard\s+(the\s+|all\s+|your\s+)?(previous|prior|system|above)\s+(instructions|rules|prompt)/i },
  { name: 'system_prompt_exposure', pattern: /(system\s+prompt|developer\s+mode|jailbreak|do\s+anything\s+now)/i },
  { name: 'role_override', pattern: /you\s+are\s+(now\s+)?(an?\s+)?(unrestricted|uncensored|jailbroken)\s+(ai|assistant|model)/i },
  { name: 'output_instruction', pattern: /(set\s+verification_status\s+to|mark\s+(this|it)\s+as\s+(verified|approved)|bypass\s+(the\s+)?verification)/i },
  { name: 'delimiters', pattern: /<\|[^|]{0,40}\|>|<<\s*(SYS|SYSTEM)\s*>>|\[\[START\]\]/i },
]

/**
 * Article text, headlines, RSS descriptions and page metadata are untrusted
 * input (§13). This flags text that tries to steer the pipeline; a hit never
 * grants anything — it is recorded as a reason and blocks publication.
 */
export function detectPromptInjection(text: string): { detected: boolean, patterns: string[] } {
  const patterns = INJECTION_PATTERNS
    .filter(entry => entry.pattern.test(text || ''))
    .map(entry => entry.name)
  return { detected: patterns.length > 0, patterns }
}

export interface StructuredClaimDraft {
  subject: string
  predicate: string
  claim_type: string
  category: string
  event_date: string | null
  confidence: number
}

const CLAIM_TYPES = new Set([
  'official_announcement', 'confirmed_fact', 'attributed_report',
  'analysis_opinion', 'rumor', 'speculation',
])
const CATEGORIES = new Set([
  'release', 'schedule', 'performance', 'award', 'chart', 'business',
  'media', 'personnel', 'other',
])

/**
 * Strict validator for optional AI-assisted claim extraction (§13). The model
 * output is untrusted: malformed JSON, unknown enum values, wrong types or
 * absurd confidence values all return `null`, and the deterministic extractor
 * is used instead. An AI response can never carry a VERIFIED status.
 */
export function parseStructuredClaims(raw: string | null | undefined): StructuredClaimDraft[] | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).claims) ? (parsed as any).claims : null)
  if (!list || !Array.isArray(list) || list.length === 0 || list.length > 20) return null

  const drafts: StructuredClaimDraft[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    const subject = record.subject
    const predicate = record.predicate
    const claimType = record.claim_type
    const category = record.category
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 200) return null
    if (typeof predicate !== 'string' || !predicate.trim() || predicate.length > 500) return null
    if (typeof claimType !== 'string' || !CLAIM_TYPES.has(claimType)) return null
    if (typeof category !== 'string' || !CATEGORIES.has(category)) return null
    const eventDate = record.event_date
    if (eventDate !== null && typeof eventDate !== 'string') return null
    if (typeof eventDate === 'string' && eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null
    const confidence = record.confidence
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null
    drafts.push({
      subject: subject.trim(),
      predicate: predicate.trim(),
      claim_type: claimType,
      category,
      event_date: eventDate || null,
      confidence,
    })
  }
  return drafts
}
