import { describe, expect, it, vi } from 'vitest'
import {
  NAVER_NEWS_ENDPOINT,
  cleanNaverText,
  naverNewsUrl,
  naverSearchHeaders,
  parseNaverNews,
} from '../server/utils/news/adapters/naver'
import { parseYouTubeFeed, youtubeFeedUrl } from '../server/utils/news/adapters/youtubeRss'
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

describe('YouTube channel feed adapter (keyless)', () => {
  // The real feed shape: Atom entries, namespaced yt:videoId and a media:group
  // carrying the title, description and thumbnail.
  const FEED = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <title>aespa</title>
      <entry>
        <id>yt:video:abcdefghijk</id>
        <yt:videoId>abcdefghijk</yt:videoId>
        <title>aespa 에스파 'Drama' MV</title>
        <published>2026-10-27T09:00:00+00:00</published>
        <author><name>aespa</name><uri>https://www.youtube.com/channel/${CHANNEL_ID}</uri></author>
        <media:group>
          <media:title>aespa 에스파 'Drama' MV</media:title>
          <media:thumbnail url="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" width="480" height="360" />
          <media:description>Official music video</media:description>
        </media:group>
      </entry>
      <entry>
        <id>yt:video:zzzzzzzzzzz</id>
        <yt:videoId>zzzzzzzzzzz</yt:videoId>
        <title>take the backseat #Shorts</title>
        <published>2026-10-28T09:00:00+00:00</published>
        <author><name>aespa</name></author>
        <media:group>
          <media:title>take the backseat #Shorts</media:title>
          <media:description></media:description>
        </media:group>
      </entry>
    </feed>`

  it('builds the public Atom feed URL and rejects a malformed channel id', () => {
    expect(youtubeFeedUrl(CHANNEL_ID)).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`)
    expect(youtubeFeedUrl('not-a-channel')).toBeNull()
    expect(youtubeFeedUrl('')).toBeNull()
  })

  it('parses uploads with their title, description and thumbnail', () => {
    const uploads = parseYouTubeFeed(FEED)
    expect(uploads).toHaveLength(2)
    expect(uploads[0]).toMatchObject({
      videoId: 'abcdefghijk',
      title: 'aespa 에스파 \'Drama\' MV',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      description: 'Official music video',
      publishedAt: '2026-10-27T09:00:00+00:00',
      channelTitle: 'aespa',
    })
  })

  it('keeps Shorts and falls back to the per-video thumbnail', () => {
    const uploads = parseYouTubeFeed(FEED)
    expect(uploads[1]!.title).toContain('#Shorts')
    expect(uploads[1]!.thumbnail).toBe('https://i.ytimg.com/vi/zzzzzzzzzzz/hqdefault.jpg')
  })

  it('skips an entry with no usable video id', () => {
    expect(parseYouTubeFeed('<feed><entry><title>no id</title></entry></feed>')).toHaveLength(0)
    expect(parseYouTubeFeed('')).toHaveLength(0)
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
