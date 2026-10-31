export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getTursoClient()

  const result = await db.execute({
    sql: `SELECT c.*, cards.name, cards.image, cards.group_name, cards.member_name,
           cards.card_type, cards.release_name, cards.last_price, cards.last_discounted_price
    FROM collections c
    JOIN cards ON c.card_id = cards.id
    WHERE c.user_id = ?
    ORDER BY c.added_at DESC`,
    args: [user.id],
  })

  const seen = new Set<string>()
  const rows = result.rows.filter((row) => {
    const key = `${row.card_id}:${row.status}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let totalOwnedValue = 0
  let totalWishlistValue = 0

  // What the owner actually paid, as opposed to what the market says it is
  // worth — the whole reason bought_price exists. It has been collected since
  // day one and never read back until now, so nothing on screen could tell the
  // user what their collection had cost them.
  //
  // Only `owned` counts: a wishlist entry with a price recorded is a note about
  // a price seen, not money spent. `ownedWithoutCost` is tracked because a total
  // that silently skips half the cards reads as exact when it is not.
  let totalOwnedCost = 0
  let ownedWithoutCost = 0

  for (const row of rows) {
    const price = (row.last_discounted_price as number) || (row.last_price as number) || 0
    if (row.status === 'owned') {
      totalOwnedValue += price
      const cost = row.bought_price
      if (cost === null || cost === undefined) {
        ownedWithoutCost += 1
      } else {
        totalOwnedCost += Number(cost) || 0
      }
    } else {
      totalWishlistValue += price
    }
  }

  return {
    success: true,
    data: rows,
    stats: {
      totalOwned: rows.filter(r => r.status === 'owned').length,
      totalWishlist: rows.filter(r => r.status === 'wishlist').length,
      totalOwnedValue,
      totalWishlistValue,
      totalOwnedCost,
      ownedWithoutCost,
    },
  }
})
