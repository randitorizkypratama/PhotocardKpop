import { parseArticleMeta } from '../adapters/publisherPage'
import { safeFetch } from '../fetchSafe'
import { isRenderableMediaUrl, validateExternalUrl } from '../url'
import type { RewriteImageInput, RewriteMaterial, RewriteSourceInput } from './types'

/**
 * Build the material a model is allowed to see for one story.
 *
 * Three rules decide what gets in:
 *  - the primary article is always source index 0, so a rewrite can never be
 *    source-less;
 *  - an image is only offered when its URL is renderable (https, public host)
 *    and it came from evidence we collected — so the credit we store is real;
 *  - the body is re-read from the live article when possible, and falls back to
 *    the stored summary when the page is unreachable. A thinner input is a
 *    limitation, never a reason to invent facts.
 */

export interface MaterialInput {
  article: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
}

export interface MaterialOptions {
  maxInputChars?: number
  /** Injected in tests; defaults to `safeFetch`. */
  fetchBody?: (url: string) => Promise<{ ok: boolean, body: string, error: string | null }>
  /** Skip the live fetch entirely (dry runs against a dead URL, tests). */
  fetchArticle?: boolean
}

function str(value: unknown): string | null {
  return value == null || value === '' ? null : String(value)
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function defaultFetchBody(url: string): Promise<{ ok: boolean, body: string, error: string | null }> {
  const result = await safeFetch(url, {
    timeoutMs: 8000,
    retries: 1,
    maxBytes: 1048576,
    acceptContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain'],
  })
  return { ok: result.ok, body: result.body, error: result.error }
}

export async function buildRewriteMaterial(
  input: MaterialInput,
  options: MaterialOptions = {},
): Promise<RewriteMaterial> {
  const { article } = input
  const maxChars = options.maxInputChars ?? 6000

  const sourceUrl = str(article.original_url) || ''
  const publisherName = str(article.publisher_name)
  const publisherDomain = str(article.publisher_domain)
  const originalTitle = str(article.original_title) || '(tanpa judul)'
  const publishedAt = str(article.published_at)

  const sources: RewriteSourceInput[] = [{
    sourceUrl,
    publisherName,
    publisherDomain,
    originalTitle,
    publishedAt,
  }]

  const corroborations = parseJson<Array<Record<string, unknown>>>(article.corroborations, [])
  for (const entry of corroborations) {
    const url = str(entry.url)
    if (!url) continue
    if (sources.some(source => source.sourceUrl === url)) continue
    if (!validateExternalUrl(url).ok) continue
    if (sources.length >= 6) break
    sources.push({
      sourceUrl: url,
      publisherName: null,
      publisherDomain: str(entry.publisherDomain),
      originalTitle: null,
      publishedAt: null,
    })
  }

  const images: RewriteImageInput[] = []
  const seen = new Set<string>()
  for (const row of input.evidence) {
    const imageUrl = str(row.image_url)
    if (!imageUrl || !isRenderableMediaUrl(imageUrl) || seen.has(imageUrl)) continue
    const pageUrl = str(row.source_url)
    if (!pageUrl || !validateExternalUrl(pageUrl).ok) continue
    seen.add(imageUrl)
    images.push({
      imageUrl,
      sourceUrl: pageUrl,
      creditText: str(row.source_name) || str(row.creator_or_publisher) || publisherName || publisherDomain,
      creditUrl: pageUrl,
      caption: str(row.original_caption) || str(row.evidence_description),
    })
    if (images.length >= 4) break
  }

  // A fresh read gives the model real paragraphs; the stored summary is the
  // floor when the publisher is unreachable right now. An official YouTube
  // upload has no article to read — the description is all there is, so there
  // is no point fetching the watch page.
  let bodyText = str(article.summary) || ''
  const isVideoUpload = (publisherDomain || '').toLowerCase() === 'youtube.com'
  if (!isVideoUpload && options.fetchArticle !== false && sourceUrl) {
    const fetchBody = options.fetchBody || defaultFetchBody
    const page = await fetchBody(sourceUrl)
    if (page.ok && page.body) {
      const meta = parseArticleMeta(page.body, sourceUrl)
      if (meta.bodyText && meta.bodyText.length > bodyText.length) bodyText = meta.bodyText
    }
  }

  return {
    articleId: String(article.id),
    artistId: String(article.artist_id || ''),
    category: String(article.category || 'other'),
    originalTitle,
    summary: str(article.summary),
    bodyText: bodyText.slice(0, maxChars),
    publisherName,
    publisherDomain,
    publishedAt,
    verificationStatus: String(article.verification_status || ''),
    verificationScore: Number(article.verification_score) || 0,
    images,
    sources,
  }
}

/** Pick the image/source records a validated answer actually referenced. */
export function selectReferenced(
  material: RewriteMaterial,
  picks: Array<{ evidenceIndex: number, caption: string | null }>,
  sourceIndexes: number[],
): { images: RewriteImageInput[], sources: RewriteSourceInput[] } {
  const images = picks
    .map(pick => {
      const offered = material.images[pick.evidenceIndex]
      if (!offered) return null
      return { ...offered, caption: pick.caption ?? offered.caption }
    })
    .filter((image): image is RewriteImageInput => image !== null)

  const sources = sourceIndexes
    .map(index => material.sources[index])
    .filter((source): source is RewriteSourceInput => Boolean(source))

  // The primary source is the article itself: always present, never dropped.
  if (sources.length === 0 && material.sources[0]) sources.push(material.sources[0])

  return { images, sources }
}
