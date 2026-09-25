export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''
  const cookieState = getCookie(event, 'tiktok_oauth_state') || ''

  deleteCookie(event, 'tiktok_oauth_state', { path: '/' })

  if (!code) {
    const err = typeof query.error_description === 'string'
      ? query.error_description
      : typeof query.error === 'string'
        ? query.error
        : 'Missing authorization code'
    return sendRedirect(event, `/shop?tiktok_error=${encodeURIComponent(err)}`, 302)
  }

  if (!state || state !== cookieState) {
    return sendRedirect(event, '/shop?tiktok_error=Invalid%20state', 302)
  }

  try {
    const tokens = await exchangeCodeForToken(code)
    await saveTokens(tokens)
    return sendRedirect(event, '/shop?tiktok_connected=1', 302)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OAuth failed'
    return sendRedirect(event, `/shop?tiktok_error=${encodeURIComponent(message)}`, 302)
  }
})
