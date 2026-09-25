export interface TikTokTokens {
  access_token: string
  refresh_token?: string
  open_id?: string
  expires_in?: number
  refresh_expires_in?: number
  scope?: string
}

export interface TikTokVideo {
  id: string
  title?: string
  video_description?: string
  duration?: number
  cover_image_url?: string
  share_url?: string
  embed_link?: string
  create_time?: number
  like_count?: number
  comment_count?: number
  share_count?: number
  view_count?: number
}

const VIDEO_FIELDS = [
  'id',
  'title',
  'video_description',
  'duration',
  'cover_image_url',
  'share_url',
  'embed_link',
  'create_time',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
].join(',')

export function getTikTokConfig() {
  const config = useRuntimeConfig()
  return {
    clientKey: config.tiktokClientKey as string,
    clientSecret: config.tiktokClientSecret as string,
    redirectUri: config.tiktokRedirectUri as string,
  }
}

export function isTikTokConfigured() {
  const { clientKey, clientSecret, redirectUri } = getTikTokConfig()
  return Boolean(clientKey && clientSecret && redirectUri)
}

function flattenTokenResponse(body: any): TikTokTokens | null {
  if (!body) return null
  if (body.access_token) return body as TikTokTokens
  if (body.data?.access_token) return body.data as TikTokTokens
  return null
}

export async function loadTokens() {
  const db = getTursoClient()
  const result = await db.execute('SELECT * FROM tiktok_auth WHERE id = 1')
  const row = result.rows[0]
  if (!row?.access_token) return null
  return {
    accessToken: row.access_token as string,
    refreshToken: (row.refresh_token as string) || '',
    openId: (row.open_id as string) || '',
    expiresAt: Number(row.expires_at) || 0,
    refreshExpiresAt: Number(row.refresh_expires_at) || 0,
    scope: (row.scope as string) || '',
  }
}

export async function saveTokens(tokens: TikTokTokens) {
  const db = getTursoClient()
  const now = Date.now()
  const expiresAt = now + (Number(tokens.expires_in) || 86400) * 1000
  const refreshExpiresAt = now + (Number(tokens.refresh_expires_in) || 31536000) * 1000

  await db.execute({
    sql: `INSERT INTO tiktok_auth (id, access_token, refresh_token, open_id, expires_at, refresh_expires_at, scope, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            open_id = excluded.open_id,
            expires_at = excluded.expires_at,
            refresh_expires_at = excluded.refresh_expires_at,
            scope = excluded.scope,
            updated_at = excluded.updated_at`,
    args: [
      tokens.access_token,
      tokens.refresh_token || '',
      tokens.open_id || '',
      expiresAt,
      refreshExpiresAt,
      tokens.scope || '',
      new Date().toISOString(),
    ],
  })
}

export async function exchangeCodeForToken(code: string): Promise<TikTokTokens> {
  const { clientKey, clientSecret, redirectUri } = getTikTokConfig()
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body,
  })

  const json = await res.json().catch(() => null)
  const tokens = flattenTokenResponse(json)
  if (!tokens?.access_token) {
    throw new Error(json?.error?.message || json?.description || json?.message || 'TikTok token exchange failed')
  }
  return tokens
}

export async function refreshAccessToken(): Promise<TikTokTokens | null> {
  const stored = await loadTokens()
  if (!stored?.refreshToken) return null
  if (stored.refreshExpiresAt && stored.refreshExpiresAt < Date.now()) return null

  const { clientKey, clientSecret } = getTikTokConfig()
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
  })

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body,
  })

  const json = await res.json().catch(() => null)
  const tokens = flattenTokenResponse(json)
  if (!tokens?.access_token) return null
  await saveTokens(tokens)
  return tokens
}

export async function getValidAccessToken(): Promise<string | null> {
  const stored = await loadTokens()
  if (!stored?.accessToken) return null

  const skewMs = 60_000
  if (!stored.expiresAt || stored.expiresAt - skewMs > Date.now()) {
    return stored.accessToken
  }

  const refreshed = await refreshAccessToken()
  return refreshed?.access_token || stored.accessToken
}

export async function fetchAllTikTokVideos(): Promise<TikTokVideo[]> {
  const accessToken = await getValidAccessToken()
  if (!accessToken) throw new Error('Not connected')

  const videos: TikTokVideo[] = []
  let cursor = 0
  let hasMore = true
  let pages = 0
  const maxPages = 50

  while (hasMore && pages < maxPages) {
    const res = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${VIDEO_FIELDS}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20, cursor }),
      },
    )

    const json = await res.json().catch(() => null)
    const errCode = json?.error?.code
    if (errCode && errCode !== 'ok') {
      if (errCode === 'access_token_invalid' || errCode === 'token_expires') {
        const refreshed = await refreshAccessToken()
        if (!refreshed) throw new Error('TikTok token expired')
        continue
      }
      throw new Error(`TikTok video list error: ${errCode}`)
    }

    const list = json?.data?.videos || []
    videos.push(...list)
    hasMore = Boolean(json?.data?.has_more)
    cursor = Number(json?.data?.cursor) || 0
    pages += 1
    if (list.length === 0) break
  }

  return videos
}

export async function cacheTikTokVideos(videos: TikTokVideo[]) {
  if (videos.length === 0) return
  const db = getTursoClient()
  const now = new Date().toISOString()

  for (const video of videos) {
    if (!video?.id) continue
    await db.execute({
      sql: `INSERT INTO tiktok_videos
              (id, title, video_description, duration, cover_image_url, share_url, embed_link,
               create_time, like_count, comment_count, share_count, view_count, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              video_description = excluded.video_description,
              duration = excluded.duration,
              cover_image_url = excluded.cover_image_url,
              share_url = excluded.share_url,
              embed_link = excluded.embed_link,
              create_time = excluded.create_time,
              like_count = excluded.like_count,
              comment_count = excluded.comment_count,
              share_count = excluded.share_count,
              view_count = excluded.view_count,
              fetched_at = excluded.fetched_at`,
      args: [
        String(video.id),
        video.title || null,
        video.video_description || null,
        video.duration ?? null,
        video.cover_image_url || null,
        video.share_url || null,
        video.embed_link || null,
        video.create_time ?? null,
        video.like_count ?? null,
        video.comment_count ?? null,
        video.share_count ?? null,
        video.view_count ?? null,
        now,
      ],
    })
  }
}

export async function loadCachedTikTokVideos(): Promise<TikTokVideo[]> {
  const db = getTursoClient()
  const result = await db.execute(
    'SELECT * FROM tiktok_videos ORDER BY create_time DESC',
  )
  return result.rows.map(row => ({
    id: String(row.id),
    title: (row.title as string) || undefined,
    video_description: (row.video_description as string) || undefined,
    duration: row.duration == null ? undefined : Number(row.duration),
    cover_image_url: (row.cover_image_url as string) || undefined,
    share_url: (row.share_url as string) || undefined,
    embed_link: (row.embed_link as string) || undefined,
    create_time: row.create_time == null ? undefined : Number(row.create_time),
    like_count: row.like_count == null ? undefined : Number(row.like_count),
    comment_count: row.comment_count == null ? undefined : Number(row.comment_count),
    share_count: row.share_count == null ? undefined : Number(row.share_count),
    view_count: row.view_count == null ? undefined : Number(row.view_count),
  }))
}

export function buildAuthorizeUrl(state: string) {
  const { clientKey, redirectUri } = getTikTokConfig()
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: 'user.info.basic,video.list',
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  })
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
}
