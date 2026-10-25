import {
  articleCountsByStatus,
  ensureNewsTables,
  lastIngestRun,
  listAudit,
  listUnverifiedArticles,
} from '../../../utils/news/store'
import { newsConfig } from '../../../utils/news/config'

/**
 * Administration view (§11): every lifecycle state, the records that never
 * passed the gates, and the ingest log. Admin session required (403 otherwise)
 * — none of this is reachable from the public feed.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await ensureNewsTables()

  const cfg = newsConfig()
  const [counts, pending, lastRun] = await Promise.all([
    articleCountsByStatus(),
    listUnverifiedArticles(50),
    lastIngestRun(),
  ])

  const recentAudit = pending.length > 0
    ? await listAudit(String(pending[0]?.id || ''), 5)
    : []

  return {
    success: true,
    counts,
    policy: {
      min_score: cfg.minScore,
      recheck_interval_minutes: Math.round(cfg.recheckIntervalMs / 60000),
      max_articles_per_run: cfg.maxArticlesPerRun,
      run_budget_ms: cfg.runBudgetMs,
      allowed_source_domains: cfg.allowedSourceDomains,
      max_retries: cfg.maxRetries,
      max_response_bytes: cfg.maxResponseBytes,
      max_article_age_days: Math.round(cfg.maxArticleAgeMs / 86400000),
    },
    unverified: pending,
    last_run: lastRun,
    recent_audit: recentAudit,
  }
})
