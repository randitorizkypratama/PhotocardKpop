import { describe, expect, it, vi } from 'vitest'
import {
  NAVER_NEWS_ENDPOINT,
  cleanNaverText,
  naverNewsUrl,
  naverSearchHeaders,
  parseNaverNews,
} from '../server/utils/news/adapters/naver'
import {
  parsePlaylistItems,
  playlistItemsUrl,
  uploadsPlaylistId,
} from '../server/utils/news/adapters/youtube'
import { parseYoutubeChannels } from '../server/utils/news/config'
import { interleaveByPublisher } from '../server/utils/news/rewrite/store'

/**
 * The two new discovery sources, tested without a network: URL builders and
 * response parsers are pure, and both APIs are only ever called through the
 * pipeline's injected fetch.
 */

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv' // UC + 22 chars

describe('Naver Search adapter', () => {
  it('builds a date-sorted news search URL', () => {
    const url = new URL(naverNewsUrl('아이브'))
    expect(url.origin + url.pathname).toBe(NAVER_NEWS_ENDPOINT)
    expect(url.searchParams.get('query')).toBe('아이브')
    expect(url.searchParams.get('sort')).toBe('date')
    expect(url.searchParams.get('display')).toBe('50')
  })

  it('clamps display and start to the API limits', () => {
    const url = new URL(naverNewsUrl('aespa', { display: 500, start: 5000 }))
    expect(url.searchParams.get('display')).toBe('100')
    expect(url.searchParams.get('start')).toBe('1000')
  })

  it('sends the credentials as headers, never in the URL', () => {
    const headers = naverSearchHeaders('client-id', 'client-secret')
    expect(headers['X-Naver-Client-Id']).toBe('client-id')
    expect(headers['X-Naver-Client-Secret']).toBe('client-secret')
    expect(naverNewsUrl('아이브')).not.toContain('client-secret')
  })

  it('strips highlight tags and decodes entities', () => {
    expect(cleanNaverText('<b>아이브</b>가 &quot;컴백&quot; 확정')).toBe('아이브가 "컴백" 확정')
    expect(cleanNaverText('  banyak   spasi  ')).toBe('banyak spasi')
  })

  it('prefers the publisher URL over Naver’s redirect', () => {
    const parsed = parseNaverNews({
      total: 1,
      items: [{
        title: '<b>아이브</b> 컴백',
        description: '요약',
        originallink: 'https://www.newsen.com/news_view.php?uid=1',
        link: 'https://n.news.naver.com/article/1',
        pubDate: 'Tue, 28 Oct 2026 09:00:00 +0900',
      }],
    })
    expect(parsed.error).toBeNull()
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]!.url).toBe('https://www.newsen.com/news_view.php?uid=1')
    expect(parsed.items[0]!.title).toBe('아이브 컴백')
    expect(parsed.items[0]!.link).toBe('https://n.news.naver.com/article/1')
  })

  it('falls back to the Naver link when there is no originallink', () => {
    const parsed = parseNaverNews({
      items: [{ title: 't', description: '', link: 'https://n.news.naver.com/a', pubDate: '' }],
    })
    expect(parsed.items[0]!.url).toBe('https://n.news.naver.com/a')
    // An empty pubDate is "no date", not an invented one.
    expect(parsed.items[0]!.publishedAt).toBeNull()
  })

  it('drops entries without a title or a link', () => {
    const parsed = parseNaverNews({ items: [{ title: '', link: 'https://x.test/a' }, { title: 'ok' }] })
    expect(parsed.items).toHaveLength(0)
  })

  it('reports an API error instead of an empty success', () => {
    expect(parseNaverNews({ errorMessage: 'invalid client id' })).toEqual({ items: [], total: 0, error: 'invalid client id' })
    expect(parseNaverNews(null).error).toContain('unexpected')
  })
})

describe('YouTube uploads adapter', () => {
  it('turns a channel ID into its uploads playlist', () => {
    expect(uploadsPlaylistId(CHANNEL_ID)).toBe(`UU${CHANNEL_ID.slice(2)}`)
    expect(uploadsPlaylistId('not-a-channel')).toBeNull()
    expect(uploadsPlaylistId('')).toBeNull()
  })

  it('builds a playlistItems URL (1 quota unit), not a search', () => {
    const url = new URL(playlistItemsUrl(`UU${CHANNEL_ID.slice(2)}`, { maxResults: 5 }))
    expect(url.pathname).toBe('/youtube/v3/playlistItems')
    expect(url.searchParams.get('part')).toBe('snippet,contentDetails')
    expect(url.searchParams.get('maxResults')).toBe('5')
    expect(url.toString()).not.toContain('/search')
    // The key is appended by the caller, so it never lands in a fixture.
    expect(url.searchParams.get('key')).toBeNull()
  })

  it('parses uploads with their thumbnail and description', () => {
    const parsed = parsePlaylistItems({
      nextPageToken: 'next',
      items: [{
        snippet: {
          title: 'aespa 에스파 \'Drama\' MV',
          description: 'Official music video',
          channelId: CHANNEL_ID,
          channelTitle: 'aespa',
          publishedAt: '2026-10-27T09:00:00Z',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' },
            medium: { url: 'https://i.ytimg.com/vi/abc/mqdefault.jpg' },
          },
        },
        contentDetails: { videoId: 'abc123' },
      }],
    })

    expect(parsed.error).toBeNull()
    expect(parsed.nextPageToken).toBe('next')
    expect(parsed.uploads[0]).toMatchObject({
      videoId: 'abc123',
      channelId: CHANNEL_ID,
      channelTitle: 'aespa',
      url: 'https://www.youtube.com/watch?v=abc123',
      thumbnail: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      description: 'Official music video',
    })
  })

  it('skips an item with no video id and reports an API error', () => {
    expect(parsePlaylistItems({ items: [{ snippet: { title: 'x' } }] }).uploads).toHaveLength(0)
    expect(parsePlaylistItems({ error: { message: 'quotaExceeded' } }).error).toBe('quotaExceeded')
  })
})

describe('YOUTUBE_CHANNELS parsing', () => {
  it('accepts artist:channelId pairs and lowercases the artist', () => {
    expect(parseYoutubeChannels(`aespa:${CHANNEL_ID}`)).toEqual({ aespa: CHANNEL_ID })
    expect(parseYoutubeChannels(`IVE:${CHANNEL_ID}, hearts2hearts:${CHANNEL_ID}`)).toEqual({
      ive: CHANNEL_ID,
      hearts2hearts: CHANNEL_ID,
    })
  })

  it('drops handles, display names and malformed values', () => {
    expect(parseYoutubeChannels('aespa:@aespa_official,ive:aespa official')).toEqual({})
    expect(parseYoutubeChannels('aespa:' + CHANNEL_ID + ',broken,ive:')).toEqual({ aespa: CHANNEL_ID })
    expect(parseYoutubeChannels('')).toEqual({})
    expect(parseYoutubeChannels(undefined)).toEqual({})
  })
})

describe('candidate interleaving', () => {
  const row = (id: string, publisherDomain: string | null) => ({ id, publisherDomain })

  it('gives every publisher a turn instead of letting one fill the run', () => {
    const rows = [
      row('soompi-1', 'soompi.com'),
      row('soompi-2', 'soompi.com'),
      row('soompi-3', 'soompi.com'),
      row('yt-1', 'youtube.com'),
      row('joongang-1', 'koreajoongangdaily.com'),
    ]
    const picked = interleaveByPublisher(rows, 3).map(entry => entry.id)
    expect(picked).toEqual(['soompi-1', 'yt-1', 'joongang-1'])
  })

  it('keeps the original order inside one publisher and respects the limit', () => {
    const rows = [row('a1', 'a.test'), row('a2', 'a.test'), row('a3', 'a.test')]
    expect(interleaveByPublisher(rows, 2).map(entry => entry.id)).toEqual(['a1', 'a2'])
  })

  it('groups rows with no publisher together instead of crashing', () => {
    const rows = [row('x1', null), row('x2', null), row('y1', 'y.test')]
    expect(interleaveByPublisher(rows, 3).map(entry => entry.id)).toEqual(['x1', 'y1', 'x2'])
  })

  it('returns an empty list when there is nothing to pick', () => {
    expect(interleaveByPublisher([], 5)).toEqual([])
    expect(interleaveByPublisher([row('a', 'a.test')], 0)).toEqual([])
  })
})

describe('Naver and YouTube stay optional', () => {
  it('naver config is empty without credentials', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', '')
    vi.stubEnv('NAVER_CLIENT_SECRET', '')
    const { newsConfig } = await import('../server/utils/news/config')
    const cfg = newsConfig()
    expect(cfg.naverClientId).toBe('')
    expect(cfg.naverClientSecret).toBe('')
    vi.unstubAllEnvs()
  })
})
