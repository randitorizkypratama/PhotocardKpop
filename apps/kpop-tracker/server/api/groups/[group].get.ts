export default defineEventHandler(async (event) => {
  const raw = event.context.params?.group
  const group = typeof raw === 'string' ? decodeURIComponent(raw).trim() : ''
  if (!group) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid group' })
  }

  const db = getTursoClient()

  const [totalRes, typeRes, memberRes, releaseRes, latestRes] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) as total FROM cards WHERE group_name = ?', args: [group] }),
    db.execute({
      sql: 'SELECT card_type, COUNT(*) as count FROM cards WHERE group_name = ? GROUP BY card_type ORDER BY count DESC',
      args: [group],
    }),
    db.execute({
      sql: 'SELECT member_name, COUNT(*) as count FROM cards WHERE group_name = ? GROUP BY member_name ORDER BY count DESC',
      args: [group],
    }),
    db.execute({
      sql: `SELECT release_name, COUNT(*) as count FROM cards
            WHERE group_name = ? AND release_name IS NOT NULL AND TRIM(release_name) != ''
            GROUP BY release_name ORDER BY count DESC`,
      args: [group],
    }),
    db.execute({
      sql: `SELECT id, name, image, group_name, member_name, card_type, release_name,
                   last_price, last_discounted_price, last_wish_count, updated_at
            FROM cards WHERE group_name = ? ORDER BY updated_at DESC LIMIT 12`,
      args: [group],
    }),
  ])

  const total = Number(totalRes.rows[0]?.total) || 0

  // The discography (not just card counts) decides which releases a group has,
  // so this list matches the /releases timeline — including releases with no
  // photocards yet.
  let discography: DiscographyRelease[] = []
  try {
    discography = await getGroupDiscography(group)
  } catch {
    // MusicBrainz down: fall back to the card-backed list below.
  }

  const counts = new Map<string, { name: string, count: number }>()
  for (const row of releaseRes.rows) {
    const name = String(row.release_name || '')
    const key = discographyKey(name)
    const existing = counts.get(key)
    const count = Number(row.count) || 0
    if (existing) existing.count += count
    else counts.set(key, { name, count })
  }

  const claimed = new Set<string>()
  const releases = discography.map((release) => {
    claimed.add(release.key)
    return {
      release_name: release.title,
      slug: releaseSlug(release.title),
      release_type: release.release_type,
      release_date: release.release_date,
      count: counts.get(release.key)?.count || 0,
    }
  })

  for (const [key, entry] of counts) {
    if (claimed.has(key)) continue
    releases.push({
      release_name: entry.name,
      slug: releaseSlug(entry.name),
      release_type: null,
      release_date: null,
      count: entry.count,
    })
  }

  releases.sort((a, b) => {
    if (a.release_date && b.release_date) {
      if (a.release_date !== b.release_date) return a.release_date < b.release_date ? 1 : -1
      return b.count - a.count
    }
    if (a.release_date) return -1
    if (b.release_date) return 1
    return b.count - a.count
  })

  const byType = typeRes.rows.map(row => ({
    card_type: String(row.card_type || ''),
    count: Number(row.count) || 0,
  }))

  const byMember = memberRes.rows.map(row => ({
    member_name: String(row.member_name || ''),
    count: Number(row.count) || 0,
  }))

  const latest = latestRes.rows.map((row) => {
    const price = Number(row.last_price) || 0
    const discounted = Number(row.last_discounted_price) || 0
    const hasDiscount = discounted > 0 && price > 0 && discounted < price
    return {
      id: row.id,
      name: row.name,
      image: row.image,
      group_name: row.group_name,
      member_name: row.member_name,
      release_name: row.release_name,
      ...cardTypeFields(row),
      price,
      discounted_price: discounted || 0,
      discount_rate: hasDiscount ? Math.round((1 - discounted / price) * 100) : 0,
      is_in_promotion: hasDiscount,
      wish_count: Number(row.last_wish_count) || 0,
    }
  })

  return {
    success: true,
    data: {
      group,
      total,
      members: byMember.length,
      releaseCount: releases.length,
      byType,
      byMember,
      releases,
      latest,
    },
  }
})
