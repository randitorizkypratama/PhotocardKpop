// Read-only snapshot of the cards table: it only changes when the daily cron
// runs, so the footer badge does not need a fresh Turso round trip per page.
export default cachedEventHandler(
  async () => {
    const db = getTursoClient()
    const result = await db.execute(
      'SELECT MAX(updated_at) as last_synced, COUNT(*) as total FROM cards',
    )

    const row = result.rows[0]
    return {
      success: true,
      data: {
        last_synced: row?.last_synced ? String(row.last_synced) : null,
        total: Number(row?.total) || 0,
        last_run: await readLastSyncLog(db),
      },
    }
  },
  { swr: true, maxAge: 5 * 60 },
)
