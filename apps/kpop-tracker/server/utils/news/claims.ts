import type { ArtistId, ClaimType, NewsCategory, NewsClaim } from './types'
import { ARTISTS, normalizeForMatch } from './artists'
import { detectPromptInjection, normalizeNewsTitle } from './text'

/**
 * Deterministic claim extraction (§8).
 *
 * This is deliberately rule-based: it runs on every candidate, needs no API
 * key, and produces the same output for the same input — which is what makes
 * the verification record reproducible. An optional LLM may *propose* claims
 * (validated by `parseStructuredClaims`), but the stored claims come from
 * here, and attribution/uncertainty in the original wording is preserved.
 */

export interface ClaimExtractionInput {
  articleId: string
  artistId: string | null
  title: string
  summary?: string | null
  body?: string | null
  /** The publisher is the artist's own agency → the claim is a primary source. */
  sourceIsOfficialAgency: boolean
  /** Publisher from a K-pop-native or known registry source. */
  sourceIsReputable: boolean
  publishedAt?: string | null
}

export interface ClaimExtraction {
  claims: NewsClaim[]
  category: NewsCategory
  primaryClaimType: ClaimType
  eventDate: string | null
  isRumor: boolean
  attributionSignals: string[]
  injection: { detected: boolean, patterns: string[] }
  notes: string[]
}

const CATEGORY_RULES: Array<{ category: NewsCategory, pattern: RegExp }> = [
  { category: 'release', pattern: /\b(comeback|album|mini album|full album|ep|single|track|tracklist|title track|repackage|debut|release|releases|released|drops|drop|out now|pre-?order|promo|promotions?)\b/i },
  { category: 'chart', pattern: /\b(chart|billboard|hanteo|gaon|circle chart|melon|rank|ranking|no\.?\s?1|number one|streams|streaming|views|certified|platinum|gold)\b/i },
  { category: 'award', pattern: /\b(award|awards|won|wins|winner|nominee|nominated|nomination|daesang|prize|trophy|ceremony)\b/i },
  { category: 'schedule', pattern: /\b(tour|concert|fan ?meeting|fansign|showcase|schedule|airdate|airs|airing|episode|broadcast|deadline|lineup|date|dates|venue|tickets?)\b/i },
  { category: 'performance', pattern: /\b(music show|stage|stages|performance|performed|mcountdown|music bank|inkigayo|show champion|comeback stage|encore)\b/i },
  { category: 'business', pattern: /\b(contract|contracts|signed|signing|endorse|endorsement|partnership|company|agency|label|lawsuit|revenue|subsidiary|acquisition|merger)\b/i },
  { category: 'media', pattern: /\b(drama|film|movie|variety|\bmc\b|host|magazine|cover shoot|acting|actor|ost|solo|series|netflix|youtube)\b/i },
  { category: 'personnel', pattern: /\b(member|members|lineup|departure|leaves|left|joined|replaced|birthday|subunit|unit|hiatus|contract renewal)\b/i },
]

const ATTRIBUTION_PATTERNS: RegExp[] = [
  /\baccording to\b/i, /\breports?\b/i, /\bsources?\s+(said|told|confirmed|revealed)\b/i,
  /\btold\s+(the\s+)?(outlet|reporters|media)\b/i, /\bstated\b/i, /\bconfirmed\b/i,
  /\binsiders?\s+(said|told|revealed)\b/i, /\bas\s+reported\b/i, /\bmedia\s+outlet\b/i,
]

const RUMOR_PATTERNS: RegExp[] = [
  /\brumou?rs?\b/i, /\bunconfirmed\b/i, /\balleged(ly)?\b/i, /\bclaims?\s+that\b/i,
  /\bnetizens?\s+(claim|say|suspect)\b/i, /\bspeculation\b/i, /\bsocial\s+media\s+(posts?|claims?)\b/i,
  /\bunverified\b/i, /\bno\s+official\s+(statement|confirmation)\b/i,
]

const SPECULATION_PATTERNS: RegExp[] = [
  /\bexpected\s+to\b/i, /\bis\s+set\s+to\b/i, /\bcould\b/i, /\bmight\b/i, /\bmays?\b/i,
  /\breportedly\b/i, /\bto\s+reportedly\b/i, /\bpotential(ly)?\b/i, /\bins\s+the\s+works\b/i,
]

const OPINION_PATTERNS: RegExp[] = [
  /\bopinion\b/i, /\beditorial\b/i, /\banalysis\b/i, /\breview\b/i, /\bwhy\s+\w+/i,
  /\bcolumn\b/i, /\bin\s+our\s+view\b/i,
]

const RELATIVE_DATE_PATTERNS: Array<{ pattern: RegExp, label: string }> = [
  { pattern: /\btomorrow\b/i, label: 'tomorrow' },
  { pattern: /\btoday\b/i, label: 'today' },
  { pattern: /\bnext\s+week\b/i, label: 'next week' },
  { pattern: /\bnext\s+month\b/i, label: 'next month' },
  { pattern: /\bthis\s+(week|month|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i, label: 'this week' },
  { pattern: /\blast\s+(week|month)\b/i, label: 'last week' },
  { pattern: /\bearly\s+\d{4}\b/i, label: 'early year' },
]

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match
  }
  return null
}

function findEventDate(text: string, publishedAt?: string | null): { value: string | null, note: string | null } {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return { value: iso[0], note: null }

  const dotted = text.match(/\b(20\d{2})[./](\d{1,2})[./](\d{1,2})\b/)
  if (dotted) {
    const year = dotted[1]
    const monthRaw = dotted[2]
    const dayRaw = dotted[3]
    if (year && monthRaw && dayRaw) {
      return { value: `${year}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}`, note: null }
    }
  }

  const korean = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (korean) {
    const year = korean[1]
    const monthRaw = korean[2]
    const dayRaw = korean[3]
    if (year && monthRaw && dayRaw) {
      return { value: `${year}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}`, note: null }
    }
  }

  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
    sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
  }
  const longForm = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i)
  if (longForm) {
    const monthName = longForm[1]?.toLowerCase()
    const dayRaw = longForm[2]
    const year = longForm[3]
    const month = monthName ? months[monthName] : undefined
    if (month && dayRaw && year) {
      return { value: `${year}-${month}-${dayRaw.padStart(2, '0')}`, note: null }
    }
  }

  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?,?\s+(20\d{2})\b/i)
  if (dayFirst) {
    const dayRaw = dayFirst[1]
    const monthName = dayFirst[2]?.toLowerCase()
    const year = dayFirst[3]
    const month = monthName ? months[monthName] : undefined
    if (month && dayRaw && year) return { value: `${year}-${month}-${dayRaw.padStart(2, '0')}`, note: null }
  }

  // Date-less but time-anchored wording: keep the phrase, do not invent a date.
  for (const entry of RELATIVE_DATE_PATTERNS) {
    if (entry.pattern.test(text)) {
      return { value: entry.label, note: 'relative timeframe, no absolute date in source' }
    }
  }
  // A day + month without a year is anchored to the publication date only when
  // the source gives one; otherwise the phrase is stored, not converted.
  const dayMonth = text.match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i)
  if (dayMonth) {
    const dayRaw = dayMonth[1]
    const monthWritten = dayMonth[2]
    const month = monthWritten ? months[monthWritten.toLowerCase()] : undefined
    const year = publishedAt ? publishedAt.slice(0, 4) : null
    if (month && dayRaw && year) {
      return {
        value: `${year}-${month}-${dayRaw.padStart(2, '0')}`,
        note: 'year taken from the article publication date',
      }
    }
    if (dayRaw && monthWritten) {
      return { value: `${dayRaw} ${monthWritten}`, note: 'no year in source — left as written' }
    }
  }

  return { value: null, note: null }
}

function classifyClaimType(input: {
  text: string
  sourceIsOfficialAgency: boolean
  sourceIsReputable: boolean
  attributionSignals: string[]
  category: NewsCategory
}): { type: ClaimType, notes: string[] } {
  const notes: string[] = []
  if (input.sourceIsOfficialAgency) {
    notes.push('publisher is the artist\u2019s own agency — primary source for this claim')
    return { type: 'official_announcement', notes }
  }
  if (firstMatch(input.text, RUMOR_PATTERNS)) {
    notes.push('wording marks the item as unverified/alleged')
    return { type: 'rumor', notes }
  }
  if (firstMatch(input.text, OPINION_PATTERNS)) {
    notes.push('editorial/opinion wording')
    return { type: 'analysis_opinion', notes }
  }
  if (input.attributionSignals.length > 0) {
    notes.push(`attribution present: ${input.attributionSignals.join(', ')}`)
    return { type: 'attributed_report', notes }
  }
  if (firstMatch(input.text, SPECULATION_PATTERNS)) {
    notes.push('future/uncertain wording — speculation, not a confirmed fact')
    return { type: 'speculation', notes }
  }
  if (input.sourceIsReputable) {
    notes.push('named reputable publisher with no uncertainty markers')
    return { type: 'confirmed_fact', notes }
  }
  notes.push('no attribution and no known publisher — treated conservatively as an attributed report')
  return { type: 'attributed_report', notes }
}

/**
 * Split a text into claim-bearing sentences: the headline always produces one,
 * and up to two summary sentences that mention the artist add supporting ones.
 */
function claimSentences(title: string, summary: string | null | undefined, artistId: string | null): string[] {
  const profile = artistId ? ARTISTS[artistId as ArtistId] : undefined
  const alias = profile?.aliases[0] ?? null
  const sentences: string[] = [title.trim()]
  if (!summary) return sentences
  const parts = summary
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean)
  for (const part of parts) {
    if (sentences.length >= 3) break
    const mentionsArtist = alias
      ? normalizeForMatch(part).includes(alias.toLowerCase())
      : false
    if (mentionsArtist) sentences.push(part)
  }
  return sentences
}

export function extractClaims(input: ClaimExtractionInput): ClaimExtraction {
  const title = input.title || ''
  const summary = input.summary || ''
  const body = (input.body || '').slice(0, 4000)
  const text = `${title} ${summary} ${body}`.trim()

  const injection = detectPromptInjection(text)
  const notes: string[] = []
  if (injection.detected) {
    notes.push(`prompt-injection markers ignored: ${injection.patterns.join(', ')}`)
  }

  const attributionSignals: string[] = []
  for (const pattern of ATTRIBUTION_PATTERNS) {
    const match = text.match(pattern)
    if (match) attributionSignals.push(match[0].toLowerCase())
  }

  const categoryRule = CATEGORY_RULES.find(rule => rule.pattern.test(text))
  const category: NewsCategory = categoryRule ? categoryRule.category : 'other'

  const primary = classifyClaimType({
    text,
    sourceIsOfficialAgency: input.sourceIsOfficialAgency,
    sourceIsReputable: input.sourceIsReputable,
    attributionSignals,
    category,
  })
  notes.push(...primary.notes)

  const isRumor = primary.type === 'rumor'
  const event = findEventDate(`${title} ${summary}`, input.publishedAt || null)
  if (event.note) notes.push(event.note)

  const sentences = claimSentences(title, summary, input.artistId)
  const claims: NewsClaim[] = sentences.map((sentence, index) => {
    const predicate = predicateFrom(sentence, category)
    const artistProfile = input.artistId ? ARTISTS[input.artistId as ArtistId] : undefined
    const subject = artistProfile?.displayName ?? (input.artistId || 'unknown')
    return {
      id: `${input.articleId}:c${index}`,
      article_id: input.articleId,
      claim_text: sentence,
      normalized_claim: normalizeNewsTitle(sentence),
      subject,
      predicate,
      relevant_dates: event.value,
      claim_type: primary.type,
      category,
      supporting_source_ids: [],
      contradicting_source_ids: [],
      claim_status: 'unassessed',
      verification_notes: [...notes, `category=${category}`],
    }
  })

  return {
    claims,
    category,
    primaryClaimType: primary.type,
    eventDate: event.value && /^\d{4}-\d{2}-\d{2}$/.test(event.value) ? event.value : null,
    isRumor,
    attributionSignals,
    injection,
    notes,
  }
}

/** Short machine-readable predicate derived from the category and wording. */
function predicateFrom(sentence: string, category: NewsCategory): string {
  const text = normalizeForMatch(sentence)
  const verb = CATEGORY_VERBS[category] || 'is the subject of a report'
  for (const [pattern, action] of Object.entries(ACTION_VERBS)) {
    if (new RegExp(pattern, 'i').test(text)) return action
  }
  return verb
}

const CATEGORY_VERBS: Record<NewsCategory, string> = {
  release: 'will release / has released music',
  schedule: 'has a scheduled appearance',
  performance: 'performs on a music program',
  award: 'received or is nominated for an award',
  chart: 'ranks on a chart',
  business: 'has a business or contractual development',
  media: 'appears in media content',
  personnel: 'has a group-membership development',
  other: 'is the subject of the report',
}

const ACTION_VERBS: Record<string, string> = {
  '\\bannounces?\\b': 'announces',
  '\\bconfirmed?\\b': 'confirms',
  '\\breleases?\\b': 'releases',
  '\\bdebut(s|ed)?\\b': 'debuts',
  '\\bwraps?\\b': 'wraps',
  '\\bconfirms?\\b': 'confirms',
  '\\bwins?\\b': 'wins',
  '\\bnominat': 'is nominated for',
  '\\bteases?\\b': 'teases',
  '\\bshares?\\b': 'shares',
  '\\breturns?\\b': 'returns',
  '\\bsets?\\b': 'sets',
  '\\bheads?\\b': 'heads to',
  '\\bjoins?\\b': 'joins',
  '\\bleaves?\\b': 'leaves',
}
