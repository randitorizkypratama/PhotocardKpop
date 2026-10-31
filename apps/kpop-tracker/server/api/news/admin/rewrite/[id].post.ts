import {
  ensureRewriteTables,
  getRewriteById,
  listRewriteImages,
  listRewriteSources,
  updateRewriteContent,
  updateRewriteStatus,
} from '../../../../utils/news/rewrite/store'
import { MAX_DEK, MAX_TITLE, MIN_BODY, estimateReadingMinutes } from '../../../../utils/news/rewrite/parse'
import { stripHtml } from '../../../../utils/news/text'

/**
 * Admin review of an AI draft — the only way a rewrite ever becomes public.
 *
 * Admin session **and** an allowed Origin are required (a browser sends
 * `Origin`; a cross-site form post cannot forge it), matching the write-side
 * convention used by `/api/auth/login` and `/api/errors`.
 *
 * Actions:
 *   approve | reject | publish | edit
 */
const ACTIONS = ['approve', 'reject', 'publish', 'edit'] as const
type Action = (typeof ACTIONS)[number]

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  requireSameOrigin(event)
  await ensureRewriteTables()

  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing rewrite id' })

  const body = await readBody(event).catch(() => null)
  const action = String(body?.action || '').toLowerCase() as Action
  if (!ACTIONS.includes(action)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown action (expected one of ${ACTIONS.join(', ')})` })
  }

  const rewrite = await getRewriteById(id)
  if (!rewrite) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  if (action === 'edit') {
    const title = String(body?.title ?? '').trim().slice(0, MAX_TITLE)
    const dek = String(body?.dek ?? '').trim().slice(0, MAX_DEK)
    // An editor is trusted with the wording, not with markup: tags are stripped
    // exactly as the model's own output is.
    const bodyMarkdown = stripHtml(String(body?.body_markdown ?? '')).trim()
    if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
    if (!dek) throw createError({ statusCode: 400, statusMessage: 'Dek is required' })
    if (bodyMarkdown.length < MIN_BODY) {
      throw createError({ statusCode: 400, statusMessage: `Body is too short (minimum ${MIN_BODY} characters)` })
    }
    await updateRewriteContent({ id, title, dek, bodyMarkdown, readingMinutes: estimateReadingMinutes(bodyMarkdown) })
  } else if (action === 'approve') {
    await updateRewriteStatus({ id, status: 'approved', note, reviewedBy: 0 })
  } else if (action === 'reject') {
    await updateRewriteStatus({ id, status: 'rejected', note, reviewedBy: 0 })
  } else {
    // publish — the article must still have content to publish.
    if (!rewrite.title || !rewrite.bodyMarkdown.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot publish an empty article' })
    }
    await updateRewriteStatus({ id, status: 'published', note, reviewedBy: 0 })
  }

  const [updated, images, sources] = await Promise.all([
    getRewriteById(id),
    listRewriteImages(id),
    listRewriteSources(id),
  ])

  return { success: true, action, data: { rewrite: updated, images, sources } }
})
