import { ARTISTS } from '../artists'
import { ARTIST_IDS } from '../types'
import { recapConfig, isRewriteConfigured, rewriteConfig, type RewriteConfig } from './config'
import {
  bucketRecapTopics,
  recapSlug,
  recapSources,
  recapWeekWindow,
  renderRecapCredits,
} from './digest'
import { buildRecapPrompt } from './prompt'
import { parseRecapJson } from './parse'
import { createGeminiKeyPool, maskKey } from './keys'
import { defaultGeminiTransport, generateOne } from './run'
import { parseArticleMeta } from '../adapters/publisherPage'
import { safeFetch } from '../fetchSafe'
import type { GeminiTransport } from './providers/gemini'
import * as store from './store'
import type { RecapArticle, RecapTopic, RecapWeekWindow, RewriteDraft, RewriteImageInput } from './types'
import { isRenderableMediaUrl, validateExternalUrl } from '../url'

/**
 * One weekly recap run: for every artist, take the week's collected articles,
 * bucket them into the headings a recap promises (where they appeared, what
 * they won, the rest of the week), ask Gemini to write the Indonesian recap,
 * validate the answer, and store it as a **draft** with `article_id = NULL`
 * and every source row that fed it.
 *
 * Idempotency is structural: `recapSlug(artist, weekKey)` is deterministic and
 * `news_rewrites.slug` is unique, so a re-run on the same window finds the
 * existing row and skips — only a `failed` row is cleared, so a manual retry
 * can work. Nothing here can publish: an admin approves the draft like any
 * other in `/admin/news`.
 */

export interface RecapRunOptions {
  dryRun?: boolean
  now?: Date
  /** Injected transport (tests); defaults to `safeFetch` over POST. */
  transport?: GeminiTransport
  /** Override the rolling seven-day window (e.g. a monthly recap). */
  window?: RecapWeekWindow
  /** Override `RECAP_MIN_ARTICLES` for this run only. */
  minArticles?: number
  /** Human label for the covered period ("Oktober 2026") used in prompt + title. */
  periodLabel?: string
}

export interface RecapRunSummary {
  startedAt: string
  finishedAt: string
  status: 'ok' | 'partial' | 'error' | 'skipped'
  window: RecapWeekWindow
  /** Artists whose window held at least `minArticles` — the ones attempted. */
  considered: number
  generated: number
  failed: number
  /** Artists skipped (too little news, or this window's draft already exists). */
  skipped: number
  provider: string
  model: string
  keys: { total: number, used: string[], cooling: string[] }
  /** Recap bodies, filled only on a dry run so the output can be inspected. */
  previews: RewriteDraft[]
  messages: string[]
}

function iso(date: Date): string {
  return date.toISOString()
}

/**
 * Fetch the full body text of an article URL. Falls back silently — a recap
 * that can't reach one publisher still runs with the rest.
 */
async function fetchArticleBody(url: string, summary: string | null): Promise<string> {
  if (!url || url.includes('youtube.com')) return summary || ''
  try {
    const result = await safeFetch(url, {
      timeoutMs: 8000,
      retries: 1,
      maxBytes: 1048576,
      acceptContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain'],
    })
    if (result.ok && result.body) {
      const meta = parseArticleMeta(result.body, url)
      if (meta.bodyText && meta.bodyText.length > (summary?.length ?? 0)) return meta.bodyText
    }
  } catch {
    // silently fall back
  }
  return summary || ''
}

/**
 * One photo per topic, taken from the first article whose evidence actually
 * carried a traceable image. The credit is always a publisher we hold a row
 * for and the link points at the article itself, so a recap can never show an
 * uncredited or unlinked picture. The model never picks these — a recap's
 * illustration is a property of the grouping, not of the prose.
 */
function recapImages(topics: RecapTopic[]): RewriteImageInput[] {
  const images: RewriteImageInput[] = []
  const seen = new Set<string>()
  for (const topic of topics) {
    for (const article of topic.articles) {
      const imageUrl = article.imageUrl
      if (!imageUrl || seen.has(imageUrl)) continue
      if (!isRenderableMediaUrl(imageUrl)) continue
      if (!validateExternalUrl(article.url).ok) continue
      seen.add(imageUrl)
      images.push({
        imageUrl,
        sourceUrl: article.url,
        creditText: article.publisherName || article.publisherDomain || null,
        creditUrl: article.url,
        caption: article.imageCaption || null,
      })
      break
    }
  }
  return images
}

export async function runWeeklyRecaps(options: RecapRunOptions = {}): Promise<RecapRunSummary> {
  const cfg: RewriteConfig = rewriteConfig()
  const recap = recapConfig()
  const startedAt = options.now || new Date()
  const window = options.window || recapWeekWindow(startedAt)
  const minArticles = options.minArticles ?? recap.minArticles

  const summary: RecapRunSummary = {
    startedAt: iso(startedAt),
    finishedAt: '',
    status: 'ok',
    window,
    considered: 0,
    generated: 0,
    failed: 0,
    skipped: 0,
    provider: 'gemini',
    model: cfg.geminiModel,
    keys: { total: cfg.geminiApiKeys.length, used: [], cooling: [] },
    previews: [],
    messages: [],
  }

  if (!isRewriteConfigured(cfg)) {
    summary.status = 'skipped'
    summary.finishedAt = iso(new Date())
    summary.messages.push('no GEMINI_API_KEYS configured — recap skipped')
    return summary
  }
  if (!recap.enabled) {
    summary.status = 'skipped'
    summary.finishedAt = iso(new Date())
    summary.messages.push('RECAP_ENABLED is off — recap skipped')
    return summary
  }

  const pool = createGeminiKeyPool(cfg.geminiApiKeys, cfg.keyCooldownMs)
  const transport = options.transport || defaultGeminiTransport()
  const usedKeys = new Set<string>()

  await store.ensureRewriteTables()

  try {
    for (const artistId of ARTIST_IDS) {
      const artistName = ARTISTS[artistId]?.displayName || artistId
      const slug = recapSlug(artistId, window.weekKey)

      const existing = await store.getRewriteBySlug(slug)
      if (existing && existing.status !== 'failed') {
        summary.skipped += 1
        summary.messages.push(`${artistName}: recap for ${window.weekKey} already exists (${existing.status})`)
        continue
      }
      if (existing) {
        // A failed row holds nothing usable — clear it so this window can be
        // retried now instead of waiting for the next scheduled week.
        await store.deleteRewrite(existing.id)
        summary.messages.push(`${artistName}: clearing failed recap to retry`)
      }

      const articles = await store.listRecapArticles(artistId, window.startIso, window.endIso)
      if (articles.length < minArticles) {
        summary.skipped += 1
        summary.messages.push(`${artistName}: only ${articles.length} article(s) in the window (need ${minArticles})`)
        continue
      }

      summary.considered += 1
      const topics = bucketRecapTopics(articles, {
        maxTopics: recap.maxTopics,
        maxPerTopic: recap.maxPerTopic,
      })
      const sources = recapSources(topics)

      // Fetch full body text for each source article — same approach as
      // material.ts for individual rewrites. Failures fall back to summary.
      const bodyTexts = new Map<string, string>()
      await Promise.all(
        sources.map(async article => {
          const body = await fetchArticleBody(article.url, article.summary)
          if (body) bodyTexts.set(article.id, body)
        })
      )
      // Bucketing drops duplicate URLs, so every topic article is in `sources`
      // — citation numbers are therefore the flat 1-based positions below.
      const indexOf = new Map(sources.map((article, position) => [article.id, position + 1]))

      const prompt = buildRecapPrompt({
        artistName,
        weekKey: window.weekKey,
        weekEnd: window.endIso.slice(0, 10),
        periodLabel: options.periodLabel,
        topics: topics.map(topic => ({
          label: topic.label,
          articles: topic.articles.map(article => ({
            index: indexOf.get(article.id)!,
            title: article.title,
            publisher: article.publisherName || article.publisherDomain || 'sumber tidak dikenal',
            publishedAt: article.publishedAt,
            bodyText: bodyTexts.get(article.id) || null,
          })),
        })),
      }, { maxInputChars: cfg.maxInputChars })

      const result = await generateOne(prompt, cfg, pool, transport)

      if (!result.ok) {
        summary.failed += 1
        summary.messages.push(`${artistName}: FAILED — ${result.error}`)
        if (!options.dryRun) {
          await store.insertRewrite(failedRecapRow(artistId, slug, artistName, window, cfg, result.error))
        }
        continue
      }

      usedKeys.add(result.key)
      const parsed = parseRecapJson(result.text)
      if (!parsed.ok) {
        summary.failed += 1
        summary.messages.push(`${artistName}: FAILED — ${parsed.error}`)
        if (!options.dryRun) {
          await store.insertRewrite(failedRecapRow(artistId, slug, artistName, window, cfg, parsed.error))
        }
        continue
      }

      const draft: RewriteDraft = {
        articleId: null,
        slug,
        title: parsed.value.title,
        dek: parsed.value.dek,
        // Credits are rendered from OUR rows: every `[n]` in the body becomes
        // the publisher it points at, and a marker outside the list is dropped.
        bodyMarkdown: renderRecapCredits(parsed.value.bodyMarkdown, sources),
        artistId,
        category: 'recap',
        language: 'id',
        readingMinutes: parsed.value.readingMinutes,
        provider: 'gemini',
        model: cfg.geminiModel,
        images: recapImages(topics),
        sources: sources.map(article => ({
          sourceUrl: article.url,
          publisherName: article.publisherName,
          publisherDomain: article.publisherDomain,
          originalTitle: article.title,
          publishedAt: article.publishedAt,
        })),
      }

      summary.generated += 1
      summary.messages.push(
        `${artistName}: recap draft generated (${topics.length} topik, ${sources.length} sumber)`,
      )

      if (!options.dryRun) {
        await store.insertRewrite({
          articleId: draft.articleId,
          slug: draft.slug,
          title: draft.title,
          dek: draft.dek,
          bodyMarkdown: draft.bodyMarkdown,
          artistId: draft.artistId,
          category: draft.category,
          language: draft.language,
          readingMinutes: draft.readingMinutes,
          provider: draft.provider,
          model: draft.model,
          status: 'draft',
          images: draft.images,
          sources: draft.sources,
        })
      } else {
        summary.previews.push(draft)
      }
    }

    summary.status = summary.failed > 0
      ? (summary.generated > 0 ? 'partial' : 'error')
      : (summary.generated > 0 ? 'ok' : 'partial')
  } catch (error) {
    summary.status = 'error'
    summary.messages.push(`recap error: ${(error as Error)?.message || String(error)}`)
    throw error
  }

  summary.finishedAt = iso(new Date())
  summary.keys.used = [...usedKeys].map(maskKey)
  summary.keys.cooling = pool.labels().filter(label => !summary.keys.used.includes(label))
  return summary
}

/** The row stored when a recap attempt failed — it is what a retry finds. */
function failedRecapRow(
  artistId: string,
  slug: string,
  artistName: string,
  window: RecapWeekWindow,
  cfg: RewriteConfig,
  error: string,
) {
  return {
    articleId: null,
    slug,
    title: `Rekap ${artistName} (${window.weekKey})`,
    dek: '',
    bodyMarkdown: '',
    artistId,
    category: 'recap',
    language: 'id',
    readingMinutes: 1,
    provider: 'gemini',
    model: cfg.geminiModel,
    status: 'failed' as const,
    error,
  }
}
