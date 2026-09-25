const CACHE_TTL_MS = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  const force = getQuery(event).refresh === '1'
  const db = getTursoClient()

  try {
    if (!force) {
      const sample = await db.execute(
        'SELECT fetched_at FROM tiktok_videos ORDER BY fetched_at DESC LIMIT 1',
      )
      const fetchedAt = sample.rows[0]?.fetched_at
      if (fetchedAt) {
        const age = Date.now() - new Date(String(fetchedAt)).getTime()
        if (age < CACHE_TTL_MS) {
          const cached = await loadCachedTikTokVideos()
          if (cached.length > 0) {
            return { success: true, source: 'cache', count: cached.length, videos: cached }
          }
        }
      }
    }

    const videos = await fetchAllTikTokVideos()
    await cacheTikTokVideos(videos)
    return { success: true, source: 'api', count: videos.length, videos }
  } catch (e) {
    const cached = await loadCachedTikTokVideos().catch(() => [])
    const message = e instanceof Error ? e.message : 'Failed to fetch TikTok videos'
    if (cached.length > 0) {
      return { success: true, source: 'cache', count: cached.length, videos: cached, warning: message }
    }
    throw createError({
      statusCode: 400,
      statusMessage: message,
    })
  }
})
