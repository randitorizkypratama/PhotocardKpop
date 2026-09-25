export default defineEventHandler(async () => {
  const configured = isTikTokConfigured()
  if (!configured) {
    return { success: true, configured: false, connected: false }
  }

  try {
    const tokens = await loadTokens()
    return {
      success: true,
      configured: true,
      connected: Boolean(tokens?.accessToken),
      openId: tokens?.openId || null,
      expiresAt: tokens?.expiresAt || null,
    }
  } catch {
    return { success: false, configured: true, connected: false }
  }
})
