import { getTursoClient } from '../utils/turso'

export default defineEventHandler(async (event) => {
  const db = getTursoClient()
  
  const result = await db.execute(`
    SELECT c.*, cards.name, cards.image, cards.group_name, cards.member_name, 
           cards.card_type, cards.last_price, cards.last_discounted_price
    FROM collections c
    JOIN cards ON c.card_id = cards.id
    ORDER BY c.added_at DESC
  `)
  
  // Calculate total value
  let totalOwnedValue = 0
  let totalWishlistValue = 0
  
  for (const row of result.rows) {
    const price = row.last_price as number || 0
    if (row.status === 'owned') {
      totalOwnedValue += price
    } else {
      totalWishlistValue += price
    }
  }
  
  return {
    success: true,
    data: result.rows,
    stats: {
      totalOwned: result.rows.filter(r => r.status === 'owned').length,
      totalWishlist: result.rows.filter(r => r.status === 'wishlist').length,
      totalOwnedValue,
      totalWishlistValue,
    },
  }
})
