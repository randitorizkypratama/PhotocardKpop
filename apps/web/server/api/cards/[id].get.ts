export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') as string)
  
  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid card ID',
    })
  }
  
  const db = getTursoClient()
  
  // Check if we have recent data
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const existing = await db.execute({
    sql: 'SELECT * FROM cards WHERE id = ? AND updated_at > ?',
    args: [id, oneHourAgo],
  })
  
  if (existing.rows.length > 0) {
    return {
      success: true,
      data: existing.rows[0],
      source: 'cache',
    }
  }
  
  // Fetch from Pocamarket - search by card name to find the specific card
  try {
    // We need to search for the card since Pocamarket doesn't have a detail endpoint
    // Search with a broader query and find the specific card
    const response = await fetchPocamarketCards('', 1)
    
    if (!response.success) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch from Pocamarket',
      })
    }
    
    const card = response.data.results.find(c => c.id === id)
    
    if (!card) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Card not found',
      })
    }
    
    const cardType = inferCardType(card.name_en)
    const now = new Date().toISOString()
    
    // Check if price changed
    const existingCard = await db.execute({
      sql: 'SELECT last_price FROM cards WHERE id = ?',
      args: [id],
    })
    
    const priceChanged = existingCard.rows.length > 0 && 
      existingCard.rows[0].last_price !== parseFloat(card.price)
    
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
        id,
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
          id,
          parseFloat(card.price),
          parseFloat(card.discounted_price),
          card.wish_count,
          card.sales_volume,
          card.stocked_count,
          now,
        ],
      })
    }
    
    return {
      success: true,
      data: {
        id: card.id,
        name: card.name_en,
        image: card.image,
        group_name: card.group_name_en,
        member_name: card.member_name_en,
        group_image: card.group_image,
        member_image: card.member_image,
        card_type: cardType,
        price: parseFloat(card.price),
        discounted_price: parseFloat(card.discounted_price),
        discount_rate: card.discount_rate,
        is_in_promotion: card.is_in_promotion,
        wish_count: card.wish_count,
        sales_volume: card.sales_volume,
        stocked_count: card.stocked_count,
      },
      source: 'api',
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Error fetching card: ${error}`,
    })
  }
})
