import { resolveRelease } from '../../utils/releases'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = String(query.group || '').trim()
  const slug = String(query.slug || '').trim()

  if (!group || !slug) {
    throw createError({ statusCode: 400, statusMessage: 'group and slug are required' })
  }

  const db = getTursoClient()

  const releases = await db.execute({
    sql: `
      SELECT release_name,
             COUNT(*) as count,
             (SELECT image FROM cards c2
               WHERE c2.group_name = c.group_name AND c2.release_name = c.release_name
               ORDER BY c2.id DESC LIMIT 1) as image,
             (SELECT id FROM cards c3
               WHERE c3.group_name = c.group_name AND c3.release_name = c.release_name
               ORDER BY c3.id DESC LIMIT 1) as card_id
      FROM cards c
      WHERE group_name = ? AND release_name IS NOT NULL AND TRIM(release_name) != ''
      GROUP BY group_name, release_name
    `,
    args: [group],
  })

  const row = releases.rows.find(candidate => releaseSlug(String(candidate.release_name)) === slug)

  // The discography supplies type/date — and for releases with no photocards
  // yet it is the only reason the page exists at all.
  let discographyEntry: DiscographyRelease | null = null
  try {
    discographyEntry = (await getGroupDiscography(group))
      .find(candidate => releaseSlug(candidate.title) === slug) || null
  } catch {
    // MusicBrainz down: card-backed pages keep working without type/date.
  }

  if (!row && !discographyEntry) {
    throw createError({ statusCode: 404, statusMessage: 'Release not found' })
  }

  const releaseName = row ? String(row.release_name) : discographyEntry!.title
  const image = row?.image ? String(row.image) : null
  const cardId = row?.card_id == null ? null : Number(row.card_id)

  const [types, summary, members] = await Promise.all([
    db.execute({
      sql: `SELECT card_type, COUNT(*) as count
            FROM cards WHERE group_name = ? AND release_name = ?
            GROUP BY card_type ORDER BY count DESC`,
      args: [group, releaseName],
    }),
    db.execute({
      sql: `SELECT MIN(CASE WHEN COALESCE(last_discounted_price, last_price) > 0
                            THEN COALESCE(last_discounted_price, last_price) END) as cheapest,
                   COUNT(DISTINCT member_name) as members
            FROM cards WHERE group_name = ? AND release_name = ?`,
      args: [group, releaseName],
    }),
    db.execute({
      sql: `SELECT member_name, COUNT(*) as count
            FROM cards WHERE group_name = ? AND release_name = ?
            GROUP BY member_name ORDER BY count DESC`,
      args: [group, releaseName],
    }),
  ])

  let match = null
  try {
    match = (await resolveRelease(group, releaseName)).match
  } catch {
    // Enrichment is optional: the album page still renders without it.
  }

  return {
    success: true,
    data: {
      group_name: group,
      release_name: releaseName,
      slug,
      count: row ? Number(row.count) || 0 : 0,
      release_type: discographyEntry?.release_type || null,
      image,
      card_id: cardId,
      artwork: match?.artwork || image,
      release_date: discographyEntry?.release_date || match?.releaseDate || null,
      label: match?.label || null,
      tracks: match?.tracks || [],
      sources: match?.sources || (match?.source ? [match.source] : []),
      cheapest: summary.rows[0]?.cheapest == null ? null : Number(summary.rows[0].cheapest),
      members: Number(summary.rows[0]?.members) || 0,
      byType: types.rows.map(entry => ({
        card_type: entry.card_type ? String(entry.card_type) : null,
        count: Number(entry.count) || 0,
      })),
      byMember: members.rows.map(entry => ({
        member_name: entry.member_name ? String(entry.member_name) : null,
        count: Number(entry.count) || 0,
      })),
    },
  }
})
