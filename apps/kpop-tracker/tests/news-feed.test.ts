import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PUBLIC_FEED_STATUS,
  buildFeedQuery,
  filterPublicFeed,
  toPublicArticle,
  type PublicArticle,
} from '../server/utils/news/feed'
import { newsConfig } from '../server/utils/news/config'
import { agencyForArtist, classifySource, isKpopContextSource, SOURCE_REGISTRY, sourceRecordCoversHost } from '../server/utils/news/sources'
import { NEWS_STATUSES, SCORE_COMPONENTS } from '../server/utils/news/types'
import { SCORE_MAX } from '../server/utils/news/scoring'

/**
 * The public feed contract: VERIFIED only, server-side, plus the
 * configuration and source registry the pipeline runs on.
 */

function placeholders(sql: string): number {
  return (sql.match(/\?/g) || []).length
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'art-1',
    artist_id: 'aespa',
    original_title: 'aespa announces new single',
    summary: 'The agency confirmed a November release.',
    language: 'en',
    category: 'release',
    original_url: 'https://kpopleague.com/news/aespa-single',
    canonical_url: 'https://kpopleague.com/news/aespa-single',
    publisher_name: 'KPop League',
    publisher_domain: 'kpopleague.com',
    published_at: '2026-10-25T02:30:00.000Z',
    published_at_has_time: 1,
    event_date: null,
    verification_status: 'VERIFIED',
    verification_score: 96,
    verification_version: 1,
    evidence_complete: 1,
    first_discovered_at: '2026-10-25T00:00:00.000Z',
    last_checked_at: '2026-10-25T06:00:00.000Z',
    created_at: '2026-10-25T00:00:00.000Z',
    updated_at: '2026-10-25T06:00:00.000Z',
    evidence_image: 'https://cdn.kpopleague.com/img/a.jpg',
    evidence_count: 3,
    ...overrides,
  }
}

describe('the feed exposes VERIFIED rows only � enforced in the query itself', () => {
  it('PUBLIC_FEED_STATUS is VERIFIED', () => {
    expect(PUBLIC_FEED_STATUS).toBe('VERIFIED')
  })

  it('every built query starts with the status filter and binds it first', () => {
    const cases = [
      buildFeedQuery(),
      buildFeedQuery({ artist: 'aespa' }),
      buildFeedQuery({ artist: 'ive', category: 'release', q: 'comeback' }),
      buildFeedQuery({ publisher: 'soompi.com', page: 3, limit: 20 }),
      buildFeedQuery({ artist: 'bts', category: 'nonsense', q: 'x' }),
    ]
    for (const query of cases) {
      expect(query.sql).toContain('verification_status = ?')
      expect(query.sql).toContain('FROM news_articles')
      expect(query.args[0]).toBe('VERIFIED')
      expect(query.countArgs[0]).toBe('VERIFIED')
      // No clause is ever dropped: WHERE always carries the status filter.
      expect(query.sql).toMatch(/WHERE verification_status = \?/)
      // Every placeholder has a matching bound value (and vice versa).
      expect(placeholders(query.sql)).toBe(query.args.length)
      expect(placeholders(query.countSql)).toBe(query.countArgs.length)
      // The list query and the count query filter identically: the main WHERE
      // clause binds exactly the values the count query binds.
      const from = query.sql.indexOf('FROM news_articles')
      const mainWhere = query.sql.slice(from, query.sql.indexOf('ORDER BY', from))
      expect(placeholders(mainWhere)).toBe(query.countArgs.length)
    }
  })

  it('ignores unknown artist and category values instead of injecting them', () => {
    const query = buildFeedQuery({ artist: 'bts', category: 'politics' })
    expect(query.sql).not.toContain('artist_id = ?')
    expect(query.sql).not.toContain('category = ?')
    expect(query.countArgs).toEqual(['VERIFIED'])
    expect(query.args).not.toContain('bts')
    expect(query.args).not.toContain('politics')
  })

  it('accepts the three in-scope artists and "All" as no filter', () => {
    for (const artist of ['aespa', 'hearts2hearts', 'ive']) {
      const query = buildFeedQuery({ artist })
      expect(query.sql).toContain('artist_id = ?')
      expect(query.args).toContain(artist)
    }
    const all = buildFeedQuery({ artist: 'All' })
    expect(all.sql).not.toContain('artist_id = ?')
  })

  it('search needles are escaped so a literal % cannot widen the match', () => {
    const query = buildFeedQuery({ q: '100% confirmed' })
    expect(query.sql).toContain('LIKE ?')
    expect(query.args).toContain('%100\\% confirmed%')
    expect(query.sql).toContain('ESCAPE')
  })

  it('bounds pagination: limit 1�50, page = 1', () => {
    expect(buildFeedQuery({ limit: 999 }).limit).toBe(50)
    expect(buildFeedQuery({ limit: -5 }).limit).toBe(1)
    expect(buildFeedQuery({ limit: 0 }).limit).toBe(12) // falsy ? default page size
    expect(buildFeedQuery({ page: -4 }).page).toBe(1)
    expect(buildFeedQuery({ page: 2, limit: 10 }).args.slice(-2)).toEqual([10, 10])
  })
})

describe('rows are filtered again on the way out (defense in depth)', () => {
  it('a VERIFIED row becomes a public article', () => {
    const article = toPublicArticle(row())
    expect(article).not.toBeNull()
    expect(article!.verification_status).toBe('VERIFIED')
    expect(article!.verification_score).toBe(96)
    expect(article!.thumbnail).toBe('https://cdn.kpopleague.com/img/a.jpg')
    expect(article!.evidence_count).toBe(3)
    expect(article!.published_at).toBe('2026-10-25T02:30:00.000Z')
  })

  it.each(NEWS_STATUSES.filter(status => status !== 'VERIFIED'))(
    'a %s row never reaches the public shape',
    (status) => {
      expect(toPublicArticle(row({ verification_status: status }))).toBeNull()
    },
  )

  it('a hand-edited row with a private or non-http URL is dropped', () => {
    expect(toPublicArticle(row({ original_url: 'http://127.0.0.1:8080/leak' }))).toBeNull()
    expect(toPublicArticle(row({ original_url: 'javascript:alert(1)' }))).toBeNull()
    expect(toPublicArticle(row({ original_url: '' }))).toBeNull()
    expect(toPublicArticle(row({ id: '' }))).toBeNull()
  })

  it('an unsafe evidence image is never used as a thumbnail', () => {
    const blocked = toPublicArticle(row({ evidence_image: 'http://169.254.169.254/meta.png' }))
    expect(blocked!.thumbnail).toBeNull()
    const http = toPublicArticle(row({ evidence_image: 'http://cdn.example.com/a.jpg' }))
    expect(http!.thumbnail).toBeNull()
    expect(toPublicArticle(row({ evidence_image: null }))!.thumbnail).toBeNull()
  })

  it('filterPublicFeed drops every non-VERIFIED row from a mixed batch', () => {
    const rows = [
      row({ id: 'a', verification_status: 'VERIFIED' }),
      row({ id: 'b', verification_status: 'PENDING_VERIFICATION' }),
      row({ id: 'c', verification_status: 'REJECTED' }),
      row({ id: 'd', verification_status: 'CONFLICTED' }),
      row({ id: 'e', verification_status: 'EXPIRED' }),
      row({ id: 'f', verification_status: 'REVOKED' }),
    ]
    const feed = filterPublicFeed(rows)
    expect(feed.map((article: PublicArticle) => article.id)).toEqual(['a'])
    expect(feed.every(article => article.verification_status === 'VERIFIED')).toBe(true)
  })
})

describe('news configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs on defaults with no environment set', () => {
    vi.stubEnv('NEWS_FETCH_TIMEOUT', '')
    vi.stubEnv('VERIFICATION_MIN_SCORE', '')
    vi.stubEnv('ALLOWED_SOURCE_DOMAINS', '')
    vi.stubEnv('YOUTUBE_API_KEY', '')
    const config = newsConfig()
    expect(config.minScore).toBe(90)
    expect(config.fetchTimeoutMs).toBe(6000)
    expect(config.recheckIntervalMs).toBe(21600000)
    expect(config.maxArticlesPerRun).toBe(9)
    expect(config.allowedSourceDomains).toEqual([])
    expect(config.youtubeApiKey).toBe('')
  })

  it('reads overrides and clamps them to sane bounds', () => {
    vi.stubEnv('VERIFICATION_MIN_SCORE', '97')
    vi.stubEnv('NEWS_FETCH_TIMEOUT', '999999')
    vi.stubEnv('NEWS_MAX_ARTICLES_PER_RUN', '0')
    vi.stubEnv('ALLOWED_SOURCE_DOMAINS', 'Soompi.com, www.yonhapnews.co.kr,')
    vi.stubEnv('YOUTUBE_API_KEY', 'server-side-secret')
    const config = newsConfig()
    expect(config.minScore).toBe(97)
    expect(config.fetchTimeoutMs).toBe(30000)
    expect(config.maxArticlesPerRun).toBe(1)
    expect(config.allowedSourceDomains).toEqual(['soompi.com', 'yonhapnews.co.kr'])
    expect(config.youtubeApiKey).toBe('server-side-secret')
  })

  it('ignores garbage rather than crashing the pipeline', () => {
    vi.stubEnv('VERIFICATION_MIN_SCORE', 'not-a-number')
    expect(newsConfig().minScore).toBe(90)
  })
})

describe('source registry', () => {
  it('resolves a hostname to its registry entry', () => {
    expect(classifySource('www.smentertainment.com')?.id).toBe('sm_entertainment')
    expect(classifySource('soompi.com')?.id).toBe('soompi')
    expect(classifySource('en.yna.co.kr')?.id).toBe('yonhap_en')
    expect(classifySource('news.google.com')?.trust).toBe('discovery_only')
    expect(classifySource(null)).toBeNull()
    expect(classifySource('random-blog.example')).toBeNull()
  })

  it('a lookalike domain never resolves to the official agency', () => {
    expect(classifySource('smentertainment.com.evil.example')).toBeNull()
    expect(classifySource('smentertainment.com-verify.top')).toBeNull()
  })

  it('maps each artist to the agency that represents it', () => {
    expect(agencyForArtist('aespa')?.id).toBe('sm_entertainment')
    expect(agencyForArtist('hearts2hearts')?.id).toBe('sm_entertainment')
    expect(agencyForArtist('ive')?.id).toBe('starship_entertainment')
  })

  it('discovery hosts supply context but never credibility', () => {
    expect(SOURCE_REGISTRY.find(source => source.id === 'google_news')?.credibilityPoints).toBe(0)
    expect(isKpopContextSource('soompi.com')).toBe(true)
    expect(isKpopContextSource('reuters.com')).toBe(false)
  })

  it('every configured feed URL sits on its own publisher�s domain', () => {
    const withFeeds = SOURCE_REGISTRY.filter(source => source.feedUrls?.length)
    expect(withFeeds.map(source => source.id)).toEqual([
      'yonhap_en',
      'soompi',
      'soompi_aespa',
      'soompi_ive',
      'soompi_hearts2hearts',
      'billboard',
      'asianjunkie',
      'korea_herald',
      'newsen',
      'hankyung_ent',
      'starnews',
    ])
    for (const source of withFeeds) {
      for (const feedUrl of source.feedUrls!) {
        expect(feedUrl.startsWith('https://')).toBe(true)
        const host = new URL(feedUrl).hostname.replace(/^www\./, '')
        // Use sourceRecordCoversHost: multiple entries can share a domain (e.g. soompi / soompi_aespa)
        expect(sourceRecordCoversHost(source, host)).toBe(true)
      }
    }
  })

  it('registers every source from the configured source list', () => {
    const ids = SOURCE_REGISTRY.map(source => source.id)
    for (const id of ['soompi', 'naver_news', 'yonhap_en', 'korea_joongang_daily', 'korea_herald', 'google_news', 'sm_entertainment', 'starship_entertainment', 'newsen', 'hankyung_ent', 'mydaily', 'sportschosun', 'starnews', 'xportsnews']) {
      expect(ids).toContain(id)
    }
    expect(SOURCE_REGISTRY.find(source => source.id === 'soompi')?.officialProfileUrls).toContain('https://www.soompi.com/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'naver_news')?.officialProfileUrls).toContain('https://news.naver.com/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'yonhap_en')?.officialProfileUrls).toContain('https://en.yna.co.kr/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'korea_joongang_daily')?.officialProfileUrls).toContain('https://koreajoongangdaily.joins.com/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'korea_herald')?.officialProfileUrls).toContain('https://www.koreaherald.com/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'google_news')?.officialProfileUrls).toContain('https://news.google.com/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'sm_entertainment')?.officialProfileUrls).toContain('https://www.smentertainment.com/')
    expect(SOURCE_REGISTRY.find(source => source.id === 'starship_entertainment')?.officialProfileUrls).toContain('https://www.starship-ent.com/')
  })

  it('Korea Herald is discovered by feed, JoongAng by sitemap, Naver not at all', () => {
    expect(SOURCE_REGISTRY.find(source => source.id === 'korea_herald')?.retrieval).toBe('rss')
    expect(SOURCE_REGISTRY.find(source => source.id === 'korea_herald')?.feedUrls)
      .toEqual(['https://www.koreaherald.com/rss/newsAll'])

    const joongang = SOURCE_REGISTRY.find(source => source.id === 'korea_joongang_daily')
    expect(joongang?.domains).toContain('koreajoongangdaily.com')
    expect(joongang?.feedUrls).toBeUndefined()
    expect(joongang?.sitemapUrls?.length).toBeGreaterThan(0)
    for (const sitemapUrl of joongang!.sitemapUrls!) {
      expect(classifySource(new URL(sitemapUrl).hostname.replace(/^www\./, ''))?.id).toBe('korea_joongang_daily')
    }

    // news.naver.com disallows every path: it is registered to be *recognised*
    // (and refused), never crawled.
    expect(SOURCE_REGISTRY.find(source => source.id === 'naver_news')?.retrieval).toBe('none')
    expect(SOURCE_REGISTRY.find(source => source.id === 'naver_news')?.sitemapUrls).toBeUndefined()
    expect(SOURCE_REGISTRY.find(source => source.id === 'naver_news')?.feedUrls).toBeUndefined()
  })
})

describe('score components sum to the published maximum', () => {
  it('A+B+C+D+E+F = 100 with the documented weights', () => {
    const weights = SCORE_COMPONENTS.map(key => SCORE_MAX[key])
    expect(weights).toEqual([25, 25, 20, 15, 10, 5])
    expect(weights.reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('all eight pipeline statuses exist', () => {
    expect([...NEWS_STATUSES].sort()).toEqual([
      'CONFLICTED', 'DISCOVERED', 'EXPIRED', 'FETCH_FAILED',
      'PENDING_VERIFICATION', 'REJECTED', 'REVOKED', 'VERIFIED',
    ])
  })
})
