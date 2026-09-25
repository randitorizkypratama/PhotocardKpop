export default defineEventHandler(async (event) => {
  const db = getTursoClient()
  const stores = knownStores()

  const cases = stores.map((_store, index) =>
    `SUM(CASE WHEN UPPER(name) LIKE ? OR UPPER(name) LIKE ? THEN 1 ELSE 0 END) as s${index}`,
  )

  const args: string[] = []
  for (const store of stores) {
    const patterns = storeLikePatterns(store.display)
    // The CASE expression always binds two placeholders (spaced + unspaced).
    args.push(patterns[0], patterns[1] ?? patterns[0])
  }

  const result = await db.execute({
    sql: `SELECT group_name, ${cases.join(', ')} FROM cards GROUP BY group_name`,
    args,
  })

  const data = stores
    .map((store, index) => {
      const byGroup: Record<string, number> = {}
      let count = 0
      for (const row of result.rows) {
        const group = String(row.group_name || '')
        const groupCount = Number(row[`s${index}`]) || 0
        if (groupCount > 0) byGroup[group] = groupCount
        count += groupCount
      }
      return { store: store.display, count, by_group: byGroup }
    })
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return { success: true, data }
})
