export default defineEventHandler(async (event) => {
  requireCronSecret(event)
  try {
    await initializeDatabase()
    return {
      success: true,
      message: 'Database initialized successfully',
    }
  } catch (error) {
    console.error('Database initialization failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to initialize database',
    })
  }
})
