export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const user = await requireUser(event)
  const idParam = getRouterParam(event, 'id') as string
  const id = parseInt(idParam)

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid collection ID',
    })
  }

  const db = getTursoClient()
  const status = getQuery(event).status

  if (id > 100000) {
    if (status === 'wishlist' || status === 'owned') {
      await db.execute({
        sql: 'DELETE FROM collections WHERE user_id = ? AND card_id = ? AND status = ?',
        args: [user.id, id, status],
      })
    } else {
      await db.execute({
        sql: 'DELETE FROM collections WHERE user_id = ? AND card_id = ?',
        args: [user.id, id],
      })
    }
  } else {
    await db.execute({
      sql: 'DELETE FROM collections WHERE user_id = ? AND id = ?',
      args: [user.id, id],
    })
  }

  return {
    success: true,
    message: 'Card removed',
  }
})
