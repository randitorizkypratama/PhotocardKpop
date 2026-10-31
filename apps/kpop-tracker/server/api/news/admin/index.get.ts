import {
  articleCountsByStatus,
  ensureNewsTables,
  lastIngestRun,
  listAudit,
  listUnverifiedArticles,
} from '../../../utils/news/store'
import {
  ensureRewriteTables,
  lastRewriteRun,
  listRewriteImages,
  listRewriteSources,
  listRewritesByStatus,
} from '../../../utils/news/rewrite/store'
import { newsConfig } from '../../../utils/news/config'
import { rewriteConfig } from '../../../utils/news/rewrite/config'

/**
 * Administration view (§11): every lifecycle state, the records that never
 * passed the gates, the AI drafts waiting for review, and the ingest logs.
 * Admin session required (403 otherwise) — none of this is reachable from the
 * public feed, and no draft here is public until it is published.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await ensureNewsTables()
  await ensureRewriteTables()

  const cfg = newsConfig()
  const rewrite = rewriteConfig()

  const [counts, pending, lastRun, lastRewrite] = await Promise.all([
    articleCountsByStatus(),
    listUnverifiedArticles(50),
    lastIngestRun(),
    lastRewriteRun(),
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
    rewrite_policy: {
      enabled: rewrite.enabled,
      model: rewrite.geminiModel,
      max_per_run: rewrite.maxPerRun,
      keys: rewrite.geminiApiKeys.length,
    },
    unverified: pending.map(reviewRow),
    drafts: await loadDrafts(),
    last_run: lastRun,
    last_rewrite_run: lastRewrite,
    recent_audit: recentAudit,
  }
})

/**
 * Every draft with its body, images and sources, so the panel can preview and
 * edit without a second round trip. Bounded: a weekly run produces a handful.
 */
async function loadDrafts(limit = 20) {
  const drafts = await listRewritesByStatus('draft', limit)
  const out = []
  for (const draft of drafts) {
    const [images, sources] = await Promise.all([
      listRewriteImages(draft.id),
      listRewriteSources(draft.id),
    ])
    out.push({
      id: draft.id,
      slug: draft.slug,
      title: draft.title,
      dek: draft.dek,
      body_markdown: draft.bodyMarkdown,
      artist_id: draft.artistId,
      category: draft.category,
      reading_minutes: draft.readingMinutes,
      status: draft.status,
      provider: draft.provider,
      model: draft.model,
      error: draft.error,
      generated_at: draft.generatedAt,
      images: images.map(image => ({
        image_url: image.imageUrl,
        source_url: image.sourceUrl,
        credit_text: image.creditText,
        credit_url: image.creditUrl,
        caption: image.caption,
      })),
      sources: sources.map(source => ({
        source_url: source.sourceUrl,
        publisher_name: source.publisherName,
        publisher_domain: source.publisherDomain,
        original_title: source.originalTitle,
      })),
    })
  }
  return out
}

/**
 * Shape one review row for the admin panel: the two JSON columns arrive as
 * strings from SQLite, and the panel needs them as arrays to render a story's
 * failed gates and the reasons behind its status.
 */
function reviewRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    artist_id: String(row.artist_id || ''),
    title: String(row.original_title || ''),
    summary: row.summary ? String(row.summary) : null,
    category: String(row.category || 'other'),
    original_url: String(row.original_url || ''),
    publisher_name: row.publisher_name ? String(row.publisher_name) : null,
    publisher_domain: row.publisher_domain ? String(row.publisher_domain) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    verification_status: String(row.verification_status || ''),
    verification_score: Number(row.verification_score) || 0,
    verification_reasons: parseList(row.verification_reasons),
    failed_gates: parseList(row.failed_gates),
    first_discovered_at: row.first_discovered_at ? String(row.first_discovered_at) : null,
    last_checked_at: row.last_checked_at ? String(row.last_checked_at) : null,
  }
}

function parseList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(entry => String(entry)) : []
  } catch {
    return []
  }
}
