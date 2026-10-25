import { validateExternalUrl } from '../url'

/**
 * Generic RSS 2.0 / Atom feed adapter (§4, §5).
 *
 * A publisher's own feed is the cleanest discovery signal there is: the link
 * it carries is already the original article URL, on the publisher's host, so
 * nothing has to be resolved through a redirector that we may not even be
 * allowed to fetch.
 *
 * EUC-KR handling: some Korean publishers (e.g. Newsen) send `Content-Type:
 * text/xml` without a charset parameter, causing the HTTP layer to default to
 * UTF-8. The XML prolog may declare `encoding="euc-kr"`, which means the
 * string is garbled. `parseFeedItems` accepts an optional `rawBytes` argument;
 * when present, it checks the prolog and re-decodes through TextDecoder if
 * the encoding differs from what was assumed at the HTTP layer.
 */

export interface FeedItem {
  title: string
  /** The publisher's own article URL — not a redirect wrapper. */
  link: string
  /** RFC-822 / ISO publication time as the feed wrote it. */
  published: string | null
  summary: string | null
  /** Publisher declared by the feed (hint only — the resolved host decides). */
  sourceName: string | null
  sourceUrl: string | null
  guid: string | null
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  const value = match?.[1]
  return value ? decodeEntities(value.trim()) : null
}

/** A link we would actually be allowed to fetch later. */
function usableLink(raw: string | null): string | null {
  if (!raw) return null
  const check = validateExternalUrl(raw)
  return check.ok ? check.url.toString() : null
}

/**
 * Extract the encoding declared in an XML prolog (e.g. `<?xml version="1.0" encoding="EUC-KR"?>`).
 * Returns the encoding name lowercased, or null if not declared.
 */
export function extractXmlEncoding(xmlString: string): string | null {
  const match = xmlString.match(/<\?xml[^>]+encoding=['"]([^'"]+)['"]/i)
  return match?.[1]?.toLowerCase() ?? null
}

/**
 * Re-decode raw bytes using the specified encoding.
 * Falls back to UTF-8 if the declared encoding is not supported.
 */
export function reencodeXmlFromBytes(bytes: Uint8Array, declaredEncoding: string): string {
  try {
    return new TextDecoder(declaredEncoding).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export function parseFeedItems(xml: string, rawBytes?: Uint8Array): FeedItem[] {
  // If rawBytes are provided, check whether the XML declares a non-UTF-8
  // encoding (e.g. EUC-KR from Newsen). If so, re-decode from the raw bytes
  // so we parse the correctly-encoded text instead of the garbled UTF-8 string.
  if (rawBytes && rawBytes.byteLength > 0) {
    const enc = extractXmlEncoding(xml)
    if (enc && enc !== 'utf-8' && enc !== 'utf8') {
      xml = reencodeXmlFromBytes(rawBytes, enc)
    }
  }

  const items: FeedItem[] = []

  const rssBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  for (const block of rssBlocks) {
    const title = tag(block, 'title')
    const link = usableLink(tag(block, 'link'))
    if (!title || !link) continue
    const sourceMatch = block.match(/<source(?:\s[^>]*)?url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i)
    items.push({
      title,
      link,
      published: tag(block, 'pubDate') || tag(block, 'dc:date') || tag(block, 'published'),
      summary: tag(block, 'description') || tag(block, 'content:encoded'),
      sourceName: sourceMatch?.[2] ? decodeEntities(sourceMatch[2].trim()) : null,
      sourceUrl: sourceMatch?.[1] || null,
      guid: tag(block, 'guid'),
    })
  }
  if (items.length) return items

  // Atom has no <item>/<link>text</link>; the URL lives in an attribute.
  const entryBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  for (const block of entryBlocks) {
    const title = tag(block, 'title')
    const href = /<link[^>]+href\s*=\s*["']([^"']+)["']/i.exec(block)?.[1]
    const link = usableLink(href ? decodeEntities(href) : null)
    if (!title || !link) continue
    items.push({
      title,
      link,
      published: tag(block, 'published') || tag(block, 'updated'),
      summary: tag(block, 'summary') || tag(block, 'content'),
      sourceName: null,
      sourceUrl: null,
      guid: tag(block, 'id'),
    })
  }
  return items
}
