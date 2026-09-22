import { getTursoClient } from '../utils/turso'
import { fetchPocamarketCards, inferCardType } from '../utils/pocamarket'

const GROUPS = ['IVE', 'aespa', 'Hearts2Hearts']

export default defineEventHandler(async (event) => {
  const db = getTursoClient()
  const now = new Date().toISOString()
  
  const results = []
  
  for (const group of GROUPS) {
    try {
      const response = await fetchPocamarketCards(group, 1)
      
      if (!response.success) {
        results.push({ group, status: 'error', message: 'API error' })
        continue
      }
      
      let synced = 0
      for (const card of response.data.results) {
        const cardType = inferCardType(card.name_en)
        
        // Check if price changed
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
        
        // Record price history only if price changed
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
      
      results.push({ group, status: 'success', synced, total: response.data.count })
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
