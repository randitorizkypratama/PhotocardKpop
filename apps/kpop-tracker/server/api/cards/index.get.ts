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

  // Structured search: card type / store phrases are pulled out first, the rest
  // is matched across name, member, group and release.
  const parsed = parseStructuredSearch(search)
  if (parsed.cardType) {
    const values = cardTypeSqlValues(parsed.cardType)
    conditions.push(`UPPER(card_type) IN (${values.map(() => '?').join(', ')})`)
    args.push(...values)
  }
  if (parsed.store) {
    const patterns = storeLikePatterns(parsed.store)
    conditions.push(`(UPPER(name) LIKE ?${patterns.length > 1 ? ' OR UPPER(name) LIKE ?' : ''})`)
    args.push(...patterns)
  }
  if (parsed.text) {
    const q = `%${parsed.text.toUpperCase()}%`
    conditions.push(
      '(UPPER(name) LIKE ? OR UPPER(member_name) LIKE ? OR UPPER(group_name) LIKE ? OR UPPER(COALESCE(release_name, \'\')) LIKE ?)',
    )
    args.push(q, q, q, q)
  }

  if (store) {
    const patterns = storeLikePatterns(store)
    conditions.push(`(UPPER(name) LIKE ?${patterns.length > 1 ? ' OR UPPER(name) LIKE ?' : ''})`)
    args.push(...patterns)
  }
  if (cardType) {
    const values = cardTypeSqlValues(cardType)
    conditions.push(`UPPER(card_type) IN (${values.map(() => '?').join(', ')})`)
    args.push(...values)
  }
  if (release) {
    conditions.push('release_name = ?')
    args.push(release)
  }
  const priceExpr = 'COALESCE(last_discounted_price, last_price)'
  if (minPrice !== undefined && !isNaN(minPrice)) {
    conditions.push(`${priceExpr} >= ?`)
    args.push(minPrice)
  }
  if (maxPrice !== undefined && !isNaN(maxPrice)) {
    conditions.push(`${priceExpr} <= ?`)
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
