import { articleCountsByStatus, ensureNewsTables, lastIngestRun } from '../../../utils/news/store'
import {
  ensureRewriteTables,
  lastRewriteRun,
  listRewriteImages,
  listRewriteSources,
  listRewritesByStatuses,
  rewriteCountsByStatus,
} from '../../../utils/news/rewrite/store'
import { newsConfig } from '../../../utils/news/config'
import { rewriteConfig } from '../../../utils/news/rewrite/config'

/**
 * The AI-draft queue for /admin/news. Collecting happens automatically; the
 * only human step is deciding what to publish. Drafts (and approved-but-not-yet
 * published items) are listed with their body, images, sources and the source
 * article's internal verification state for context.
 *
 * Admin session required (403 otherwise). Nothing here is public until an admin
 * publishes it — see rewrite/[id].post.ts.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await ensureNewsTables()
  await ensureRewriteTables()

  const cfg = newsConfig()
  const rewrite = rewriteConfig()

  const [counts, rewriteCounts, drafts, lastRun, lastRewrite] = await Promise.all([
    articleCountsByStatus(),
    rewriteCountsByStatus(),
    loadDrafts(),
    lastIngestRun(),
    lastRewriteRun(),
  ])

  return {
    success: true,
    // news_articles histogram — how the last harvest landed (internal only).
    counts,
    // news_rewrites histogram — the draft/publish pipeline.
    rewrite_counts: rewriteCounts,
    policy: { min_score: cfg.minScore },
    rewrite_policy: {
      enabled: rewrite.enabled,
      model: rewrite.geminiModel,
      max_per_run: rewrite.maxPerRun,
      keys: rewrite.geminiApiKeys.length,
    },
    drafts,
    last_run: lastRun,
    last_rewrite_run: lastRewrite,
  }
})

/**
 * Every draft with its body, images and sources, so the panel can preview and
 * edit without a second round trip. Bounded: a weekly run produces a handful.
 */
async function loadDrafts(limit = 20) {
  const drafts = await listRewritesByStatuses(['draft', 'approved'], limit)
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
      // Internal context only — the source article's verification state.
      source_status: draft.sourceStatus,
      source_score: draft.sourceScore,
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
