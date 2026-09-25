export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') as string)

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid card ID',
    })
  }

  const db = getTursoClient()

  const existing = await db.execute({
    sql: 'SELECT * FROM cards WHERE id = ?',
    args: [id],
  })

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    const price = Number(row.last_price) || 0
    const discounted = row.last_discounted_price == null ? null : Number(row.last_discounted_price)
    const hasDiscount = discounted != null && price > 0 && discounted < price
    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        image: row.image,
        group_name: row.group_name,
        member_name: row.member_name,
        group_image: row.group_image,
        member_image: row.member_image,
        release_name: row.release_name,
        ...cardTypeFields(row),
        price: row.last_price,
        discounted_price: row.last_discounted_price,
        discount_rate: hasDiscount
          ? Math.round((1 - discounted / price) * 100)
          : 0,
        is_in_promotion: hasDiscount,
        wish_count: row.last_wish_count,
        sales_volume: row.last_sales_volume,
        stocked_count: row.last_stocked_count,
      },
      source: 'db',
    }
  }

  throw createError({
    statusCode: 404,
    statusMessage: 'Card not found',
  })
})