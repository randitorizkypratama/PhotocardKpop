export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await ensureAuthTables()
  const db = getTursoClient()

  const result = await db.execute(
    'SELECT id, scope, message, stack, path, created_at FROM error_log ORDER BY id DESC LIMIT 20'
  )

  return {
    success: true,
    data: result.rows.map((row) => ({
      id: Number(row.id),
      scope: String(row.scope),
      message: String(row.message),
      stack: row.stack ? String(row.stack) : null,
      path: row.path ? String(row.path) : null,
      created_at: String(row.created_at),
    })),
  }
})
