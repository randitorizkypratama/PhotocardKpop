/**
 * Sitemap adapter (§4) — discovery for publishers that offer no usable feed.
 *
 * Only what discovery needs: the URL of each entry, its modification date, and
 * — when the publisher publishes a Google News sitemap — the headline and
 * publication date it declares itself. Nothing here is treated as evidence;
 * every entry still has to be fetched, matched and verified like any other
 * candidate.
 */

export interface SitemapEntry {
  /** Article URL (entity-decoded, still subject to URL validation later). */
  loc: string
  /** `<lastmod>` when present. */
  lastmod: string | null
  /** `<news:title>` when the entry is part of a Google News sitemap. */
  title: string | null
  /** `<news:publication_date>` when present. */
  publishedAt: string | null
}

export interface ParsedSitemap {
  kind: 'urlset' | 'index'
  entries: SitemapEntry[]
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
}

function inner(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  const value = match?.[1]?.trim()
  return value ? decodeEntities(value) : null
}

/** `<url>` (urlset) and `<sitemap>` (index) blocks, in document order. */
function blocks(xml: string, tag: 'url' | 'sitemap'): string[] {
  return xml.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'gi')) || []
}

export function parseSitemap(xml: string): ParsedSitemap {
  const urlBlocks = blocks(xml, 'url')
  if (urlBlocks.length > 0) {
    const entries: SitemapEntry[] = []
    for (const block of urlBlocks) {
      const loc = inner(block, 'loc')
      if (!loc) continue
      entries.push({
        loc,
        lastmod: inner(block, 'lastmod'),
        title: inner(block, 'news:title'),
        publishedAt: inner(block, 'news:publication_date'),
      })
    }
    return { kind: 'urlset', entries }
  }

  return {
    kind: 'index',
    entries: blocks(xml, 'sitemap').map(block => ({
      loc: inner(block, 'loc') || '',
      lastmod: inner(block, 'lastmod'),
      title: null,
      publishedAt: null,
    })).filter(entry => entry.loc),
  }
}

/**
 * URL path as readable words, so a sitemap without headlines can still be
 * screened for an artist slug ("…/aespa-…", "…/ive-…"). Screening only — the
 * page itself decides whether the story is really about the artist.
 */
export function slugAsText(url: string): string {
  let path = url
  try {
    path = new URL(url).pathname
  } catch { /* keep the raw value; it is screened anyway */ }
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    decoded = path
  }
  return decoded
    .replace(/\.(html?|php)$/i, '')
    .replace(/[-_+/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
