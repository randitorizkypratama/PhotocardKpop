export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || undefined
  const member = (query.member as string) || undefined
  const search = (query.search as string) || undefined
  const cardType = (query.card_type as string) || undefined
  const release = (query.release as string) || undefined
  const store = (query.store as string) || undefined
  const minPrice = query.min_price !== undefined ? parseFloat(query.min_price as string) : undefined
  const maxPrice = query.max_price !== undefined ? parseFloat(query.max_price as string) : undefined

  const db = getTursoClient()

  // Store counts: every active filter except the store facet itself.
  const storeFilter = buildCardFilter({ group, member, search, cardType, release, minPrice, maxPrice })
  const stores = knownStores()
  const cases = stores.map((_store, index) =>
    `COALESCE(SUM(CASE WHEN UPPER(name) LIKE ? OR UPPER(name) LIKE ? THEN 1 ELSE 0 END), 0) as s${index}`,
  )
  const storeArgs: string[] = []
  for (const storeEntry of stores) {
    const patterns = storeLikePatterns(storeEntry.display)
    // The CASE expression always binds two placeholders (spaced + unspaced).
    const spaced = patterns[0] ?? ''
    storeArgs.push(spaced, patterns[1] ?? spaced)
  }
  const storeResult = await db.execute({
    sql: `SELECT ${cases.join(', ')} FROM cards ${storeFilter.where}`,
    // SELECT-list placeholders come before WHERE placeholders positionally.
    args: [...storeArgs, ...storeFilter.args],
  })
  const storeRow = storeResult.rows[0]
  const storeData = stores
    .map((storeEntry, index) => ({ store: storeEntry.display, count: Number(storeRow?.[`s${index}`]) || 0 }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  // Card-type counts: every active filter except the card type facet itself.
  const typeFilter = buildCardFilter({ group, member, search, release, store, minPrice, maxPrice })
  const typeWhere = typeFilter.where
    ? `${typeFilter.where} AND card_type IS NOT NULL AND TRIM(card_type) != ''`
    : `WHERE card_type IS NOT NULL AND TRIM(card_type) != ''`
  const typeResult = await db.execute({
    sql: `SELECT card_type, COUNT(*) as count FROM cards ${typeWhere} GROUP BY card_type`,
    args: typeFilter.args,
  })
  const typeData = typeResult.rows
    .map(row => ({ card_type: String(row.card_type), count: Number(row.count) || 0 }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  // Release counts: every active filter except the release facet itself. Only
  // releases that actually have photocards come back — the discography-only
  // entries (zero cards) are deliberately left out of this filter.
  const releaseFilter = buildCardFilter({ group, member, search, cardType, store, minPrice, maxPrice })
  const releaseWhere = releaseFilter.where
    ? `${releaseFilter.where} AND release_name IS NOT NULL AND TRIM(release_name) != ''`
    : `WHERE release_name IS NOT NULL AND TRIM(release_name) != ''`
  const releaseResult = await db.execute({
    sql: `SELECT release_name, COUNT(*) as count FROM cards ${releaseWhere} GROUP BY release_name`,
    args: releaseFilter.args,
  })
  const releaseData = releaseResult.rows
    .map(row => ({ release_name: String(row.release_name), count: Number(row.count) || 0 }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return { success: true, data: { stores: storeData, card_types: typeData, releases: releaseData } }
})
