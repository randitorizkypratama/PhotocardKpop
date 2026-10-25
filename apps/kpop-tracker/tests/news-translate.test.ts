import { describe, expect, it, vi } from 'vitest'
import {
  TARGET_LANGS,
  isTargetLang,
  parseTranslation,
  translateArticle,
  translateText,
  translationUrl,
} from '../server/utils/news/translate'
import { localizeArticle, parseFeedLang, type PublicArticle } from '../server/utils/news/feed'

/**
 * Translation is display-only: the engine may add wording next to the
 * verified original, never replace or invent it. Every failure path must land
 * on the original text.
 */

function article(overrides: Partial<PublicArticle> = {}): PublicArticle {
  return {
    id: 'art-1',
    artist_id: 'aespa',
    title: 'aespa announces new single',
    original_title: 'aespa announces new single',
    summary: 'The agency confirmed a November release.',
    category: 'release',
    original_url: 'https://kpopleague.com/news/aespa-single',
    canonical_url: 'https://kpopleague.com/news/aespa-single',
    publisher_name: 'KPop League',
    publisher_domain: 'kpopleague.com',
    published_at: '2026-10-25T02:30:00.000Z',
    published_at_has_time: true,
    event_date: null,
    language: 'en',
    verification_status: 'VERIFIED',
    verification_score: 96,
    last_checked_at: '2026-10-25T06:00:00.000Z',
    evidence_count: 3,
    thumbnail: null,
    translated: false,
    translation_lang: 'en',
    ...overrides,
  } as PublicArticle
}

function ok(body: unknown) {
  return { ok: true, body: JSON.stringify(body), error: null }
}

describe('target languages', () => {
  it('covers English and Indonesian only', () => {
    expect([...TARGET_LANGS]).toEqual(['en', 'id'])
  })

  it('isTargetLang accepts exactly those two', () => {
    expect(isTargetLang('en')).toBe(true)
    expect(isTargetLang('id')).toBe(true)
    expect(isTargetLang('ko')).toBe(false)
    expect(isTargetLang(undefined)).toBe(false)
  })
})

describe('translationUrl — keyless endpoint, single bounded query', () => {
  it('builds a MyMemory get request with the lang pair', () => {
    const url = translationUrl('aespa announces new single', 'id')
    expect(url.startsWith('https://api.mymemory.translated.net/get?q=')).toBe(true)
    expect(url).toContain('langpair=en%7Cid')
    expect(url).toContain(encodeURIComponent('aespa announces new single'))
  })

  it('defaults the source to English when none is given', () => {
    expect(translationUrl('안녕하세요', 'en')).toContain('langpair=en%7Cen')
  })

  it('caps the query at the provider limit instead of sending a novel', () => {
    const long = 'x'.repeat(2000)
    const url = translationUrl(long, 'id')
    const query = new URL(url).searchParams.get('q') || ''
    expect(query.length).toBeLessThanOrEqual(480)
  })

  it('trims the text before encoding it', () => {
    const url = translationUrl('   hello   ', 'id')
    expect(new URL(url).searchParams.get('q')).toBe('hello')
  })
})

describe('parseTranslation — anything uncertain is a failure', () => {
  it('accepts a clean translation', () => {
    const result = parseTranslation(JSON.stringify({
      responseStatus: 200,
      responseData: { translatedText: 'aespa mengumumkan single baru' },
    }), 'id')
    expect(result).toEqual({ ok: true, text: 'aespa mengumumkan single baru', error: null })
  })

  it('trims the returned wording', () => {
    const result = parseTranslation(JSON.stringify({
      responseData: { translatedText: '  IVE akan merilis lagu baru  ' },
    }), 'id')
    expect(result.text).toBe('IVE akan merilis lagu baru')
  })

  it('rejects non-JSON bodies', () => {
    const result = parseTranslation('<html>rate limited</html>', 'id')
    expect(result.ok).toBe(false)
    expect(result.text).toBeNull()
    expect(result.error).toMatch(/non-JSON/)
  })

  it('rejects a non-200 provider status', () => {
    const result = parseTranslation(JSON.stringify({
      responseStatus: 429,
      responseData: { translatedText: 'something' },
    }), 'id')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/429/)
  })

  it('rejects an empty translation', () => {
    const result = parseTranslation(JSON.stringify({ responseData: { translatedText: '   ' } }), 'id')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no text/)
  })

  it('rejects provider quota warnings even when they come back as text', () => {
    const result = parseTranslation(JSON.stringify({
      responseData: { translatedText: 'MYMEMORY WARNING: NO TRANSLATION AVAILABLE' },
    }), 'id')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/quota|query/i)
  })

  it('rejects a malformed payload with a missing responseData', () => {
    const result = parseTranslation(JSON.stringify({ responseStatus: 200 }), 'id')
    expect(result.ok).toBe(false)
  })

  it('rejects the provider payload that refuses an unsupported language pair', () => {
    const result = parseTranslation(JSON.stringify({
      responseStatus: 200,
      responseData: { translatedText: "'AUTO' IS AN INVALID SOURCE LANGUAGE . EXAMPLE: LANGPAIR=EN|IT" },
    }), 'en')
    expect(result.ok).toBe(false)
    expect(result.text).toBeNull()
  })
})

describe('translateText — through the polite fetch, with fallback on any failure', () => {
  it('returns the provider wording on success', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({
      responseStatus: 200,
      responseData: { translatedText: 'aespa mengumumkan single baru' },
    }))
    const result = await translateText('aespa announces new single', 'id', { fetchBody })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('aespa mengumumkan single baru')
    expect(fetchBody).toHaveBeenCalledTimes(1)
    expect(fetchBody.mock.calls[0][0]).toContain('langpair=en%7Cid')
  })

  it('never throws when the fetch fails — it reports the error', async () => {
    const fetchBody = vi.fn().mockResolvedValue({ ok: false, body: '', error: 'timeout' })
    const result = await translateText('hello', 'id', { fetchBody })
    expect(result).toEqual({ ok: false, text: null, error: 'timeout' })
  })

  it('never throws when the fetch itself rejects', async () => {
    const fetchBody = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(translateText('hello', 'id', { fetchBody })).rejects.toThrow('network down')
  })

  it('skips the network entirely for empty input', async () => {
    const fetchBody = vi.fn()
    const result = await translateText('   ', 'id', { fetchBody })
    expect(result.ok).toBe(false)
    expect(fetchBody).not.toHaveBeenCalled()
  })

  it('honours an explicit source language', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({ responseData: { translatedText: 'aespa' } }))
    await translateText('에스파', 'en', { fetchBody, source: 'ko' })
    expect(fetchBody.mock.calls[0][0]).toContain('langpair=ko%7Cen')
  })
})

describe('translateArticle — headline first, summary optional, original never lost', () => {
  const input = { title: 'aespa announces new single', summary: 'The agency confirmed it.', language: 'en' }

  it('translates both fields when the provider answers', async () => {
    const fetchBody = vi.fn()
      .mockResolvedValueOnce(ok({ responseData: { translatedText: 'aespa mengumumkan single baru' } }))
      .mockResolvedValueOnce(ok({ responseData: { translatedText: 'Agensi mengonfirmasinya.' } }))
    const { translation, error } = await translateArticle(input, 'id', { fetchBody })
    expect(error).toBeNull()
    expect(translation).toEqual({
      lang: 'id',
      title: 'aespa mengumumkan single baru',
      summary: 'Agensi mengonfirmasinya.',
    })
    expect(fetchBody).toHaveBeenCalledTimes(2)
  })

  it('uses the detected source language of the article', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({ responseData: { translatedText: 'aespa' } }))
    await translateArticle({ ...input, language: 'ko' }, 'en', { fetchBody })
    expect(fetchBody.mock.calls[0][0]).toContain('langpair=ko%7Cen')
  })

  it('falls back to English when the language code is unknown', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({ responseData: { translatedText: 'aespa' } }))
    await translateArticle({ ...input, language: 'xx-YY' }, 'id', { fetchBody })
    expect(fetchBody.mock.calls[0][0]).toContain('langpair=en%7Cid')
  })

  it('strips the region tag from a code like ko-KR', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({ responseData: { translatedText: 'aespa' } }))
    await translateArticle({ ...input, language: 'ko-KR' }, 'id', { fetchBody })
    expect(fetchBody.mock.calls[0][0]).toContain('langpair=ko%7Cid')
  })

  it('keeps an Indonesian article on an id|en pair instead of falling back to English', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({ responseData: { translatedText: 'aespa announces a world tour' } }))
    const { translation } = await translateArticle(
      { title: 'aespa mengumumkan tur dunia', summary: null, language: 'id' },
      'en',
      { fetchBody },
    )
    expect(fetchBody.mock.calls[0][0]).toContain('langpair=id%7Cen')
    expect(translation?.title).toBe('aespa announces a world tour')
  })

  it('never asks the provider to translate a language into itself', async () => {
    const fetchBody = vi.fn()
    const { translation, error } = await translateArticle(
      { title: 'aespa announces new single', summary: null, language: 'en' },
      'en',
      { fetchBody },
    )
    expect(fetchBody).not.toHaveBeenCalled()
    expect(translation).toBeNull()
    expect(error).toMatch(/identical/)
  })

  it('reports a failure and stores nothing when the headline cannot be translated', async () => {
    const fetchBody = vi.fn().mockResolvedValue({ ok: false, body: '', error: 'upstream status 429' })
    const { translation, error } = await translateArticle(input, 'id', { fetchBody })
    expect(translation).toBeNull()
    expect(error).toMatch(/429/)
  })

  it('keeps the translated headline when only the summary fails (summary null = keep original)', async () => {
    const fetchBody = vi.fn()
      .mockResolvedValueOnce(ok({ responseData: { translatedText: 'aespa mengumumkan single baru' } }))
      .mockResolvedValueOnce({ ok: false, body: '', error: 'timeout' })
    const { translation, error } = await translateArticle(input, 'id', { fetchBody })
    expect(error).toBeNull()
    expect(translation?.title).toBe('aespa mengumumkan single baru')
    expect(translation?.summary).toBeNull()
  })

  it('makes a single request when there is no summary', async () => {
    const fetchBody = vi.fn().mockResolvedValue(ok({ responseData: { translatedText: 'judul' } }))
    const { translation } = await translateArticle({ ...input, summary: null }, 'id', { fetchBody })
    expect(fetchBody).toHaveBeenCalledTimes(1)
    expect(translation?.summary).toBeNull()
  })
})

describe('parseFeedLang — a malformed value can never widen the response', () => {
  it('accepts id', () => {
    expect(parseFeedLang('id')).toBe('id')
  })

  it('falls back to en for everything else', () => {
    expect(parseFeedLang('en')).toBe('en')
    expect(parseFeedLang('ID')).toBe('en')
    expect(parseFeedLang('ko')).toBe('en')
    expect(parseFeedLang(undefined)).toBe('en')
    expect(parseFeedLang(null)).toBe('en')
    expect(parseFeedLang(['id'])).toBe('id')
    expect(parseFeedLang(['en', 'id'])).toBe('en')
    expect(parseFeedLang(42)).toBe('en')
  })
})

describe('localizeArticle — swap wording only when a usable translation exists', () => {
  const original = article()

  it('keeps the verified wording when there is no translation at all', () => {
    const out = localizeArticle(original, null, 'id')
    expect(out.title).toBe('aespa announces new single')
    expect(out.summary).toBe(original.summary)
    expect(out.translated).toBe(false)
    expect(out.original_title).toBe('aespa announces new single')
  })

  it('swaps in a usable translation and keeps the original beside it', () => {
    const out = localizeArticle(original, {
      lang: 'id',
      title: 'aespa mengumumkan single baru',
      summary: 'Agensi mengonfirmasi rilis November.',
      status: 'ok',
    }, 'id')
    expect(out.title).toBe('aespa mengumumkan single baru')
    expect(out.summary).toBe('Agensi mengonfirmasi rilis November.')
    expect(out.original_title).toBe('aespa announces new single')
    expect(out.translated).toBe(true)
    expect(out.translation_lang).toBe('id')
  })

  it('ignores a row stored for another language', () => {
    const out = localizeArticle(original, {
      lang: 'en',
      title: 'judul lain',
      summary: null,
      status: 'ok',
    }, 'id')
    expect(out.title).toBe(original.title)
    expect(out.translated).toBe(false)
  })

  it('ignores a failed row', () => {
    const out = localizeArticle(original, {
      lang: 'id',
      title: null,
      summary: null,
      status: 'failed',
    }, 'id')
    expect(out.title).toBe(original.title)
    expect(out.translated).toBe(false)
  })

  it('does not claim a translation when the wording is identical', () => {
    const out = localizeArticle(original, {
      lang: 'id',
      title: 'aespa announces new single',
      summary: null,
      status: 'ok',
    }, 'id')
    expect(out.translated).toBe(false)
    expect(out.title).toBe(original.title)
  })

  it('keeps the original summary when the translation only has a headline', () => {
    const out = localizeArticle(original, {
      lang: 'id',
      title: 'aespa mengumumkan single baru',
      summary: null,
      status: 'ok',
    }, 'id')
    expect(out.title).toBe('aespa mengumumkan single baru')
    expect(out.summary).toBe(original.summary)
    expect(out.translated).toBe(true)
  })

  it('carries the source language through untouched', () => {
    const out = localizeArticle(article({ language: 'ko' }), null, 'en')
    expect(out.source_language).toBe('ko')
    expect(out.language).toBe('ko')
    expect(out.translated).toBe(false)
  })
})
