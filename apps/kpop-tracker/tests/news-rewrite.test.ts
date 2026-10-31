import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, REWRITE_JSON_SCHEMA } from '../server/utils/news/rewrite/prompt'
import {
  MAX_DEK,
  MAX_IMAGES,
  MAX_TITLE,
  estimateReadingMinutes,
  extractJsonObject,
  parseArticleJson,
} from '../server/utils/news/rewrite/parse'
import { buildGeminiRequest, callGemini, parseGeminiResponse } from '../server/utils/news/rewrite/providers/gemini'
import { createGeminiKeyPool, maskKey } from '../server/utils/news/rewrite/keys'
import { listRawFromEnv, isRewriteConfigured, rewriteConfig } from '../server/utils/news/rewrite/config'
import { toPublicArticle, toPublicCard } from '../server/utils/news/rewrite/public'
import { buildSlug, slugify } from '../server/utils/news/rewrite/store'
import type { NewsRewrite, RewriteImage, RewriteMaterial } from '../server/utils/news/rewrite/types'

/**
 * The rewrite layer's pure half: prompt building, model-output validation, the
 * Gemini request/response mapping and the key pool. No network, no database.
 */

function material(overrides: Partial<RewriteMaterial> = {}): RewriteMaterial {
  return {
    articleId: 'art-1',
    artistId: 'aespa',
    category: 'release',
    originalTitle: 'aespa announces fifth mini album for October 20',
    summary: 'The agency confirmed the date on Sunday.',
    bodyText: 'aespa will release a new mini album. The title track was produced in-house.',
    publisherName: 'Soompi',
    publisherDomain: 'soompi.com',
    publishedAt: '2026-10-25T09:30:00Z',
    verificationStatus: 'PENDING_VERIFICATION',
    verificationScore: 68,
    images: [
      { imageUrl: 'https://cdn.soompi.com/a.jpg', sourceUrl: 'https://www.soompi.com/article/1', creditText: 'Soompi', creditUrl: 'https://www.soompi.com/article/1', caption: 'Poster comeback aespa' },
    ],
    sources: [
      { sourceUrl: 'https://www.soompi.com/article/1', publisherName: 'Soompi', publisherDomain: 'soompi.com', originalTitle: 'aespa announces fifth mini album', publishedAt: '2026-10-25T09:30:00Z' },
      { sourceUrl: 'https://www.koreaherald.com/article/2', publisherName: 'The Korea Herald', publisherDomain: 'koreaherald.com', originalTitle: 'SM confirms aespa comeback', publishedAt: '2026-10-25T00:00:00Z' },
    ],
    ...overrides,
  }
}

/** A body comfortably over the 400-character floor. */
const LONG_BODY = 'aespa akhirnya mengumumkan tanggal comeback mereka dan penggemar langsung heboh di media sosial. '.repeat(5)
const EMPTY_OPTIONS = { imageCount: 0, sourceCount: 0 }

function modelReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'aespa Umumkan Comeback, MY Siap-Siap!',
    dek: 'aespa mengumumkan mini album kelima mereka. Tanggalnya sudah dikonfirmasi oleh agensi.',
    body_markdown: LONG_BODY,
    image_picks: [{ evidence_index: 0, caption: 'Poster comeback' }],
    source_indexes: [0],
    ...overrides,
  })
}

describe('prompt building', () => {
  it('carries the artist, the material and the exact JSON schema', () => {
    const prompt = buildPrompt(material())
    expect(prompt).toContain('aespa')
    expect(prompt).toContain('aespa announces fifth mini album for October 20')
    expect(prompt).toContain(REWRITE_JSON_SCHEMA)
    expect(prompt).toContain('Soompi')
    // The source list is quoted with its indexes so the model can cite them.
    expect(prompt).toContain('0. Soompi')
    expect(prompt).toContain('1. The Korea Herald')
  })

  it('forbids fabrication and forbids URLs in the body', () => {
    const prompt = buildPrompt(material())
    expect(prompt).toMatch(/JANGAN mengarang/i)
    expect(prompt).toMatch(/belum dikonfirmasi/i)
    expect(prompt).toMatch(/Jangan menuliskan URL/i)
  })

  it('truncates the source body to maxInputChars', () => {
    const long = 'x'.repeat(5000)
    const prompt = buildPrompt(material({ bodyText: long }), { maxInputChars: 100 })
    expect(prompt).toContain('x'.repeat(100))
    expect(prompt).not.toContain('x'.repeat(101))
  })

  it('says the material is an official video when there is no article body', () => {
    const prompt = buildPrompt(material({ bodyText: 'Official music video', summary: 'Official music video' }))
    expect(prompt).toContain('unggahan video resmi')
    expect(prompt).toContain('Jangan mengarang isi atau adegan')
  })

  it('does not add the video note for a normal article body', () => {
    expect(buildPrompt(material({ bodyText: 'kata '.repeat(120) }))).not.toContain('unggahan video resmi')
  })

  it('says so when there is nothing to offer', () => {
    const prompt = buildPrompt(material({ images: [], summary: null, bodyText: '' }))
    expect(prompt).toContain('(tidak ada gambar yang tersedia)')
    expect(prompt).toContain('Ringkasan: (tidak ada)')
  })
})

describe('model output validation', () => {
  it('accepts a well-formed reply and derives the reading time', () => {
    const result = parseArticleJson(modelReply(), { imageCount: 1, sourceCount: 2 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.title).toContain('Comeback')
    expect(result.value.imagePicks).toEqual([{ evidenceIndex: 0, caption: 'Poster comeback' }])
    expect(result.value.sourceIndexes).toEqual([0])
    expect(result.value.readingMinutes).toBeGreaterThanOrEqual(1)
  })

  it('tolerates a markdown code fence and surrounding prose', () => {
    const fenced = `Tentu, ini hasilnya:\n\`\`\`json\n${modelReply()}\n\`\`\``
    expect(parseArticleJson(fenced, { imageCount: 1, sourceCount: 2 }).ok).toBe(true)
    expect(extractJsonObject(fenced)).toContain('"title"')
  })

  it('rejects a reply that is not JSON at all', () => {
    const result = parseArticleJson('Maaf, saya tidak bisa membantu.', EMPTY_OPTIONS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('no JSON object')
  })

  it('rejects malformed JSON', () => {
    expect(parseArticleJson('{ "title": "x", ', EMPTY_OPTIONS).ok).toBe(false)
  })

  it('rejects a reply with no title or no dek', () => {
    expect(parseArticleJson(modelReply({ title: '' }), EMPTY_OPTIONS).ok).toBe(false)
    expect(parseArticleJson(modelReply({ dek: '' }), EMPTY_OPTIONS).ok).toBe(false)
  })

  it('rejects a body below the minimum length instead of publishing half an article', () => {
    const result = parseArticleJson(modelReply({ body_markdown: 'Terlalu pendek.' }), EMPTY_OPTIONS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('too short')
  })

  it('strips HTML out of the body', () => {
    const html = `<p>${LONG_BODY}</p><script>alert(1)</script>`
    const result = parseArticleJson(modelReply({ body_markdown: html }), EMPTY_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.bodyMarkdown).not.toContain('<')
    expect(result.value.bodyMarkdown).not.toContain('alert(1)')
  })

  it('keeps the paragraph structure instead of flattening the article', () => {
    const body = `Paragraf pertama yang cukup panjang.\n\n## Sub Judul\n\nParagraf kedua setelah sub judul. ${LONG_BODY}`
    const result = parseArticleJson(modelReply({ body_markdown: body }), EMPTY_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.bodyMarkdown).toContain('\n\n## Sub Judul\n\n')
    expect(result.value.bodyMarkdown.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(3)
  })

  it('pushes a heading the model inlined mid-sentence onto its own line', () => {
    const body = `Pembuka artikel ini cukup panjang. ## Persaingan Ketat Puncak Lalu isi berikutnya. ${LONG_BODY}`
    const result = parseArticleJson(modelReply({ body_markdown: body }), EMPTY_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.bodyMarkdown).toContain('\n\n## Persaingan Ketat Puncak')
  })

  it('caps the title and dek lengths', () => {
    const result = parseArticleJson(modelReply({ title: 'T'.repeat(300), dek: 'D'.repeat(900) }), EMPTY_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.title.length).toBe(MAX_TITLE)
    expect(result.value.dek.length).toBe(MAX_DEK)
  })

  it('drops image picks whose index was never offered, so a credit is never invented', () => {
    const result = parseArticleJson(
      modelReply({ image_picks: [{ evidence_index: 7, caption: 'karangan' }, { evidence_index: 0, caption: 'asli' }] }),
      { imageCount: 1, sourceCount: 2 },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.imagePicks.map(pick => pick.evidenceIndex)).toEqual([0])
  })

  it('de-duplicates picks and never exceeds the cap', () => {
    const picks = Array.from({ length: 8 }, (_, index) => ({ evidence_index: index % 3, caption: null }))
    const result = parseArticleJson(modelReply({ image_picks: picks }), { imageCount: 3, sourceCount: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.imagePicks.length).toBeLessThanOrEqual(MAX_IMAGES)
    expect(new Set(result.value.imagePicks.map(pick => pick.evidenceIndex)).size).toBe(result.value.imagePicks.length)
  })

  it('drops citing an index that does not exist', () => {
    const result = parseArticleJson(modelReply({ source_indexes: [9] }), { imageCount: 1, sourceCount: 2 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Nothing valid was cited, so the reply falls back to the primary source.
    expect(result.value.sourceIndexes).toEqual([0])
  })

  it('an article is never source-less, even with no sources offered', () => {
    const result = parseArticleJson(modelReply({ source_indexes: [] }), EMPTY_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sourceIndexes).toEqual([])
  })

  it('sorts cited sources and caps them', () => {
    const result = parseArticleJson(
      modelReply({ source_indexes: [3, 1, 0, 2, 4, 5, 6, 7] }),
      { imageCount: 0, sourceCount: 8 },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sourceIndexes).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('reading time', () => {
  it('is at least one minute and grows with the text', () => {
    expect(estimateReadingMinutes('')).toBe(1)
    expect(estimateReadingMinutes('kata '.repeat(200))).toBe(1)
    expect(estimateReadingMinutes('kata '.repeat(1200))).toBe(6)
  })
})

describe('Gemini request mapping', () => {
  it('posts to the model endpoint with the key in a header, never the URL', () => {
    const request = buildGeminiRequest({ model: 'gemini-2.5-flash', apiKey: 'AIza-secret', prompt: 'halo', maxTokens: 2048, temperature: 0.5 })
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(request.url).not.toContain('AIza-secret')
    expect(request.headers['x-goog-api-key']).toBe('AIza-secret')
    const body = JSON.parse(request.body)
    expect(body.contents[0].parts[0].text).toBe('halo')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.maxOutputTokens).toBe(2048)
  })
})

describe('Gemini response mapping', () => {
  const okBody = JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"title":"x"}' }] }, finishReason: 'STOP' }],
  })

  it('reads the text out of a normal answer', () => {
    expect(parseGeminiResponse(200, okBody)).toEqual({ ok: true, text: '{"title":"x"}', error: null, quota: false, retryable: false })
  })

  it('marks an overloaded model as retryable so the pool moves to the next key', () => {
    const body = JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } })
    const parsed = parseGeminiResponse(503, body)
    expect(parsed.ok).toBe(false)
    expect(parsed.retryable).toBe(true)
    expect(parsed.quota).toBe(false)
  })

  it('a safety block or a truncated answer is not retryable', () => {
    expect(parseGeminiResponse(200, JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })).retryable).toBe(false)
    const truncated = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ti' }] }, finishReason: 'MAX_TOKENS' }] })
    expect(parseGeminiResponse(200, truncated).retryable).toBe(false)
  })

  it('joins multi-part answers', () => {
    const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })
    expect(parseGeminiResponse(200, body).text).toBe('ab')
  })

  it('flags RESOURCE_EXHAUSTED as a quota error so the key cools down', () => {
    const body = JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } })
    const parsed = parseGeminiResponse(429, body)
    expect(parsed.ok).toBe(false)
    expect(parsed.quota).toBe(true)
    expect(parsed.error).toContain('RESOURCE_EXHAUSTED')
  })

  it('flags a bare 429 with an unreadable body as quota too', () => {
    const parsed = parseGeminiResponse(429, '')
    expect(parsed.quota).toBe(true)
  })

  it('a rejected key is an error but not a quota problem', () => {
    const body = JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'API key not valid' } })
    const parsed = parseGeminiResponse(403, body)
    expect(parsed.ok).toBe(false)
    expect(parsed.quota).toBe(false)
  })

  it('treats a safety block, an empty answer and a truncation as errors', () => {
    expect(parseGeminiResponse(200, JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })).error).toContain('blocked')
    expect(parseGeminiResponse(200, JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })).error).toContain('no text')
    const truncated = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ti' }] }, finishReason: 'MAX_TOKENS' }] })
    expect(parseGeminiResponse(200, truncated).error).toContain('truncated')
  })
})

describe('callGemini', () => {
  it('passes the built request to the transport and parses the answer', async () => {
    const transport = vi.fn(async () => ({
      status: 200,
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"x"}' }] } }] }),
      error: null,
    }))
    const result = await callGemini(
      { model: 'gemini-2.5-flash', apiKey: 'k', prompt: 'p', maxTokens: 100, temperature: 0.2 },
      { timeoutMs: 5000, transport },
    )
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]![0].headers['x-goog-api-key']).toBe('k')
  })

  it('reports a transport failure with its status', async () => {
    const transport = vi.fn(async () => ({ status: 429, body: '', error: 'upstream status 429' }))
    const result = await callGemini(
      { model: 'm', apiKey: 'k', prompt: 'p', maxTokens: 100, temperature: 0 },
      { timeoutMs: 1000, transport },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('upstream status 429')
    expect(result.quota).toBe(true)
  })
})

describe('Gemini key pool', () => {
  it('masks keys so a summary can never leak one', () => {
    expect(maskKey('AIzaSyBcdEfghIjklMnop')).toMatch(/^AIza…Mnop$/)
    expect(maskKey('short')).toBe('****')
    expect(maskKey('')).toBe('****')
  })

  it('reports available keys and cools down the exhausted one', () => {
    const now = 1_000_000
    const pool = createGeminiKeyPool(['key-one-aaaa', 'key-two-bbbb'], 60_000)
    expect(pool.size).toBe(2)
    expect(pool.available(now)).toHaveLength(2)

    pool.cooldown('key-one-aaaa', now)
    expect(pool.isCoolingDown('key-one-aaaa', now)).toBe(true)
    expect(pool.available(now)).toEqual(['key-two-bbbb'])
    // …and it comes back once the cooldown has elapsed.
    expect(pool.available(now + 60_001)).toHaveLength(2)
  })

  it('ignores duplicates and blanks', () => {
    const pool = createGeminiKeyPool(['a-aaaaaaa', 'a-aaaaaaa', '', '  '], 1000)
    expect(pool.size).toBe(1)
    expect(pool.labels()).toEqual([maskKey('a-aaaaaaa')])
  })
})

describe('public blog shapers', () => {
  const base: NewsRewrite = {
    id: 'r1',
    articleId: 'a1',
    slug: 'aespa-comeback-2026-10-abcdef',
    title: 'aespa Umumkan Comeback',
    dek: 'aespa mengumumkan mini album kelima mereka.',
    bodyMarkdown: 'Isi artikel.',
    artistId: 'aespa',
    category: 'release',
    language: 'id',
    readingMinutes: 3,
    status: 'published',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: '2026-10-26T00:00:00Z',
    error: null,
    attempts: 0,
    generatedAt: '2026-10-26T00:00:00Z',
    createdAt: '2026-10-26T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z',
  }

  const transparency = { verification_status: 'PENDING_VERIFICATION', verification_score: 68, publisher_name: 'Soompi', publisher_domain: 'soompi.com' }

  it('exposes a published article', () => {
    const card = toPublicCard({ ...base, thumbnail: 'https://cdn.soompi.com/a.jpg' })
    expect(card?.slug).toBe(base.slug)
    expect(card?.thumbnail).toBe('https://cdn.soompi.com/a.jpg')
    expect(card?.reading_minutes).toBe(3)
  })

  it('never serialises a draft, an approved or a rejected rewrite', () => {
    for (const status of ['draft', 'approved', 'rejected', 'failed'] as const) {
      expect(toPublicCard({ ...base, status, thumbnail: null })).toBeNull()
      expect(toPublicArticle({ ...base, status }, [], [], transparency)).toBeNull()
    }
  })

  it('drops an unsafe preview image instead of passing it to a browser', () => {
    expect(toPublicCard({ ...base, thumbnail: 'http://127.0.0.1/x.jpg' })?.thumbnail).toBeNull()
    expect(toPublicCard({ ...base, thumbnail: 'http://cdn.soompi.com/a.jpg' })?.thumbnail).toBeNull()
    expect(toPublicCard({ ...base, thumbnail: null })?.thumbnail).toBeNull()
  })

  it('keeps only images that are both renderable and linkable', () => {
    const image = (overrides: Partial<RewriteImage> = {}): RewriteImage => ({
      id: 'i0',
      rewriteId: 'r1',
      position: 0,
      imageUrl: 'https://cdn.soompi.com/a.jpg',
      sourceUrl: 'https://www.soompi.com/article/1',
      creditText: 'Soompi',
      creditUrl: 'https://www.soompi.com/article/1',
      caption: 'Poster',
      rightsStatus: 'hotlinked_credited',
      createdAt: '2026-10-26T00:00:00Z',
      ...overrides,
    })

    const article = toPublicArticle(
      base,
      [image(), image({ id: 'i1', imageUrl: 'http://cdn.soompi.com/insecure.jpg' }), image({ id: 'i2', sourceUrl: 'http://127.0.0.1/leak' })],
      [{
        id: 's0',
        rewriteId: 'r1',
        position: 0,
        sourceUrl: 'https://www.soompi.com/article/1',
        publisherName: 'Soompi',
        publisherDomain: 'soompi.com',
        originalTitle: 'aespa announces fifth mini album',
        publishedAt: '2026-10-25T00:00:00Z',
        createdAt: '2026-10-26T00:00:00Z',
      }],
      transparency,
    )

    expect(article?.images).toHaveLength(1)
    expect(article?.images[0]?.image_url).toBe('https://cdn.soompi.com/a.jpg')
    expect(article?.thumbnail).toBe('https://cdn.soompi.com/a.jpg')
    expect(article?.sources).toHaveLength(1)
    expect(article?.transparency.verification_score).toBe(68)
  })
})

describe('slug building', () => {
  it('cuts a long title at a whole word, never mid-word', () => {
    const slug = slugify('Keseruan IVE di M Countdown Bersama A2O LITE dan JxJ SEVENTEEN')
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-sevente')).toBe(false)
    expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('keeps a short title and never returns an empty slug', () => {
    expect(slugify('IVE Comeback!')).toBe('ive-comeback')
    expect(slugify('!!!')).toBe('artikel')
  })

  it('appends the publish date and a short random suffix', () => {
    expect(buildSlug('aespa Umumkan Comeback', '2026-10-22T09:00:00Z'))
      .toMatch(/^aespa-umumkan-comeback-2026-10-22-[0-9a-f]{6}$/)
  })

  it('omits the date when the source has none', () => {
    expect(buildSlug('aespa Umumkan Comeback', null)).toMatch(/^aespa-umumkan-comeback-[0-9a-f]{6}$/)
  })
})

describe('rewrite configuration', () => {
  it('keeps API keys case-sensitive instead of lowercasing them', () => {
    vi.stubEnv('GEMINI_API_KEYS', 'AIzaMixedCase,secondKEY')
    expect(listRawFromEnv('GEMINI_API_KEYS')).toEqual(['AIzaMixedCase', 'secondKEY'])
    expect(rewriteConfig().geminiApiKeys).toEqual(['AIzaMixedCase', 'secondKEY'])
    vi.unstubAllEnvs()
  })

  it('is unconfigured without any key, and configured once one exists', () => {
    vi.stubEnv('GEMINI_API_KEYS', '')
    expect(isRewriteConfigured(rewriteConfig())).toBe(false)
    vi.stubEnv('GEMINI_API_KEYS', 'AIza-xxxx')
    expect(isRewriteConfigured(rewriteConfig())).toBe(true)
    vi.unstubAllEnvs()
  })

  it('can be switched off entirely', () => {
    vi.stubEnv('GEMINI_API_KEYS', 'AIza-xxxx')
    vi.stubEnv('REWRITE_ENABLED', 'false')
    expect(isRewriteConfigured(rewriteConfig())).toBe(false)
    vi.unstubAllEnvs()
  })
})
