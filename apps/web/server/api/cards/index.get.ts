import { getTursoClient } from '../utils/turso'
import { fetchPocamarketCards, inferCardType } from '../utils/pocamarket'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || 'IVE'
  const page = parseInt(query.page as string) || 1
  const member = query.member as string | undefined
  
  const db = getTursoClient()
  
  // Check if we have recent data (less than 1 hour old)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const existingCards = await db.execute({
    sql: 'SELECT * FROM cards WHERE group_name = ? AND updated_at > ? LIMIT 50',
    args: [group, oneHourAgo],
  })
  
  if (existingCards.rows.length > 0) {
    return {
      success: true,
      data: existingCards.rows,
      source: 'cache',
    }
  }
  
  // Fetch from Pocamarket API
  try {
    const response = await fetchPocamarketCards(group, page)
    
    if (!response.success) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch from Pocamarket',
      })
    }
    
    // Upsert cards into database
    for (const card of response.data.results) {
      const cardType = inferCardType(card.name_en)
      const now = new Date().toISOString()
      
      // Check if price changed
      const existing = await db.execute({
        sql: 'SELECT last_price FROM cards WHERE id = ?',
        args: [card.id],
      })
      
      const priceChanged = existing.rows.length > 0 && 
        existing.rows[0].last_price !== parseFloat(card.price)
      
      // Upsert card
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
    }
    
    // Return filtered results
    let results = response.data.results
    if (member) {
      results = results.filter(c => c.member_name_en.toUpperCase() === member.toUpperCase())
    }
    
    return {
      success: true,
      data: results.map(card => ({
        id: card.id,
        name: card.name_en,
        image: card.image,
        group_name: card.group_name_en,
        member_name: card.member_name_en,
        group_image: card.group_image,
        member_image: card.member_image,
        card_type: inferCardType(card.name_en),
        price: parseFloat(card.price),
        discounted_price: parseFloat(card.discounted_price),
        discount_rate: card.discount_rate,
        is_in_promotion: card.is_in_promotion,
        wish_count: card.wish_count,
        sales_volume: card.sales_volume,
        stocked_count: card.stocked_count,
      })),
      total: response.data.count,
      page,
      next_page: response.data.next_page,
      source: 'api',
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Error fetching cards: ${error}`,
    })
  }
})
