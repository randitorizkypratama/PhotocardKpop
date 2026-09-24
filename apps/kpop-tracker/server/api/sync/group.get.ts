const GROUPS = ['IVE', 'aespa', 'Hearts2Hearts']
const BATCH_SIZE = 10

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || undefined

  if (!group || !GROUPS.includes(group)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid group' })
  }

  const db = getTursoClient()
  const now = new Date().toISOString()

  // Get total count first
  const firstPage = await fetchPocamarketCards(group, 1)
  if (!firstPage.success) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch from Pocamarket' })
  }

  const totalCards = firstPage.data.count
  const totalPages = Math.ceil(totalCards / 20)
  let totalSynced = 0

  // Insert first page
  const firstMapped = mapCards(firstPage.data.results)
  await batchUpsert(db, firstMapped, now)
  totalSynced += firstMapped.length

  // Fetch remaining pages in batches of BATCH_SIZE
  for (let startPage = 2; startPage <= totalPages; startPage += BATCH_SIZE) {
    const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages)
    const promises: Promise<any>[] = []

    for (let p = startPage; p <= endPage; p++) {
      promises.push(
        fetchPocamarketCards(group, p)
          .then(res => res.success ? mapCards(res.data.results) : [])
          .catch(() => [])
      )
    }

    const results = await Promise.all(promises)
    const allCards = results.flat()

    if (allCards.length > 0) {
      await batchUpsert(db, allCards, now)
      totalSynced += allCards.length
    }
  }

  return {
    success: true,
    group,
    totalSynced,
    totalCards,
    pages: totalPages,
  }
})

function mapCards(results: any[]) {
  return results.map(card => ({
    id: card.id,
    name: card.name_en,
    image: card.image,
    group_name: card.group_name_en,
    member_name: card.member_name_en,
    group_image: card.group_image,
    member_image: card.member_image,
    card_type: inferCardType(card.name_en),
    release_name: extractReleaseName(card.name_en, card.group_name_en),
    price: parseFloat(card.price),
    discounted_price: parseFloat(card.discounted_price),
    wish_count: card.wish_count,
    sales_volume: card.sales_volume,
    stocked_count: card.stocked_count,
  }))
}

async function batchUpsert(db: any, cards: any[], now: string) {
  const stmts = cards.map(card => ({
    sql: `
      INSERT INTO cards (id, name, image, group_name, member_name, group_image, member_image,
                       card_type, release_name, last_price, last_discounted_price, last_wish_count,
                       last_sales_volume, last_stocked_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, image = excluded.image, member_name = excluded.member_name,
        group_image = excluded.group_image, member_image = excluded.member_image,
        card_type = excluded.card_type, release_name = excluded.release_name,
        last_price = excluded.last_price,
        last_discounted_price = excluded.last_discounted_price, last_wish_count = excluded.last_wish_count,
        last_sales_volume = excluded.last_sales_volume, last_stocked_count = excluded.last_stocked_count,
        updated_at = excluded.updated_at
    `,
    args: [
      card.id, card.name, card.image, card.group_name, card.member_name,
      card.group_image, card.member_image, card.card_type, card.release_name,
      card.price, card.discounted_price,
      card.wish_count, card.sales_volume, card.stocked_count, now,
    ],
  }))

  // Execute in chunks of 50 to avoid overwhelming the DB
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50)
    await db.batch(chunk)
  }

  const historyStmts = cards.map(card => ({
    sql: `
      INSERT INTO price_history (card_id, price, discounted_price, wish_count, sales_volume, stocked_count, recorded_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM price_history
        WHERE card_id = ?
          AND price IS ?
          AND COALESCE(discounted_price, -1) IS COALESCE(?, -1)
        ORDER BY recorded_at DESC
        LIMIT 1
      )
    `,
    args: [
      card.id,
      card.price,
      card.discounted_price,
      card.wish_count,
      card.sales_volume,
      card.stocked_count,
      now,
      card.id,
      card.price,
      card.discounted_price,
    ],
  }))

  for (let i = 0; i < historyStmts.length; i += 50) {
    const chunk = historyStmts.slice(i, i + 50)
    try {
      await db.batch(chunk)
    } catch (e) {
      console.error('Failed to write price_history snapshot:', e)
    }
  }
}
