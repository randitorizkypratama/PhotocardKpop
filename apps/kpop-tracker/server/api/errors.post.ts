export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const body = await readBody(event).catch(() => null)
  const message = String(body?.message ?? '')

  if (!message || message.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid error payload' })
  }

  await logError('client', message, body?.stack, body?.path)
  return { success: true }
})
