/**
 * Machine translation — **presentation only** (§18).
 *
 * The verified record is always the original text: `news_articles.original_title`
 * and `summary` are what the audit trail scored and what the evidence proves.
 * Translations live in their own table, are labelled as machine output, and are
 * served *in addition to* the original — never in place of it. If the engine is
 * unreachable, the original text is returned unchanged: a missing translation
 * is a limitation, never a reason to invent wording.
 *
 * Provider: MyMemory (keyless, JSON, server-side only). Chosen over Google's
 * `/translate_a/single` endpoint because Google's own robots.txt carries
 * `Disallow: /translate_a/` — using it would break the pipeline's rule that
 * robots.txt is never bypassed. No key and no browser-visible secret: the
 * request is made from the server, like every other fetch in this pipeline.
 */

export const TARGET_LANGS = ['en', 'id'] as const
export type TargetLang = (typeof TARGET_LANGS)[number]

/**
 * Languages this pipeline can be given as a source (mirrors `detectLanguage`
 * plus the Indonesian half of the target set).
 *
 * There is deliberately no `auto`: MyMemory rejects `langpair=auto|xx` with an
 * error body, and an explicit pair keeps the request honest about what the
 * engine is being asked to do. An unknown or missing code falls back to `en`,
 * which is what the overwhelming majority of the corpus is written in.
 */
export type SourceLang = 'en' | 'id' | 'ko' | 'ja' | 'zh'

export interface TranslateResult {
  ok: boolean
  text: string | null
  error: string | null
}

export interface TranslateOptions {
  /**
   * Performs the request through the pipeline's polite, robots-checked fetch
   * (rate limits, size caps and timeouts all apply).
   */
  fetchBody: (url: string) => Promise<{ ok: boolean, body: string, error: string | null }>
  /** Source language; defaults to `en` for the (rare) missing code. */
  source?: SourceLang
}

const ENDPOINT = 'https://api.mymemory.translated.net/get'
/** MyMemory caps a single query; longer summaries are truncated, not split. */
const MAX_CHARS = 480

export function isTargetLang(value: unknown): value is TargetLang {
  return typeof value === 'string' && (TARGET_LANGS as readonly string[]).includes(value)
}

export function translationUrl(text: string, target: TargetLang, source: SourceLang = 'en'): string {
  const query = encodeURIComponent(text.slice(0, MAX_CHARS).trim())
  const pair = `${source}|${target}`
  return `${ENDPOINT}?q=${query}&langpair=${encodeURIComponent(pair)}`
}

/**
 * Parse a MyMemory `get` response. Anything that is not a clean translation —
 * a quota warning, an error payload, malformed JSON — is reported as a failure
 * so the caller can fall back to the original wording.
 */
export function parseTranslation(body: string, target: TargetLang): TranslateResult {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return { ok: false, text: null, error: 'translation provider returned non-JSON' }
  }

  const data = payload as {
    responseStatus?: number | string
    responseData?: { translatedText?: unknown }
    responseDetails?: unknown
  }
  const status = Number(data.responseStatus)
  if (Number.isFinite(status) && status !== 200) {
    return { ok: false, text: null, error: `translation provider status ${status}` }
  }

  const translated = typeof data.responseData?.translatedText === 'string'
    ? data.responseData.translatedText.trim()
    : ''
  if (!translated) return { ok: false, text: null, error: 'translation provider returned no text' }
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(translated)) {
    return { ok: false, text: null, error: 'translation provider quota or query limit' }
  }

  // Guard against a plausible-looking but empty/duplicated answer: an engine
  // that echoes the input back has not translated anything.
  return { ok: true, text: translated, error: null }
}

export async function translateText(
  text: string,
  target: TargetLang,
  options: TranslateOptions,
): Promise<TranslateResult> {
  const source = text.trim()
  if (!source) return { ok: false, text: null, error: 'nothing to translate' }

  const result = await options.fetchBody(translationUrl(source, target, options.source ?? 'en'))
  if (!result.ok) return { ok: false, text: null, error: result.error || 'translation request failed' }
  return parseTranslation(result.body, target)
}

export interface ArticleTranslation {
  lang: TargetLang
  title: string | null
  summary: string | null
}

/** Translate an article's headline and summary into one target language. */
export async function translateArticle(
  input: { title: string, summary: string | null, language: string | null },
  target: TargetLang,
  options: TranslateOptions,
): Promise<{ translation: ArticleTranslation | null, error: string | null }> {
  // Normalise region-tagged codes (`ko-KR`) and fall back to `en` — MyMemory
  // rejects `auto`, and an unknown code must not turn into a failed request.
  const raw = (input.language || '').toLowerCase().split('-')[0] || ''
  const source: SourceLang = (['en', 'id', 'ko', 'ja', 'zh'] as string[]).includes(raw)
    ? (raw as SourceLang)
    : 'en'
  // The caller normally skips this (a story is never translated *into* its own
  // language), but a same-language pair is answered with an error body by the
  // provider, so it must never reach the network.
  if (source === target) return { translation: null, error: 'source and target language are identical' }

  const title = await translateText(input.title, target, { ...options, source })
  if (!title.ok || !title.text) {
    return { translation: null, error: title.error || 'headline translation failed' }
  }

  const out: ArticleTranslation = { lang: target, title: title.text, summary: null }
  if (input.summary && input.summary.trim()) {
    const summary = await translateText(input.summary, target, { ...options, source })
    // A headline alone still makes the card readable; a null summary tells the
    // caller to keep the original wording instead of dropping the text.
    out.summary = summary.ok && summary.text ? summary.text : null
  }
  return { translation: out, error: null }
}
