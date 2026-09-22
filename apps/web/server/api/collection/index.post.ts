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
  
  // Check if already in collection
  const existing = await db.execute({
    sql: 'SELECT id FROM collections WHERE card_id = ?',
    args: [card_id],
  })
  
  if (existing.rows.length > 0) {
    // Update existing
    await db.execute({
      sql: 'UPDATE collections SET status = ?, bought_price = ? WHERE card_id = ?',
      args: [status, bought_price || null, card_id],
    })
  } else {
    // Insert new
    await db.execute({
      sql: 'INSERT INTO collections (card_id, status, bought_price, added_at) VALUES (?, ?, ?, ?)',
      args: [card_id, status, bought_price || null, now],
    })
  }
  
  return {
    success: true,
    message: `Card ${existing.rows.length > 0 ? 'updated' : 'added'} to collection`,
  }
})
