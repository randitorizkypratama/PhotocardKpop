export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  const { card_id, status = 'wishlist', bought_price } = body
  
  if (!card_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'card_id is required',
    })
  }
  
  if (!['owned', 'wishlist'].includes(status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'status must be "owned" or "wishlist"',
    })
  }
  
  const db = getTursoClient()
  const now = new Date().toISOString()

  try {
    await db.execute({
      sql: `INSERT INTO collections (card_id, status, bought_price, added_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(card_id, status) DO UPDATE SET bought_price = excluded.bought_price, added_at = excluded.added_at`,
      args: [card_id, status, bought_price || null, now],
    })
  } catch {
    await db.execute({
      sql: 'UPDATE collections SET bought_price = ? WHERE card_id = ? AND status = ?',
      args: [bought_price || null, card_id, status],
    })
  }

  return {
    success: true,
    message: status === 'owned' ? 'Card added to collection' : 'Card added to wishlist',
  }
})
