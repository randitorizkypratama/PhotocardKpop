export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const user = await requireUser(event)
  const id = parseIdParam(getRouterParam(event, 'id'))

  if (id === null) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid collection ID',
    })
  }

  const db = getTursoClient()
  const status = getQuery(event).status

  if (status !== undefined && status !== 'wishlist' && status !== 'owned') {
    throw createError({
      statusCode: 400,
      statusMessage: 'status must be "owned" or "wishlist"',
    })
  }

  const row = await db.execute({
    sql: 'DELETE FROM collections WHERE user_id = ? AND id = ?',
    args: [user.id, id],
  })
  let removed = Number(row.rowsAffected) > 0

  if (!removed && id > 100000) {
    const byCard = status
      ? await db.execute({
          sql: 'DELETE FROM collections WHERE user_id = ? AND card_id = ? AND status = ?',
          args: [user.id, id, status],
        })
      : await db.execute({
          sql: 'DELETE FROM collections WHERE user_id = ? AND card_id = ?',
          args: [user.id, id],
        })
    removed = Number(byCard.rowsAffected) > 0
  }

  return {
    success: removed,
    message: removed ? 'Card removed' : 'Nothing to remove',
  }
})
