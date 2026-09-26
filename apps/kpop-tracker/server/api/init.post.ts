export default defineEventHandler(async (event) => {
  requireCronSecret(event)
  try {
    await initializeDatabase()
    return {
      success: true,
      message: 'Database initialized successfully',
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to initialize database: ${error}`,
    })
  }
})
