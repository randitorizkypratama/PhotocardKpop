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

  // If no filters, just fetch the requested page (fast)
  if (!hasFilters) {
    const response = await fetchPocamarketCards(group, page)
    if (!response.success) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch from Pocamarket' })
    }
    const cards = mapCards(response.data.results)
    return {
      success: true,
      data: cards,
      pagination: {
        page,
        limit,
        total: response.data.count,
        totalPages: Math.ceil(response.data.count / 20),
      },
    }
  }

  // If filters, fetch all pages and filter
  let allCards: any[] = []
  let currentPage = 1
  let hasMore = true
  const maxPages = 100 // safety limit (2000 cards)

  while (hasMore && currentPage <= maxPages) {
    try {
      const response = await fetchPocamarketCards(group, currentPage)
      if (!response.success || response.data.results.length === 0) break

      const mapped = mapCards(response.data.results)
      allCards.push(...mapped)

      hasMore = response.data.next_page !== null
      currentPage++
    } catch {
      break
    }
  }

  // Apply filters
  if (member) {
    allCards = allCards.filter(c => c.member_name?.toUpperCase() === member.toUpperCase())
  }
  if (search) {
    const q = search.toUpperCase()
    allCards = allCards.filter(c => c.name.toUpperCase().includes(q) || c.member_name?.toUpperCase().includes(q))
  }
  if (cardType) {
    allCards = allCards.filter(c => c.card_type === cardType)
  }
  if (minPrice !== undefined) {
    allCards = allCards.filter(c => c.discounted_price >= minPrice)
  }
  if (maxPrice !== undefined) {
    allCards = allCards.filter(c => c.discounted_price <= maxPrice)
  }

  // Sort
  if (sort === 'price_asc') allCards.sort((a, b) => a.discounted_price - b.discounted_price)
  else if (sort === 'price_desc') allCards.sort((a, b) => b.discounted_price - a.discounted_price)
  else if (sort === 'name') allCards.sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === 'stock') allCards.sort((a, b) => b.stocked_count - a.stocked_count)

  const total = allCards.length
  const start = (page - 1) * limit
  const paginatedCards = allCards.slice(start, start + limit)

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
