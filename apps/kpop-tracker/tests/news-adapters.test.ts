import { describe, expect, it, vi } from 'vitest'
import { safeFetch, type SafeFetchOptions } from '../server/utils/news/fetchSafe'
import { parseRobots, robotsAllows } from '../server/utils/news/robots'
import { canonicalizeUrl, hostnameOf, isRenderableMediaUrl, validateExternalUrl } from '../server/utils/news/url'
import { isPlausiblePublicationDate, parsePublicationDate, dayInTimeZone, formatInTimeZone } from '../server/utils/news/dates'
import { findDuplicate, isIndependentCorroboration, isSameEvent, withinTimeWindow, type CandidateIdentity, type ExistingStory } from '../server/utils/news/dedupe'
import { parseArticleMeta, extractOfficialLinks } from '../server/utils/news/adapters/publisherPage'
import { decodeGoogleNewsUrl, googleNewsFeedUrl, parseGoogleNewsRss } from '../server/utils/news/adapters/googleNews'
import { parseFeedItems } from '../server/utils/news/adapters/rssFeed'
import { parseSitemap, slugAsText } from '../server/utils/news/adapters/sitemap'

/**
 * Retrieval, robots.txt, SSRF, dates, canonicalization and duplicate
 * detection — the parts of the pipeline that decide *what* is ever allowed to
 * reach the verifier. Everything here runs offline: `safeFetch` takes an
 * injected `fetchImpl`, so redirects, failures and timeouts are simulated
 * rather than depended upon.
 */

function htmlResponse(body: string, init: { status?: number, headers?: Record<string, string>, url?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers || {}) },
  })
}

function okOptions(overrides: Partial<SafeFetchOptions> = {}): SafeFetchOptions {
  return { timeoutMs: 2000, retries: 0, ...overrides }
}

// ---------------------------------------------------------------- scenario 13

describe('scenario 13 — retrieval failure leaves nothing publishable', () => {
  it('a connection failure is reported as a failure, never as content', async () => {
    const result = await safeFetch('https://broken.example.com/story', okOptions({
      fetchImpl: (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch,
    }))
    expect(result.ok).toBe(false)
    expect(result.status).toBeNull()
    expect(result.body).toBe('')
    expect(result.error).toContain('request failed')
    expect(result.attempts).toBe(1)
  })

  it('retries a failing request up to the configured budget', async () => {
    const spy = vi.fn(() => Promise.reject(new Error('reset')))
    const result = await safeFetch('https://flaky.example.com/story', okOptions({
      fetchImpl: spy as unknown as typeof fetch,
      retries: 2,
      sleep: async () => { /* no real waiting in tests */ },
    }))
    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(3)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('a 404 is a failure with an empty body', async () => {
    const result = await safeFetch('https://gone.example.com/story', okOptions({
      fetchImpl: (() => Promise.resolve(htmlResponse('<html>moved</html>', { status: 404 }))) as typeof fetch,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('upstream status 404')
    expect(result.body).toBe('')
  })

  it('robots.txt blocking prevents the request entirely', async () => {
    const spy = vi.fn()
    const result = await safeFetch('https://private.example.com/story', okOptions({
      fetchImpl: spy as unknown as typeof fetch,
      isAllowedByRobots: () => false,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('blocked by robots.txt')
    expect(spy).not.toHaveBeenCalled()
  })

  it('an unsupported content type is not read as an article', async () => {
    const result = await safeFetch('https://cdn.example.com/file.zip', okOptions({
      fetchImpl: (() => Promise.resolve(new Response('PK', {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }))) as typeof fetch,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unsupported content type')
    expect(result.body).toBe('')
  })

  it('a response over the byte cap is aborted', async () => {
    const result = await safeFetch('https://huge.example.com/page', okOptions({
      fetchImpl: (() => Promise.resolve(htmlResponse('x'.repeat(4096)))) as typeof fetch,
      maxBytes: 1024,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('response larger than 1024 bytes')
  })

  it('a request that never answers is aborted at the timeout', async () => {
    const hangingFetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as typeof fetch
    const result = await safeFetch('https://slow.example.com/story', okOptions({
      fetchImpl: hangingFetch,
      timeoutMs: 60,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('request failed')
  })
})

// ---------------------------------------------------------------- scenario 17

describe('scenario 17 — private-network targets are never fetched', () => {
  const blocked = [
    ['loopback ipv4', 'http://127.0.0.1/admin'],
    ['localhost', 'http://localhost/api'],
    ['ipv6 loopback', 'http://[::1]/api'],
    ['private 10.x', 'http://10.0.0.5/x'],
    ['private 192.168.x', 'http://192.168.1.10/x'],
    ['private 172.16.x', 'http://172.16.0.9/x'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data'],
    ['this network', 'http://0.0.0.0/'],
    ['decimal-encoded loopback', 'http://2130706433/'],
    ['hex-encoded loopback', 'http://0x7f000001/'],
    ['internal hostname', 'http://intranet/'],
    ['credentials in url', 'https://user:pass@example.com/x'],
    ['non-http scheme', 'file:///etc/passwd'],
    ['non-standard port', 'https://example.com:8443/x'],
  ] as const

  it.each(blocked)('%s is rejected before any socket is opened', async (_label, url) => {
    const spy = vi.fn()
    const result = await safeFetch(url, okOptions({ fetchImpl: spy as unknown as typeof fetch }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('url rejected')
    expect(spy).not.toHaveBeenCalled()
  })

  it('a public URL that redirects to the metadata service is revalidated and refused', async () => {
    const spy = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    }))
    const result = await safeFetch('https://news.example.com/story', okOptions({
      fetchImpl: spy as unknown as typeof fetch,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('url rejected')
    expect(result.error).toContain('private IPv4')
    // Only the first, public hop was ever requested.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a redirect to an internal hostname is refused too', async () => {
    const spy = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 301,
      headers: { location: 'http://localhost/admin' },
    }))
    const result = await safeFetch('https://news.example.com/legacy', okOptions({
      fetchImpl: spy as unknown as typeof fetch,
    }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('internal hostname')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('redirect chains are bounded', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, {
      status: 302,
      headers: { location: 'https://news.example.com/again' },
    }))) as unknown as typeof fetch
    const result = await safeFetch('https://news.example.com/loop', okOptions({ fetchImpl, maxRedirects: 3 }))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('too many redirects')
  })

  it('validateExternalUrl enforces the optional domain allowlist', () => {
    expect(validateExternalUrl('https://evil.example.org/x').ok).toBe(true)
    expect(validateExternalUrl('https://evil.example.org/x', { allowedDomains: ['soompi.com'] }).ok).toBe(false)
    expect(validateExternalUrl('https://www.soompi.com/x', { allowedDomains: ['soompi.com'] }).ok).toBe(true)
    expect(validateExternalUrl('https://smentertainment.com.evil.example/x', { allowedDomains: ['smentertainment.com'] }).ok).toBe(false)
  })
})

// ------------------------------------------------------------------- robots

describe('robots.txt parsing and longest-match rules', () => {
  it('applies our group, prefers the specific group over the wildcard', () => {
    const policy = parseRobots(`
User-agent: *
Disallow: /private/
Allow: /private/press

User-agent: HIBIKISHOP-NewsBot
Disallow: /archive/
Allow: /archive/2026/
`)
    expect(robotsAllows(policy, '/archive/2026/a')).toBe(true)
    expect(robotsAllows(policy, '/archive/2025/a')).toBe(false)
    expect(robotsAllows(policy, '/news/aespa')).toBe(true)
  })

  it('an empty Disallow means everything is allowed', () => {
    const policy = parseRobots('User-agent: *\nDisallow:')
    expect(robotsAllows(policy, '/anything')).toBe(true)
  })

  it('no rules for us means the path is allowed (RFC 9309)', () => {
    const policy = parseRobots('User-agent: OtherBot\nDisallow: /')
    expect(robotsAllows(policy, '/')).toBe(true)
  })

  it('longest matching rule wins', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /news\nAllow: /news/public')
    expect(robotsAllows(policy, '/news/public/a')).toBe(true)
    expect(robotsAllows(policy, '/news/private/a')).toBe(false)
  })
})

// -------------------------------------------------------- URL canonicalization

describe('URL canonicalization', () => {
  it('strips tracking params, fragments and sorts what is left', () => {
    expect(canonicalizeUrl('https://News.Example.COM/story/1?utm_source=x&utm_medium=y&id=7#top'))
      .toBe('https://news.example.com/story/1?id=7')
    expect(canonicalizeUrl('https://news.example.com/story/1?b=2&a=1'))
      .toBe('https://news.example.com/story/1?a=1&b=2')
  })

  it('two Google News links to one story canonicalize identically', () => {
    const a = canonicalizeUrl('https://kpopleague.com/news/aespa?utm_source=gn&utm_campaign=rss')
    const b = canonicalizeUrl('https://kpopleague.com/news/aespa?fbclid=abc')
    expect(a).toBe(b)
    expect(a).toBe('https://kpopleague.com/news/aespa')
  })

  it('rejects untrusted URLs outright', () => {
    expect(canonicalizeUrl('https://user:pass@example.com/x')).toBe('')
    expect(canonicalizeUrl('not a url')).toBe('')
    expect(hostnameOf('https://WWW.Example.com/x')).toBe('example.com')
    expect(hostnameOf('nonsense')).toBeNull()
  })

  it('only https assets with a public host may be rendered', () => {
    expect(isRenderableMediaUrl('https://cdn.smentertainment.com/img/a.jpg')).toBe(true)
    expect(isRenderableMediaUrl('http://cdn.smentertainment.com/img/a.jpg')).toBe(false)
    expect(isRenderableMediaUrl('https://127.0.0.1/img.jpg')).toBe(false)
    expect(isRenderableMediaUrl('javascript:alert(1)')).toBe(false)
    expect(isRenderableMediaUrl(null)).toBe(false)
  })
})

// ------------------------------------------------------------ scenario 2 / 6

describe('publication date parsing', () => {
  it('parses an ISO timestamp with its zone and keeps the instant', () => {
    const parsed = parsePublicationDate('2026-10-25T09:30:00+07:00')
    expect(parsed).toEqual({ iso: '2026-10-25T02:30:00.000Z', hasTime: true, precision: 'second', assumedTimezone: false })
  })

  it('flags a timestamp that carried no zone as assumed UTC', () => {
    const parsed = parsePublicationDate('2026-10-25 09:30')
    expect(parsed?.hasTime).toBe(true)
    expect(parsed?.assumedTimezone).toBe(true)
  })

  it('keeps a date-only value as a date — no time is invented', () => {
    expect(parsePublicationDate('2026-10-25')).toEqual({
      iso: '2026-10-25', hasTime: false, precision: 'day', assumedTimezone: false,
    })
    expect(parsePublicationDate('2026/10/25')?.iso).toBe('2026-10-25')
    expect(parsePublicationDate('2026년 10월 25일')?.iso).toBe('2026-10-25')
  })

  it('parses RFC-822 bylines used by RSS feeds', () => {
    expect(parsePublicationDate('Sat, 25 Oct 2026 09:30:00 GMT')?.iso).toBe('2026-10-25T09:30:00.000Z')
  })

  it('parses epoch seconds and milliseconds', () => {
    expect(parsePublicationDate('1792906200')?.iso).toBe(new Date(1792906200 * 1000).toISOString())
    expect(parsePublicationDate('1792906200000')?.iso).toBe(new Date(1792906200000).toISOString())
  })

  it('returns null when the source gave no usable date (never substitutes fetch time)', () => {
    expect(parsePublicationDate('')).toBeNull()
    expect(parsePublicationDate(null)).toBeNull()
    expect(parsePublicationDate('Yesterday')).toBeNull()
    expect(parsePublicationDate('coming soon')).toBeNull()
    expect(parsePublicationDate('2026-13-45')).toBeNull()
  })

  it('rejects implausible publication dates but accepts recent ones', () => {
    const now = new Date('2026-10-25T00:00:00.000Z')
    expect(isPlausiblePublicationDate('2026-10-25', now)).toBe(true)
    expect(isPlausiblePublicationDate('1999-05-01', now)).toBe(false)
    expect(isPlausiblePublicationDate('2031-01-01', now)).toBe(false)
    expect(isPlausiblePublicationDate(null, now)).toBe(false)
  })
})

// --------------------------------------------------------------- timezone

describe('timezone conversion (Asia/Jakarta, WIB = UTC+7)', () => {
  it('shifts an instant to WIB for display', () => {
    const label = formatInTimeZone('2026-10-25T02:30:00.000Z')
    expect(label).toContain('09:30')
    expect(label).toContain('25')
    expect(label).toContain('2026')
  })

  it('rolls late-evening UTC into the next day in WIB', () => {
    expect(dayInTimeZone('2026-10-25T18:30:00.000Z')).toBe('2026-10-26')
    expect(dayInTimeZone('2026-10-25T10:30:00.000Z')).toBe('2026-10-25')
  })

  it('prints a date-only value verbatim instead of shifting it', () => {
    expect(formatInTimeZone('2026-10-25')).toBe('2026-10-25')
    expect(dayInTimeZone('2026-10-25')).toBe('2026-10-25')
    expect(formatInTimeZone(null)).toBe('')
  })
})

// ---------------------------------------------------------------- scenario 8

describe('scenario 8 — duplicate stories collapse into one', () => {
  const identity: CandidateIdentity = {
    artistId: 'aespa',
    title: 'aespa announces new single for November',
    canonicalUrl: 'https://kpopleague.com/news/aespa-single',
    publisherDomain: 'kpopleague.com',
    publishedAt: '2026-10-25T00:00:00Z',
  }

  const existing: ExistingStory[] = [
    {
      id: 'story-1',
      artist_id: 'aespa',
      normalized_title: 'aespa announces new single for november',
      original_url: 'https://kpopleague.com/news/aespa-single?utm_source=rss',
      canonical_url: 'https://kpopleague.com/news/aespa-single',
      story_key: null,
      published_at: '2026-10-25T01:00:00Z',
      publisher_domain: 'kpopleague.com',
      verification_status: 'VERIFIED',
    },
  ]

  it('the same URL with tracking params attached is the same story', () => {
    const match = findDuplicate(identity, existing)
    expect(match.duplicate).toBe(true)
    expect(match.storyId).toBe('story-1')
    expect(match.reason).toContain('canonical URL')
  })

  it('the same wording from the same publisher in the same window is a copy', () => {
    const match = findDuplicate(
      { ...identity, canonicalUrl: 'https://kpopleague.com/2026/10/aespa-single/' },
      [{ ...existing[0]!, canonical_url: 'https://kpopleague.com/other-path', original_url: 'https://kpopleague.com/other-path', story_key: null }],
    )
    expect(match.duplicate).toBe(true)
    expect(match.syndicated).toBe(false)
  })

  it('the same wording from another publisher is a syndicated copy, not corroboration', () => {
    const match = findDuplicate(
      {
        ...identity,
        canonicalUrl: 'https://mirror.example.com/story/1',
        publisherDomain: 'mirror.example.com',
      },
      existing,
    )
    expect(match.duplicate).toBe(true)
    expect(match.syndicated).toBe(true)
    expect(match.storyId).toBe('story-1')
  })

  it('a different story about the same artist is not a duplicate', () => {
    const match = findDuplicate(
      { ...identity, title: 'IVE announces a fan meeting in Seoul', artistId: 'ive', canonicalUrl: 'https://kpopleague.com/news/ive-fan' },
      existing,
    )
    expect(match.duplicate).toBe(false)
    expect(match.reason).toBe('no match')
  })

  it('stories outside the time window are not merged', () => {
    expect(withinTimeWindow('2026-10-25T00:00:00Z', '2026-10-24T00:00:00Z')).toBe(true)
    expect(withinTimeWindow('2026-10-25T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(false)
    expect(withinTimeWindow(null, '2026-10-01T00:00:00Z')).toBe(true)
  })
})

describe('corroboration independence (wire copies do not corroborate)', () => {
  const base = { publisherDomain: 'soompi.com', title: 'aespa announces new single for November', canonicalUrl: 'https://soompi.com/a' }

  it('rejects the same URL, the same domain and near-identical wording', () => {
    expect(isIndependentCorroboration(base, { ...base, canonicalUrl: 'https://soompi.com/a' })).toBe(false)
    expect(isIndependentCorroboration(base, { ...base, canonicalUrl: 'https://soompi.com/b' })).toBe(false)
    expect(isIndependentCorroboration(base, { ...base, publisherDomain: 'other.com', canonicalUrl: 'https://other.com/b' })).toBe(false)
  })

  it('accepts a differently worded story from another publisher', () => {
    expect(isIndependentCorroboration(base, {
      publisherDomain: 'koreaherald.com',
      title: 'SM confirms aespa November comeback with new single',
      canonicalUrl: 'https://koreaherald.com/art/1',
    })).toBe(true)
  })

  it('headlines about unrelated events do not corroborate each other', () => {
    expect(isIndependentCorroboration(base, {
      publisherDomain: 'koreaherald.com',
      title: 'Starship shares fall after quarterly earnings report',
      canonicalUrl: 'https://koreaherald.com/art/2',
    })).toBe(false)
  })
})

// ----------------------------------------------------------------- adapters

describe('publisher page adapter reads what the newsroom published', () => {
  const html = `
    <html><head>
      <title>aespa announces new single | KPop League</title>
      <meta property="og:title" content="aespa announces new single">
      <meta property="og:site_name" content="KPop League">
      <meta property="og:image" content="https://cdn.kpopleague.com/img/a.jpg">
      <meta property="article:published_time" content="2026-10-25T09:30:00+07:00">
      <meta name="author" content="Newsdesk">
      <link rel="canonical" href="https://kpopleague.com/news/aespa-comeback">
    </head><body>
      <article>
        <h1>aespa announces new single</h1>
        <p>aespa will release a new single next month, the agency said on Sunday.</p>
        <p>The group's fifth mini album arrives on November 20 with a title track produced in-house.</p>
        <p>Additional reporting details the promotional schedule, the showcase venue and the broadcast plan.</p>
      </article>
      <script>const noise = "ignore <p>me</p>"</script>
    </body></html>`

  it('extracts canonical URL, byline, image, publication time and body text', () => {
    const meta = parseArticleMeta(html, 'https://kpopleague.com/news/aespa-comeback?utm_source=gn')
    expect(meta.canonicalUrl).toBe('https://kpopleague.com/news/aespa-comeback')
    expect(meta.title).toBe('aespa announces new single')
    expect(meta.siteName).toBe('KPop League')
    expect(meta.imageUrl).toBe('https://cdn.kpopleague.com/img/a.jpg')
    expect(meta.publishedTime).toBe('2026-10-25T09:30:00+07:00')
    expect(meta.author).toBe('Newsdesk')
    expect(meta.bodyLength).toBeGreaterThan(200)
    expect(meta.bodyText).toContain('the agency said')
    expect(meta.bodyText).not.toContain('ignore <p>me')
  })

  it('reports nothing rather than guessing when a page carries no metadata', () => {
    const meta = parseArticleMeta('<html><body>loading…</body></html>', 'https://kpopleague.com/x')
    expect(meta.canonicalUrl).toBeNull()
    expect(meta.imageUrl).toBeNull()
    expect(meta.publishedTime).toBeNull()
    expect(meta.author).toBeNull()
  })

  it('decodes entities in a headline instead of storing them raw', () => {
    const meta = parseArticleMeta(
      '<html><head><title>K-pop&apos;s master of ceremonies &#8212; a guide</title></head><body></body></html>',
      'https://kpopleague.com/x',
    )
    expect(meta.title).toBe("K-pop's master of ceremonies — a guide")
  })

  it('keeps only same-host links so a footer cannot pose as an announcement', () => {
    const links = extractOfficialLinks(`
      <html><body>
        <a href="/news/2026/aespa-comeback">aespa comeback announcement details</a>
        <a href="https://instagram.com/smentertainment">SM on Instagram</a>
        <a href="https://starship-ent.com/news/ive">IVE schedule announcement</a>
        <a href="javascript:void(0)">skip me please</a>
      </body></html>`, 'https://www.smentertainment.com/')
    expect(links).toHaveLength(1)
    expect(links[0]!.url).toBe('https://www.smentertainment.com/news/2026/aespa-comeback')
    expect(links[0]!.text).toContain('aespa comeback announcement')
  })
})

describe('same event, different wording (§12 — what makes corroboration possible)', () => {
  const aespaAnnouncement = {
    artistId: 'aespa' as const,
    title: 'aespa announces fifth mini album for October 20',
    publisherDomain: 'soompi.com',
    publishedAt: '2026-10-25T00:00:00Z',
    eventDate: '2026-10-20',
  }

  it('links two independent outlets covering one occurrence', () => {
    const other = {
      artistId: 'aespa' as const,
      title: 'SM confirms aespa fifth mini album arrives October 20 with title track',
      publisherDomain: 'koreaherald.com',
      publishedAt: '2026-10-24T09:00:00Z',
      eventDate: '2026-10-20',
    }
    expect(isSameEvent(aespaAnnouncement, other)).toBe(true)
    // Different wording, different host, no shared URL → genuinely independent.
    expect(isIndependentCorroboration(
      { publisherDomain: aespaAnnouncement.publisherDomain, title: aespaAnnouncement.title, canonicalUrl: 'https://soompi.com/a' },
      { publisherDomain: other.publisherDomain, title: other.title, canonicalUrl: 'https://koreaherald.com/b' },
    )).toBe(true)
    expect(isSameEvent(other, aespaAnnouncement)).toBe(true) // symmetric
  })

  it('never links the same publisher (that is dedupe’s job, not corroboration’s)', () => {
    expect(isSameEvent(aespaAnnouncement, {
      ...aespaAnnouncement,
      title: 'aespa fifth mini album confirmed for October 20',
      publishedAt: '2026-10-24T00:00:00Z',
    })).toBe(false)
  })

  it('refuses a different artist, a stale article, or a conflicting event date', () => {
    expect(isSameEvent(aespaAnnouncement, {
      ...aespaAnnouncement,
      artistId: 'ive',
      publisherDomain: 'koreaherald.com',
      publishedAt: '2026-10-24T00:00:00Z',
    })).toBe(false)

    expect(isSameEvent(aespaAnnouncement, {
      ...aespaAnnouncement,
      publisherDomain: 'koreaherald.com',
      publishedAt: '2026-09-01T00:00:00Z',
    })).toBe(false)

    expect(isSameEvent(aespaAnnouncement, {
      ...aespaAnnouncement,
      publisherDomain: 'koreaherald.com',
      publishedAt: '2026-10-24T00:00:00Z',
      eventDate: '2026-11-02',
    })).toBe(false)
  })

  it('refuses two unrelated stories that merely mention the same artist', () => {
    expect(isSameEvent(aespaAnnouncement, {
      artistId: 'aespa',
      title: 'aespa to headline Goyang music festival this November',
      publisherDomain: 'yonhap.co.kr',
      publishedAt: '2026-10-24T00:00:00Z',
      eventDate: null,
    })).toBe(false)

    expect(isSameEvent(aespaAnnouncement, {
      artistId: null,
      title: aespaAnnouncement.title,
      publisherDomain: 'koreaherald.com',
      publishedAt: '2026-10-24T00:00:00Z',
    })).toBe(false)
  })
})

describe('publisher feeds are the discovery path that reaches originals', () => {
  it('parses RSS items with the publisher’s own article link', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel>
      <item>
        <title>aespa announces fifth mini album</title>
        <link>https://www.soompi.com/article/12345/aespa-announces</link>
        <pubDate>Sat, 25 Oct 2026 09:30:00 +0700</pubDate>
        <description>&lt;p&gt;The agency confirmed the date.&lt;/p&gt;</description>
        <guid isPermaLink="false">soompi-12345</guid>
        <source url="https://www.soompi.com">Soompi</source>
      </item>
      <item>
        <title>IVE adds a Seoul date</title>
        <link>http://169.254.169.254/steal</link>
        <pubDate>Fri, 24 Oct 2026 10:00:00 +0700</pubDate>
      </item>
    </channel></rss>`

    const items = parseFeedItems(xml)
    // The private-network entry is dropped at parse time: a feed cannot make
    // us fetch something the SSRF guard would reject anyway.
    expect(items).toHaveLength(1)
    expect(items[0]!.link).toBe('https://www.soompi.com/article/12345/aespa-announces')
    expect(items[0]!.title).toBe('aespa announces fifth mini album')
    expect(items[0]!.published).toBe('Sat, 25 Oct 2026 09:30:00 +0700')
    expect(items[0]!.summary).toContain('The agency confirmed the date.')
    expect(items[0]!.sourceName).toBe('Soompi')
    expect(items[0]!.guid).toBe('soompi-12345')
  })

  it('parses Atom entries, where the URL lives in an attribute', () => {
    const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Hearts2Hearts drops a trailer</title>
        <link href="https://www.soompi.com/article/999/hearts2hearts"/>
        <published>2026-10-25T01:00:00Z</published>
        <summary>First look at the concept.</summary>
      </entry>
    </feed>`
    const items = parseFeedItems(xml)
    expect(items).toHaveLength(1)
    expect(items[0]!.link).toBe('https://www.soompi.com/article/999/hearts2hearts')
    expect(items[0]!.published).toBe('2026-10-25T01:00:00Z')
  })

  it('returns nothing for HTML masquerading as a feed', () => {
    expect(parseFeedItems('<html><body><article>not xml</article></body></html>')).toEqual([])
    expect(parseFeedItems('')).toEqual([])
  })
})

describe('Google News RSS is discovery only', () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <item>
      <title>aespa announces new single - KPop League</title>
      <link>https://news.google.com/rss/articles/CBMiabc?oc=5</link>
      <guid isPermaLink="false">CMiabc</guid>
      <pubDate>Sat, 25 Oct 2026 09:30:00 GMT</pubDate>
      <description>&lt;a href="https://news.google.com/rss/articles/CBMiabc"&gt;Read more&lt;/a&gt;</description>
      <source url="https://kpopleague.com">KPop League</source>
    </item>
    <item>
      <title>IVE announces fan meeting in Seoul - Soompi</title>
      <link>https://news.google.com/rss/articles/CBMiother?oc=5</link>
      <pubDate>Sat, 25 Oct 2026 08:00:00 GMT</pubDate>
      <source url="https://soompi.com">Soompi</source>
    </item>
  </channel></rss>`

  it('parses items with publisher hints and RFC-822 dates', () => {
    const items = parseGoogleNewsRss(rss)
    expect(items).toHaveLength(2)
    expect(items[0]!.title).toContain('aespa announces new single')
    expect(items[0]!.sourceName).toBe('KPop League')
    expect(items[0]!.sourceUrl).toBe('https://kpopleague.com')
    expect(items[0]!.pubDate).toBe('Sat, 25 Oct 2026 09:30:00 GMT')
    expect(items[1]!.sourceName).toBe('Soompi')
  })

  it('builds a search feed URL with the query encoded', () => {
    const url = new URL(googleNewsFeedUrl('aespa comeback when:30d'))
    expect(url.hostname).toBe('news.google.com')
    expect(url.searchParams.get('q')).toBe('aespa comeback when:30d')
  })

  it('builds the three configured per-artist feeds exactly as documented', () => {
    expect(googleNewsFeedUrl('aespa'))
      .toBe('https://news.google.com/rss/search?q=aespa&hl=en-US&gl=US&ceid=US:en')
    expect(googleNewsFeedUrl('"Hearts2Hearts"'))
      .toBe('https://news.google.com/rss/search?q=%22Hearts2Hearts%22&hl=en-US&gl=US&ceid=US:en')
    expect(googleNewsFeedUrl('"IVE" K-pop'))
      .toBe('https://news.google.com/rss/search?q=%22IVE%22+K-pop&hl=en-US&gl=US&ceid=US:en')
  })

  it('decodes only genuine article payloads, and never a private target', () => {
    const encode = (value: string) =>
      Buffer.from(value, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const link = `https://news.google.com/rss/articles/${encode('https://kpopleague.com/news/aespa-comeback')}`
    expect(decodeGoogleNewsUrl(link)).toBe('https://kpopleague.com/news/aespa-comeback')

    expect(decodeGoogleNewsUrl(`https://news.google.com/rss/articles/${encode('http://169.254.169.254/latest')}`)).toBeNull()
    expect(decodeGoogleNewsUrl('https://news.google.com/rss/search?q=aespa')).toBeNull()
  })
})

// ---------------------------------------------------------------- sitemaps

describe('sitemap discovery adapter', () => {
  const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https:&#x2F;&#x2F;www.koreajoongangdaily.com&#x2F;entertainment&#x2F;aespa-tops-the-charts&#x2F;12936425</loc>
    <news:news>
      <news:publication_date>2026-10-24T16:40+01:00</news:publication_date>
      <news:title>aespa tops the charts</news:title>
    </news:news>
    <lastmod>2026-10-24T16:40+01:00</lastmod>
  </url>
  <url>
    <loc>https://www.koreajoongangdaily.com/sports/nothing-here/12936426</loc>
    <lastmod>2026-10-20T09:00+01:00</lastmod>
  </url>
</urlset>`

  it('reads a Google News sitemap with its headline and declared date', () => {
    const parsed = parseSitemap(newsSitemap)
    expect(parsed.kind).toBe('urlset')
    expect(parsed.entries).toHaveLength(2)

    const [first, second] = parsed.entries
    expect(first!.loc).toBe('https://www.koreajoongangdaily.com/entertainment/aespa-tops-the-charts/12936425')
    expect(first!.title).toBe('aespa tops the charts')
    expect(first!.publishedAt).toBe('2026-10-24T16:40+01:00')
    expect(first!.lastmod).toBe('2026-10-24T16:40+01:00')
    // No <news:> block, no headline — the slug is all a caller gets.
    expect(second!.title).toBeNull()
    expect(second!.publishedAt).toBeNull()
  })

  it('reads a sitemap index as child locations', () => {
    const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.koreajoongangdaily.com/sitemap?pageType=article</loc><lastmod>2026-10-25</lastmod></sitemap>
</sitemapindex>`
    const parsed = parseSitemap(index)
    expect(parsed.kind).toBe('index')
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0]!.loc).toBe('https://www.koreajoongangdaily.com/sitemap?pageType=article')
    expect(parsed.entries[0]!.title).toBeNull()
  })

  it('turns a URL path into matchable words without touching the query', () => {
    expect(slugAsText('https://www.koreajoongangdaily.com/entertainment/aespa-comeback-date/123'))
      .toBe('entertainment aespa comeback date 123')
    expect(slugAsText('https://example.com/ive-wonyoung-solo.html'))
      .toBe('ive wonyoung solo')
    expect(slugAsText('not a url')).toBe('not a url')
  })

  it('Google News disallows its search feed for our agent', () => {
    const policy = parseRobots([
      'User-agent: *',
      'Disallow: /',
      'Allow: /$',
      'Allow: /home/',
      'Allow: /topics/',
    ].join('\n'))
    expect(robotsAllows(policy, '/rss/search?q=aespa'.split('?')[0]!)).toBe(false)
    // `Allow: /$` is the robots end-of-path anchor, not a literal dollar sign.
    expect(robotsAllows(policy, '/')).toBe(true)
    expect(robotsAllows(policy, '/home/latest')).toBe(true)
    expect(robotsAllows(policy, '/homeish')).toBe(false)
  })

  it('SM Entertainment allows exactly its homepage and nothing else', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /\nAllow: /$\n')
    expect(robotsAllows(policy, '/')).toBe(true)
    expect(robotsAllows(policy, '/news/aespa-comeback')).toBe(false)
    expect(robotsAllows(policy, '/feed')).toBe(false)
  })
})
