import type { NewsStatus } from './types'
import { isRenderableMediaUrl, validateExternalUrl } from './url'

/**
 * The public feed contract (§11, §18.16): **only VERIFIED rows ever leave the
 * server.** The status filter is part of the query builder itself, so no
 * endpoint, cache or future refactor can drop it, and every row is checked a
 * second time on the way out.
 */

export const PUBLIC_FEED_STATUS: NewsStatus = 'VERIFIED'

export interface FeedFilters {
  artist?: string | null
  category?: string | null
  q?: string | null
  publisher?: string | null
  page?: number | null
  limit?: number | null
}

export interface FeedQuery {
  sql: string
  countSql: string
  args: (string | number)[]
  countArgs: (string | number)[]
  page: number
  limit: number
}

const ARTIST_IDS = new Set(['aespa', 'hearts2hearts', 'ive'])
const CATEGORIES = new Set([
  'release', 'schedule', 'performance', 'award', 'chart', 'business',
  'media', 'personnel', 'other',
])

function sanitizeLike(value: string): string {
  return `%${value.replace(/[%_\\]/g, match => `\\${match}`).trim()}%`
}

export function buildFeedQuery(filters: FeedFilters = {}): FeedQuery {
  const clauses: string[] = ['verification_status = ?']
  const args: (string | number)[] = [PUBLIC_FEED_STATUS]

  const artist = (filters.artist || '').trim()
  if (artist && artist !== 'All' && ARTIST_IDS.has(artist)) {
    clauses.push('artist_id = ?')
    args.push(artist)
  }

  const category = (filters.category || '').trim()
  if (category && category !== 'All' && CATEGORIES.has(category)) {
    clauses.push('category = ?')
    args.push(category)
  }

  const publisher = (filters.publisher || '').trim().toLowerCase()
  if (publisher) {
    clauses.push('LOWER(publisher_domain) = ?')
    args.push(publisher)
  }

  const q = (filters.q || '').trim()
  if (q) {
    clauses.push('(original_title LIKE ? ESCAPE \'\\\' OR summary LIKE ? ESCAPE \'\\\' OR publisher_name LIKE ? ESCAPE \'\\\')')
    const needle = sanitizeLike(q)
    args.push(needle, needle, needle)
  }

  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 12))
  const page = Math.max(1, Number(filters.page) || 1)
  const offset = (page - 1) * limit

  const where = `WHERE ${clauses.join(' AND ')}`
  return {
    sql: `SELECT id, story_key, artist_id, original_title, summary, language, category,
                 original_url, canonical_url, publisher_name, publisher_domain,
                 published_at, published_at_has_time, event_date, verification_status,
                 verification_score, verification_version, evidence_complete,
                 first_discovered_at, last_checked_at, created_at, updated_at,
                 (SELECT image_url FROM news_evidence e
                    WHERE e.article_id = news_articles.id
                    ORDER BY e.retrieved_at DESC LIMIT 1) AS evidence_image,
                 (SELECT COUNT(*) FROM news_evidence e
                    WHERE e.article_id = news_articles.id) AS evidence_count
          FROM news_articles
          ${where}
          ORDER BY COALESCE(published_at, first_discovered_at) DESC, id DESC
          LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(*) AS total FROM news_articles ${where}`,
    args: [...args, limit, offset],
    countArgs: [...args],
    page,
    limit,
  }
}

export interface PublicArticle {
  id: string
  artist_id: string
  title: string
  summary: string | null
  language: string | null
  category: string
  original_url: string
  canonical_url: string | null
  publisher_name: string | null
  publisher_domain: string | null
  published_at: string | null
  published_at_has_time: boolean
  event_date: string | null
  verification_status: NewsStatus
  verification_score: number
  last_checked_at: string | null
  /** Best linked evidence asset (never rehosted) — the feed's visual preview. */
  thumbnail: string | null
  evidence_count: number
}

/**
 * Convert a DB row into the public shape. Returns `null` for anything that is
 * not VERIFIED — defense in depth behind the WHERE clause, and the reason a
 * hand-edited or corrupted row still cannot leak into the feed.
 */
export function toPublicArticle(row: Record<string, unknown>): PublicArticle | null {
  if (String(row.verification_status) !== PUBLIC_FEED_STATUS) return null
  if (!row.id || !row.original_url) return null
  if (!validateExternalUrl(String(row.original_url)).ok) return null
  return {
    id: String(row.id),
    artist_id: String(row.artist_id || ''),
    title: String(row.original_title || ''),
    summary: row.summary ? String(row.summary) : null,
    language: row.language ? String(row.language) : null,
    category: String(row.category || 'other'),
    original_url: String(row.original_url),
    canonical_url: row.canonical_url ? String(row.canonical_url) : null,
    publisher_name: row.publisher_name ? String(row.publisher_name) : null,
    publisher_domain: row.publisher_domain ? String(row.publisher_domain) : null,
    published_at: typeof row.published_at === 'string' && row.published_at ? row.published_at : null,
    published_at_has_time: Boolean(row.published_at_has_time),
    event_date: typeof row.event_date === 'string' && row.event_date ? row.event_date : null,
    verification_status: PUBLIC_FEED_STATUS,
    verification_score: Number(row.verification_score) || 0,
    last_checked_at: typeof row.last_checked_at === 'string' ? row.last_checked_at : null,
    thumbnail: isRenderableMediaUrl(typeof row.evidence_image === 'string' ? row.evidence_image : null)
      ? String(row.evidence_image)
      : null,
    evidence_count: Number(row.evidence_count) || 0,
  }
}

/** Last line of defence: drop anything non-VERIFIED or unsafe to render. */
export function filterPublicFeed(rows: Array<Record<string, unknown>>): PublicArticle[] {
  const out: PublicArticle[] = []
  for (const row of rows) {
    const article = toPublicArticle(row)
    if (article) out.push(article)
  }
  return out
}

// ------------------------------------------------------------ display language

export type FeedLang = 'en' | 'id'

/**
 * `?lang=en|id` — anything else falls back to English, so a malformed value
 * can never widen or change what the feed returns.
 */
export function parseFeedLang(value: unknown): FeedLang {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'id' ? 'id' : 'en'
}

/**
 * A stored display translation. Declared structurally (rather than imported
 * from the store) so `feed.ts` stays free of its own consumer.
 */
export interface DisplayTranslation {
  lang: string
  title: string | null
  summary: string | null
  status: string
  provider?: string
}

export interface LocalizedArticle extends PublicArticle {
  /** The verified wording, always present next to the translation. */
  original_title: string
  source_language: string | null
  /** `true` only when a machine translation is actually being shown. */
  translated: boolean
  translation_lang: FeedLang
}

/**
 * Swap in a translation *when one exists for the requested language*, and keep
 * the original beside it. Nothing here can invent text: no row, a `failed`
 * row, or a row for another language all mean "show the verified original".
 */
export function localizeArticle(
  article: PublicArticle,
  translation: DisplayTranslation | null | undefined,
  lang: FeedLang,
): LocalizedArticle {
  const usable = Boolean(
    translation
    && translation.status === 'ok'
    && translation.lang === lang
    && translation.title
    && translation.title !== article.title,
  )

  return {
    ...article,
    original_title: article.title,
    source_language: article.language,
    title: usable && translation!.title ? translation!.title : article.title,
    summary: usable && translation!.summary ? translation!.summary : article.summary,
    translated: usable,
    translation_lang: lang,
  }
}
