import { ensureRewriteTables, listPublishedRewrites } from '../../../utils/news/rewrite/store'
import { toPublicCard } from '../../../utils/news/rewrite/public'

/**
 * The fanbase blog feed — published rewrites only.
 *
 * This is a different contract from `/api/news` (the VERIFIED-only news feed):
 * a rewrite reaches this endpoint only after an admin approved and published
 * it, and `toPublicCard` returns `null` for any other status as a second guard.
 */
export default defineEventHandler(async (event) => {
  await ensureRewriteTables()
  const query = getQuery(event)

  const result = await listPublishedRewrites({
    artist: single(query.artist),
    category: single(query.category),
    q: single(query.q),
    page: positiveInt(query.page, 1),
    limit: positiveInt(query.limit, 12),
  })

  const data = result.rewrites
    .map(toPublicCard)
    .filter((card): card is NonNullable<ReturnType<typeof toPublicCard>> => card !== null)

  return {
    success: true,
    data,
    meta: {
      page: result.page,
      pages: Math.max(1, Math.ceil(result.total / result.limit)),
      total: result.total,
      limit: result.limit,
      // Explicit contract marker for clients and smoke tests.
      status_filter: 'published',
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
