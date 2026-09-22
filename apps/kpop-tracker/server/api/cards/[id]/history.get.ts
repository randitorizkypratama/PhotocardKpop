export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') as string)
  
  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid card ID',
    })
  }
  
  const db = getTursoClient()
  
  const result = await db.execute({
    sql: `SELECT * FROM price_history WHERE card_id = ? ORDER BY recorded_at DESC LIMIT 30`,
    args: [id],
  })
  
  return {
    success: true,
    data: result.rows,
  }
})
