import { describe, expect, it } from 'vitest'
import { matchArtist, normalizeForMatch, ARTISTS } from '../server/utils/news/artists'
import { normalizeNewsTitle, newsTitleSimilarity } from '../server/utils/news/text'

describe('Korean artist matching', () => {
  it('matches aespa from Korean headline', () => {
    const result = matchArtist('에스파 새 앨범 발매 확정 컴백')
    expect(result.match?.artistId).toBe('aespa')
  })

  it('matches IVE from Korean headline', () => {
    const result = matchArtist('아이브 신곡 발매 스케줄 공개')
    expect(result.match?.artistId).toBe('ive')
  })

  it('matches Hearts2Hearts from Korean headline', () => {
    const result = matchArtist('하츠투하츠 컴백 앨범 발매')
    expect(result.match?.artistId).toBe('hearts2hearts')
  })

  it('matches Hearts2Hearts with space variant', () => {
    const result = matchArtist('하츠 투 하츠 신곡 공개')
    expect(result.match?.artistId).toBe('hearts2hearts')
  })

  it('does not match IVE in plain English without context', () => {
    const result = matchArtist('The stock market has improved considerably')
    expect(result.match).toBeNull()
  })

  it('matches IVE with kpop publisher context', () => {
    const result = matchArtist('IVE drops new single', { publisherIsKpopSource: true })
    expect(result.match?.artistId).toBe('ive')
  })

  it('normalizeForMatch handles Hangul correctly', () => {
    const result = normalizeForMatch('에스파 컴백')
    expect(result).toContain('에스파')
    expect(result).toContain('컴백')
  })

  it('Korean headline similarity works for same story', () => {
    const a = normalizeNewsTitle('에스파 새 앨범 발매 확정')
    const b = normalizeNewsTitle('에스파 새 앨범 발매 확정 소식')
    expect(newsTitleSimilarity(a, b)).toBeGreaterThan(0.5)
  })

  it('Korean headline similarity is low for different stories', () => {
    const a = normalizeNewsTitle('에스파 컴백 발표')
    const b = normalizeNewsTitle('아이브 신곡 공개')
    expect(newsTitleSimilarity(a, b)).toBeLessThan(0.4)
  })

  it('aespa has Korean alias 에스파', () => {
    expect(ARTISTS.aespa.aliases).toContain('에스파')
  })

  it('IVE has Korean alias 아이브', () => {
    expect(ARTISTS.ive.aliases).toContain('아이브')
  })

  it('Hearts2Hearts has Korean alias 하츠투하츠', () => {
    expect(ARTISTS.hearts2hearts.aliases).toContain('하츠투하츠')
  })

  it('Hearts2Hearts has Korean space variant 하츠 투 하츠', () => {
    expect(ARTISTS.hearts2hearts.aliases).toContain('하츠 투 하츠')
  })

  it('aespa members include Korean names', () => {
    expect(ARTISTS.aespa.members).toContain('카리나')
    expect(ARTISTS.aespa.members).toContain('윈터')
  })
})

describe('Korean source registry', () => {
  it('translation supports ko source language', async () => {
    // translationUrl with source=ko should produce a valid URL
    const { translationUrl } = await import('../server/utils/news/translate')
    const url = translationUrl('에스파 컴백', 'en', 'ko')
    expect(url).toContain('langpair=ko%7Cen')
    expect(url).toContain('api.mymemory.translated.net')
  })

  it('translation URL for ko->id', async () => {
    const { translationUrl } = await import('../server/utils/news/translate')
    const url = translationUrl('아이브 신곡', 'id', 'ko')
    expect(url).toContain('langpair=ko%7Cid')
  })

  it('parseTranslation handles MyMemory Korean response', async () => {
    const { parseTranslation } = await import('../server/utils/news/translate')
    const mockBody = JSON.stringify({
      responseStatus: 200,
      responseData: { translatedText: 'aespa comeback' },
    })
    const result = parseTranslation(mockBody, 'en')
    expect(result.ok).toBe(true)
    expect(result.text).toBe('aespa comeback')
  })
})
