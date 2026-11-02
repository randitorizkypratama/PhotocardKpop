import { validateExternalUrl } from '../url'

/**
 * Bing News RSS adapter — a *discovery* mechanism, never a source of truth
 * (§4, §5). It stands in for Naver Search, which is unreachable from this
 * region: one query returns several publishers' coverage of the same event,
 * which is exactly the corroboration funnel the verification score needs.
 *
 * Two details matter for correctness:
 *  - Every item's `<link>` is a Bing redirect (`/news/apiclick.aspx?…&url=…`)
 *    that embeds the *publisher's* URL percent-encoded. The adapter decodes it
 *    so domain classification, robots.txt and citations all refer to the real
 *    publisher — and refuses to hand back a Bing/MSN host of its own.
 *  - Everything returned is still only a candidate: the article page is
 *    fetched, robots-checked and verified like any other discovery path.
 */

export interface BingNewsItem {
  title: string
  /** The bing.com/news/apiclick.aspx redirect URL as published in the feed. */
  link: string
  /** RFC-822 publication time as written by Bing. */
  pubDate: string | null
  /** Publisher name declared by the feed (hint only — must be verified). */
  sourceName: string | null
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

/**
 * The Bing News search feed for a query. Built by hand rather than with
 * URLSearchParams so the result is exactly the documented form: `q`
 * percent-encoded (+ for spaces) and `format=RSS` left readable — quotes stay
 * `%22`, which is what keeps an ambiguous alias like "IVE" literal.
 */
export function bingNewsFeedUrl(query: string): string {
  const q = encodeURIComponent(query).replace(/%20/g, '+')
  return `https://www.bing.com/news/search?q=${q}&format=RSS`
}

export function parseBingNewsRss(xml: string): BingNewsItem[] {
  const items: BingNewsItem[] = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  for (const block of blocks) {
    const link = tag(block, 'link')
    const title = tag(block, 'title')
    if (!link || !title) continue
    // Bing declares the publisher in a namespaced `<News:Source>` tag rather
    // than Google's `<source url=…>`.
    const sourceMatch = block.match(/<News:Source(?:\s[^>]*)?>([\s\S]*?)<\/News:Source>/i)
    const sourceNameValue = sourceMatch?.[1]
    items.push({
      title,
      link,
      pubDate: tag(block, 'pubDate'),
      sourceName: sourceNameValue ? decodeEntities(sourceNameValue.trim()) : null,
      description: tag(block, 'description'),
      guid: tag(block, 'guid'),
    })
  }
  return items
}

/**
 * Extract the publisher's URL from a Bing `apiclick.aspx` redirect. Returns
 * `null` when the link is not such a redirect, the payload is not a usable
 * http(s) URL (private networks are rejected by `validateExternalUrl`), or
 * the target is Bing/MSN itself — an interstitial is not an article.
 */
export function decodeBingArticleUrl(link: string): string | null {
  if (!/^https?:\/\/(?:www\.)?bing\.com\/news\/apiclick\.aspx(?:\?|$)/i.test(link)) return null
  const match = /[?&]url=([^&"'\s]+)/i.exec(link)
  const encoded = match?.[1]
  if (!encoded) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(encoded)
  } catch {
    return null
  }
  const check = validateExternalUrl(decoded)
  if (!check.ok) return null

  const host = check.url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'bing.com' || host.endsWith('.bing.com')) return null
  if (host === 'msn.com' || host.endsWith('.msn.com')) return null
  return check.url.toString()
}
