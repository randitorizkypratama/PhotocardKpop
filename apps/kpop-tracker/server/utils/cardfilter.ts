export interface CardFilterInput {
  group?: string
  member?: string
  search?: string
  cardType?: string
  release?: string
  store?: string
  minPrice?: number
  maxPrice?: number
}

/**
 * Shared WHERE builder for `/api/cards` and `/api/facets` so facet counts and
 * the result list always agree on what "the current filters" mean.
 */
export function buildCardFilter(input: CardFilterInput): { where: string, args: (string | number)[] } {
  const conditions: string[] = []
  const args: (string | number)[] = []

  if (input.group) {
    conditions.push('group_name = ?')
    args.push(input.group)
  }
  if (input.member) {
    conditions.push('UPPER(member_name) = ?')
    args.push(input.member.toUpperCase())
  }

  // Structured search: card type / store phrases are pulled out first, the rest
  // is matched across name, member, group and release.
  const parsed = parseStructuredSearch(input.search)
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

  if (input.store) {
    const patterns = storeLikePatterns(input.store)
    conditions.push(`(UPPER(name) LIKE ?${patterns.length > 1 ? ' OR UPPER(name) LIKE ?' : ''})`)
    args.push(...patterns)
  }
  if (input.cardType) {
    const values = cardTypeSqlValues(input.cardType)
    conditions.push(`UPPER(card_type) IN (${values.map(() => '?').join(', ')})`)
    args.push(...values)
  }
  if (input.release) {
    conditions.push('release_name = ?')
    args.push(input.release)
  }
  const priceExpr = 'COALESCE(last_discounted_price, last_price)'
  if (input.minPrice !== undefined && !isNaN(input.minPrice)) {
    conditions.push(`${priceExpr} >= ?`)
    args.push(input.minPrice)
  }
  if (input.maxPrice !== undefined && !isNaN(input.maxPrice)) {
    conditions.push(`${priceExpr} <= ?`)
    args.push(input.maxPrice)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, args }
}
