export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const group = (query.group as string) || 'IVE'
  const member = (query.member as string) || undefined
  const search = (query.search as string) || undefined
  const cardType = (query.card_type as string) || undefined
  const sort = (query.sort as string) || 'popular'
  const minPrice = parseFloat(query.min_price as string) || undefined
  const maxPrice = parseFloat(query.max_price as string) || undefined
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 20

  const hasFilters = !!(member || cardType || search || minPrice || maxPrice)

  // No filters: just fetch the requested page (fast)
  if (!hasFilters) {
    const response = await fetchPocamarketCards(group, page)
    if (!response.success) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch from Pocamarket' })
    }
    return {
      success: true,
      data: mapCards(response.data.results),
      pagination: {
        page,
        limit,
        total: response.data.count,
        totalPages: Math.ceil(response.data.count / 20),
      },
    }
  }

  // With filters: fetch pages until we have enough matches
  let allCards: any[] = []
  let pocamarketPage = 1
  let hasMore = true
  const maxPages = 50 // max 50 pages = 1000 raw cards from Pocamarket
  const minMatches = 100 // try to find at least 100 matches

  while (hasMore && pocamarketPage <= maxPages) {
    try {
      const response = await fetchPocamarketCards(group, pocamarketPage)
      if (!response.success || response.data.results.length === 0) break

      const mapped = mapCards(response.data.results)
      allCards.push(...mapped)

      hasMore = response.data.next_page !== null
      pocamarketPage++

      // Early stop: if we have enough matches after filtering
      if (allCards.length >= minMatches * 3) break
    } catch {
      break
    }
  }

  // Apply filters
  let filtered = allCards
  if (member) {
    filtered = filtered.filter(c => c.member_name?.toUpperCase() === member.toUpperCase())
  }
  if (search) {
    const q = search.toUpperCase()
    filtered = filtered.filter(c => c.name.toUpperCase().includes(q) || c.member_name?.toUpperCase().includes(q))
  }
  if (cardType) {
    filtered = filtered.filter(c => c.card_type === cardType)
  }
  if (minPrice !== undefined) {
    filtered = filtered.filter(c => c.discounted_price >= minPrice)
  }
  if (maxPrice !== undefined) {
    filtered = filtered.filter(c => c.discounted_price <= maxPrice)
  }

  // Sort
  if (sort === 'price_asc') filtered.sort((a, b) => a.discounted_price - b.discounted_price)
  else if (sort === 'price_desc') filtered.sort((a, b) => b.discounted_price - a.discounted_price)
  else if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === 'stock') filtered.sort((a, b) => b.stocked_count - a.stocked_count)

  const total = filtered.length
  const start = (page - 1) * limit
  const paginatedCards = filtered.slice(start, start + limit)

  return {
    success: true,
    data: paginatedCards,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
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
    price: parseFloat(card.price),
    discounted_price: parseFloat(card.discounted_price),
    discount_rate: card.discount_rate,
    is_in_promotion: card.is_in_promotion,
    wish_count: card.wish_count,
    sales_volume: card.sales_volume,
    stocked_count: card.stocked_count,
  }))
}
