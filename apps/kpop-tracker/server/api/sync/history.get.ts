export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getTursoClient()
  try {
    const result = await db.execute(`
      SELECT id, started_at, finished_at, status, total_synced, results, error
      FROM sync_log
      ORDER BY id DESC
      LIMIT 30
    `)

    const runs = result.rows.map((row) => {
      let groups: Array<{ group: string, success: boolean, totalSynced?: number, error?: string }> = []
      try {
        groups = row.results ? JSON.parse(String(row.results)) : []
      } catch {
        groups = []
      }
      return {
        id: Number(row.id),
        started_at: String(row.started_at),
        finished_at: row.finished_at ? String(row.finished_at) : null,
        status: String(row.status),
        total_synced: row.total_synced == null ? null : Number(row.total_synced),
        error: row.error ? String(row.error) : null,
        groups,
      }
    })

    return { success: true, data: runs }
  } catch {
    // Table does not exist before the first cron run.
    return { success: true, data: [] }
  }
})
