/**
 * GET /api/sync/group — RETIRED
 *
 * Per-group Pocamarket sync has moved to GitHub Actions (`sync-pocamarket.yml`).
 * This endpoint is kept as a stub so existing callers get a clear 410 Gone
 * instead of a silent 404.
 */
export default defineEventHandler((event) => {
  setResponseStatus(event, 410)
  return {
    error: 'Gone',
    message:
      'Pocamarket sync has moved to GitHub Actions. This endpoint is no longer active.',
  }
})
