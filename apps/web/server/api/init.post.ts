export default defineEventHandler(async () => {
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
