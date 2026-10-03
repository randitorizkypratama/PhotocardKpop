export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const user = await requireUser(event)
  const body = await readBody(event)

  const { card_id, status = 'wishlist', bought_price } = body

  const cardId = Number(card_id)
  if (!Number.isInteger(cardId) || cardId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'card_id must be a positive integer',
    })
  }

  if (!['owned', 'wishlist'].includes(status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'status must be "owned" or "wishlist"',
    })
  }

  let price: number | null = null
  if (bought_price !== undefined && bought_price !== null && bought_price !== '') {
    price = Number(bought_price)
    if (!Number.isFinite(price) || price < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'bought_price must be a non-negative number',
      })
    }
  }

  const db = getTursoClient()

  const card = await db.execute({
    sql: 'SELECT 1 FROM cards WHERE id = ? LIMIT 1',
    args: [cardId],
  })
  if (card.rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Card not found',
    })
  }

  const now = new Date().toISOString()

  try {
    await db.execute({
      sql: `INSERT INTO collections (card_id, status, bought_price, added_at, user_id) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, card_id, status) DO UPDATE SET bought_price = excluded.bought_price, added_at = excluded.added_at`,
      args: [cardId, status, price, now, user.id],
    })
  } catch {
    const updated = await db.execute({
      sql: 'UPDATE collections SET bought_price = ? WHERE user_id = ? AND card_id = ? AND status = ?',
      args: [price, user.id, cardId, status],
    })
    if (Number(updated.rowsAffected) === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Card not found',
      })
    }
  }

  return {
    success: true,
    message: status === 'owned' ? 'Card added to collection' : 'Card added to wishlist',
  }
})
