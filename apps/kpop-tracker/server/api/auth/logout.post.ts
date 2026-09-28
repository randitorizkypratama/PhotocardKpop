export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  await destroySession(event)
  return { success: true }
})
