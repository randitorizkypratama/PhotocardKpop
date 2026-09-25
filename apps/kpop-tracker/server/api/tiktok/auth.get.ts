import { randomBytes } from 'node:crypto'

export default defineEventHandler(async (event) => {
  if (!isTikTokConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'TikTok client key/secret/redirect URI not configured',
    })
  }

  const state = randomBytes(16).toString('hex')
  setCookie(event, 'tiktok_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 600,
    path: '/',
  })

  return sendRedirect(event, buildAuthorizeUrl(state), 302)
})
