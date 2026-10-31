import { requireUser } from '../../utils/session'
import { getTursoClient } from '../../utils/turso'

/**
 * Aggregates the daily total market value of a user's owned collection.
 *
 * For each day where price_history exists, we sum the effective price
 * (discounted_price || price) across all owned cards. The result is a
 * time series of { date, value } points that the client renders as a
 * line chart.
 *
 * We fetch the latest snapshot per card per day, so a card with multiple
 * snapshots on the same day only counts its most recent one.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getTursoClient()

  // Get all owned card ids for the user.
  const ownedResult = await db.execute({
    sql: `SELECT card_id FROM collections
          WHERE user_id = ? AND status = 'owned'`,
    args: [user.id],
  })

  const cardIds = ownedResult.rows.map(row => Number(row.card_id))
  if (cardIds.length === 0) {
    return { success: true, data: [] }
  }

  // Fetch price history for all owned cards. We take the latest snapshot
  // per card per day using ROW_NUMBER so each card contributes at most one
  // price per day. The window function partitions by card_id and date
  // (truncated to day from recorded_at).
  const placeholders = cardIds.map(() => '?').join(', ')
  const history = await db.execute({
    sql: `WITH daily AS (
            SELECT
              card_id,
              price,
              discounted_price,
              DATE(recorded_at) AS day,
              ROW_NUMBER() OVER (
                PARTITION BY card_id, DATE(recorded_at)
                ORDER BY recorded_at DESC, id DESC
              ) AS rn
            FROM price_history
            WHERE card_id IN (${placeholders})
          )
          SELECT day,
                 SUM(CASE
                   WHEN discounted_price IS NOT NULL AND discounted_price > 0
                   THEN discounted_price
                   ELSE price
                 END) AS total_value
          FROM daily
          WHERE rn = 1
          GROUP BY day
          ORDER BY day ASC`,
    args: cardIds,
  })

  const data = history.rows.map(row => ({
    date: String(row.day),
    value: Number(row.total_value) || 0,
  }))

  return { success: true, data }
})
