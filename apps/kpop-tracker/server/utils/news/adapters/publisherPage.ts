import { stripHtml } from '../text'
import { validateExternalUrl } from '../url'

/**
 * Publisher page adapter (§5, §9E/§9F).
 *
 * Reads the metadata a newsroom's own page declares — canonical URL, Open
 * Graph image, publication time, JSON-LD — and the body text, so the verifier
 * can say "the article was retrieved and inspected" honestly instead of
 * inferring anything from a Google News headline.
 */

export interface ArticleMeta {
  canonicalUrl: string | null
  title: string | null
  description: string | null
  siteName: string | null
  /** The publisher's own image for this story (og:image / JSON-LD). */
  imageUrl: string | null
  imageCaption: string | null
  publishedTime: string | null
  modifiedTime: string | null
  author: string | null
  /** Plain text of the article body — its length is the "was inspected" test. */
  bodyText: string
  bodyLength: number
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]+content\\s*=\\s*["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]+(?:property|name)\\s*=\\s*["']${key}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) return decode(match[1])
  }
  return null
}

function numericEntity(hex: string | undefined, decimal: string | undefined): string {
  const code = hex !== undefined ? Number.parseInt(hex, 16) : Number(decimal)
  return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ''
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    // Headlines carry numeric references (`&#8212;` for a dash): storing them
    // raw would put markup in the title the feed prints.
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => numericEntity(hex, undefined))
    .replace(/&#(\d+);/g, (_match, decimal: string) => numericEntity(undefined, decimal))
    .trim()
}

function absoluteUrl(value: string | null, base: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

function firstJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const blocks = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const block of blocks) {
    const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')
    try {
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as any)['@graph']) ? (parsed as any)['@graph'] : [parsed])
      for (const entry of list) {
        if (entry && typeof entry === 'object') out.push(entry as Record<string, unknown>)
      }
    } catch {
      // Malformed JSON-LD is common; the meta tags below still carry the data.
    }
  }
  return out
}

function pickImage(value: unknown, base: string): string | null {
  if (typeof value === 'string') return absoluteUrl(value, base)
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = pickImage(entry, base)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return pickImage(record.url ?? record.contentUrl ?? record['@id'], base)
  }
  return null
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = asString(entry)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return asString(record.name)
  }
  return null
}

/** Body text: article-ish containers first, then whatever is left. */
function extractBodyText(html: string): string {
  const candidates = [
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
    /<div[^>]+class\s*=\s*["'][^"']*(?:article[-_ ]?body|story[-_ ]?body|news[-_ ]?content|post[-_ ]?content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  ]
  for (const pattern of candidates) {
    const match = pattern.exec(html)
    if (match && match[1]) {
      const text = stripHtml(match[1])
      if (text.length > 200) return text
    }
  }
  // Fallback: strip the whole document (nav included) — only its *length* is
  // used, to tell "we read the article" from "we saw a headline".
  return stripHtml(html)
}

export function parseArticleMeta(html: string, pageUrl: string): ArticleMeta {
  const jsonLd = firstJsonLd(html)
  const newsLd = jsonLd.find(entry => {
    const type = entry['@type']
    const types = Array.isArray(type) ? type : [type]
    return types.some(value => typeof value === 'string' && /Article|NewsArticle|ReportageNewsArticle|BlogPosting|WebPage/i.test(value))
  }) || null

  const rawCanonical = metaContent(html, 'og:url')
    || (html.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i)?.[1] || null)
    || (newsLd ? asString(newsLd.mainEntityOfPage) : null)
  const canonicalUrl = absoluteUrl(rawCanonical ? decode(rawCanonical) : null, pageUrl)

  const rawTitleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = metaContent(html, 'og:title')
    || (newsLd ? asString(newsLd.headline) : null)
    || (rawTitleTag ? decode(rawTitleTag) : null)

  const description = metaContent(html, 'og:description')
    || metaContent(html, 'description')
    || (newsLd ? asString(newsLd.description) : null)

  const siteName = metaContent(html, 'og:site_name')
    || (newsLd ? asString((newsLd.publisher as Record<string, unknown> | undefined)?.name) : null)

  const imageUrl = absoluteUrl(metaContent(html, 'og:image'), pageUrl)
    || (newsLd ? pickImage(newsLd.image, pageUrl) : null)

  const publishedTime = metaContent(html, 'article:published_time')
    || metaContent(html, 'datePublished')
    || (newsLd ? asString(newsLd.datePublished) : null)
    || (html.match(/<time[^>]+datetime\s*=\s*["']([^"']+)["']/i)?.[1] || null)

  const modifiedTime = metaContent(html, 'article:modified_time')
    || (newsLd ? asString(newsLd.dateModified) : null)

  const author = metaContent(html, 'article:author')
    || metaContent(html, 'author')
    || (newsLd ? asString(newsLd.author) : null)

  const imageCaption = metaContent(html, 'og:image:alt')
    || metaContent(html, 'image:alt')

  const bodyText = extractBodyText(html)

  return {
    canonicalUrl,
    title: title ? decode(title).trim() : null,
    description: description ? decode(description) : null,
    siteName: siteName ? decode(siteName) : null,
    imageUrl,
    imageCaption: imageCaption ? decode(imageCaption) : null,
    publishedTime: publishedTime ? publishedTime.trim() : null,
    modifiedTime: modifiedTime ? modifiedTime.trim() : null,
    author: author ? decode(author) : null,
    bodyText,
    bodyLength: bodyText.length,
  }
}

/**
 * Article links on an official agency site (§4 primary sources). Relative
 * links are resolved; only same-host links are kept so a footer link to a
 * social network can never be mistaken for an announcement.
 */
export function extractOfficialLinks(html: string, baseUrl: string): Array<{ url: string, text: string }> {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  const links: Array<{ url: string, text: string }> = []
  const anchors = html.match(/<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi) || []
  const seen = new Set<string>()
  for (const anchor of anchors) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(anchor)?.[1]
    const text = stripHtml(anchor.replace(/^<a[^>]*>/i, '').replace(/<\/a>$/i, '')).trim()
    if (!href || !text || text.length < 8) continue
    let resolved: URL
    try {
      resolved = new URL(href, base)
    } catch {
      continue
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') continue
    if (resolved.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue
    resolved.hash = ''
    const check = validateExternalUrl(resolved.toString())
    if (!check.ok) continue
    const key = check.url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ url: key, text: text.replace(/\s+/g, ' ').slice(0, 200) })
  }
  return links
}
