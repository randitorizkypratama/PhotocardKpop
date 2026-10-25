import { runNewsIngestion } from '../../utils/news/run'

/**
 * Daily verification run (Vercel cron + manual trigger).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (fail-closed 401 when the secret
 * is unset). Bounded by `NEWS_MAX_ARTICLES_PER_RUN` and `NEWS_RUN_BUDGET_MS`
 * so a single invocation can never exceed the serverless function timeout.
 */
export default defineEventHandler(async (event) => {
  requireCronSecret(event)

  const summary = await runNewsIngestion()

  return {
    success: summary.status !== 'error',
    status: summary.status,
    started_at: summary.startedAt,
    finished_at: summary.finishedAt,
    discovered: summary.discovered,
    verified: summary.verified,
    rejected: summary.rejected,
    pending: summary.pending,
    fetch_failed: summary.fetchFailed,
    rechecked: summary.rechecked,
    sources: summary.sources,
    messages: summary.messages.slice(0, 60),
  }
})
