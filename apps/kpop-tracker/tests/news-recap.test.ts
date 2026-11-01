import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RECAP_WINDOW_DAYS,
  bucketRecapTopics,
  recapSlug,
  recapSources,
  recapWeekWindow,
  renderRecapCredits,
  topicKeyFor,
} from '../server/utils/news/rewrite/digest'
import { buildRecapPrompt, RECAP_JSON_SCHEMA } from '../server/utils/news/rewrite/prompt'
import { parseRecapJson } from '../server/utils/news/rewrite/parse'
import { recapConfig } from '../server/utils/news/rewrite/config'
import type { RecapArticle } from '../server/utils/news/rewrite/types'

/**
 * The weekly recap's pure half: the window, the topic bucketing that turns a
 * noisy week into the headings a recap promises, the deterministic slug that
 * makes it idempotent, the citation rendering that credits every source per
 * topic, and the validation of the model's reply. No network, no database.
 */

function article(overrides: Partial<RecapArticle> = {}): RecapArticle {
  return {
    id: 'a1',
    title: '아이브, 뮤직뱅크 1위',
    summary: null,
    language: 'ko',
    category: 'performance',
    publisherName: 'MyDaily',
    publisherDomain: 'mydaily.co.kr',
    url: 'https://www.mydaily.co.kr/article/1',
    publishedAt: '2026-10-26T03:00:00Z',
    ...overrides,
  }
}

describe('recap week window', () => {
  it('is the seven days ending at run time, keyed by the start date', () => {
    const now = new Date('2026-11-02T11:00:00Z')
    const window = recapWeekWindow(now)
    expect(RECAP_WINDOW_DAYS).toBe(7)
    expect(window.weekKey).toBe('2026-10-26')
    expect(window.startIso).toBe('2026-10-26T11:00:00.000Z')
    expect(window.endIso).toBe('2026-11-02T11:00:00.000Z')
    // Same input, same window — a retry derives the same slug.
    expect(recapWeekWindow(now)).toEqual(window)
  })
})

describe('recap slug', () => {
  it('is deterministic per artist and week', () => {
    expect(recapSlug('ive', '2026-10-26')).toBe('rekap-ive-2026-10-26')
    expect(recapSlug('hearts2hearts', '2026-10-26')).toBe('rekap-hearts2hearts-2026-10-26')
    // The unique column on this slug is what blocks a second draft for the
    // same window — the string must not vary between runs.
    expect(recapSlug('ive', '2026-10-26')).toBe(recapSlug('ive', '2026-10-26'))
  })
})

describe('topic bucketing', () => {
  it('groups a Korean and an English headline about one show under one heading', () => {
    const topics = bucketRecapTopics([
      article({ id: 'ko', url: 'https://sportschosun.co.kr/a', title: "아이브, 'Magnetic'로 뮤직뱅크 1위" }),
      article({ id: 'en', url: 'https://soompi.com/b', title: 'IVE takes 1st win on Music Bank with "Magnetic"' }),
    ])
    expect(topics).toHaveLength(1)
    expect(topics[0]!.key).toBe('show:musicbank')
    expect(topics[0]!.label).toBe('Penampilan di Music Bank')
    expect(topics[0]!.articles.map(entry => entry.id)).toEqual(['ko', 'en'])
  })

  it('keeps a music-show win and an award ceremony in separate topics, shows first', () => {
    const topics = bucketRecapTopics([
      article({ id: 'award', url: 'https://mydaily.co.kr/1', title: '아이브, 서울가요대상 본상 수상', category: 'award' }),
      article({ id: 'win', url: 'https://sportschosun.co.kr/2', title: '아이브, 뮤직뱅크 1위' }),
    ])
    expect(topics.map(topic => topic.key)).toEqual(['show:musicbank', 'award:seoulmusic'])
    expect(topics[1]!.label).toBe('Penghargaan Seoul Music Awards')
  })

  it('names a view milestone its own heading and falls back to the category otherwise', () => {
    expect(topicKeyFor(article({ title: "에스파 '더티워크' 뮤직비디오 1억뷰 돌파" })))
      .toEqual({ key: 'milestone:views100m', label: 'Milestone 100 Juta Views' })

    expect(topicKeyFor(article({ title: "아이브 안유진, 샤넬과 함께한 '더블유 코리아' 화보 공개", category: 'media' })))
      .toEqual({ key: 'category:media', label: 'Media & Pictorial' })
  })

  it('applies both caps hard', () => {
    const wins = [1, 2, 3, 4, 5].map(n =>
      article({ id: `w${n}`, url: `https://sportschosun.co.kr/${n}`, title: '아이브, 뮤직뱅크 1위' }))
    const [topic] = bucketRecapTopics(wins, { maxPerTopic: 2 })
    expect(topic!.articles).toHaveLength(2)

    const many = [
      article({ id: 'c1', url: 'https://a/1', title: '아이브 화보 공개', category: 'media' }),
      article({ id: 'c2', url: 'https://a/2', title: '아이브 일정 공개', category: 'schedule' }),
      article({ id: 'c3', url: 'https://a/3', title: '아이브 뮤직뱅크 출연', category: 'performance' }),
    ]
    expect(bucketRecapTopics(many, { maxTopics: 1 })).toHaveLength(1)
    // The heading that survives the cap is the show, not the first category.
    expect(bucketRecapTopics(many, { maxTopics: 1 })[0]!.key).toBe('show:musicbank')
  })

  it('drops a duplicate URL so one article cannot appear twice', () => {
    const topics = bucketRecapTopics([
      article({ id: 'a', url: 'https://same/1' }),
      article({ id: 'b', url: 'https://same/1' }),
    ])
    expect(topics.flatMap(topic => topic.articles)).toHaveLength(1)
  })

  it('flattens topics in order for the citation list', () => {
    const topics = bucketRecapTopics([
      article({ id: 'win', url: 'https://a/1', title: '아이브, 뮤직뱅크 1위' }),
      article({ id: 'award', url: 'https://a/2', title: '아이브, 서울가요대상 본상 수상' }),
    ])
    expect(recapSources(topics).map(entry => entry.id)).toEqual(['win', 'award'])
  })
})

describe('credit rendering (§ per-topic source credit)', () => {
  const sources = [
    article({ id: 's1', publisherName: 'MyDaily' }),
    article({ id: 's2', publisherName: 'Soompi' }),
    article({ id: 's3', publisherName: 'Sports Chosun' }),
  ]

  it('replaces every citation marker with the publisher it points at', () => {
    const body = '## Penampilan di Music Bank\nIVE tampil dan menang. Sumber: [1], [3]'
    expect(renderRecapCredits(body, sources))
      .toBe('## Penampilan di Music Bank\nIVE tampil dan menang. Sumber: MyDaily, Sports Chosun')
  })

  it('keeps the valid half of a partially invented credit line', () => {
    expect(renderRecapCredits('Sumber: [2], [9]', sources)).toBe('Sumber: Soompi')
  })

  it('removes an inline credit left empty by its dropped marker', () => {
    expect(renderRecapCredits('## Lainnya\nKegiatan lain. Sumber: [9]', sources))
      .toBe('## Lainnya\nKegiatan lain.')
  })

  it('removes a whole-line credit that cited nothing, keeping the rest intact', () => {
    const body = 'Paragraf pembuka.\n\nSumber: [7]\n\nParagraf penutup.'
    expect(renderRecapCredits(body, sources)).toBe('Paragraf pembuka.\n\nParagraf penutup.')
  })

  it('falls back to the domain when a row carries no publisher name', () => {
    const bare = [article({ id: 'b1', publisherName: null, publisherDomain: 'yna.co.kr' })]
    expect(renderRecapCredits('Sumber: [1]', bare)).toBe('Sumber: yna.co.kr')
  })
})

describe('recap reply validation', () => {
  const LONG_BODY = 'IVE tampil di Music Bank pekan ini dan membawakan lagu terbaru mereka. '.repeat(6)

  function recapReply(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      title: 'IVE Pekan Ini: Menang di Music Bank dan Sorotan Lainnya',
      dek: 'IVE punya pekan yang sibuk dengan penampilan dan kabar baru. Ini rangkumannya.',
      body_markdown: LONG_BODY,
      ...overrides,
    })
  }

  it('accepts a valid recap reply', () => {
    const parsed = parseRecapJson(recapReply())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.title).toContain('IVE Pekan Ini')
      expect(parsed.value.readingMinutes).toBeGreaterThanOrEqual(1)
    }
  })

  it('tolerates a stray code fence', () => {
    expect(parseRecapJson('```json\n' + recapReply() + '\n```').ok).toBe(true)
  })

  it('rejects a reply with no title, or a body under the floor', () => {
    const noTitle = parseRecapJson(recapReply({ title: '' }))
    expect(noTitle.ok).toBe(false)

    const shortBody = parseRecapJson(recapReply({ body_markdown: 'terlalu pendek' }))
    expect(shortBody.ok).toBe(false)
    if (!shortBody.ok) expect(shortBody.error).toContain('too short')
  })

  it('rejects a reply that is not a JSON object at all', () => {
    expect(parseRecapJson('maaf, saya tidak bisa menulis rekap itu').ok).toBe(false)
  })
})

describe('recap prompt', () => {
  it('carries the artist, the window, the topic headings and the citation convention', () => {
    const prompt = buildRecapPrompt({
      artistName: 'IVE',
      weekKey: '2026-10-26',
      weekEnd: '2026-11-02',
      topics: [{
        label: 'Penampilan di Music Bank',
        articles: [{ index: 1, title: '아이브, 뮤직뱅크 1위', publisher: 'Sports Chosun', publishedAt: '2026-10-24T12:00:00Z' }],
      }],
    })
    expect(prompt).toContain('IVE')
    expect(prompt).toContain('2026-10-26 s/d 2026-11-02')
    expect(prompt).toContain('## Penampilan di Music Bank')
    expect(prompt).toContain('[1] 아이브, 뮤직뱅크 1위 — Sports Chosun — 2026-10-24')
    expect(prompt).toContain(RECAP_JSON_SCHEMA)
    expect(prompt).toContain('Sumber: [n], [m]')
    expect(prompt).toMatch(/JANGAN mengarang/i)
  })
})

describe('recap configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to on with three articles per artist per window', () => {
    vi.stubEnv('RECAP_ENABLED', '')
    vi.stubEnv('RECAP_MIN_ARTICLES', '')
    const config = recapConfig()
    expect(config.enabled).toBe(true)
    expect(config.minArticles).toBe(3)
    expect(config.maxTopics).toBe(6)
    expect(config.maxPerTopic).toBe(4)
  })

  it('can be switched off without touching the rewrite pass', () => {
    vi.stubEnv('RECAP_ENABLED', 'false')
    expect(recapConfig().enabled).toBe(false)
  })
})
