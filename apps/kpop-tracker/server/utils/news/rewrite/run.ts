import { safeFetch } from '../fetchSafe'
import { rewriteConfig, isRewriteConfigured, type RewriteConfig } from './config'
import { buildPrompt } from './prompt'
import { parseArticleJson } from './parse'
import { callGemini, type GeminiTransport } from './providers/gemini'
import { createGeminiKeyPool, maskKey, type GeminiKeyPool } from './keys'
import { buildRewriteMaterial, selectReferenced, type MaterialOptions } from './material'
import { buildSlug } from './store'
import * as store from './store'
import type { RewriteDraft } from './types'

/**
 * One rewrite run: pick articles worth writing up, ask Gemini to write them in
 * Indonesian fanbase style, validate the answer, and store it as a **draft**.
 *
 * Nothing here can publish: a human approves drafts in the admin review page.
 * A key that reports a quota error is cooled down and the next key is used; if
 * every key is exhausted the article is left as `failed` and retried on a later
 * run — never published half-written.
 */

export interface RewriteRunOptions {
  limit?: number
  dryRun?: boolean
  now?: Date
  /** Injected transport (tests); defaults to `safeFetch` over POST. */
  transport?: GeminiTransport
  /** Forwarded to the material builder (tests / offline runs). */
  material?: MaterialOptions
}

export interface RewriteRunSummary {
  startedAt: string
  finishedAt: string
  status: 'ok' | 'partial' | 'error' | 'skipped'
  candidates: number
  generated: number
  failed: number
  provider: string
  model: string
  keys: { total: number, used: string[], cooling: string[] }
  /** Draft bodies, filled only on a dry run so the output can be inspected. */
  previews: RewriteDraft[]
  messages: string[]
}

function iso(date: Date): string {
  return date.toISOString()
}

/**
 * POST through the pipeline's one safe doorway.
 *
 * `safeFetch` reports a throttled request as `upstream status 429` with a null
 * status (the retries were exhausted), so the code is recovered from the message
 * — otherwise a quota error would not be recognised as one and the key would
 * never cool down.
 */
export function defaultGeminiTransport(): GeminiTransport {
  return async (request, { timeoutMs }) => {
    const result = await safeFetch(request.url, {
      method: 'POST',
      body: request.body,
      headers: request.headers,
      timeoutMs,
      // No transport-level retry: the request is large, so a retry would double
      // the wait. The key pool is the failover mechanism instead.
      retries: 0,
      maxBytes: 262144,
      acceptContentTypes: ['application/json', 'text/plain', '*/*'],
    })
    const fromMessage = /upstream status (\d{3})/.exec(result.error || '')?.[1]
    const status = result.status ?? (fromMessage ? Number(fromMessage) : null)
    return { status, body: result.body, error: result.error }
  }
}

async function generateOne(
  prompt: string,
  config: RewriteConfig,
  pool: GeminiKeyPool,
  transport: GeminiTransport,
): Promise<{ ok: true, text: string, key: string } | { ok: false, error: string, quotaExhausted: boolean }> {
  const attempted = new Set<string>()
  let lastError = 'no Gemini key is available (all are cooling down)'

  for (;;) {
    const key = pool.available().find(candidate => !attempted.has(candidate))
    if (!key) return { ok: false, error: lastError, quotaExhausted: pool.size > 0 }

    attempted.add(key)
    const result = await callGemini(
      {
        model: config.geminiModel,
        apiKey: key,
        prompt,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      },
      { timeoutMs: config.timeoutMs, transport },
    )

    if (result.ok && result.text) return { ok: true, text: result.text, key }

    lastError = result.error || 'gemini call failed'
    if (result.retryable) {
      // Quota, overload (503 UNAVAILABLE) or a deadline: cool this key down and
      // try the next one. Only when every key has been tried does the article
      // give up — and then it is retried by a later run, never half-published.
      pool.cooldown(key)
      continue
    }
    // A rejected key, a safety block or a truncated answer is not something a
    // different key would fix — stop instead of burning the rest of the pool.
    return { ok: false, error: lastError, quotaExhausted: false }
  }
}

export async function runRewrite(options: RewriteRunOptions = {}): Promise<RewriteRunSummary> {
  const cfg = rewriteConfig()
  const startedAt = options.now || new Date()
  const summary: RewriteRunSummary = {
    startedAt: iso(startedAt),
    finishedAt: '',
    status: 'ok',
    candidates: 0,
    generated: 0,
    failed: 0,
    provider: 'gemini',
    model: cfg.geminiModel,
    keys: { total: cfg.geminiApiKeys.length, used: [], cooling: [] },
    previews: [],
    messages: [],
  }

  if (!isRewriteConfigured(cfg)) {
    summary.status = 'skipped'
    summary.finishedAt = iso(new Date())
    summary.messages.push(cfg.enabled
      ? 'no GEMINI_API_KEYS configured — nothing to do'
      : 'REWRITE_ENABLED is off — nothing to do')
    return summary
  }

  const limit = Math.max(1, options.limit ?? cfg.maxPerRun)
  const pool = createGeminiKeyPool(cfg.geminiApiKeys, cfg.keyCooldownMs)
  const transport = options.transport || defaultGeminiTransport()
  const failedBefore = iso(new Date(startedAt.getTime() - cfg.retryFailedMs))
  const usedKeys = new Set<string>()

  await store.ensureRewriteTables()
  const logId = options.dryRun ? null : await store.beginRewriteLog(summary.startedAt)

  try {
    const candidates = await store.listRewriteCandidates(limit, failedBefore)
    summary.candidates = candidates.length
    if (candidates.length === 0) summary.messages.push('no article is waiting to be rewritten')

    for (const candidate of candidates) {
      if (pool.available().length === 0) {
        summary.messages.push('every Gemini key is cooling down — remaining articles move to the next run')
        break
      }

      const loaded = await store.loadRewriteMaterial(candidate.id)
      if (!loaded) {
        summary.messages.push(`${candidate.id}: article row disappeared`)
        continue
      }

      const material = await buildRewriteMaterial(loaded, {
        maxInputChars: cfg.maxInputChars,
        ...options.material,
      })
      const prompt = buildPrompt(material, { maxInputChars: cfg.maxInputChars })
      const result = await generateOne(prompt, cfg, pool, transport)

      if (!result.ok) {
        summary.failed += 1
        summary.messages.push(`${material.originalTitle}: FAILED — ${result.error}`)
        if (!options.dryRun) {
          // A failed row is what makes the retry window work: the same article
          // is not attempted again until `retryFailedMs` has passed.
          await store.insertRewrite({
            articleId: material.articleId,
            slug: buildSlug(material.originalTitle, material.publishedAt),
            title: material.originalTitle,
            dek: material.summary || '',
            bodyMarkdown: '',
            artistId: material.artistId,
            category: material.category,
            language: 'id',
            readingMinutes: 1,
            provider: 'gemini',
            model: cfg.geminiModel,
            status: 'failed',
            error: result.error,
          })
        }
        continue
      }

      usedKeys.add(result.key)
      const parsed = parseArticleJson(result.text, {
        imageCount: material.images.length,
        sourceCount: material.sources.length,
      })

      if (!parsed.ok) {
        summary.failed += 1
        summary.messages.push(`${material.originalTitle}: FAILED — ${parsed.error}`)
        if (!options.dryRun) {
          await store.insertRewrite({
            articleId: material.articleId,
            slug: buildSlug(material.originalTitle, material.publishedAt),
            title: material.originalTitle,
            dek: material.summary || '',
            bodyMarkdown: '',
            artistId: material.artistId,
            category: material.category,
            language: 'id',
            readingMinutes: 1,
            provider: 'gemini',
            model: cfg.geminiModel,
            status: 'failed',
            error: parsed.error,
          })
        }
        continue
      }

      const { images, sources } = selectReferenced(material, parsed.value.imagePicks, parsed.value.sourceIndexes)
      const draft: RewriteDraft = {
        articleId: material.articleId,
        slug: buildSlug(parsed.value.title, material.publishedAt),
        title: parsed.value.title,
        dek: parsed.value.dek,
        bodyMarkdown: parsed.value.bodyMarkdown,
        artistId: material.artistId,
        category: material.category,
        language: 'id',
        readingMinutes: parsed.value.readingMinutes,
        provider: 'gemini',
        model: cfg.geminiModel,
        images,
        sources,
      }

      summary.generated += 1
      summary.messages.push(`${draft.title}: draft generated (${draft.readingMinutes} min, ${images.length} gambar, ${sources.length} sumber)`)

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
        // Nothing is written on a dry run, so hand the draft back instead.
        summary.previews.push(draft)
      }
    }

    summary.status = summary.failed > 0
      ? (summary.generated > 0 ? 'partial' : 'error')
      : (summary.generated > 0 ? 'ok' : 'partial')
  } catch (error) {
    summary.status = 'error'
    summary.messages.push(`rewrite error: ${(error as Error)?.message || String(error)}`)
    if (logId !== null) {
      await store.finishRewriteLog(logId, {
        finishedAt: iso(new Date()),
        status: 'error',
        generated: summary.generated,
        failed: summary.failed,
        provider: summary.provider,
        message: summary.messages.join(' | ').slice(0, 4000),
      })
    }
    throw error
  }

  summary.finishedAt = iso(new Date())
  summary.keys.used = [...usedKeys].map(maskKey)
  summary.keys.cooling = pool.labels().filter(label => !summary.keys.used.includes(label) && cfg.geminiApiKeys.some(key => maskKey(key) === label && pool.isCoolingDown(key)))

  if (logId !== null) {
    await store.finishRewriteLog(logId, {
      finishedAt: summary.finishedAt,
      status: summary.status === 'error' ? 'error' : (summary.status === 'ok' ? 'ok' : 'partial'),
      generated: summary.generated,
      failed: summary.failed,
      provider: summary.provider,
      message: summary.messages.slice(0, 40).join(' | ').slice(0, 4000),
    })
  }

  return summary
}

export { lastRewriteRun } from './store'
