import { ARTISTS, googleNewsQueryFor, matchArtist } from './artists'
import { ARTIST_IDS, type ArtistId } from './types'
import type { Corroboration, NewsArticle, NewsClaim, NewsEvidence, NewsStatus, VerificationInput } from './types'
import { newsConfig, type NewsConfig } from './config'
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from './fetchSafe'
import { decodeGoogleNewsUrl, googleNewsFeedUrl, parseGoogleNewsRss } from './adapters/googleNews'
import { parseFeedItems } from './adapters/rssFeed'
import { parseSitemap, slugAsText } from './adapters/sitemap'
import { naverNewsUrl, naverSearchHeaders, parseNaverNews } from './adapters/naver'
import { parsePlaylistItems, playlistItemsUrl, uploadsPlaylistId } from './adapters/youtube'
import { extractOfficialLinks, parseArticleMeta, type ArticleMeta } from './adapters/publisherPage'
import { extractClaims } from './claims'
import { canonicalizeUrl, hostnameOf, validateExternalUrl } from './url'
import { articleIdFor, detectPromptInjection, normalizeNewsTitle, storyKey } from './text'
import { isPlausiblePublicationDate, parsePublicationDate } from './dates'
import { agencyForArtist, classifySource, isKpopContextSource, SOURCE_REGISTRY, sourceRecordCoversHost, type SourceRecord } from './sources'
import { findDuplicate, isIndependentCorroboration, isSameEvent, type ExistingStory } from './dedupe'
import { buildAuditRecord, verifyCandidate } from './verify'
import { parseRobots, robotsAllows, type RobotsPolicy } from './robots'
import { TARGET_LANGS, translateArticle } from './translate'
import * as store from './store'

/**
 * The ingestion + verification pipeline (§13).
 *
 * Ordered exactly as specified: fetch → normalize → artist match → dedupe →
 * original source → claims → evidence → corroboration → contradictions →
 * score → hard gates → publish → audit. Every step either produces a fact or
 * records a limitation; nothing is invented when a source is unavailable.
 */

export interface IngestionOptions {
  artists?: ArtistId[]
  /** Upper bound on stories processed in this invocation. */
  maxArticles?: number
  fetchImpl?: typeof fetch
  now?: Date
  /** Injected sleep (tests) — default is a real timer. */
  sleep?: (ms: number) => Promise<void>
}

export interface IngestionSummary {
  startedAt: string
  finishedAt: string
  status: 'ok' | 'partial' | 'error'
  discovered: number
  verified: number
  rejected: number
  pending: number
  fetchFailed: number
  rechecked: number
  messages: string[]
  sources: Array<{ id: string, availability: string, itemCount: number, error: string | null }>
}

interface SourcePage {
  url: string
  canonicalUrl: string | null
  host: string
  /** Publisher name declared by the discovery feed. */
  declaredName: string | null
  record: SourceRecord | null
  meta: ArticleMeta | null
  fetched: boolean
  error: string | null
  fetchedAt: string
  feedTitle: string
  feedPubDate: string | null
  inspectedBodyLength: number
}

interface RunStory {
  artistId: ArtistId
  title: string
  summary: string | null
  sources: SourcePage[]
  discoveredAt: string
  feedPubDate: string | null
  injection: boolean
}

interface RunContext {
  cfg: NewsConfig
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  robots: Map<string, RobotsPolicy | null>
  startedAt: Date
  deadline: number
  /** Last request time per host — enforces `hostMinIntervalMs`. */
  lastRequestAt: Map<string, number>
  /** Hosts that answered 429, left alone until this timestamp. */
  coolDownUntil: Map<string, number>
  /** Bodies already retrieved in this run (feeds repeat across artists). */
  bodyCache: Map<string, SafeFetchResult>
}

function nowIso(date = new Date()): string {
  return date.toISOString()
}

/** A failed translation is retried after this long, not on every run. */
const RETRY_FAILED_TRANSLATION_MS = 6 * 60 * 60 * 1000

/**
 * How many of a story's sources are inspected in one run.
 *
 * Independent corroboration needs three publishers besides the primary before
 * a secondary source can clear `min_score` (18 + 25 + 20 + 15 + 10 + 5 = 93),
 * so the primary plus three others is the smallest inspection set that can
 * ever publish a story the agency did not announce itself.
 */
const MAX_INSPECTED_SOURCES = 4

function outOfBudget(ctx: RunContext): boolean {
  return Date.now() > ctx.deadline
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * robots.txt is loaded once per host per run. If it cannot be fetched we
 * proceed (RFC 9309) — but a policy that *does* disallow a path is honoured.
 */
async function robotsFor(origin: string, ctx: RunContext): Promise<RobotsPolicy | null> {
  if (ctx.robots.has(origin)) return ctx.robots.get(origin) ?? null
  const result = await pacedFetch(`${origin}/robots.txt`, ctx, {
    timeoutMs: Math.min(ctx.cfg.fetchTimeoutMs, 4000),
    retries: 0,
    maxBytes: 65536,
    maxRedirects: 3,
    acceptContentTypes: ['text/plain', 'text/html', '*/*'],
  })
  const policy = result.ok ? parseRobots(result.body) : null
  ctx.robots.set(origin, policy)
  return policy
}

/**
 * Every outbound request passes through here, so politeness is a property of
 * the pipeline rather than of each call site:
 *
 *  - one request at a time per host, spaced `hostMinIntervalMs` apart;
 *  - a host that answered 429 is left alone for `hostCooldownMs`;
 *  - a body already fetched in this run is served from memory, so the three
 *    artists share one request per feed instead of three.
 *
 * The wait is a *single* sleep computed from the clock — never a spin loop —
 * which also keeps injected (instant) sleeps in tests safe.
 */
async function pacedFetch(url: string, ctx: RunContext, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const cached = ctx.bodyCache.get(url)
  if (cached) return cached

  const host = hostnameOf(url) || ''
  const now = Date.now()
  const coolDownUntil = ctx.coolDownUntil.get(host) || 0
  if (now < coolDownUntil) {
    return {
      ok: false,
      status: 429,
      url,
      redirected: false,
      contentType: '',
      body: '',
      rawBytes: new Uint8Array(),
      bytes: 0,
      error: `host cooling down after 429 (${Math.ceil((coolDownUntil - now) / 1000)}s left)`,
      attempts: 0,
    }
  }

  const last = ctx.lastRequestAt.get(host) || 0
  const wait = last + ctx.cfg.hostMinIntervalMs - now
  if (wait > 0) await ctx.sleep(wait)
  ctx.lastRequestAt.set(host, Date.now())

  const result = await safeFetch(url, {
    fetchImpl: ctx.fetchImpl,
    sleep: ctx.sleep,
    ...options,
  })

  if (result.status === 429 || /upstream status 429/.test(result.error || '')) {
    ctx.coolDownUntil.set(host, Date.now() + ctx.cfg.hostCooldownMs)
  }
  if (result.ok) ctx.bodyCache.set(url, result)
  return result
}

async function fetchPage(
  url: string,
  ctx: RunContext,
  options: { asRobots?: boolean, maxBytes?: number } = {},
): Promise<SafeFetchResult> {
  const host = hostnameOf(url)
  const policy = host ? await robotsFor(`https://${host}`, ctx) : null
  const path = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return '/'
    }
  })()
  return pacedFetch(url, ctx, {
    timeoutMs: ctx.cfg.fetchTimeoutMs,
    retries: ctx.cfg.maxRetries,
    maxBytes: options.maxBytes ?? ctx.cfg.maxResponseBytes,
    allowedDomains: ctx.cfg.allowedSourceDomains.length ? ctx.cfg.allowedSourceDomains : undefined,
    isAllowedByRobots: policy ? (target: URL) => robotsAllows(policy, target.pathname) : undefined,
  })
}

function detectLanguage(text: string): string | null {
  if (!text) return null
  if (/[가-힯]/.test(text)) return 'ko'
  if (/[぀-ヿ]/.test(text)) return 'ja'
  if (/[一-鿿]/.test(text)) return 'zh'
  return 'en'
}

/** Rank sources so the strongest one becomes the story's primary source. */
function trustRank(record: SourceRecord | null): number {
  if (!record) return 0
  switch (record.trust) {
    case 'primary_official': return 4
    case 'primary_wire': return 3
    case 'secondary_reputable': return 2
    case 'discovery_only': return 0
    default: return 1
  }
}

function sortSources(sources: SourcePage[]): SourcePage[] {
  return [...sources]
    .filter(source => !source.error)
    .sort((a, b) => {
      const rank = trustRank(b.record) - trustRank(a.record)
      if (rank !== 0) return rank
      return a.url.localeCompare(b.url)
    })
}

/** Distinct publishing hosts a story was seen at — the corroboration ceiling. */
function distinctHosts(story: RunStory): number {
  return new Set(story.sources.map(source => source.host)).size
}

/** Fetch an original article page and normalize everything we can from it. */
async function loadSourcePage(input: {
  url: string
  declaredName: string | null
  feedTitle: string
  feedPubDate: string | null
}, ctx: RunContext): Promise<SourcePage> {
  const page: SourcePage = {
    url: input.url,
    canonicalUrl: null,
    host: hostnameOf(input.url) || '',
    declaredName: input.declaredName,
    record: null,
    meta: null,
    fetched: false,
    error: null,
    fetchedAt: nowIso(),
    feedTitle: input.feedTitle,
    feedPubDate: input.feedPubDate,
    inspectedBodyLength: 0,
  }
  page.record = classifySource(page.host)

  const result = await fetchPage(input.url, ctx)
  page.fetchedAt = nowIso()
  if (!result.ok) {
    page.error = result.error
    return page
  }
  page.fetched = true
  page.url = result.url
  page.host = hostnameOf(result.url) || page.host
  page.record = classifySource(page.host)
  const meta = parseArticleMeta(result.body, result.url)
  page.meta = meta
  page.canonicalUrl = meta.canonicalUrl
  page.inspectedBodyLength = meta.bodyLength
  if (!page.declaredName) page.declaredName = meta.siteName
  return page
}

/**
 * Google News links are redirects, not the publisher's URL. Try the embedded
 * payload first; otherwise follow the redirect chain (validated hop by hop).
 */
async function resolveOriginalUrl(link: string, ctx: RunContext): Promise<string | null> {
  const decoded = decodeGoogleNewsUrl(link)
  if (decoded) return decoded
  const result = await fetchPage(link, ctx)
  if (!result.ok) return null
  return result.url
}

/** Group the run's candidates into stories (§12 — no repeated stories). */
function groupIntoStories(
  candidates: Array<{ artistId: ArtistId, title: string, url: string, host: string, pubDate: string | null, declaredName: string | null, summary: string | null, discoveredAt: string }>,
): RunStory[] {
  const stories: RunStory[] = []
  for (const candidate of candidates) {
    const canonical = canonicalizeUrl(candidate.url) || candidate.url
    const identity = {
      artistId: candidate.artistId,
      title: candidate.title,
      canonicalUrl: canonical,
      publisherDomain: candidate.host,
      publishedAt: candidate.pubDate,
    }
    const existingShapes: ExistingStory[] = stories.map(story => ({
      id: story.title,
      artist_id: story.artistId,
      normalized_title: normalizeNewsTitle(story.title),
      original_url: story.sources[0]?.url || '',
      canonical_url: story.sources[0] ? (canonicalizeUrl(story.sources[0].url) || story.sources[0].url) : '',
      story_key: storyKey(story.artistId, story.title),
      published_at: story.feedPubDate,
      publisher_domain: story.sources[0]?.host || null,
      verification_status: 'DISCOVERED',
    }))
    const match = findDuplicate(identity, existingShapes)
    const injection = detectPromptInjection(`${candidate.title} ${candidate.summary || ''}`).detected
    if (match.duplicate && match.storyId) {
      const target = stories.find(story => story.title === match.storyId)
      if (target) {
        const duplicateUrl = canonicalizeUrl(candidate.url) || candidate.url
        const already = target.sources.some(source => canonicalizeUrl(source.url) === duplicateUrl)
        if (!already) {
          target.sources.push({
            url: candidate.url,
            canonicalUrl: canonical,
            host: candidate.host,
            declaredName: candidate.declaredName,
            record: classifySource(candidate.host),
            meta: null,
            fetched: false,
            error: 'not fetched — grouped as a duplicate source of this story',
            fetchedAt: nowIso(),
            feedTitle: candidate.title,
            feedPubDate: candidate.pubDate,
            inspectedBodyLength: 0,
          })
        }
        target.injection = target.injection || injection
        continue
      }
    }
    const source = {
      url: candidate.url,
      canonicalUrl: canonical,
      host: candidate.host,
      declaredName: candidate.declaredName,
      record: classifySource(candidate.host),
      meta: null,
      fetched: false,
      error: null as string | null,
      fetchedAt: nowIso(),
      feedTitle: candidate.title,
      feedPubDate: candidate.pubDate,
      inspectedBodyLength: 0,
    }

    // §12 second half: two URLs reporting the same event become one story
    // with several source links — independent outlets word the same
    // occurrence differently, so headline identity alone would keep them
    // apart and component B could never score anything.
    const sameEvent = stories.find((story) => {
      const primary = story.sources[0]
      if (!primary || primary.host === candidate.host) return false
      return isSameEvent(
        { artistId: candidate.artistId, title: candidate.title, publisherDomain: candidate.host, publishedAt: candidate.pubDate },
        { artistId: story.artistId, title: story.title, publisherDomain: primary.host, publishedAt: story.feedPubDate },
      )
    })
    if (sameEvent) {
      if (!sameEvent.sources.some(existing => existing.host === candidate.host)) {
        sameEvent.sources.push({ ...source, error: 'not fetched — grouped as a second source of this story' })
      }
      sameEvent.injection = sameEvent.injection || injection
      continue
    }

    stories.push({
      artistId: candidate.artistId,
      title: candidate.title,
      summary: candidate.summary,
      discoveredAt: candidate.discoveredAt,
      feedPubDate: candidate.pubDate,
      injection,
      sources: [source],
    })
  }
  return stories
}

type DiscoveryCandidate = {
  artistId: ArtistId
  title: string
  url: string
  host: string
  pubDate: string | null
  declaredName: string | null
  summary: string | null
  discoveredAt: string
}

/**
 * Publisher feeds (§4) — the discovery path that actually reaches an original
 * article. The link in a publisher's own feed is already its article URL, so
 * nothing has to be resolved through a redirector whose robots.txt may forbid
 * us (`news.google.com` disallows everything but a handful of paths, which is
 * why resolving Google News links never yields a fetchable source).
 */
async function collectFeedCandidates(
  artistId: ArtistId,
  ctx: RunContext,
  limit: number,
): Promise<DiscoveryCandidate[]> {
  const out: DiscoveryCandidate[] = []
  if (limit <= 0) return out
  const cutoff = Date.now() - ctx.cfg.maxArticleAgeMs

  // Every matching publisher's feed is read and its artist-matched items are
  // queued; candidates are then drawn *one per publisher per pass*.  Drawing
  // round-robin is what stops the first publisher in the registry (Soompi,
  // with its large general feed) from consuming the whole discovery budget
  // before the others are consulted — without it a single run can only ever
  // see one publisher's wording, and §12 corroboration is unreachable.
  const queues: Array<{ record: SourceRecord, items: DiscoveryCandidate[] }> = []

  for (const record of SOURCE_REGISTRY) {
    if (!record.feedUrls?.length) continue
    if (record.supportedArtists !== 'all' && !record.supportedArtists.includes(artistId)) continue
    if (outOfBudget(ctx)) break

    let itemCount = 0
    let lastError: string | null = null
    let success = false
    const matched: DiscoveryCandidate[] = []

    for (const feedUrl of record.feedUrls) {
      const result = await fetchPage(feedUrl, ctx)
      if (!result.ok) {
        lastError = result.error
        continue
      }
      success = true
      const items = parseFeedItems(result.body, result.rawBytes)
      itemCount = Math.max(itemCount, items.length)

      for (const item of items) {
        const published = parsePublicationDate(item.published)
        // The feed's own date decides recency — never the discovery time.
        if (published && new Date(published.iso.length === 10 ? `${published.iso}T00:00:00Z` : published.iso).getTime() < cutoff) continue

        const host = hostnameOf(item.link)
        if (!host) continue
        // The entry's link must live on this publisher's own host: a feed is
        // a publisher's word about itself, not a licence to quote anyone.
        if (!sourceRecordCoversHost(record, host)) continue

        const matchedArtist = matchArtist(`${item.title} ${item.summary || ''}`, {
          publisherIsKpopSource: isKpopContextSource(host),
        })
        if (!matchedArtist.match || matchedArtist.match.artistId !== artistId) continue

        matched.push({
          artistId,
          title: item.title,
          url: item.link,
          host,
          pubDate: item.published,
          declaredName: item.sourceName || record.displayName,
          summary: item.summary,
          discoveredAt: nowIso(),
        })
      }
    }

    await store.recordSourceStatus({
      id: record.id,
      displayName: record.displayName,
      availability: success ? 'ok' : 'error',
      lastAttempt: nowIso(),
      lastSuccess: success ? nowIso() : undefined,
      lastError: success ? null : lastError,
      itemCount,
    })

    if (matched.length) queues.push({ record, items: matched })
  }

  while (out.length < limit && !outOfBudget(ctx)) {
    let drawn = 0
    for (const queue of queues) {
      if (out.length >= limit) break
      const next = queue.items.shift()
      if (!next) continue
      out.push(next)
      drawn += 1
    }
    if (drawn === 0) break
  }

  return out
}

/**
 * Sitemap discovery (§4) — for publishers with no usable feed (Korea JoongAng
 * Daily). The sitemap is fetched within its own size budget; only entries
 * whose declared date is inside the discovery window and whose slug/headline
 * names the artist are kept, and the article itself still has to match when
 * it is inspected later in the run.
 */
async function collectSitemapCandidates(
  artistId: ArtistId,
  ctx: RunContext,
  limit: number,
): Promise<DiscoveryCandidate[]> {
  const out: DiscoveryCandidate[] = []
  if (limit <= 0) return out
  const cutoff = Date.now() - ctx.cfg.maxArticleAgeMs
  const profile = ARTISTS[artistId]

  for (const record of SOURCE_REGISTRY) {
    if (out.length >= limit || outOfBudget(ctx)) break
    if (!record.sitemapUrls?.length) continue
    if (record.supportedArtists !== 'all' && !record.supportedArtists.includes(artistId)) continue

    let success = false
    let itemCount = 0
    let lastError: string | null = null

    for (const sitemapUrl of record.sitemapUrls) {
      if (out.length >= limit || outOfBudget(ctx)) break
      const result = await fetchPage(sitemapUrl, ctx, { maxBytes: ctx.cfg.sitemapMaxBytes })
      if (!result.ok) {
        lastError = result.error
        continue
      }
      success = true
      const entries = parseSitemap(result.body).entries
      let dateFilteredCount = 0

      for (const entry of entries) {
        if (out.length >= limit || outOfBudget(ctx)) break
        const host = hostnameOf(entry.loc)
        if (!host) continue
        // A sitemap is a publisher's word about itself — its entries must
        // stay on that publisher's host, exactly like a feed's links.
        if (!sourceRecordCoversHost(record, host)) continue

        const published = parsePublicationDate(entry.publishedAt || entry.lastmod)
        // Undated entries are skipped: recency is part of discovery, and a
        // sitemap without dates offers no way to prove it.
        if (!published) continue
        if (new Date(published.iso.length === 10 ? `${published.iso}T00:00:00Z` : published.iso).getTime() < cutoff) continue

        dateFilteredCount++

        const haystack = `${entry.title || ''} ${slugAsText(entry.loc)}`
        const matched = matchArtist(haystack, {
          publisherIsKpopSource: isKpopContextSource(host),
          extraContext: profile.members,
        })
        if (!matched.match || matched.match.artistId !== artistId) continue

        out.push({
          artistId,
          title: entry.title || slugAsText(entry.loc),
          url: entry.loc,
          host,
          pubDate: entry.publishedAt || entry.lastmod,
          declaredName: record.displayName,
          summary: null,
          discoveredAt: nowIso(),
        })
      }
      itemCount = Math.max(itemCount, dateFilteredCount)
    }

    await store.recordSourceStatus({
      id: record.id,
      displayName: record.displayName,
      availability: success ? 'ok' : 'error',
      lastAttempt: nowIso(),
      lastSuccess: success ? nowIso() : undefined,
      lastError: success ? null : lastError,
      itemCount,
    })
  }

  return out
}

/** Discover candidates through Google News RSS for one artist. */
async function collectGoogleNewsCandidates(
  artistId: ArtistId,
  ctx: RunContext,
  limit: number,
): Promise<DiscoveryCandidate[]> {
  const profile = ARTISTS[artistId]
  // The configured per-artist query, fetched through the robots check like
  // every other URL: `news.google.com` disallows `/rss/search`, so this
  // normally records `blocked` rather than quietly retrieving the feed.
  const feedUrl = googleNewsFeedUrl(googleNewsQueryFor(profile))
  const result = await fetchPage(feedUrl, ctx)

  if (!result.ok) {
    await store.recordSourceStatus({
      id: 'google_news',
      displayName: 'Google News',
      availability: /robots\.txt/.test(result.error || '') ? 'blocked' : 'error',
      lastAttempt: nowIso(),
      lastError: result.error,
      itemCount: 0,
    })
    return []
  }

  const items = parseGoogleNewsRss(result.body)
  const cutoff = Date.now() - ctx.cfg.maxArticleAgeMs
  const candidates: DiscoveryCandidate[] = []

  for (const item of items) {
    if (candidates.length >= limit) break
    const published = parsePublicationDate(item.pubDate)
    // Only *recent* items are considered, and the feed's own date is used for
    // the window — never the discovery time.
    if (published && new Date(published.iso.length === 10 ? `${published.iso}T00:00:00Z` : published.iso).getTime() < cutoff) continue

    const declaredHost = hostnameOf(item.sourceUrl)
    const matched = matchArtist(`${item.title} ${item.description || ''}`, {
      publisherIsKpopSource: isKpopContextSource(declaredHost),
    })
    if (!matched.match || matched.match.artistId !== artistId) continue

    const original = await resolveOriginalUrl(item.link, ctx)
    if (!original) continue
    const host = hostnameOf(original)
    if (!host) continue

    candidates.push({
      artistId,
      title: item.title,
      url: original,
      host,
      pubDate: item.pubDate,
      declaredName: item.sourceName,
      summary: item.description,
      discoveredAt: nowIso(),
    })
    if (outOfBudget(ctx)) break
  }

  await store.recordSourceStatus({
    id: 'google_news',
    displayName: 'Google News',
    availability: 'ok',
    lastAttempt: nowIso(),
    lastSuccess: nowIso(),
    itemCount: items.length,
  })

  return candidates
}

/**
 * Korean discovery through the official Naver Search API.
 *
 * This is not a crawl and needs no robots check: Naver answers a JSON list of
 * headlines and links for a keyword (the artist's Hangul name), and each
 * result then goes through the normal path — the publisher's own page is
 * fetched, robots-checked and verified like every other candidate.
 */
async function collectNaverCandidates(
  artistId: ArtistId,
  ctx: RunContext,
  limit: number,
): Promise<DiscoveryCandidate[]> {
  const out: DiscoveryCandidate[] = []
  if (limit <= 0) return out
  if (!ctx.cfg.naverClientId || !ctx.cfg.naverClientSecret) return out

  const profile = ARTISTS[artistId]
  // The Hangul alias first: it is what Korean newsrooms actually print.
  const query = profile.aliases.find(alias => /[가-힯]/.test(alias)) || profile.displayName
  const result = await pacedFetch(naverNewsUrl(query, { display: 50, sort: 'date' }), ctx, {
    timeoutMs: ctx.cfg.fetchTimeoutMs,
    retries: ctx.cfg.maxRetries,
    maxBytes: ctx.cfg.maxResponseBytes,
    acceptContentTypes: ['application/json', 'text/plain', '*/*'],
    headers: naverSearchHeaders(ctx.cfg.naverClientId, ctx.cfg.naverClientSecret),
  })

  if (!result.ok) {
    await store.recordSourceStatus({
      id: 'naver_openapi',
      displayName: 'Naver Search API',
      availability: 'error',
      lastAttempt: nowIso(),
      lastError: result.error,
      itemCount: 0,
    })
    return out
  }

  let payload: unknown
  try {
    payload = JSON.parse(result.body)
  } catch {
    payload = null
  }
  const parsed = parseNaverNews(payload)
  if (parsed.error) {
    await store.recordSourceStatus({
      id: 'naver_openapi',
      displayName: 'Naver Search API',
      availability: 'error',
      lastAttempt: nowIso(),
      lastError: parsed.error,
      itemCount: 0,
    })
    return out
  }

  const cutoff = Date.now() - ctx.cfg.maxArticleAgeMs
  for (const item of parsed.items) {
    if (out.length >= limit || outOfBudget(ctx)) break

    const published = parsePublicationDate(item.publishedAt)
    if (published && new Date(published.iso.length === 10 ? `${published.iso}T00:00:00Z` : published.iso).getTime() < cutoff) continue

    const host = hostnameOf(item.url)
    if (!host) continue

    const matchedArtist = matchArtist(`${item.title} ${item.description}`, {
      publisherIsKpopSource: isKpopContextSource(host),
    })
    if (!matchedArtist.match || matchedArtist.match.artistId !== artistId) continue

    out.push({
      artistId,
      title: item.title,
      url: item.url,
      host,
      pubDate: item.publishedAt,
      // Naver gives no publisher name; the article page supplies it.
      declaredName: null,
      summary: item.description || null,
      discoveredAt: nowIso(),
    })
  }

  await store.recordSourceStatus({
    id: 'naver_openapi',
    displayName: 'Naver Search API',
    availability: 'ok',
    lastAttempt: nowIso(),
    lastSuccess: nowIso(),
    itemCount: parsed.items.length,
  })

  return out
}

/** Every discovery path for one artist, grouped into deduplicated stories. */
async function discoverForArtist(
  artistId: ArtistId,
  ctx: RunContext,
  limit: number,
): Promise<ReturnType<typeof groupIntoStories>> {
  // Three discovery paths share the budget, each with a guaranteed slice:
  // feeds 50%, sitemaps 30%, Naver (Korean) 20%.  Without a reserved slice the
  // first publisher to answer fills the whole quota and the paths that add
  // variety never get read.  Google News takes whatever is left — it normally
  // records `blocked`, so it rarely consumes anything.
  const feedLimit = Math.max(1, Math.ceil(limit * 0.5))
  const sitemapLimit = Math.max(0, Math.round(limit * 0.3))
  const naverLimit = Math.max(0, limit - feedLimit - sitemapLimit)

  const candidates: DiscoveryCandidate[] = []

  candidates.push(...(await collectFeedCandidates(artistId, ctx, feedLimit)))

  if (sitemapLimit > 0 && !outOfBudget(ctx)) {
    candidates.push(...(await collectSitemapCandidates(artistId, ctx, sitemapLimit)))
  }

  if (naverLimit > 0 && !outOfBudget(ctx)) {
    candidates.push(...(await collectNaverCandidates(artistId, ctx, naverLimit)))
  }

  const remaining = Math.max(0, limit - candidates.length)
  if (remaining > 0 && !outOfBudget(ctx)) {
    candidates.push(...(await collectGoogleNewsCandidates(artistId, ctx, remaining)))
  }

  return groupIntoStories(candidates)
}

/**
 * Primary source discovery (§4): walk the agency's own site for announcements
 * about this artist. These are the only pages that can make a story a primary
 * source, so they are worth their own request budget.
 */
async function discoverOfficialSourceUrls(artistId: ArtistId, ctx: RunContext, limit = 2): Promise<string[]> {
  const agency = agencyForArtist(artistId)
  if (!agency) return []
  const base = `https://www.${agency.domains[0]}`
  const result = await fetchPage(base, ctx)
  if (!result.ok) {
    await store.recordSourceStatus({
      id: agency.id,
      displayName: agency.displayName,
      availability: 'error',
      lastAttempt: nowIso(),
      lastError: result.error,
      itemCount: 0,
    })
    return []
  }

  const links = extractOfficialLinks(result.body, base)
  const profile = ARTISTS[artistId]
  const matched = links.filter(link => {
    const check = matchArtist(link.text, { extraContext: profile.members })
    return Boolean(check.match && check.match.artistId === artistId)
  })

  await store.recordSourceStatus({
    id: agency.id,
    displayName: agency.displayName,
    availability: 'ok',
    lastAttempt: nowIso(),
    lastSuccess: nowIso(),
    itemCount: links.length,
  })

  return matched.slice(0, limit).map(link => link.url)
}

/**
 * Official-channel YouTube uploads (teasers, MVs, behind-the-scenes).
 *
 * A video has no article body, so it cannot pass `source_accessible`. Instead
 * of pretending otherwise, the upload is stored directly as a
 * `PENDING_VERIFICATION` article with one traceable `official_video` evidence
 * row — honest about what it is, visible in the admin review list, and picked
 * up by the rewrite pipeline, while the public VERIFIED feed is untouched.
 *
 * Only allowlisted channel IDs are accepted; a display name never grants
 * "official" status.
 */
async function ingestYouTubeVideos(
  artistId: ArtistId,
  ctx: RunContext,
  summary: IngestionSummary,
): Promise<void> {
  if (!ctx.cfg.youtubeApiKey) return
  const channelId = ctx.cfg.youtubeChannels[artistId]
  if (!channelId) return
  const playlistId = uploadsPlaylistId(channelId)
  if (!playlistId) return

  const url = `${playlistItemsUrl(playlistId, { maxResults: 10 })}&key=${encodeURIComponent(ctx.cfg.youtubeApiKey)}`
  const result = await pacedFetch(url, ctx, {
    timeoutMs: ctx.cfg.fetchTimeoutMs,
    retries: ctx.cfg.maxRetries,
    maxBytes: ctx.cfg.maxResponseBytes,
    acceptContentTypes: ['application/json', 'text/plain', '*/*'],
  })

  if (!result.ok) {
    await store.recordSourceStatus({
      id: 'youtube_official',
      displayName: 'YouTube (official channels)',
      availability: 'error',
      lastAttempt: nowIso(),
      lastError: result.error,
      itemCount: 0,
    })
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(result.body)
  } catch {
    payload = null
  }
  const parsed = parsePlaylistItems(payload)
  if (parsed.error) {
    await store.recordSourceStatus({
      id: 'youtube_official',
      displayName: 'YouTube (official channels)',
      availability: 'error',
      lastAttempt: nowIso(),
      lastError: parsed.error,
      itemCount: 0,
    })
    return
  }

  const cutoff = Date.now() - ctx.cfg.maxArticleAgeMs
  let stored = 0

  for (const upload of parsed.uploads) {
    if (outOfBudget(ctx)) break
    if (!upload.title) continue

    const published = parsePublicationDate(upload.publishedAt)
    // The channel is the artist's own, so the upload is about that artist by
    // definition — recency is the only filter.
    if (published && new Date(published.iso.length === 10 ? `${published.iso}T00:00:00Z` : published.iso).getTime() < cutoff) continue

    const canonical = canonicalizeUrl(upload.url) || upload.url
    const articleId = articleIdFor(canonical)
    if (await store.getArticleById(articleId)) continue

    const now = nowIso()
    const category: NewsArticle['category'] = /music video|\bmv\b|teaser|trailer|album|single|comeback|debut|pre-?release/i
      .test(`${upload.title} ${upload.description}`)
      ? 'release'
      : 'media'

    const article: NewsArticle = {
      id: articleId,
      story_key: storyKey(artistId, upload.title),
      artist_id: artistId,
      original_title: upload.title,
      normalized_title: normalizeNewsTitle(upload.title, upload.channelTitle),
      summary: upload.description.slice(0, 600) || null,
      language: detectLanguage(`${upload.title} ${upload.description}`),
      category,
      original_url: upload.url,
      canonical_url: canonical,
      publisher_name: upload.channelTitle || 'YouTube',
      publisher_domain: 'youtube.com',
      published_at: published?.iso || null,
      published_at_timezone: published?.hasTime ? 'UTC' : (published ? 'date-only' : null),
      published_at_has_time: published?.hasTime || false,
      first_discovered_at: now,
      last_checked_at: now,
      event_date: null,
      verification_status: 'PENDING_VERIFICATION',
      verification_score: 0,
      verification_reasons: [
        'official channel upload — no article body to verify',
        `allowlisted channel ${channelId}`,
      ],
      verification_version: 1,
      evidence_complete: Boolean(upload.thumbnail),
      created_at: now,
      updated_at: now,
    }

    const evidence: NewsEvidence[] = upload.thumbnail
      ? [{
          id: `${articleId}:e0`,
          article_id: articleId,
          evidence_type: 'official_video',
          source_url: upload.url,
          canonical_source_url: upload.url,
          image_url: upload.thumbnail,
          thumbnail_url: upload.thumbnail,
          video_url: upload.url,
          video_id: upload.videoId,
          source_name: upload.channelTitle || 'YouTube',
          source_domain: 'youtube.com',
          creator_or_publisher: upload.channelTitle || null,
          published_at: article.published_at,
          retrieved_at: now,
          original_caption: null,
          evidence_description: 'Official channel upload — thumbnail linked, never rehosted',
          supports_claim_ids: [],
          rights_status: 'linked_to_origin_not_rehosted',
          attribution_text: `${upload.channelTitle || 'YouTube'} — official video`,
          content_hash: null,
          verification_status: 'traceable',
        }]
      : []

    await store.upsertArticle(article, {
      scoreBreakdown: JSON.stringify({}),
      failedGates: ['source_accessible', 'min_score'],
      corroborations: [],
    })
    await store.replaceArticleEvidence(articleId, evidence, [])
    stored += 1
  }

  await store.recordSourceStatus({
    id: 'youtube_official',
    displayName: 'YouTube (official channels)',
    availability: 'ok',
    lastAttempt: nowIso(),
    lastSuccess: nowIso(),
    itemCount: parsed.uploads.length,
  })

  if (stored > 0) {
    summary.messages.push(`YouTube ${artistId}: ${stored} official upload(s) stored for review`)
  }
}

function evidenceFromPage(page: SourcePage, articleId: string, claimIds: string[], category: NewsArticle['category']): NewsEvidence[] {
  const imageUrl = page.meta?.imageUrl
  if (!imageUrl || !page.fetched) return []
  const host = hostnameOf(imageUrl) || page.host
  const isOfficial = page.record?.type === 'official_agency'
  return [{
    id: `${articleId}:e0`,
    article_id: articleId,
    evidence_type: isOfficial ? 'official_announcement' : 'publisher_image',
    source_url: page.url,
    canonical_source_url: page.canonicalUrl || page.url,
    image_url: imageUrl,
    thumbnail_url: imageUrl,
    video_url: null,
    video_id: null,
    source_name: page.declaredName || page.record?.displayName || host,
    source_domain: host,
    creator_or_publisher: page.declaredName || page.record?.displayName || null,
    published_at: page.meta?.publishedTime || null,
    retrieved_at: page.fetchedAt,
    original_caption: page.meta?.imageCaption || null,
    evidence_description: `Visual published with the original article about a ${category} story`,
    supports_claim_ids: claimIds,
    rights_status: 'linked_to_origin_not_rehosted',
    attribution_text: `${page.declaredName || host} — original article`,
    content_hash: null,
    verification_status: 'traceable',
  }]
}

const DENIAL_PATTERNS = /\b(denies|denied|refutes|refuted|no such (plan|talk|discussion)|baseless|false report|clarifies that there is no)\b/i

function detectContradictions(primary: { eventDate: string | null, text: string }, others: Array<{ eventDate: string | null, text: string }>): string[] {
  const issues: string[] = []
  for (const other of others) {
    if (primary.eventDate && other.eventDate && primary.eventDate !== other.eventDate) {
      issues.push(`event date differs between sources (${primary.eventDate} vs ${other.eventDate})`)
    }
    if (DENIAL_PATTERNS.test(other.text) && !DENIAL_PATTERNS.test(primary.text)) {
      issues.push('a supporting source denies the reported claim')
    }
  }
  return issues
}

function buildStoryFacts(story: RunStory): {
  facts: VerificationInput
  article: NewsArticle
} {
  const ordered = sortSources(story.sources)
  const primary = ordered[0]!
  const others = ordered.slice(1)
  const articleId = articleIdFor(canonicalizeUrl(primary.url) || primary.url)
  const now = nowIso()

  const title = primary.meta?.title || primary.feedTitle
  const summary = (primary.meta?.description || story.summary || '').slice(0, 600) || null
  const publishedFromPage = parsePublicationDate(primary.meta?.publishedTime || null)
  const pageDateUsable = Boolean(publishedFromPage && isPlausiblePublicationDate(publishedFromPage.iso))
  const publishedAt = pageDateUsable ? publishedFromPage : parsePublicationDate(primary.feedPubDate)

  const sourceIsAgency = primary.record?.type === 'official_agency'
  const extraction = extractClaims({
    articleId,
    artistId: story.artistId,
    title,
    summary,
    body: primary.meta?.bodyText || '',
    sourceIsOfficialAgency: sourceIsAgency,
    sourceIsReputable: Boolean(primary.record),
    publishedAt: publishedAt?.iso || null,
  })

  const evidence = evidenceFromPage(primary, articleId, extraction.claims.map(claim => claim.id), extraction.category)
  for (const page of others) {
    if (!page.fetched || !page.meta?.imageUrl) continue
    const extra = evidenceFromPage(page, articleId, [], extraction.category)
    for (const item of extra) {
      item.id = `${articleId}:e${evidence.length}`
      item.evidence_type = 'publisher_image'
      evidence.push(item)
    }
  }

  const corroborations: Corroboration[] = []
  for (const page of others) {
    if (!page.fetched) continue
    const independent = isIndependentCorroboration(
      { publisherDomain: primary.host, title, canonicalUrl: canonicalizeUrl(primary.url) || primary.url },
      { publisherDomain: page.host, title: page.feedTitle, canonicalUrl: canonicalizeUrl(page.url) || page.url },
    )
    corroborations.push({
      sourceId: page.record?.id || page.host,
      publisherDomain: page.host,
      url: canonicalizeUrl(page.url) || page.url,
      independent,
    })
  }

  const otherPages = others
    .filter(page => page.fetched)
    .map(page => ({
      eventDate: parsePublicationDate(page.meta?.publishedTime || page.feedPubDate)?.iso ?? null,
      text: `${page.feedTitle} ${page.meta?.description || ''}`,
    }))
  const contradictions = detectContradictions(
    { eventDate: extraction.eventDate, text: `${title} ${summary || ''} ${primary.meta?.bodyText?.slice(0, 2000) || ''}` },
    otherPages,
  )

  const agency = agencyForArtist(story.artistId)
  const officialPrimaryConfirms = Boolean(
    sourceIsAgency
    || corroborations.some(entry => entry.sourceId === agency?.id),
  )

  const injectionDetected = story.injection || extraction.injection.detected

  const evidenceComplete = evidence.every(item =>
    item.source_url
    && item.source_domain
    && item.image_url
    && item.retrieved_at
    && item.rights_status
    && item.attribution_text
    && item.verification_status === 'traceable',
  )

  const facts: VerificationInput = {
    artistId: story.artistId,
    artistAmbiguous: false,
    publisherDomain: primary.host,
    publisherName: primary.declaredName || primary.meta?.siteName || primary.record?.displayName || null,
    sourceTrust: primary.record?.trust ?? null,
    sourceCredibilityPoints: primary.record?.credibilityPoints ?? 0,
    sourceDirectKnowledge: sourceIsAgency,
    sourceIsOfficialAgency: sourceIsAgency,
    sourceFetched: primary.fetched && primary.inspectedBodyLength > 0,
    sourceUrl: primary.url,
    sourceUrlResolves: Boolean(validateExternalUrl(primary.url).ok) && !primary.error,
    sourceMatchesPublisher: Boolean(primary.host) && (primary.canonicalUrl ? hostnameOf(primary.canonicalUrl) === primary.host : true),
    inspectedBodyLength: primary.inspectedBodyLength,
    canonicalUrl: primary.canonicalUrl || canonicalizeUrl(primary.url) || null,
    publishedAt: publishedAt?.iso || null,
    publishedAtHasTime: publishedAt?.hasTime || false,
    publishedAtFromPageMetadata: pageDateUsable,
    publishedAtPlausible: publishedAt ? isPlausiblePublicationDate(publishedAt.iso) : false,
    eventDate: extraction.eventDate,
    category: extraction.category,
    claims: extraction.claims,
    evidence,
    corroborations,
    contradictions,
    isDuplicate: false,
    isRumor: extraction.isRumor,
    isOpinion: extraction.primaryClaimType === 'analysis_opinion',
    hasAttribution: extraction.attributionSignals.length > 0 || sourceIsAgency,
    officialPrimaryConfirms,
    evidenceComplete,
    injectionDetected,
  }

  const article: NewsArticle = {
    id: articleId,
    story_key: storyKey(story.artistId, title),
    artist_id: story.artistId,
    original_title: title,
    normalized_title: normalizeNewsTitle(title, primary.declaredName),
    summary,
    language: detectLanguage(`${title} ${summary || ''}`),
    category: extraction.category,
    original_url: primary.url,
    canonical_url: facts.canonicalUrl,
    publisher_name: facts.publisherName,
    publisher_domain: primary.host,
    published_at: facts.publishedAt,
    published_at_timezone: facts.publishedAt
      ? (facts.publishedAtHasTime ? 'UTC' : 'date-only')
      : null,
    published_at_has_time: facts.publishedAtHasTime,
    first_discovered_at: story.discoveredAt,
    last_checked_at: now,
    event_date: facts.eventDate,
    verification_status: 'DISCOVERED',
    verification_score: 0,
    verification_reasons: [],
    verification_version: 1,
    evidence_complete: facts.evidenceComplete,
    created_at: story.discoveredAt,
    updated_at: now,
  }

  return { facts, article }
}

async function persistStory(
  facts: VerificationInput,
  article: NewsArticle,
  previousStatus: NewsStatus | null,
  previousVersion: number,
  minScore: number,
): Promise<{ status: NewsStatus, score: number }> {
  const outcome = verifyCandidate(facts, { previousStatus, minScore })
  article.verification_status = outcome.status
  article.verification_score = outcome.score
  article.verification_reasons = outcome.reasons
  article.verification_version = previousVersion + 1
  article.evidence_complete = facts.evidenceComplete
  article.last_checked_at = nowIso()
  article.updated_at = nowIso()

  await store.upsertArticle(article, {
    scoreBreakdown: JSON.stringify(outcome.breakdown),
    failedGates: outcome.failedGates,
    corroborations: facts.corroborations,
  })
  // The claims table carries the verdict the hard gates reached: a claim that
  // survived `claims_supported` is supported, one caught by a contradiction is
  // contradicted, and anything the run could not independently confirm stays
  // unconfirmed rather than being quietly upgraded.
  const claimsSupported = !outcome.failedGates.includes('claims_supported')
  for (const claim of facts.claims) {
    if (facts.contradictions.length > 0) claim.claim_status = 'contradicted'
    else if (claimsSupported) claim.claim_status = 'supported'
    else claim.claim_status = 'unsupported'
  }

  await store.replaceArticleEvidence(article.id, facts.evidence, facts.claims)

  const audit = buildAuditRecord({
    articleId: article.id,
    verificationVersion: article.verification_version,
    facts,
    outcome,
    previousStatus,
  })
  await store.appendAudit({
    articleId: audit.article_id,
    verificationVersion: audit.verification_version,
    timestamp: audit.timestamp,
    sourcesInspected: audit.sources_inspected,
    claimsEvaluated: audit.claims_evaluated,
    evidenceDiscovered: audit.evidence_discovered,
    scoreBreakdown: audit.score_breakdown,
    failedGates: audit.failed_gates,
    contradictions: audit.contradictions,
    decision: audit.decision,
    previousStatus: audit.previous_status,
    newStatus: audit.new_status,
    reason: audit.reason,
  })

  return { status: outcome.status, score: outcome.score }
}

/**
 * Machine translation for one published story (**display only**).
 *
 * Runs only for VERIFIED rows and only for target languages that differ from
 * the source wording, so the verified original is never rewritten — it stays
 * on `news_articles` as the thing the audit scored, and the API serves it
 * alongside every translation as `original_title`.
 *
 * Failure handling is deliberately conservative:
 *  - a provider error is stored as a `failed` row (retried after 6 h, so a
 *    transient 403 or an exhausted quota costs one request, not one per run);
 *  - the whole step is skipped once the run budget is spent — translation is
 *    a nicety, verification is the job;
 *  - exceptions are swallowed: no story may lose its VERIFIED state because a
 *    translation endpoint was down.
 */
async function ensureTranslations(
  ctx: RunContext,
  row: { id: string, title: string, summary: string | null, language: string | null },
): Promise<void> {
  if (!row.title || outOfBudget(ctx)) return
  const source = (row.language || 'en').toLowerCase().split('-')[0] || 'en'

  // MyMemory answers through the same polite, size-capped fetch as everything
  // else (per-host spacing, timeouts, retries, byte cap). It deliberately gets
  // no robots gate and no source-domain allowlist: it is a public JSON API
  // with no robots.txt (404), not a publisher we are scraping.
  const fetchBody = async (url: string) => {
    const result = await pacedFetch(url, ctx, {
      timeoutMs: Math.min(ctx.cfg.fetchTimeoutMs, 8000),
      retries: 1,
      maxBytes: 65536,
      acceptContentTypes: ['application/json', 'text/plain', '*/*'],
    })
    return { ok: result.ok, body: result.body, error: result.error }
  }

  for (const target of TARGET_LANGS) {
    if (target === source || outOfBudget(ctx)) continue
    try {
      const existing = await store.getTranslation(row.id, target)
      if (existing?.status === 'ok' && existing.title) continue
      if (existing && Date.now() - Date.parse(existing.translated_at) < RETRY_FAILED_TRANSLATION_MS) continue

      const { translation, error } = await translateArticle(
        { title: row.title, summary: row.summary, language: row.language },
        target,
        { fetchBody },
      )
      await store.upsertTranslation({
        articleId: row.id,
        lang: target,
        title: translation?.title ?? null,
        summary: translation?.summary ?? null,
        provider: 'mymemory',
        status: translation ? 'ok' : 'failed',
        error: translation ? null : error,
        translatedAt: nowIso(),
      })
    } catch (error) {
      // Never let a translation failure disturb the verified record.
      try {
        await store.upsertTranslation({
          articleId: row.id,
          lang: target,
          title: null,
          summary: null,
          provider: 'mymemory',
          status: 'failed',
          error: (error as Error)?.message || 'translation failed',
          translatedAt: nowIso(),
        })
      } catch {
        /* storage unavailable — the original wording still renders */
      }
    }
  }
}

/** Map a stored row back onto the NewsArticle shape (recheck path). */
function articleFromRow(row: Record<string, unknown>): NewsArticle {
  const created = String(row.created_at || nowIso())
  return {
    id: String(row.id),
    story_key: String(row.story_key || ''),
    artist_id: String(row.artist_id) as ArtistId,
    original_title: String(row.original_title || ''),
    normalized_title: String(row.normalized_title || ''),
    summary: row.summary ? String(row.summary) : null,
    language: row.language ? String(row.language) : null,
    category: (row.category || 'other') as NewsArticle['category'],
    original_url: String(row.original_url || ''),
    canonical_url: row.canonical_url ? String(row.canonical_url) : null,
    publisher_name: row.publisher_name ? String(row.publisher_name) : null,
    publisher_domain: row.publisher_domain ? String(row.publisher_domain) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    published_at_timezone: row.published_at_timezone ? String(row.published_at_timezone) : null,
    published_at_has_time: Boolean(row.published_at_has_time),
    first_discovered_at: String(row.first_discovered_at || created),
    last_checked_at: String(row.last_checked_at || created),
    event_date: row.event_date ? String(row.event_date) : null,
    verification_status: String(row.verification_status || 'DISCOVERED') as NewsStatus,
    verification_score: Number(row.verification_score) || 0,
    verification_reasons: parseArray(row.verification_reasons),
    verification_version: Number(row.verification_version) || 1,
    evidence_complete: Boolean(row.evidence_complete),
    created_at: created,
    updated_at: String(row.updated_at || created),
  }
}

function evidenceFromRow(row: Record<string, unknown>): NewsEvidence {
  return {
    id: String(row.id),
    article_id: String(row.article_id),
    evidence_type: row.evidence_type as NewsEvidence['evidence_type'],
    source_url: String(row.source_url || ''),
    canonical_source_url: row.canonical_source_url ? String(row.canonical_source_url) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
    video_url: row.video_url ? String(row.video_url) : null,
    video_id: row.video_id ? String(row.video_id) : null,
    source_name: row.source_name ? String(row.source_name) : null,
    source_domain: row.source_domain ? String(row.source_domain) : null,
    creator_or_publisher: row.creator_or_publisher ? String(row.creator_or_publisher) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    retrieved_at: String(row.retrieved_at || nowIso()),
    original_caption: row.original_caption ? String(row.original_caption) : null,
    evidence_description: row.evidence_description ? String(row.evidence_description) : null,
    supports_claim_ids: parseArray(row.supports_claim_ids),
    rights_status: String(row.rights_status || ''),
    attribution_text: row.attribution_text ? String(row.attribution_text) : null,
    content_hash: row.content_hash ? String(row.content_hash) : null,
    verification_status: row.verification_status as NewsEvidence['verification_status'],
  }
}

function claimFromRow(row: Record<string, unknown>): NewsClaim {
  return {
    id: String(row.id),
    article_id: String(row.article_id),
    claim_text: String(row.claim_text || ''),
    normalized_claim: String(row.normalized_claim || ''),
    subject: String(row.subject || ''),
    predicate: String(row.predicate || ''),
    relevant_dates: row.relevant_dates ? String(row.relevant_dates) : null,
    claim_type: row.claim_type as NewsClaim['claim_type'],
    category: row.category as NewsClaim['category'],
    supporting_source_ids: parseArray(row.supporting_source_ids),
    contradicting_source_ids: parseArray(row.contradicting_source_ids),
    claim_status: row.claim_status as NewsClaim['claim_status'],
    verification_notes: parseArray(row.verification_notes),
  }
}

function parseArray(value: unknown): string[] {
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(entry => String(entry)) : []
  } catch {
    return []
  }
}

/**
 * Re-verify stored stories whose recheck window elapsed (§13.14). A source
 * that is merely unreachable right now does not revoke a story — that is a
 * retrieval limitation, not proof the story was wrong; it is recorded and the
 * decision is retried next run.
 */
async function recheckDueStories(ctx: RunContext, summary: IngestionSummary): Promise<void> {
  const since = new Date(ctx.startedAt.getTime() - ctx.cfg.recheckIntervalMs).toISOString()
  const due = await store.listDueForRecheck(since)
  for (const row of due) {
    if (outOfBudget(ctx)) {
      summary.messages.push('run budget reached — remaining rechecks move to the next run')
      return
    }
    const articleId = String(row.id)
    const articleRow = await store.getArticleById(articleId)
    if (!articleRow) continue
    const previousStatus = String(articleRow.verification_status) as NewsStatus
    const evidenceRows = await store.listEvidence(articleId)
    const claimRows = await store.listClaims(articleId)
    const evidence = evidenceRows.map(evidenceFromRow)
    const claims = claimRows.map(claimFromRow)
    const eventDate = articleRow.event_date ? String(articleRow.event_date) : null

    const expired = Boolean(eventDate && Date.now() - new Date(`${eventDate}T00:00:00Z`).getTime() > 30 * 86400000)
    const sourceUrl = String(articleRow.original_url || '')
    const page = await loadSourcePage({
      url: sourceUrl,
      declaredName: articleRow.publisher_name ? String(articleRow.publisher_name) : null,
      feedTitle: String(articleRow.original_title || ''),
      feedPubDate: null,
    }, ctx)

    const facts: VerificationInput = {
      artistId: String(articleRow.artist_id) as ArtistId,
      artistAmbiguous: false,
      publisherDomain: articleRow.publisher_domain ? String(articleRow.publisher_domain) : null,
      publisherName: articleRow.publisher_name ? String(articleRow.publisher_name) : null,
      sourceTrust: classifySource(articleRow.publisher_domain ? String(articleRow.publisher_domain) : null)?.trust ?? null,
      sourceCredibilityPoints: classifySource(articleRow.publisher_domain ? String(articleRow.publisher_domain) : null)?.credibilityPoints ?? 0,
      sourceDirectKnowledge: Boolean(classifySource(articleRow.publisher_domain ? String(articleRow.publisher_domain) : null)?.type === 'official_agency'),
      sourceIsOfficialAgency: classifySource(articleRow.publisher_domain ? String(articleRow.publisher_domain) : null)?.type === 'official_agency',
      sourceFetched: page.fetched && page.inspectedBodyLength > 0,
      sourceUrl,
      sourceUrlResolves: Boolean(validateExternalUrl(sourceUrl).ok) && page.fetched,
      sourceMatchesPublisher: page.fetched ? page.host === String(articleRow.publisher_domain || page.host) : true,
      inspectedBodyLength: page.inspectedBodyLength,
      canonicalUrl: articleRow.canonical_url ? String(articleRow.canonical_url) : null,
      publishedAt: articleRow.published_at ? String(articleRow.published_at) : null,
      publishedAtHasTime: Boolean(articleRow.published_at_has_time),
      publishedAtFromPageMetadata: Boolean(page.meta?.publishedTime),
      publishedAtPlausible: articleRow.published_at ? isPlausiblePublicationDate(String(articleRow.published_at)) : false,
      eventDate,
      category: (articleRow.category || 'other') as NewsArticle['category'],
      claims,
      evidence,
      corroborations: parseJsonArray(articleRow.corroborations),
      contradictions: [],
      isDuplicate: false,
      isRumor: claims.some(claim => claim.claim_type === 'rumor'),
      isOpinion: claims.some(claim => claim.claim_type === 'analysis_opinion'),
      hasAttribution: claims.length > 0,
      officialPrimaryConfirms: claims.some(claim => claim.claim_type === 'official_announcement'),
      evidenceComplete: Boolean(articleRow.evidence_complete),
      injectionDetected: false,
    }

    if (!page.fetched) {
      // Retrieval limitation, not a refutation: keep the decision, log why.
      await store.appendAudit({
        articleId,
        verificationVersion: Number(articleRow.verification_version) || 1,
        timestamp: nowIso(),
        sourcesInspected: [sourceUrl],
        claimsEvaluated: claims.map(claim => `${claim.subject} / ${claim.predicate}`),
        evidenceDiscovered: evidence.map(item => `${item.evidence_type} @ ${item.source_url}`),
        scoreBreakdown: {},
        failedGates: [],
        contradictions: [],
        decision: previousStatus,
        previousStatus,
        newStatus: previousStatus,
        reason: `recheck could not retrieve the original source (${page.error || 'unavailable'}) — previous decision retained`,
      })
      await store.upsertArticle({
        ...articleFromRow(articleRow),
        last_checked_at: nowIso(),
        updated_at: nowIso(),
      }, {
        scoreBreakdown: String(articleRow.score_breakdown || '{}'),
        failedGates: parseArray(articleRow.failed_gates),
        corroborations: facts.corroborations,
      })
      summary.rechecked += 1
      continue
    }

    const outcome = verifyCandidate(facts, { previousStatus, minScore: ctx.cfg.minScore, expired })
    await store.upsertArticle({
      ...articleFromRow(articleRow),
      verification_status: outcome.status,
      verification_score: outcome.score,
      verification_reasons: outcome.reasons,
      verification_version: (Number(articleRow.verification_version) || 1) + 1,
      last_checked_at: nowIso(),
      updated_at: nowIso(),
    }, {
      scoreBreakdown: JSON.stringify(outcome.breakdown),
      failedGates: outcome.failedGates,
      corroborations: facts.corroborations,
    })
    if (outcome.status !== previousStatus) {
      const audit = buildAuditRecord({ articleId, verificationVersion: Number(articleRow.verification_version) + 1, facts, outcome, previousStatus })
      await store.appendAudit({
        articleId: audit.article_id,
        verificationVersion: audit.verification_version,
        timestamp: audit.timestamp,
        sourcesInspected: audit.sources_inspected,
        claimsEvaluated: audit.claims_evaluated,
        evidenceDiscovered: audit.evidence_discovered,
        scoreBreakdown: audit.score_breakdown,
        failedGates: audit.failed_gates,
        contradictions: audit.contradictions,
        decision: audit.decision,
        previousStatus: audit.previous_status,
        newStatus: audit.new_status,
        reason: audit.reason,
      })
    }
    if (outcome.status === 'VERIFIED') {
      await ensureTranslations(ctx, {
        id: articleId,
        title: String(articleRow.original_title || ''),
        summary: articleRow.summary ? String(articleRow.summary) : null,
        language: articleRow.language ? String(articleRow.language) : null,
      })
    }
    summary.rechecked += 1
    summary.messages.push(`${articleId}: ${previousStatus} → ${outcome.status} (score ${outcome.score})`)
  }
}

function parseJsonArray(value: unknown): Corroboration[] {
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Corroboration[] : []
  } catch {
    return []
  }
}

/** Run the full pipeline once. Safe to call repeatedly (idempotent writes). */
export async function runNewsIngestion(options: IngestionOptions = {}): Promise<IngestionSummary> {
  const cfg = newsConfig()
  const startedAt = options.now || new Date()
  const summary: IngestionSummary = {
    startedAt: nowIso(startedAt),
    finishedAt: '',
    status: 'ok',
    discovered: 0,
    verified: 0,
    rejected: 0,
    pending: 0,
    fetchFailed: 0,
    rechecked: 0,
    messages: [],
    sources: [],
  }

  const ctx: RunContext = {
    cfg,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    sleep: options.sleep || sleepDefault,
    robots: new Map(),
    startedAt,
    deadline: startedAt.getTime() + cfg.runBudgetMs,
    lastRequestAt: new Map(),
    coolDownUntil: new Map(),
    bodyCache: new Map(),
  }

  await store.ensureNewsTables()
  const logId = await store.beginIngestLog(summary.startedAt)
  const artists = options.artists?.length ? options.artists : [...ARTIST_IDS]
  // How many stories are *processed* per artist stays bounded by the configured
  // article budget; how many are *discovered* is deliberately wider, because
  // corroboration needs the same event to be seen at several publishers before
  // any single story can pass the hard gates.
  const publishPerArtist = Math.max(1, Math.ceil((options.maxArticles ?? cfg.maxArticlesPerRun) / artists.length))
  const discoveryPerArtist = Math.max(publishPerArtist, cfg.discoveryCandidatesPerArtist)

  try {
    for (const artistId of artists) {
      const stories = await discoverForArtist(artistId, ctx, discoveryPerArtist)

      // Attach official agency announcements as sources (or as new stories).
      const officialUrls = await discoverOfficialSourceUrls(artistId, ctx)
      for (const url of officialUrls) {
        const host = hostnameOf(url)
        if (!host) continue
        const target = stories.find(story =>
          story.sources.some(source => canonicalizeUrl(source.url) === canonicalizeUrl(url)),
        )
        if (target) {
          if (!target.sources.some(source => source.host === host)) {
            target.sources.push({
              url,
              canonicalUrl: canonicalizeUrl(url),
              host,
              declaredName: agencyForArtist(artistId)?.displayName || null,
              record: classifySource(host),
              meta: null,
              fetched: false,
              error: null,
              fetchedAt: nowIso(),
              feedTitle: '',
              feedPubDate: null,
              inspectedBodyLength: 0,
            })
          }
          continue
        }
        const page = await loadSourcePage({ url, declaredName: agencyForArtist(artistId)?.displayName || null, feedTitle: '', feedPubDate: null }, ctx)
        const matched = matchArtist(`${page.meta?.title || ''} ${page.meta?.description || ''}`, {
          extraContext: ARTISTS[artistId].members,
        })
        if (!matched.match || matched.match.artistId !== artistId) continue
        if (page.meta?.title) {
          stories.push({
            artistId,
            title: page.meta.title,
            summary: page.meta.description,
            discoveredAt: nowIso(),
            feedPubDate: page.meta.publishedTime,
            injection: detectPromptInjection(page.meta.bodyText || '').detected,
            sources: [page],
          })
        }
      }

      // Official channel uploads are stored directly (a video has no body to
      // fetch), so they are not part of `discoverForArtist`.
      await ingestYouTubeVideos(artistId, ctx, summary)

      if (outOfBudget(ctx)) {
        summary.messages.push('run budget reached during discovery — remaining work moves to the next run')
        break
      }

      // Spend the per-artist processing budget on the stories most likely to
      // verify: the ones several publishers already cover. A story with four
      // sources is one step from the corroboration gate; a single-source story
      // cannot reach it at all.
      const ranked = [...stories]
        .sort((a, b) => {
          const bySources = distinctHosts(b) - distinctHosts(a)
          if (bySources !== 0) return bySources
          return (Date.parse(b.feedPubDate || '') || 0) - (Date.parse(a.feedPubDate || '') || 0)
        })
        .slice(0, publishPerArtist)

      const existing = await store.listStoriesForArtist(artistId)

      for (const story of ranked) {
        if (outOfBudget(ctx)) break

        // Inspect the primary source and enough others to corroborate it —
        // three independent ones is what a secondary source needs to score.
        const ordered = sortSources(story.sources)
        for (let index = 0; index < ordered.length && index < MAX_INSPECTED_SOURCES; index++) {
          const source = ordered[index]!
          if (source.fetched) continue
          const page = await loadSourcePage({
            url: source.url,
            declaredName: source.declaredName,
            feedTitle: source.feedTitle,
            feedPubDate: source.feedPubDate,
          }, ctx)
          Object.assign(source, page)
          if (outOfBudget(ctx)) break
        }

        const primary = ordered[0]!
        if (!primary.fetched) {
          summary.discovered += 1
          summary.fetchFailed += 1
          summary.messages.push(`${story.title}: source not retrievable (${primary.error || 'unknown'})`)
          continue
        }

        // Artist match is re-asserted against the *fetched* page. Discovery
        // only ever saw a headline, a feed summary or a URL slug, so a story
        // whose real page turns out to be about someone else is dropped here
        // instead of being verified and published under the wrong artist.
        // The body head is included because a headline routinely omits the
        // artist the article is actually about.
        const confirmText = [
          primary.feedTitle,
          primary.meta?.title || '',
          primary.meta?.description || '',
          (primary.meta?.bodyText || '').slice(0, 2000),
        ].join(' ').trim()
        if (primary.meta && confirmText) {
          const confirmed = matchArtist(confirmText, {
            publisherIsKpopSource: isKpopContextSource(primary.host),
            extraContext: ARTISTS[story.artistId].members,
          })
          if (!confirmed.match || confirmed.match.artistId !== story.artistId) {
            summary.messages.push(`${story.title}: dropped — the fetched page does not match ${ARTISTS[story.artistId].displayName}`)
            continue
          }
        }

        const { facts, article } = buildStoryFacts(story)

        // Duplicate against what is already stored: merge instead of repeat.
        const duplicate = findDuplicate({
          artistId: story.artistId,
          title: article.original_title,
          canonicalUrl: article.canonical_url || article.original_url,
          publisherDomain: article.publisher_domain,
          publishedAt: article.published_at,
        }, existing as unknown as ExistingStory[])
        facts.isDuplicate = duplicate.duplicate && !duplicate.storyId

        const existingId = duplicate.duplicate ? duplicate.storyId : null
        const previousRow = existingId ? await store.getArticleById(existingId) : null
        if (previousRow) {
          // The stored story keeps its identity; this source joins it.
          article.id = String(previousRow.id)
          article.story_key = String(previousRow.story_key)
          article.first_discovered_at = String(previousRow.first_discovered_at)
          article.created_at = String(previousRow.created_at)
          const storedCorroborations = parseJsonArray(previousRow.corroborations)
          const merged = new Map<string, Corroboration>()
          for (const entry of [...storedCorroborations, ...facts.corroborations]) merged.set(entry.url, entry)
          facts.corroborations = [...merged.values()]
          facts.isDuplicate = false
        }

        // §B, cross-run: an article about the same event from a *different*
        // publisher — fetched and inspected by an earlier run at its own URL —
        // is independent corroboration. This is the only way three sources
        // that published on three different days of the same week ever meet.
        for (const row of existing) {
          if (String(row.id || '') === article.id) continue
          const rowStatus = String(row.verification_status || '')
          if (rowStatus === 'REJECTED' || rowStatus === 'CONFLICTED') continue

          const rowDomain = row.publisher_domain ? String(row.publisher_domain) : null
          const rowTitle = String(row.original_title || '')
          const rowUrl = String(row.original_url || '')
          if (!rowUrl) continue
          const rowCanonical = canonicalizeUrl(rowUrl) || rowUrl
          if (facts.corroborations.some(entry => entry.url === rowCanonical)) continue

          const linked = isSameEvent(
            {
              artistId: story.artistId,
              title: article.original_title,
              publisherDomain: article.publisher_domain,
              publishedAt: article.published_at,
              eventDate: facts.eventDate,
            },
            {
              artistId: row.artist_id ? String(row.artist_id) as ArtistId : null,
              title: rowTitle,
              publisherDomain: rowDomain,
              publishedAt: row.published_at ? String(row.published_at) : null,
              eventDate: row.event_date ? String(row.event_date) : null,
            },
          )
          if (!linked) continue

          facts.corroborations.push({
            sourceId: rowDomain || String(row.id),
            publisherDomain: rowDomain || '',
            url: rowCanonical,
            independent: isIndependentCorroboration(
              { publisherDomain: article.publisher_domain, title: article.original_title, canonicalUrl: article.canonical_url || article.original_url },
              { publisherDomain: rowDomain, title: rowTitle, canonicalUrl: rowCanonical },
            ),
          })
        }

        summary.discovered += 1
        const previousStatus = previousRow ? (String(previousRow.verification_status) as NewsStatus) : null
        const previousVersion = previousRow ? Number(previousRow.verification_version) || 0 : 0
        const result = await persistStory(facts, article, previousStatus, previousVersion, cfg.minScore)

        if (result.status === 'VERIFIED') {
          summary.verified += 1
          await ensureTranslations(ctx, {
            id: article.id,
            title: article.original_title,
            summary: article.summary,
            language: article.language,
          })
        }
        else if (result.status === 'REJECTED' || result.status === 'CONFLICTED') summary.rejected += 1
        else if (result.status === 'FETCH_FAILED') summary.fetchFailed += 1
        else summary.pending += 1

        summary.messages.push(`${article.original_title}: ${result.status} (${result.score})`)
      }
    }

    await recheckDueStories(ctx, summary)
    summary.status = summary.verified > 0 || summary.rechecked > 0 || summary.discovered > 0 ? 'ok' : 'partial'
  } catch (error) {
    summary.status = 'error'
    summary.messages.push(`pipeline error: ${(error as Error)?.message || String(error)}`)
    await store.finishIngestLog(logId, {
      finishedAt: nowIso(),
      status: 'error',
      discovered: summary.discovered,
      verified: summary.verified,
      rejected: summary.rejected,
      pending: summary.pending,
      message: summary.messages.join(' | '),
    })
    throw error
  }

  summary.finishedAt = nowIso()
  await store.finishIngestLog(logId, {
    finishedAt: summary.finishedAt,
    status: summary.status,
    discovered: summary.discovered,
    verified: summary.verified,
    rejected: summary.rejected,
    pending: summary.pending,
    message: summary.messages.slice(0, 40).join(' | '),
  })

  summary.sources = (await store.listSourceStatuses()).map(row => ({
    id: String(row.source_id),
    availability: String(row.availability),
    itemCount: Number(row.item_count) || 0,
    error: row.last_error ? String(row.last_error) : null,
  }))

  return summary
}

/** Registry view for the transparency panel (§4). */
export function sourceRegistrySnapshot() {
  return SOURCE_REGISTRY.map(record => ({
    id: record.id,
    displayName: record.displayName,
    domains: record.domains,
    type: record.type,
    trust: record.trust,
    supportedArtists: record.supportedArtists,
    retrieval: record.retrieval,
    officialProfileUrls: record.officialProfileUrls,
    notes: record.notes || null,
  }))
}
