export default defineEventHandler(async () => {
  const db = getTursoClient()
  const result = await db.execute(`
    SELECT group_name, card_type, COUNT(*) AS count
    FROM cards
    WHERE card_type IS NOT NULL AND TRIM(card_type) != ''
    GROUP BY group_name, card_type
  `)

  const map = new Map<string, { card_type: string, count: number, by_group: Record<string, number> }>()
  for (const row of result.rows) {
    const type = String(row.card_type)
    const group = String(row.group_name || '')
    const count = Number(row.count) || 0
    let entry = map.get(type)
    if (!entry) {
      entry = { card_type: type, count: 0, by_group: {} }
      map.set(type, entry)
    }
    entry.count += count
    if (group) entry.by_group[group] = count
  }

  const data = [...map.values()].sort((a, b) => b.count - a.count)
  return { success: true, data }
})
