/**
 * YouTube Data API adapter (§4, §7).
 *
 * Runs only when `YOUTUBE_API_KEY` is set. A channel is treated as official
 * only when its ID is on the allowlist configured by the operator after
 * checking it against the agency website — a display name matching "aespa
 * official" proves nothing and is never used to grant official status.
 */

export interface YouTubeVideoCandidate {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  publishedAt: string | null
  url: string
  thumbnail: string | null
  /** True only when the channel ID is on the validated allowlist. */
  official: boolean
}

export interface YouTubeSearchResult {
  videos: YouTubeVideoCandidate[]
  /** Videos skipped because their channel is not on the allowlist. */
  rejectedCount: number
  allowlistSize: number
  error: string | null
}

export function youtubeSearchUrl(query: string, options: { channelId?: string, maxResults?: number } = {}): string {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(Math.min(50, Math.max(1, options.maxResults ?? 10))),
    q: query,
    relevanceLanguage: 'en',
  })
  if (options.channelId) params.set('channelId', options.channelId)
  return `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
}

// ── Uploads playlist (the cheap path: 1 quota unit per call) ───────────────

export interface YouTubeUpload {
  videoId: string
  title: string
  description: string
  channelId: string
  channelTitle: string
  publishedAt: string | null
  url: string
  thumbnail: string | null
}

/**
 * A channel's uploads live in a playlist whose ID is the channel ID with `UC`
 * replaced by `UU`. Reading it costs 1 unit, where a `search` call costs 100 —
 * which is why discovery uses this instead of searching.
 */
export function uploadsPlaylistId(channelId: string): string | null {
  const clean = (channelId || '').trim()
  if (!/^UC[\w-]{20,}$/.test(clean)) return null
  return `UU${clean.slice(2)}`
}

/** The API key is appended by the caller so this stays a pure URL builder. */
export function playlistItemsUrl(
  playlistId: string,
  options: { maxResults?: number, pageToken?: string } = {},
): string {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: String(Math.min(50, Math.max(1, options.maxResults ?? 10))),
  })
  if (options.pageToken) params.set('pageToken', options.pageToken)
  return `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`
}

export function parsePlaylistItems(payload: unknown): {
  uploads: YouTubeUpload[]
  nextPageToken: string | null
  error: string | null
} {
  const body = payload as {
    items?: unknown[]
    nextPageToken?: unknown
    error?: { message?: unknown }
  } | null

  if (body?.error?.message) return { uploads: [], nextPageToken: null, error: String(body.error.message) }
  if (!body || !Array.isArray(body.items)) {
    return { uploads: [], nextPageToken: null, error: 'unexpected YouTube API payload' }
  }

  const uploads: YouTubeUpload[] = []
  for (const raw of body.items) {
    const item = raw as {
      snippet?: Record<string, any>
      contentDetails?: Record<string, any>
    }
    const snippet = item?.snippet
    const videoId = String(item?.contentDetails?.videoId || snippet?.resourceId?.videoId || '')
    if (!videoId || !snippet) continue

    const thumbnails = snippet.thumbnails as Record<string, { url?: string }> | undefined
    uploads.push({
      videoId,
      title: String(snippet.title || '').trim(),
      description: String(snippet.description || '').trim(),
      channelId: String(snippet.channelId || ''),
      channelTitle: String(snippet.channelTitle || ''),
      publishedAt: snippet.publishedAt ? String(snippet.publishedAt) : null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.medium?.url || null,
    })
  }

  return {
    uploads,
    nextPageToken: typeof body.nextPageToken === 'string' ? body.nextPageToken : null,
    error: null,
  }
}

export function parseAllowlist(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^[\w-]{10,}$/.test(value))
}

export function parseYouTubeSearchResponse(
  payload: unknown,
  allowlist: string[],
): YouTubeSearchResult {
  const allowed = new Set(allowlist)
  const result: YouTubeSearchResult = { videos: [], rejectedCount: 0, allowlistSize: allowed.size, error: null }

  const body = payload as { items?: unknown[], error?: { message?: string } } | null
  if (body?.error?.message) {
    result.error = body.error.message
    return result
  }
  if (!body || !Array.isArray(body.items)) {
    result.error = 'unexpected YouTube API payload'
    return result
  }

  for (const raw of body.items) {
    const item = raw as { id?: { videoId?: string }, snippet?: Record<string, unknown> }
    const videoId = item?.id?.videoId
    const snippet = item?.snippet
    if (!videoId || !snippet) continue
    const channelId = String(snippet.channelId || '')
    const thumbnails = snippet.thumbnails as Record<string, { url?: string }> | undefined
    const official = allowed.has(channelId)
    if (!official) {
      result.rejectedCount += 1
      continue
    }
    result.videos.push({
      videoId,
      title: String(snippet.title || ''),
      channelId,
      channelTitle: String(snippet.channelTitle || ''),
      publishedAt: snippet.publishedAt ? String(snippet.publishedAt) : null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: thumbnails?.medium?.url || thumbnails?.default?.url || thumbnails?.high?.url || null,
      official: true,
    })
  }
  return result
}
