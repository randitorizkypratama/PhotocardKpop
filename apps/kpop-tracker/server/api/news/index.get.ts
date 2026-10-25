import { ensureNewsTables, getTranslations, listPublicFeed } from '../../utils/news/store'
import { localizeArticle, parseFeedLang } from '../../utils/news/feed'
/**
 * Public news feed (§11, §18.16).
 *
 * `listPublicFeed` → `buildFeedQuery` hardcodes `verification_status = 'VERIFIED'`
 * and `filterPublicFeed` drops any row that is not VERIFIED on the way out, so
 * a pending/rejected/conflicted row can never reach this response — not by
 * query parameter, not by cache key, not by a future refactor.
 *
 * `?lang=en|id` only chooses which *wording* is shown; the verified original
 * always travels with it as `original_title`, and a missing translation falls
 * back to that original rather than to invented text.
 */
export default defineEventHandler(async (event) => {
  await ensureNewsTables()
  const query = getQuery(event)
  const lang = parseFeedLang(query.lang)

  const result = await listPublicFeed({
    artist: single(query.artist),
    category: single(query.category),
    q: single(query.q),
    publisher: single(query.publisher),
    page: positiveInt(query.page, 1),
    limit: positiveInt(query.limit, 12),
  })

  const translations = await getTranslations(result.articles.map(article => article.id), lang)

  return {
    success: true,
    data: result.articles.map(article => localizeArticle(article, translations.get(article.id), lang)),
    meta: {
      page: result.page,
      pages: result.pages,
      total: result.total,
      limit: result.limit,
      lang,
      // Explicit contract marker for clients and for smoke tests.
      status_filter: 'VERIFIED',
    },
  }
})

function single(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  return text ? text.slice(0, 200) : null
}

function positiveInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
