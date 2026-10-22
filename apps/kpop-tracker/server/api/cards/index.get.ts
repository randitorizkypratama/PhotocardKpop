// Only the columns the response actually maps. `SELECT *` used to pull every
// column (pocamarket ids, urls, timestamps, …) across the Turso wire for each
// of the 20–100 rows on the page, and most of it was thrown away here.
const CARD_COLUMNS = [
  'id',
  'name',
  'image',
  'group_name',
  'member_name',
  'group_image',
  'member_image',
  'release_name',
  'card_type',
  'last_price',
  'last_discounted_price',
  'last_wish_count',
  'last_sales_volume',
  'last_stocked_count',
].join(', ')

export default cachedEventHandler(
  async (event) => {
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
    if (sort === 'price_asc') orderClause = 'ORDER BY COALESCE(last_discounted_price, last_price) ASC'
    else if (sort === 'price_desc') orderClause = 'ORDER BY COALESCE(last_discounted_price, last_price) DESC'
    else if (sort === 'name') orderClause = 'ORDER BY name ASC'
    else if (sort === 'stock') orderClause = 'ORDER BY last_stocked_count DESC'
    // Not updated_at. The daily cron computes one `now` for the whole run and
    // writes it to every row it upserts, so after a full sync all 16567 cards
    // share a single timestamp and this ordering was arbitrary — the table held
    // only 5 distinct values, 16507 of them identical.
    //
    // Pocamarket ids ascend with listing time: measured across October, the id
    // ranges of cards first seen on successive days never overlap
    // (2026-10-01 511776..511974 … 2026-10-21 516923..517330), so id DESC means
    // "most recently listed" and rides the primary key.
    else if (sort === 'newest') orderClause = 'ORDER BY id DESC'

    // COUNT and the page used to run back to back — two round trips to Turso
    // on every browse request. A batch is one round trip.
    const [countResult, cardsResult] = await db.batch([
      {
        sql: `SELECT COUNT(*) as total FROM cards ${whereClause}`,
        args,
      },
      {
        sql: `SELECT ${CARD_COLUMNS} FROM cards ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      },
    ], 'read')

    const total = Number(countResult?.rows[0]?.total) || 0

    const cards = (cardsResult?.rows ?? []).map((card) => {
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
  },
  {
    // The most requested endpoint in the app, and the table only moves on the
    // daily cron. The cache key is the full URL, so every filter/page/sort
    // combination is cached on its own — 60s is short enough that nothing a
    // user sees is ever meaningfully stale, but long enough to collapse a
    // burst of filter tweaking into one query.
    swr: true,
    maxAge: 60,
  },
)
