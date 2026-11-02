import {
  ensureRewriteTables,
  getRewriteBySlug,
  listRewriteImages,
  listRewriteSources,
} from '../../../utils/news/rewrite/store'
import { toPublicArticle } from '../../../utils/news/rewrite/public'

/**
 * One published blog article, with its images/credits and its sources.
 *
 * A draft, a rejected rewrite or an unknown slug is a 404 — never a 403, which
 * would confirm that a private row exists.
 */
export default defineEventHandler(async (event) => {
  await ensureRewriteTables()
  const slug = String(getRouterParam(event, 'slug') || '').trim()
  if (!slug) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const rewrite = await getRewriteBySlug(slug)
  if (!rewrite || rewrite.status !== 'published') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const [images, sources] = await Promise.all([
    listRewriteImages(rewrite.id),
    listRewriteSources(rewrite.id),
  ])

  const article = toPublicArticle(rewrite, images, sources)
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  return { success: true, data: article }
})
