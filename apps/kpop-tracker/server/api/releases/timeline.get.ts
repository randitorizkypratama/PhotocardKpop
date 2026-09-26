export default defineEventHandler(async (event) => {
  const db = getTursoClient()
  const group = String(getQuery(event).group || '').trim()

  const groupFilter = group ? ' AND group_name = ?' : ''
  const result = await db.execute({
    sql: `
      SELECT group_name,
             release_name,
             COUNT(*) as count,
             (SELECT image FROM cards c2
               WHERE c2.group_name = c.group_name AND c2.release_name = c.release_name
               ORDER BY c2.id DESC LIMIT 1) as image,
             (SELECT id FROM cards c3
               WHERE c3.group_name = c.group_name AND c3.release_name = c.release_name
               ORDER BY c3.id DESC LIMIT 1) as card_id
      FROM cards c
      WHERE release_name IS NOT NULL AND TRIM(release_name) != ''${groupFilter}
      GROUP BY group_name, release_name
    `,
    args: group ? [group] : [],
  })

  const cardRows = result.rows.map(row => ({
    group_name: String(row.group_name),
    release_name: String(row.release_name),
    key: discographyKey(String(row.release_name)),
    slug: releaseSlug(String(row.release_name)),
    count: Number(row.count) || 0,
    image: row.image ? String(row.image) : null,
    card_id: row.card_id == null ? null : Number(row.card_id),
  }))

  // The discography is the source of truth for which releases exist — it even
  // lists releases with no photocards yet, which cards alone can never do.
  const groups = group ? [group] : [...DISCOGRAPHY_GROUPS]
  const discography: DiscographyRelease[] = []
  for (const name of groups) {
    try {
      discography.push(...await getGroupDiscography(name))
    } catch (error) {
      console.error(`Discography unavailable for ${name}:`, error)
    }
  }

  const cardsByKey = new Map<string, typeof cardRows[number][]>()
  for (const row of cardRows) {
    const mapKey = `${row.group_name}::${row.key}`
    const bucket = cardsByKey.get(mapKey)
    if (bucket) bucket.push(row)
    else cardsByKey.set(mapKey, [row])
  }

  const entries: Array<{
    group_name: string
    release_name: string
    slug: string
    release_type: string | null
    count: number
    image: string | null
    card_id: number | null
    release_date: string | null
    label: string | null
    sources: string[]
  }> = []

  const claimed = new Set<string>()

  for (const release of discography) {
    const mapKey = `${release.group_name}::${release.key}`
    const matched = cardsByKey.get(mapKey) || []
    const count = matched.reduce((sum, row) => sum + row.count, 0)
    const cover = matched.slice().sort((a, b) => b.count - a.count)[0]

    entries.push({
      group_name: release.group_name,
      release_name: release.title,
      slug: releaseSlug(release.title),
      release_type: release.release_type,
      count,
      image: cover?.image || null,
      card_id: cover?.card_id ?? null,
      release_date: release.release_date,
      label: null,
      sources: [],
    })
    claimed.add(mapKey)
  }

  // Releases tagged by the token fallback (tracks, events) are not in the
  // discography but still deserve a spot on the timeline.
  for (const row of cardRows) {
    const mapKey = `${row.group_name}::${row.key}`
    if (claimed.has(mapKey)) continue
    claimed.add(mapKey)
    entries.push({
      group_name: row.group_name,
      release_name: row.release_name,
      slug: row.slug,
      release_type: null,
      count: row.count,
      image: row.image,
      card_id: row.card_id,
      release_date: null,
      label: null,
      sources: [],
    })
  }

  const cache = await readReleaseCacheMany(
    entries.map(entry => releaseCacheKey(entry.group_name, entry.release_name)),
  )

  const data = entries
    .map((entry) => {
      const match = cache.get(releaseCacheKey(entry.group_name, entry.release_name))
      const hit = match?.status === 'hit' ? match.match : null
      return {
        ...entry,
        // Discography dates win: they describe the merged base release, not a
        // single regional edition.
        release_date: entry.release_date || hit?.releaseDate || null,
        label: hit?.label || null,
        sources: hit?.sources || (hit?.source ? [hit.source] : []),
      }
    })
    .sort((a, b) => {
      // Dated releases first, newest first; releases without a date sink to the
      // bottom ordered by how many cards they have.
      if (a.release_date && b.release_date) {
        if (a.release_date !== b.release_date) return a.release_date < b.release_date ? 1 : -1
        return b.count - a.count
      }
      if (a.release_date) return -1
      if (b.release_date) return 1
      return b.count - a.count
    })

  return { success: true, data }
})
