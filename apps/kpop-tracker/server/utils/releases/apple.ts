import type { ReleaseMatch, ReleaseProvider, ReleaseTrack } from './types'
import { MATCH_THRESHOLD, artistMatches, titleSimilarity } from './matching'

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`apple status ${response.status}`)
  return response.json()
}

function artworkUrl(template?: string): string | undefined {
  if (!template) return undefined
  return template.replace(/\{\w+\}/g, '600x600').replace(/\/\d+x\d+bb\.jpg/, '/600x600bb.jpg')
}

/** Public iTunes catalog search — no developer token required. */
async function lookupItunes(artist: string, title: string): Promise<ReleaseMatch | null> {
  const term = [artist, title].filter(Boolean).join(' ')
  const search = await getJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=8`,
  )
  const results = Array.isArray(search?.results) ? search.results : []

  let best: any = null
  let bestScore = 0
  for (const result of results) {
    const score = titleSimilarity(title, result.collectionName)
    if (score < MATCH_THRESHOLD) continue
    if (!artistMatches(artist, result.artistName)) continue
    if (score > bestScore) {
      bestScore = score
      best = result
    }
  }
  if (!best) return null

  let tracks: ReleaseTrack[] | undefined
  try {
    const detail = await getJson(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(best.collectionId)}&entity=song`,
    )
    const songs = (Array.isArray(detail?.results) ? detail.results : [])
      .filter((item: any) => item.trackNumber > 0)
      .sort((a: any, b: any) => (a.discNumber || 1) - (b.discNumber || 1) || a.trackNumber - b.trackNumber)
      .slice(0, 40)
      .map((item: any, index: number) => ({
        position: Number(item.trackNumber) || index + 1,
        title: String(item.trackName || ''),
      }))
    tracks = songs.length > 0 ? songs : undefined
  } catch {
    tracks = undefined
  }

  return {
    id: String(best.collectionId),
    title: String(best.collectionName || title),
    artist: String(best.artistName || artist),
    releaseDate: best.releaseDate ? String(best.releaseDate).slice(0, 10) : undefined,
    artwork: artworkUrl(best.artworkUrl100),
    tracks,
    source: 'apple',
    confidence: Number(bestScore.toFixed(3)),
  }
}

/**
 * Official Apple Music API, only used when APPLE_MUSIC_TOKEN is configured on the
 * server. The token never reaches the browser.
 */
async function lookupAppleMusic(artist: string, title: string): Promise<ReleaseMatch | null> {
  const token = process.env.APPLE_MUSIC_TOKEN
  const storefront = process.env.APPLE_MUSIC_STOREFRONT || 'us'
  if (!token) return null

  const term = [artist, title].filter(Boolean).join(' ')
  const search = await getJson(
    `https://api.music.apple.com/v1/catalog/${storefront}/albums?filter[term]=${encodeURIComponent(term)}&limit=8`,
    { Authorization: `Bearer ${token}` },
  )
  const results = Array.isArray(search?.data) ? search.data : []

  let best: any = null
  let bestScore = 0
  for (const item of results) {
    const attrs = item.attributes || {}
    const score = titleSimilarity(title, attrs.name)
    if (score < MATCH_THRESHOLD) continue
    if (!artistMatches(artist, attrs.artistName)) continue
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  if (!best) return null

  let tracks: ReleaseTrack[] | undefined
  try {
    const detail = await getJson(
      `https://api.music.apple.com/v1/catalog/${storefront}/albums/${best.id}?include=tracks`,
      { Authorization: `Bearer ${token}` },
    )
    const songs = detail?.data?.[0]?.relationships?.tracks?.data || []
    tracks = songs
      .slice(0, 40)
      .map((song: any, index: number) => ({
        position: Number(song.attributes?.trackNumber) || index + 1,
        title: String(song.attributes?.name || ''),
      }))
    if (tracks.length === 0) tracks = undefined
  } catch {
    tracks = undefined
  }

  const attrs = best.attributes || {}
  return {
    id: String(best.id),
    title: String(attrs.name || title),
    artist: String(attrs.artistName || artist),
    releaseDate: attrs.releaseDate ? String(attrs.releaseDate).slice(0, 10) : undefined,
    artwork: artworkUrl(attrs.artwork?.url),
    tracks,
    label: attrs.recordLabel ? String(attrs.recordLabel) : undefined,
    source: 'apple',
    confidence: Number(bestScore.toFixed(3)),
  }
}

export const appleMusicProvider: ReleaseProvider = {
  id: 'apple',
  async lookup(artist, title): Promise<ReleaseMatch | null> {
    if (!title) return null
    if (process.env.APPLE_MUSIC_TOKEN) {
      const official = await lookupAppleMusic(artist, title)
      if (official) return official
    }
    return await lookupItunes(artist, title)
  },
}
