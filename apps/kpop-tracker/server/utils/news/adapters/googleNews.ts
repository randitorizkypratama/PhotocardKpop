import { validateExternalUrl } from '../url'

/**
 * Google News RSS adapter — a *discovery* mechanism, never a source of truth
 * (§4, §5). Everything it returns is a candidate: the item still has to be
 * resolved to its original publisher and inspected before it can score even a
 * single point for source credibility.
 */

export interface GoogleNewsItem {
  title: string
  /** The news.google.com redirect URL as published in the feed. */
  link: string
  /** RFC-822 publication time as written by Google. */
  pubDate: string | null
  /** Publisher name declared by the feed (hint only — must be verified). */
  sourceName: string | null
  /** Publisher domain declared by the feed (hint only). */
  sourceUrl: string | null
  description: string | null
  guid: string | null
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  const value = match?.[1]
  return value ? decodeEntities(value.trim()) : null
}

export function googleNewsFeedUrl(query: string, options: { hl?: string, gl?: string, ceid?: string } = {}): string {
  const hl = options.hl || 'en-US'
  const gl = options.gl || 'US'
  const ceid = options.ceid || `${gl}:${hl.split('-')[0]}`
  // Built by hand rather than with URLSearchParams so the result is exactly
  // the documented form: `q` percent-encoded (+ for spaces), `ceid=US:en`
  // left readable. Quotes in a query stay `%22`, which is what keeps an
  // ambiguous alias like "IVE" literal.
  const q = encodeURIComponent(query).replace(/%20/g, '+')
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`
}

export function parseGoogleNewsRss(xml: string): GoogleNewsItem[] {
  const items: GoogleNewsItem[] = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  for (const block of blocks) {
    const link = tag(block, 'link')
    const title = tag(block, 'title')
    if (!link || !title) continue
    const sourceMatch = block.match(/<source(?:\s[^>]*)?url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i)
    const sourceUrlValue = sourceMatch?.[1]
    const sourceNameValue = sourceMatch?.[2]
    items.push({
      title,
      link,
      pubDate: tag(block, 'pubDate'),
      sourceName: sourceNameValue ? decodeEntities(sourceNameValue.trim()) : null,
      sourceUrl: sourceUrlValue ?? null,
      description: tag(block, 'description'),
      guid: tag(block, 'guid'),
    })
  }
  return items
}

/**
 * Older Google News article links embed the target URL base64-encoded in the
 * path. When the payload does not contain a URL (the current format), return
 * `null` and let the caller resolve it by following the HTTP redirect chain —
 * which is validated hop by hop like every other request.
 */
export function decodeGoogleNewsUrl(link: string): string | null {
  const match = /\/(?:rss\/)?articles\/([A-Za-z0-9_\-]+=*)/.exec(link)
  const encoded = match?.[1]
  if (!encoded) return null
  let payload = encoded.replace(/-/g, '+').replace(/_/g, '/')
  while (payload.length % 4 !== 0) payload += '='

  let decoded: string
  try {
    decoded = Buffer.from(payload, 'base64').toString('utf-8')
  } catch {
    return null
  }
  const urlMatch = decoded.match(/https?:\/\/[^\s"'<>]+/)
  if (!urlMatch) return null
  // Trim protobuf trailing bytes that are not part of the URL.
  const candidate = urlMatch[0].replace(/[\x00-\x1f]+$/, '')
  const check = validateExternalUrl(candidate)
  return check.ok ? check.url.toString() : null
}
