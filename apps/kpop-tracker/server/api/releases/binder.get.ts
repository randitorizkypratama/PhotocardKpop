/**
 * Every card in one release as slim binder slots.
 *
 * /api/cards is paginated (24 per page on this page) and carries fields the
 * slot grid never renders; a release can hold far more cards than one page.
 * Ownership is deliberately NOT included — it is per-user, arrives client-side
 * from useCollection, and keeping it out lets this response be cached like the
 * rest of the release data.
 */
export default cachedEventHandler(
  async (event) => {
    const query = getQuery(event)
    const group = typeof query.group === 'string' ? query.group : ''
    const release = typeof query.release === 'string' ? query.release : ''
    if (!group || !release) {
      throw createError({
        statusCode: 400,
        statusMessage: 'group and release are required',
      })
    }

    const db = getTursoClient()
    // Same predicate as the release detail count and /api/cards' filter, so
    // the binder always holds exactly the cards the header promises.
    const result = await db.execute({
      sql: `SELECT id, name, image, member_name, card_type, last_price, last_discounted_price
            FROM cards WHERE group_name = ? AND release_name = ?
            ORDER BY id ASC`,
      args: [group, release],
    })

    return {
      success: true,
      data: result.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        image: row.image ? String(row.image) : '',
        member_name: row.member_name ? String(row.member_name) : '',
        card_type: row.card_type ? String(row.card_type) : null,
        price: row.last_price == null ? 0 : Number(row.last_price),
        discounted_price: row.last_discounted_price == null ? null : Number(row.last_discounted_price),
      })),
    }
  },
  {
    // Ownership is client-side, so the payload is user-independent; card data
    // only moves on the daily cron.
    swr: true,
    maxAge: 60,
  },
)
