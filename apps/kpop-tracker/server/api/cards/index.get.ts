export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || undefined
  const member = (query.member as string) || undefined
  const search = (query.search as string) || undefined
  const cardType = (query.card_type as string) || undefined
  const release = (query.release as string) || undefined
  const store = (query.store as string) || undefined
  const sort = (query.sort as string) || 'popular'
  const minPrice = query.min_price !== undefined ? parseFloat(query.min_price as string) : undefined
  const maxPrice = query.max_price !== undefined ? parseFloat(query.max_price as string) : undefined
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20))
  const offset = (page - 1) * limit

  const db = getTursoClient()

  const { where: whereClause, args } = buildCardFilter({
    group,
    member,
    search,
    cardType,
    release,
    store,
    minPrice,
    maxPrice,
  })

  let orderClause = 'ORDER BY last_wish_count DESC'
  if (sort === 'price_asc') orderClause = 'ORDER BY last_discounted_price ASC'
  else if (sort === 'price_desc') orderClause = 'ORDER BY last_discounted_price DESC'
  else if (sort === 'name') orderClause = 'ORDER BY name ASC'
  else if (sort === 'stock') orderClause = 'ORDER BY last_stocked_count DESC'
  else if (sort === 'newest') orderClause = 'ORDER BY updated_at DESC'

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM cards ${whereClause}`,
    args,
  })
  const total = countResult.rows[0]?.total as number || 0

  if (total === 0) {
    return {
      success: true,
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    }
  }

  const cardsResult = await db.execute({
    sql: `SELECT * FROM cards ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  })

  const cards = cardsResult.rows.map((card) => {
    const price = Number(card.last_price) || 0
    const discounted = card.last_discounted_price == null ? 0 : Number(card.last_discounted_price)
    const hasDiscount = discounted > 0 && price > 0 && discounted < price
    return {
      id: card.id,
      name: card.name,
      image: card.image,
      group_name: card.group_name,
      member_name: card.member_name,
      group_image: card.group_image,
      member_image: card.member_image,
      release_name: card.release_name,
      ...cardTypeFields(card),
      price: card.last_price,
      discounted_price: card.last_discounted_price,
      discount_rate: hasDiscount ? Math.round((1 - discounted / price) * 100) : 0,
      is_in_promotion: hasDiscount,
      wish_count: card.last_wish_count,
      sales_volume: card.last_sales_volume,
      stocked_count: card.last_stocked_count,
    }
  })

  return {
    success: true,
    data: cards,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
})
