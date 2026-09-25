import { resolveRelease } from '../../utils/releases'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const title = String(query.title || '').trim()
  const artist = String(query.artist || '').trim()

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }

  try {
    const { match, cached } = await resolveRelease(artist, title)
    return { success: true, data: match, cached }
  } catch {
    // Enrichment is optional: never let it break the page.
    return { success: true, data: null, cached: false }
  }
})
