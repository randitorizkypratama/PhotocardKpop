/**
 * POST /api/cron/sync — RETIRED
 *
 * Pocamarket sync has moved to GitHub Actions (`sync-pocamarket.yml`).
 * This endpoint is kept as a stub so existing bookmarks / monitoring alerts
 * get a clear 410 Gone instead of a silent 404.
 */
export default defineEventHandler((event) => {
  setResponseStatus(event, 410)
  return {
    error: 'Gone',
    message:
      'Pocamarket sync has moved to GitHub Actions. This endpoint is no longer active.',
  }
})
