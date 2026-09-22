const GROUPS = ['IVE', 'aespa', 'Hearts2Hearts']

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const groupFilter = query.group as string | undefined
  
  const db = getTursoClient()
  const now = new Date().toISOString()
  
  const results = []
  const groupsToSync = groupFilter ? [groupFilter] : GROUPS
  
  for (const group of groupsToSync) {
    if (!GROUPS.includes(group)) {
      results.push({ group, status: 'error', message: `Unknown group: ${group}` })
      continue
    }
    
    try {
      let synced = 0
      let page = 1
      let hasMore = true
      let totalCards = 0
      
      while (hasMore) {
        const response = await fetchPocamarketCards(group, page)
        
        if (!response.success || response.data.results.length === 0) {
          break
        }
        
        totalCards = response.data.count
        
        for (const card of response.data.results) {
          const cardType = inferCardType(card.name_en)
          
          const existing = await db.execute({
            sql: 'SELECT last_price FROM cards WHERE id = ?',
            args: [card.id],
          })
          
          const priceChanged = existing.rows.length > 0 && 
            existing.rows[0].last_price !== parseFloat(card.price)
          
          await db.execute({
            sql: `
              INSERT INTO cards (id, name, image, group_name, member_name, group_image, member_image, 
                               card_type, last_price, last_discounted_price, last_wish_count, 
                               last_sales_volume, last_stocked_count, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                image = excluded.image,
                member_name = excluded.member_name,
                group_image = excluded.group_image,
                member_image = excluded.member_image,
                card_type = excluded.card_type,
                last_price = excluded.last_price,
                last_discounted_price = excluded.last_discounted_price,
                last_wish_count = excluded.last_wish_count,
                last_sales_volume = excluded.last_sales_volume,
                last_stocked_count = excluded.last_stocked_count,
                updated_at = excluded.updated_at
            `,
            args: [
              card.id,
              card.name_en,
              card.image,
              card.group_name_en,
              card.member_name_en,
              card.group_image,
              card.member_image,
              cardType,
              parseFloat(card.price),
              parseFloat(card.discounted_price),
              card.wish_count,
              card.sales_volume,
              card.stocked_count,
              now,
            ],
          })
          
          if (priceChanged) {
            await db.execute({
              sql: `INSERT INTO price_history (card_id, price, discounted_price, wish_count, sales_volume, stocked_count, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              args: [
                card.id,
                parseFloat(card.price),
                parseFloat(card.discounted_price),
                card.wish_count,
                card.sales_volume,
                card.stocked_count,
                now,
              ],
            })
          }
          
          synced++
        }
        
        hasMore = response.data.next_page !== null
        page++
      }
      
      results.push({ group, status: 'success', synced, total: totalCards })
    } catch (error) {
      results.push({ group, status: 'error', message: String(error) })
    }
  }
  
  return {
    success: true,
    message: 'Sync completed',
    results,
  }
})
