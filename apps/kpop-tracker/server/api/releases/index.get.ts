export default defineEventHandler(async (event) => {
  const db = getTursoClient()
  const requested = parseInt(getQuery(event).limit as string) || 24
  const limit = Math.min(60, Math.max(1, requested))

  const result = await db.execute(`
    SELECT release_name,
           COUNT(*) as count,
           (SELECT image FROM cards c2 WHERE c2.release_name = c.release_name ORDER BY c2.id DESC LIMIT 1) as image,
           (SELECT id FROM cards c3 WHERE c3.release_name = c.release_name ORDER BY c3.id DESC LIMIT 1) as card_id,
           (SELECT group_name FROM cards c4 WHERE c4.release_name = c.release_name ORDER BY c4.id DESC LIMIT 1) as group_name
    FROM cards c
    WHERE release_name IS NOT NULL AND TRIM(release_name) != ''
    GROUP BY release_name
    ORDER BY count DESC
    LIMIT ?
  `, [limit])

  const data = result.rows.map(row => ({
    release_name: String(row.release_name),
    count: Number(row.count) || 0,
    image: row.image ? String(row.image) : null,
    card_id: row.card_id == null ? null : Number(row.card_id),
    group_name: row.group_name ? String(row.group_name) : null,
  }))

  return { success: true, data }
})
