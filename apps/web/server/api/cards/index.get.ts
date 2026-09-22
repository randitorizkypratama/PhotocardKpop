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

  // Fetch from Pocamarket - one page at a time (fast, no timeout)
  const response = await fetchPocamarketCards(group, page)

  if (!response.success) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch from Pocamarket' })
  }

  let cards = response.data.results.map(card => ({
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

  // Apply filters client-side on this page
  if (member) {
    cards = cards.filter(c => c.member_name?.toUpperCase() === member.toUpperCase())
  }
  if (search) {
    const q = search.toUpperCase()
    cards = cards.filter(c => c.name.toUpperCase().includes(q) || c.member_name?.toUpperCase().includes(q))
  }
  if (cardType) {
    cards = cards.filter(c => c.card_type === cardType)
  }
  if (minPrice !== undefined) {
    cards = cards.filter(c => c.discounted_price >= minPrice)
  }
  if (maxPrice !== undefined) {
    cards = cards.filter(c => c.discounted_price <= maxPrice)
  }

  // Sort within page
  if (sort === 'price_asc') cards.sort((a, b) => a.discounted_price - b.discounted_price)
  else if (sort === 'price_desc') cards.sort((a, b) => b.discounted_price - a.discounted_price)
  else if (sort === 'name') cards.sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === 'stock') cards.sort((a, b) => b.stocked_count - a.stocked_count)

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
})
