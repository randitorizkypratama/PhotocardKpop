import type { ReleaseMatch, ReleaseProvider, ReleaseTrack } from './types'
import {
  MATCH_THRESHOLD,
  artistMatches,
  escapeLucene,
  titleSimilarity,
} from './matching'

const BASE = 'https://musicbrainz.org/ws/2'
const USER_AGENT =
  'HIBIKISHOP-Photocatalog/1.0 (https://kpop-tracker-six.vercel.app; photocard catalog)'

/** MusicBrainz asks for max 1 request per second — serialize them per instance. */
let lastRequestAt = 0
let chain: Promise<unknown> = Promise.resolve()

function mbGet(path: string): Promise<any> {
  const run = async () => {
    const wait = 1100 - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    const response = await fetch(`${BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`musicbrainz status ${response.status}`)
    return response.json()
  }
  const next = chain.then(run, run)
  chain = next.catch(() => undefined)
  return next
}

interface RgCandidate {
  id: string
  title: string
  date?: string
  score?: number
  artist?: string
}

async function searchReleaseGroups(artist: string, title: string): Promise<RgCandidate[]> {
  const clauses = [`releasegroup:"${escapeLucene(title)}"`]
  if (artist) clauses.push(`artist:"${escapeLucene(artist)}"`)
  const query = clauses.join(' AND ')
  const json = await mbGet(`/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=8`)
  const groups = Array.isArray(json?.['release-groups']) ? json['release-groups'] : []
  return groups.map((group: any) => ({
    id: String(group.id),
    title: String(group.title || ''),
    date: group['first-release-date'] ? String(group['first-release-date']) : undefined,
    score: Number(group.score) || 0,
    artist: Array.isArray(group['artist-credit'])
      ? group['artist-credit'].map((credit: any) => credit.name).join(', ')
      : undefined,
  }))
}

async function fetchTracks(releaseGroupId: string): Promise<ReleaseTrack[] | undefined> {
  try {
    const json = await mbGet(
      `/release?release-group=${releaseGroupId}&inc=media+recordings&fmt=json&limit=5`,
    )
    const releases = Array.isArray(json?.releases) ? json.releases : []
    let best: ReleaseTrack[] | undefined

    for (const release of releases) {
      const tracks: ReleaseTrack[] = []
      for (const disc of Array.isArray(release?.media) ? release.media : []) {
        for (const track of Array.isArray(disc?.tracks) ? disc.tracks : []) {
          tracks.push({
            position: Number(track.position) || tracks.length + 1,
            title: String(track.title || ''),
          })
        }
      }
      // Prefer the fullest release (album over single/clip) for the tracklist.
      if (tracks.length > 0 && (!best || tracks.length > best.length)) best = tracks.slice(0, 40)
    }

    return best
  } catch {
    return undefined
  }
}

function pick(candidates: RgCandidate[], artist: string, title: string): { candidate: RgCandidate, confidence: number } | null {
  let best: { candidate: RgCandidate, confidence: number } | null = null
  for (const candidate of candidates) {
    if (!candidate.title) continue
    const similarity = titleSimilarity(title, candidate.title)
    if (similarity < MATCH_THRESHOLD) continue
    // Never accept an artist-less candidate when we know the artist, and never
    // accept a different artist — a wrong album is worse than no album.
    if (artist && !candidate.artist) continue
    if (!artistMatches(artist, candidate.artist)) continue
    const confidence = Math.min(1, similarity * (candidate.score && candidate.score >= 90 ? 1 : 0.97))
    if (!best || confidence > best.confidence) best = { candidate, confidence }
  }
  return best
}

export const musicBrainzProvider: ReleaseProvider = {
  id: 'musicbrainz',
  async lookup(artist, title): Promise<ReleaseMatch | null> {
    if (!title) return null
    let candidates = await searchReleaseGroups(artist, title)
    let best = pick(candidates, artist, title)

    if (!best && artist) {
      // Retry without the artist clause (spelling variants) — the artist check
      // still applies, so an unrelated album with the same title is rejected.
      candidates = await searchReleaseGroups('', title)
      best = pick(candidates, artist, title)
    }
    if (!best) return null

    const tracks = await fetchTracks(best.candidate.id)
    return {
      id: best.candidate.id,
      title: best.candidate.title,
      artist: best.candidate.artist || artist,
      releaseDate: best.candidate.date,
      tracks,
      source: 'musicbrainz',
      confidence: Number(best.confidence.toFixed(3)),
    }
  },
}
