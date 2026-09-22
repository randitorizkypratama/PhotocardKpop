const GROUPS = ['IVE', 'aespa', 'Hearts2Hearts']

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || undefined

  if (!group || !GROUPS.includes(group)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid group' })
  }

  const db = getTursoClient()
  const now = new Date().toISOString()

  let page = 1
  let hasMore = true
  let totalSynced = 0
  let totalCards = 0

  while (hasMore) {
    try {
      const response = await fetchPocamarketCards(group, page)
      if (!response.success || response.data.results.length === 0) break

      totalCards = response.data.count

      for (const card of response.data.results) {
        const cardType = inferCardType(card.name_en)

        await db.execute({
          sql: `
            INSERT INTO cards (id, name, image, group_name, member_name, group_image, member_image,
                             card_type, last_price, last_discounted_price, last_wish_count,
                             last_sales_volume, last_stocked_count, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name, image = excluded.image, member_name = excluded.member_name,
              group_image = excluded.group_image, member_image = excluded.member_image,
              card_type = excluded.card_type, last_price = excluded.last_price,
              last_discounted_price = excluded.last_discounted_price, last_wish_count = excluded.last_wish_count,
              last_sales_volume = excluded.last_sales_volume, last_stocked_count = excluded.last_stocked_count,
              updated_at = excluded.updated_at
          `,
          args: [
            card.id, card.name_en, card.image, card.group_name_en, card.member_name_en,
            card.group_image, card.member_image, cardType,
            parseFloat(card.price), parseFloat(card.discounted_price),
            card.wish_count, card.sales_volume, card.stocked_count, now,
          ],
        })

        totalSynced++
      }

      hasMore = response.data.next_page !== null
      page++
    } catch {
      break
    }
  }

  return {
    success: true,
    group,
    totalSynced,
    totalCards,
    pages: page - 1,
  }
})
