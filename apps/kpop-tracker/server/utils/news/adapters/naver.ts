import { decodeEntities } from '../text'

/**
 * Naver Search API adapter (news discovery, Korean).
 *
 * This is the replacement for Google News RSS, which `news.google.com` blocks
 * for our agent via robots.txt. It is an authenticated **API**, not a crawl:
 * Naver returns a JSON list of headlines/links, and the pipeline then fetches
 * the publisher's own page exactly like every other discovery path — robots
 * check, 12 gates, no bypass.
 *
 * Two details matter for correctness:
 *  - `originallink` is the publisher's URL; `link` is a Naver redirect. The
 *    former is preferred so domain classification, robots.txt and citations all
 *    refer to the actual publisher.
 *  - Naver wraps matches in `<b>` tags and HTML-escapes entities, so both are
 *    cleaned out of titles and descriptions before anything else sees them.
 */

export const NAVER_NEWS_ENDPOINT = 'https://openapi.naver.com/v1/search/news.json'

export interface NaverNewsItem {
  title: string
  description: string
  /** Naver's redirect URL (n.news.naver.com) — kept for auditing. */
  link: string
  /** The publisher's own URL, when Naver supplied one. */
  originalLink: string
  publishedAt: string | null
  /** What the pipeline should fetch: `originalLink`, falling back to `link`. */
  url: string
}

export interface NaverSearchResult {
  items: NaverNewsItem[]
  total: number
  error: string | null
}

export function naverNewsUrl(
  query: string,
  options: { display?: number, start?: number, sort?: 'date' | 'sim' } = {},
): string {
  const params = new URLSearchParams({
    query,
    display: String(Math.min(100, Math.max(1, options.display ?? 50))),
    start: String(Math.min(1000, Math.max(1, options.start ?? 1))),
    sort: options.sort ?? 'date',
  })
  return `${NAVER_NEWS_ENDPOINT}?${params.toString()}`
}

export function naverSearchHeaders(clientId: string, clientSecret: string): Record<string, string> {
  return {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
    'accept': 'application/json',
  }
}

/**
 * Strip Naver's highlight markup and decode entities.
 *
 * Tags are removed **without** inserting a space: Naver wraps the matched
 * keyword inside a word, so `<b>아이브</b>가` must become `아이브가`, not
 * `아이브 가` (Korean particles attach directly to the noun).
 */
export function cleanNaverText(value: unknown): string {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

export function parseNaverNews(payload: unknown): NaverSearchResult {
  const body = payload as { items?: unknown[], total?: unknown, errorMessage?: unknown } | null

  if (body?.errorMessage) {
    return { items: [], total: 0, error: String(body.errorMessage) }
  }
  if (!body || !Array.isArray(body.items)) {
    return { items: [], total: 0, error: 'unexpected Naver API payload' }
  }

  const items: NaverNewsItem[] = []
  for (const raw of body.items) {
    const entry = raw as Record<string, unknown>
    const title = cleanNaverText(entry.title)
    const originalLink = String(entry.originallink || '').trim()
    const link = String(entry.link || '').trim()
    const url = originalLink || link
    if (!title || !url) continue

    const publishedAt = entry.pubDate ? String(entry.pubDate) : null
    items.push({
      title,
      description: cleanNaverText(entry.description),
      link,
      originalLink,
      publishedAt: publishedAt && publishedAt.trim() ? publishedAt : null,
      url,
    })
  }

  return { items, total: Number(body.total) || items.length, error: null }
}
