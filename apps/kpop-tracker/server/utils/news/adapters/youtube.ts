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
