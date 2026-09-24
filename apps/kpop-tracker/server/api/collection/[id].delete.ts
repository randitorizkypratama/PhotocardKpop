export default defineEventHandler(async (event) => {
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
        sql: 'DELETE FROM collections WHERE card_id = ? AND status = ?',
        args: [id, status],
      })
    } else {
      await db.execute({
        sql: 'DELETE FROM collections WHERE card_id = ?',
        args: [id],
      })
    }
  } else {
    await db.execute({
      sql: 'DELETE FROM collections WHERE id = ?',
      args: [id],
    })
  }

  return {
    success: true,
    message: 'Card removed',
  }
})
