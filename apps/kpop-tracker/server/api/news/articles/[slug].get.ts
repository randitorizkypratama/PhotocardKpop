import {
  ensureRewriteTables,
  getRewriteBySlug,
  listRewriteImages,
  listRewriteSources,
} from '../../../utils/news/rewrite/store'
import { toPublicArticle } from '../../../utils/news/rewrite/public'
import { getArticleById } from '../../../utils/news/store'

/**
 * One published blog article, with its images/credits and its sources.
 *
 * A draft, a rejected rewrite or an unknown slug is a 404 — never a 403, which
 * would confirm that a private row exists. The `transparency` block names the
 * article this was rewritten from, so the reader can check the source.
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

  const sourceRow = rewrite.articleId ? await getArticleById(rewrite.articleId) : null
  const transparency = {
    verification_status: sourceRow ? String(sourceRow.verification_status || '') || null : null,
    verification_score: sourceRow ? Number(sourceRow.verification_score) || 0 : null,
    publisher_name: sourceRow ? (sourceRow.publisher_name ? String(sourceRow.publisher_name) : null) : null,
    publisher_domain: sourceRow ? (sourceRow.publisher_domain ? String(sourceRow.publisher_domain) : null) : null,
  }

  const article = toPublicArticle(rewrite, images, sources, transparency)
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  return { success: true, data: article }
})
