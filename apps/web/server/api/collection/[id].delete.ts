import { getTursoClient } from '../utils/turso'

export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') as string)
  
  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid collection ID',
    })
  }
  
  const db = getTursoClient()
  
  await db.execute({
    sql: 'DELETE FROM collections WHERE id = ?',
    args: [id],
  })
  
  return {
    success: true,
    message: 'Card removed from collection',
  }
})
