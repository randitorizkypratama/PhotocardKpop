interface MoverRow {
  id: number
  name: string
  image: string | null
  group_name: string
  member_name: string
  card_type: string | null
  release_name: string | null
  price: number
  prev_price: number
  delta_pct: number
}

/**
 * Biggest effective-price changes between each card's two latest
 * price_history snapshots, only for cards whose latest snapshot is recent
 * (within 36h — covers the daily cron's ±59min window regardless of WIB).
 */
const MOVERS_SQL = (direction: 'ASC' | 'DESC') => `
  WITH recent AS (
    SELECT DISTINCT card_id FROM price_history WHERE recorded_at >= ?
  ),
  snaps AS (
    SELECT ph.card_id, ph.price, ph.discounted_price, ph.recorded_at, ph.id,
           ROW_NUMBER() OVER (PARTITION BY ph.card_id ORDER BY ph.recorded_at DESC, ph.id DESC) AS rn
    FROM price_history ph
    WHERE ph.card_id IN (SELECT card_id FROM recent)
  ),
  delta AS (
    SELECT l.card_id,
           CASE WHEN COALESCE(l.discounted_price, 0) > 0 THEN l.discounted_price ELSE l.price END AS cur,
           CASE WHEN COALESCE(p.discounted_price, 0) > 0 THEN p.discounted_price ELSE p.price END AS prev
    FROM snaps l
    JOIN snaps p ON p.card_id = l.card_id AND p.rn = l.rn + 1
    WHERE l.rn = 1
      AND l.recorded_at >= ?
  )
  SELECT c.id, c.name, c.image, c.group_name, c.member_name, c.card_type, c.release_name,
         d.cur AS price,
         d.prev AS prev_price,
         (d.cur - d.prev) * 100.0 / d.prev AS delta_pct
  FROM delta d
  JOIN cards c ON c.id = d.card_id
  WHERE d.prev > 0 AND d.cur > 0 AND d.cur <> d.prev
  ORDER BY delta_pct ${direction}
  LIMIT ?
`

async function fetchMovers(direction: 'ASC' | 'DESC', cutoff: string, limit: number): Promise<MoverRow[]> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: MOVERS_SQL(direction),
    args: [cutoff, cutoff, limit],
  })
  return result.rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    image: row.image ? String(row.image) : null,
    group_name: String(row.group_name),
    member_name: row.member_name ? String(row.member_name) : '',
    card_type: row.card_type ? String(row.card_type) : null,
    release_name: row.release_name ? String(row.release_name) : null,
    price: Number(row.price),
    prev_price: Number(row.prev_price),
    delta_pct: Number(row.delta_pct),
  }))
}

export default defineEventHandler(async () => {
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
  const [drops, risers] = await Promise.all([
    fetchMovers('ASC', cutoff, 6),
    fetchMovers('DESC', cutoff, 6),
  ])

  return {
    success: true,
    data: { drops, risers },
    generated_at: new Date().toISOString(),
  }
})
