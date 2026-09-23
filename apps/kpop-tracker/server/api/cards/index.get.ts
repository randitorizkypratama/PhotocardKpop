export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || undefined
  const member = (query.member as string) || undefined
  const search = (query.search as string) || undefined
  const cardType = (query.card_type as string) || undefined
  const release = (query.release as string) || undefined
  const sort = (query.sort as string) || 'popular'
  const minPrice = parseFloat(query.min_price as string) || undefined
  const maxPrice = parseFloat(query.max_price as string) || undefined
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 20
  const offset = (page - 1) * limit

  const db = getTursoClient()

  let conditions: string[] = []
  let args: (string | number)[] = []

  if (group) {
    conditions.push('group_name = ?')
    args.push(group)
  }
  if (member) {
    conditions.push('UPPER(member_name) = ?')
    args.push(member.toUpperCase())
  }
  if (search) {
    conditions.push('(UPPER(name) LIKE ? OR UPPER(member_name) LIKE ?)')
    const q = `%${search.toUpperCase()}%`
    args.push(q, q)
  }
  if (cardType) {
    conditions.push('card_type = ?')
    args.push(cardType)
  }
  if (release) {
    conditions.push('release_name = ?')
    args.push(release)
  }
  if (minPrice !== undefined) {
    conditions.push('last_discounted_price >= ?')
    args.push(minPrice)
  }
  if (maxPrice !== undefined) {
    conditions.push('last_discounted_price <= ?')
    args.push(maxPrice)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

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

  const cards = cardsResult.rows.map(card => ({
    id: card.id,
    name: card.name,
    image: card.image,
    group_name: card.group_name,
    member_name: card.member_name,
    group_image: card.group_image,
    member_image: card.member_image,
    card_type: card.card_type,
    release_name: card.release_name,
    price: card.last_price,
    discounted_price: card.last_discounted_price,
    discount_rate: (card.last_discounted_price as number) < (card.last_price as number)
      ? Math.round((1 - (card.last_discounted_price as number) / (card.last_price as number)) * 100)
      : 0,
    is_in_promotion: (card.last_discounted_price as number) < (card.last_price as number),
    wish_count: card.last_wish_count,
    sales_volume: card.last_sales_volume,
    stocked_count: card.last_stocked_count,
  }))

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
