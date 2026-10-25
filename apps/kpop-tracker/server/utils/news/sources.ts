import type { ArtistId, SourceTrust } from './types'

/**
 * Configurable source registry (§4).
 *
 * Two things a source record must never be judged by: a display name and a
 * domain string quoted inside an untrusted article. Registry entries are
 * written here by hand, matched against the domain we *actually resolved*,
 * and carry a trust class that is only ever one input to the score.
 */

export type SourceType =
  | 'official_agency'
  | 'official_channel'
  | 'discovery'
  | 'news_publisher'
  | 'wire'

export type RetrievalMethod = 'rss' | 'http_html' | 'youtube_api' | 'none'

export interface SourceRecord {
  id: string
  displayName: string
  /** Registrable domains (no scheme, no www). Compared after resolution. */
  domains: string[]
  type: SourceType
  trust: SourceTrust
  supportedArtists: ArtistId[] | 'all'
  retrieval: RetrievalMethod
  /** Where the official profile links were validated from, when applicable. */
  officialProfileUrls: string[]
  /** Points awarded by score component A when the claim is within its knowledge. */
  credibilityPoints: number
  /**
   * The publisher's own RSS/Atom feeds (§4 discovery). Links in these feeds
   * are already original article URLs, so no redirector has to be followed.
   */
  feedUrls?: string[]
  /**
   * Publisher sitemaps (§4 discovery). Used only where the publisher offers
   * no usable feed; robots.txt is checked before each fetch like every other
   * URL, and only entries carrying a publication date are considered.
   */
  sitemapUrls?: string[]
  lastSuccessfulRetrieval?: string | null
  notes?: string
}

export const SOURCE_REGISTRY: SourceRecord[] = [
  {
    id: 'sm_entertainment',
    displayName: 'SM Entertainment',
    domains: ['smentertainment.com'],
    type: 'official_agency',
    trust: 'primary_official',
    supportedArtists: ['aespa', 'hearts2hearts'],
    retrieval: 'http_html',
    officialProfileUrls: ['https://www.smentertainment.com/'],
    credibilityPoints: 25,
    notes: 'Primary source for its own artists\u2019 announcements only. robots.txt allows only `/`, so discovery stops at the homepage (its feed is never requested).',
  },
  {
    id: 'starship_entertainment',
    displayName: 'Starship Entertainment',
    domains: ['starship-ent.com'],
    type: 'official_agency',
    trust: 'primary_official',
    supportedArtists: ['ive'],
    retrieval: 'http_html',
    officialProfileUrls: ['https://www.starship-ent.com/'],
    credibilityPoints: 25,
    notes: 'Primary source for its own artists\u2019 announcements only. The site is a JS shell (sitemap included), so no article list can be crawled.',
  },
  {
    id: 'google_news',
    displayName: 'Google News',
    domains: ['news.google.com'],
    type: 'discovery',
    trust: 'discovery_only',
    supportedArtists: 'all',
    retrieval: 'rss',
    officialProfileUrls: ['https://news.google.com/'],
    credibilityPoints: 0,
    notes: 'Discovery mechanism only. Never evidence for a claim. Its robots.txt disallows /rss/search, so the configured per-artist feeds are requested through the robots check and normally record `blocked` instead of being fetched.',
  },
  {
    id: 'yonhap_en',
    displayName: 'Yonhap News Agency',
    domains: ['en.yna.co.kr', 'yna.co.kr'],
    type: 'wire',
    trust: 'primary_wire',
    supportedArtists: 'all',
    retrieval: 'rss',
    officialProfileUrls: ['https://en.yna.co.kr/'],
    credibilityPoints: 20,
    feedUrls: ['https://en.yna.co.kr/RSS/news.xml'],
  },
  {
    id: 'soompi',
    displayName: 'Soompi',
    domains: ['soompi.com'],
    type: 'news_publisher',
    trust: 'secondary_reputable',
    supportedArtists: 'all',
    retrieval: 'rss',
    officialProfileUrls: ['https://www.soompi.com/'],
    credibilityPoints: 18,
    feedUrls: [
      'https://www.soompi.com/feed',
      'https://www.soompi.com/feed?paged=2',
      'https://www.soompi.com/feed?paged=3',
    ],
    notes: 'K-pop-native publisher; its feed is the main discovery path for all three artists.',
  },
  {
    id: 'billboard',
    displayName: 'Billboard',
    domains: ['billboard.com'],
    type: 'news_publisher',
    trust: 'secondary_reputable',
    supportedArtists: 'all',
    retrieval: 'rss',
    officialProfileUrls: ['https://www.billboard.com/'],
    credibilityPoints: 18,
    feedUrls: ['https://www.billboard.com/feed/'],
    notes: 'Chart and comeback coverage; English-language.',
  },
  {
    id: 'naver_news',
    displayName: 'Naver News',
    domains: ['naver.com', 'news.naver.com'],
    type: 'news_publisher',
    trust: 'secondary_reputable',
    supportedArtists: 'all',
    retrieval: 'none',
    officialProfileUrls: ['https://news.naver.com/'],
    credibilityPoints: 18,
    notes: 'Aggregator with robots.txt `Disallow: /` for every agent — no request is made to it. Registered only so a naver.com URL is recognised (and its fetch refused) rather than treated as an unknown host.',
  },
  {
    id: 'korea_joongang_daily',
    displayName: 'Korea JoongAng Daily',
    domains: ['koreajoongangdaily.joins.com', 'koreajoongangdaily.com', 'joongang.co.kr'],
    type: 'news_publisher',
    trust: 'secondary_reputable',
    supportedArtists: 'all',
    retrieval: 'http_html',
    officialProfileUrls: ['https://koreajoongangdaily.joins.com/'],
    credibilityPoints: 18,
    sitemapUrls: [
      // Declared in its robots.txt: a Google News sitemap (10 newest items,
      // with <news:title> and <news:publication_date>) plus the newest chunk
      // of the article sitemap, whose slugs carry the headline keywords.
      'https://www.koreajoongangdaily.com/tag/korea/business/lifestyle/entertainment/sports/opinion/world/?lab_viewport=newssitemap',
      'https://www.koreajoongangdaily.com/sitemap.xml',
    ],
    notes: 'No RSS feed. Discovery runs off its declared sitemaps; every candidate URL is re-fetched and re-matched before it can score.',
  },
  {
    id: 'korea_herald',
    displayName: 'The Korea Herald',
    domains: ['koreaherald.com'],
    type: 'news_publisher',
    trust: 'secondary_reputable',
    supportedArtists: 'all',
    retrieval: 'rss',
    officialProfileUrls: ['https://www.koreaherald.com/'],
    credibilityPoints: 18,
    feedUrls: ['https://www.koreaherald.com/rss/newsAll'],
    notes: 'English-language daily; the feed linked from its own page (robots.txt allows /).',
  },
]

/** Hosts that are permitted to be discovered but never count as a source. */
export const DISCOVERY_HOSTS = new Set(['news.google.com'])

/** K-pop-native publishers — their identity supplies context for §3 matching. */
const KPOP_CONTEXT_HOSTS = new Set(['soompi.com'])

/** Hosts with no registrable suffix we should treat as a news publisher. */
function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, '').split('.')
  if (parts.length <= 2) return parts.join('.')
  // Co.uk / joongang.co.kr style suffixes handled by explicit registry entries
  // first (exact match below), so a two-label tail is a good enough fallback.
  return parts.slice(-2).join('.')
}

/**
 * Resolve the *actual* host of a fetched URL to a registry entry.
 * Matching is exact on registrable domain — an attacker-controlled
 * `smentertainment.com.evil.example` never resolves to the agency.
 */
export function classifySource(hostname: string | null | undefined): SourceRecord | null {
  if (!hostname) return null
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const registrable = registrableDomain(host)
  for (const record of SOURCE_REGISTRY) {
    for (const domain of record.domains) {
      if (host === domain || registrable === domain) return record
    }
  }
  return null
}

export function isKpopContextSource(hostname: string | null | undefined): boolean {
  if (!hostname) return false
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return KPOP_CONTEXT_HOSTS.has(host) || registrableDomain(host) === 'smentertainment.com' || registrableDomain(host) === 'starship-ent.com'
}

/** The agency that represents an artist, for primary-source checks. */
export function agencyForArtist(artistId: ArtistId): SourceRecord | null {
  return SOURCE_REGISTRY.find(record =>
    record.type === 'official_agency'
    && Array.isArray(record.supportedArtists)
    && record.supportedArtists.includes(artistId),
  ) || null
}

/** Registry entry for a known K-pop publisher, if any. */
export function sourceForDomain(hostname: string | null | undefined): SourceRecord | null {
  return classifySource(hostname)
}
