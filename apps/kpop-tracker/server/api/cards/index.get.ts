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
    const pageRows = cardsResult?.rows ?? []

    // Recent price movement for the trend badge on each card. Scoped to this
    // page's ids (never the whole table) and to snapshots from the last 7
    // days, so the badge reads "recently moved" instead of "moved sometime".
    // The (latest, previous) pair and the discounted-price precedence mirror
    // /api/movers. One extra round trip, collapsed by the 60s SWR cache below;
    // the ids only exist after the page query, so it cannot join the batch.
    const deltas = new Map<number, number>()
    if (pageRows.length > 0) {
      try {
        const ids = pageRows.map(row => Number(row.id))
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const history = await db.execute({
          sql: `WITH snaps AS (
                  SELECT card_id, price, discounted_price, recorded_at,
                         ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY recorded_at DESC, id DESC) AS rn
                  FROM price_history
                  WHERE card_id IN (${ids.map(() => '?').join(', ')})
                )
                SELECT card_id, price, discounted_price, recorded_at, rn
                FROM snaps WHERE rn <= 2`,
          args: ids,
        })
        const byCard = new Map<number, Array<{ rn: number, eff: number, at: string }>>()
        for (const row of history.rows) {
          const cardId = Number(row.card_id)
          const discounted = row.discounted_price == null ? 0 : Number(row.discounted_price)
          const price = Number(row.price) || 0
          const entry = { rn: Number(row.rn), eff: discounted > 0 ? discounted : price, at: String(row.recorded_at) }
          const list = byCard.get(cardId) ?? []
          list.push(entry)
          byCard.set(cardId, list)
        }
        for (const [cardId, list] of byCard) {
          const latest = list.find(snap => snap.rn === 1)
          const previous = list.find(snap => snap.rn === 2)
          // ISO timestamps compare lexicographically. A stale latest snapshot
          // (cron skipped) means the "movement" is not recent — no badge.
          if (!latest || !previous || latest.at < cutoff) continue
          if (!(latest.eff > 0) || !(previous.eff > 0) || latest.eff === previous.eff) continue
          deltas.set(cardId, Math.round(((latest.eff - previous.eff) * 1000) / previous.eff) / 10)
        }
      } catch {
        // price_history missing or window functions unsupported — the badge
        // is decoration; the page must still render every card.
      }
    }

    const cards = pageRows.map((card) => {
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
        delta_pct: deltas.get(Number(card.id)) ?? null,
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
