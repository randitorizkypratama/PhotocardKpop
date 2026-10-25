import { ensureNewsTables, listSourceStatuses, listVerifiedPublishers } from '../../utils/news/store'
import { sourceRegistrySnapshot } from '../../utils/news/run'
import { newsConfig } from '../../utils/news/config'
import { SCORE_COMPONENTS } from '../../utils/news/types'
import { GATE_ORDER } from '../../utils/news/gates'

/**
 * Transparency panel data (§4): which sources exist, what they are trusted
 * for, and which publishers actually produced a VERIFIED story. The registry
 * is static configuration — it never claims an article was checked when it
 * was not; live availability comes from `news_source_status`.
 */
export default defineEventHandler(async () => {
  await ensureNewsTables()

  const [publishers, statuses] = await Promise.all([
    listVerifiedPublishers(),
    listSourceStatuses().catch(() => [] as Array<Record<string, unknown>>),
  ])

  const cfg = newsConfig()
  return {
    success: true,
    registry: sourceRegistrySnapshot(),
    publishers,
    policy: {
      min_score: cfg.minScore,
      components: SCORE_COMPONENTS,
      // A story is published only when every hard gate passes and the
      // deterministic score reaches this minimum.
      hard_gates: GATE_ORDER.length,
    },
    availability: statuses.map(row => ({
      source_id: String(row.source_id ?? ''),
      display_name: String(row.display_name ?? ''),
      availability: String(row.availability ?? 'unknown'),
      last_attempt: row.last_attempt ? String(row.last_attempt) : null,
      last_success: row.last_success ? String(row.last_success) : null,
      last_error: row.last_error ? String(row.last_error) : null,
      item_count: Number(row.item_count) || 0,
    })),
  }
})
