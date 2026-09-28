import { describe, expect, it } from 'vitest'
import { buildCardFilter } from '../server/utils/cardfilter'
import { knownStores, parseStructuredSearch } from '../server/utils/normalize'
import { hashPassword, verifyPassword } from '../server/utils/password'
import { safeExternalUrl } from '../app/lib/url'

const placeholders = (sql: string) => (sql.match(/\?/g) || []).length

describe('buildCardFilter', () => {
  it('returns an empty WHERE for no filters', () => {
    const { where, args } = buildCardFilter({})
    expect(where).toBe('')
    expect(args).toEqual([])
  })

  it('parameterizes group and member without interpolating values', () => {
    const { where, args } = buildCardFilter({ group: 'IVE', member: 'rei' })
    expect(where).toBe('WHERE group_name = ? AND UPPER(member_name) = ?')
    expect(args).toEqual(['IVE', 'REI'])
    expect(where).not.toContain('IVE')
  })

  it('keeps SQL injection attempts in args, not in the SQL string', () => {
    const evil = "x' OR 1=1 --"
    const { where, args } = buildCardFilter({ search: evil })
    expect(where).not.toContain('OR 1=1')
    expect(where).not.toContain("1=1")
    expect(args.some(a => String(a).toUpperCase().includes('OR 1=1'))).toBe(true)
    expect(placeholders(where)).toBe(args.length)
  })

  it('matches placeholder count to args for every filter combined', () => {
    const { where, args } = buildCardFilter({
      group: 'aespa',
      member: 'karina',
      search: 'rei lucky draw ktown4u',
      store: 'KTOWN4U',
      cardType: 'POB',
      release: 'Armageddon',
      minPrice: 1,
      maxPrice: 9,
    })
    expect(where.startsWith('WHERE ')).toBe(true)
    expect(placeholders(where)).toBe(args.length)
    expect(args.length).toBeGreaterThan(5)
  })

  it('prices filter on the COALESCE(discounted, price) expression', () => {
    const { where } = buildCardFilter({ minPrice: 5 })
    expect(where).toContain('COALESCE(last_discounted_price, last_price) >= ?')
    const { where: desc } = buildCardFilter({ maxPrice: 5 })
    expect(desc).toContain('COALESCE(last_discounted_price, last_price) <= ?')
  })

  it('builds a LIKE filter for stores with both spaced and joined variants', () => {
    const { where, args } = buildCardFilter({ store: 'KTOWN4U' })
    expect(where).toContain('UPPER(name) LIKE ?')
    expect(args).toEqual(['%KTOWN4U%'])
  })
})

describe('parseStructuredSearch', () => {
  it('handles null, undefined and empty input', () => {
    for (const input of [null, undefined, '', '   ']) {
      const parsed = parseStructuredSearch(input as string | null | undefined)
      expect(parsed.text).toBe('')
      expect(parsed.cardType).toBeNull()
      expect(parsed.store).toBeNull()
    }
  })

  it('caps long queries at 200 characters', () => {
    const parsed = parseStructuredSearch('a'.repeat(5000))
    expect(parsed.text.length).toBeLessThanOrEqual(200)
  })

  it('extracts card type phrases from the query', () => {
    expect(parseStructuredSearch('rei lucky draw').cardType).toBe('Lucky Draw')
    expect(parseStructuredSearch('some pob card').cardType).toBe('POB')
  })

  it('extracts a known store and leaves the rest as text', () => {
    const store = knownStores()[0]
    const parsed = parseStructuredSearch(`${store.display} yujin blue hour`)
    expect(parsed.store).toBe(store.display)
    expect(parsed.text).toContain('yujin')
    expect(parsed.text).not.toContain(store.display.toUpperCase())
  })
})

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', () => {
    const stored = hashPassword('hunter2secret')
    expect(stored).not.toContain('hunter2secret')
    expect(verifyPassword('hunter2secret', stored)).toBe(true)
    expect(verifyPassword('wrong-password', stored)).toBe(false)
  })

  it('salts each hash independently', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'))
  })

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'garbage')).toBe(false)
    expect(verifyPassword('x', 'aa:bb')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
  })
})

describe('safeExternalUrl', () => {
  it('only allows http(s) URLs', () => {
    expect(safeExternalUrl('https://www.tiktok.com/@x')).toBe('https://www.tiktok.com/@x')
    expect(safeExternalUrl('  https://ok.dev/path  ')).toBe('https://ok.dev/path')
    expect(safeExternalUrl('javascript:alert(1)')).toBe('')
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe('')
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBe('')
    expect(safeExternalUrl(null, 'https://fallback.dev')).toBe('https://fallback.dev')
  })
})
