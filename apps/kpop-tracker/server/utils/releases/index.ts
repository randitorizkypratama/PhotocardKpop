import type { ReleaseMatch, ReleaseProvider } from './types'
import { musicBrainzProvider } from './musicbrainz'
import { appleMusicProvider } from './apple'
import { readReleaseCache, releaseCacheKey, writeReleaseCache } from './cache'

/**
 * Priority: MusicBrainz first (metadata authority), Apple second (artwork + tracks).
 * Pocamarket stays the source of truth for the photocard itself — enrichment only
 * fills release metadata that the caller may choose to ignore.
 */
export const releaseProviders: ReleaseProvider[] = [musicBrainzProvider, appleMusicProvider]

export interface ReleaseLookupResult {
  match: ReleaseMatch | null
  cached: boolean
}

const inFlight = new Map<string, Promise<ReleaseLookupResult>>()

export async function resolveRelease(artist: string, title: string): Promise<ReleaseLookupResult> {
  const key = releaseCacheKey(artist, title)
  const cached = await readReleaseCache(key)
  if (cached.status === 'hit') return { match: cached.match, cached: true }
  if (cached.status === 'negative') return { match: null, cached: true }

  const pending = inFlight.get(key)
  if (pending) return pending

  const task = (async (): Promise<ReleaseLookupResult> => {
    let match: ReleaseMatch | null = null
    let failed = false

    for (const provider of releaseProviders) {
      let result: ReleaseMatch | null = null
      try {
        result = await provider.lookup(artist, title)
      } catch {
        failed = true
      }
      if (!result) continue

      if (!match) {
        match = { ...result, sources: [result.source] }
      } else {
        // Gap filling only: never replace metadata we already accepted.
        if (!match.artwork && result.artwork) {
          match.artwork = result.artwork
          if (!match.sources?.includes(result.source)) match.sources?.push(result.source)
        }
        if (!match.releaseDate && result.releaseDate) match.releaseDate = result.releaseDate
        const currentTracks = match.tracks?.length || 0
        if (currentTracks < 3 && (result.tracks?.length || 0) > currentTracks) {
          match.tracks = result.tracks
          if (!match.sources?.includes(result.source)) match.sources?.push(result.source)
        }
        if (!match.label && result.label) match.label = result.label
      }

      const hasArtwork = Boolean(match.artwork)
      const trackCount = match.tracks?.length || 0
      if (hasArtwork && trackCount >= 3) break
    }

    // Only remember genuine "no such release" answers, not provider outages.
    if (match || !failed) await writeReleaseCache(key, artist, title, match)
    return { match, cached: false }
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, task)
  return task
}
