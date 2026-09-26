/**
 * Normalization layer for Pocamarket-derived photocard data.
 *
 * Raw values coming from card names are kept intact; the UI and filters use the
 * normalized values. Nothing here writes back to the database.
 */

export const CARD_TYPE_CANONICAL = [
  'Album',
  'POB',
  'Lucky Draw',
  'MD',
  'Fan Meeting',
  "Season's Greetings",
  'Concert',
  'Trading Card',
  'Pop-up',
  'Fan Club',
  'Fansign',
  'Broadcast',
  'Event',
] as const

/** Lower-cased, punctuation-free alias → canonical card type. */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  album: 'Album',
  'album pc': 'Album',
  'albumpc': 'Album',
  'album photocard': 'Album',
  digipack: 'Album',
  'kit album': 'Album',
  weverse: 'Album',
  pob: 'POB',
  'p.o.b': 'POB',
  'pre order benefit': 'POB',
  'preorder benefit': 'POB',
  'pre-order benefit': 'POB',
  'pre order': 'POB',
  'preorder': 'POB',
  'lucky draw': 'Lucky Draw',
  luckydraw: 'Lucky Draw',
  'lucky draw event': 'Lucky Draw',
  md: 'MD',
  merch: 'MD',
  merchandise: 'MD',
  'md ver': 'MD',
  'fan meeting': 'Fan Meeting',
  fanmeeting: 'Fan Meeting',
  'fan meeting card': 'Fan Meeting',
  "season's greetings": "Season's Greetings",
  'seasons greetings': "Season's Greetings",
  'season greeting': "Season's Greetings",
  sg: "Season's Greetings",
  concert: 'Concert',
  'world tour': 'Concert',
  live: 'Concert',
  'trading card': 'Trading Card',
  'trading cards': 'Trading Card',
  tc: 'Trading Card',
  'pop-up': 'Pop-up',
  popup: 'Pop-up',
  'pop up': 'Pop-up',
  'pop-up store': 'Pop-up',
  'popup store': 'Pop-up',
  'fan club': 'Fan Club',
  fanclub: 'Fan Club',
  'fan kit': 'Fan Club',
  fansign: 'Fansign',
  'fan sign': 'Fansign',
  'fan signing': 'Fansign',
  broadcast: 'Broadcast',
  'music show': 'Broadcast',
  event: 'Event',
}

/** Phrases detected inside a raw card name → canonical card type. Longest first. */
const RAW_PHRASES: { pattern: RegExp; canonical: string }[] = [
  { pattern: /SEASON'?S?\s+GREETINGS/i, canonical: "Season's Greetings" },
  { pattern: /TRADING\s+CARD/i, canonical: 'Trading Card' },
  { pattern: /LUCKY\s*DRAW/i, canonical: 'Lucky Draw' },
  { pattern: /PRE[-\s]?ORDER\s+BENEFIT/i, canonical: 'POB' },
  { pattern: /\bPOB\b/i, canonical: 'POB' },
  { pattern: /FAN\s*MEETING|FAN\s*CERT/i, canonical: 'Fan Meeting' },
  { pattern: /FAN\s*CLUB|FAN\s*KIT/i, canonical: 'Fan Club' },
  { pattern: /FAN\s*SIGN(ING)?\b/i, canonical: 'Fansign' },
  { pattern: /\bMD\b|MERCH/i, canonical: 'MD' },
  { pattern: /POP[-\s]?UP/i, canonical: 'Pop-up' },
  { pattern: /BROADCAST/i, canonical: 'Broadcast' },
  { pattern: /CONCERT|WORLD\s+TOUR/i, canonical: 'Concert' },
]

const KEY_STORES: { display: string; pattern: RegExp }[] = [
  { display: 'KTOWN4U', pattern: /\bKTOWN4U\b|\bK[- ]?TOWN4U\b/i },
  { display: 'WITHMUU', pattern: /\bWITHMUU\b/i },
  { display: 'Apple Music', pattern: /\bAPPLE\s*MUSIC\b/i },
  { display: 'MakeStar', pattern: /\bMAKESTAR\b/i },
  { display: 'Interasia', pattern: /\bINTERASIA\b/i },
  { display: 'Everline', pattern: /\bEVERLINE\b/i },
  { display: 'Mini Record', pattern: /\bMINIRECORD\b|\bMINI\s*RECORD\b/i },
  { display: 'Musicart', pattern: /\bMUSICART\b/i },
  { display: 'Soundwave', pattern: /\bSOUNDWAVE\b/i },
  { display: 'Mule', pattern: /\bMULE\b/i },
  { display: 'Yes24', pattern: /\bYES24\b/i },
  { display: 'Gmarket', pattern: /\bGMARKET\b/i },
  { display: 'Hanteo', pattern: /\bHANTEO\b/i },
  { display: 'Interpark', pattern: /\bINTERPARK\b/i },
  { display: 'Mnet', pattern: /\bMNET\b/i },
  { display: 'DICON', pattern: /\bDICON\b/i },
]

const EVENT_PHRASES: { display: string; pattern: RegExp }[] = [
  { display: 'Pop-up store', pattern: /POP[-\s]?UP\s+STORE/i },
  { display: 'Video call', pattern: /VIDEO\s*CALL/i },
  { display: 'Fansign', pattern: /FAN\s*SIGN(ING)?\b/i },
  { display: 'Showcase', pattern: /SHOWCASE/i },
  { display: 'Fansign event', pattern: /FAN\s*EVENT\b/i },
]

export function displayKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Map any card type spelling onto the canonical label. Unknown values are kept as-is. */
export function normalizeCardType(value?: string | null): string {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  const key = displayKey(trimmed)
  return ALIAS_TO_CANONICAL[key] ?? trimmed
}

/** Best-effort raw type phrase as written on the card name, else the stored value. */
export function detectRawCardType(name?: string | null, fallback?: string | null): string {
  if (name) {
    for (const { pattern } of RAW_PHRASES) {
      const match = name.match(pattern)
      if (match) return match[0].trim()
    }
  }
  return fallback ? String(fallback) : ''
}

/** Store / platform the photocard was distributed by, when the name says so. */
export function extractStore(name?: string | null): string | null {
  if (!name) return null
  for (const store of KEY_STORES) {
    if (store.pattern.test(name)) return store.display
  }
  return null
}

/** Explicit event phrase on the card name. Returns null instead of guessing. */
export function extractEvent(name?: string | null): string | null {
  if (!name) return null
  for (const event of EVENT_PHRASES) {
    if (event.pattern.test(name)) return event.display
  }
  return null
}

export interface CardTypeFields {
  card_type: string
  card_type_raw: string
  store: string | null
  event: string | null
}

/** Fields added to every photocard response. */
export function cardTypeFields(row: Record<string, any>): CardTypeFields {
  const stored = row?.card_type == null ? null : String(row.card_type)
  return {
    card_type: normalizeCardType(stored),
    card_type_raw: detectRawCardType(row?.name, stored),
    store: extractStore(row?.name),
    event: extractEvent(row?.name),
  }
}

/** Values usable inside `UPPER(card_type) IN (...)`. */
export function cardTypeSqlValues(query: string): string[] {
  const values = new Set<string>([query, normalizeCardType(query)])
  return [...values].filter(Boolean).map(v => v.toUpperCase())
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface StructuredSearch {
  /** Free-text remainder (member, album, group, …) */
  text: string
  /** Card type parsed out of the query, if any */
  cardType: string | null
  /** Store parsed out of the query, if any */
  store: string | null
}

const SEARCH_TYPE_PHRASES: { phrase: string; canonical: string }[] = [
  { phrase: "SEASON'S GREETINGS", canonical: "Season's Greetings" },
  { phrase: 'SEASONS GREETINGS', canonical: "Season's Greetings" },
  { phrase: 'LUCKY DRAW', canonical: 'Lucky Draw' },
  { phrase: 'TRADING CARD', canonical: 'Trading Card' },
  { phrase: 'PRE-ORDER BENEFIT', canonical: 'POB' },
  { phrase: 'PRE ORDER BENEFIT', canonical: 'POB' },
  { phrase: 'FAN MEETING', canonical: 'Fan Meeting' },
  { phrase: 'FAN CLUB', canonical: 'Fan Club' },
  { phrase: 'POP-UP', canonical: 'Pop-up' },
  { phrase: 'POP UP', canonical: 'Pop-up' },
  { phrase: 'FANSIGN', canonical: 'Fansign' },
  { phrase: 'BROADCAST', canonical: 'Broadcast' },
  { phrase: 'CONCERT', canonical: 'Concert' },
  { phrase: 'POB', canonical: 'POB' },
  { phrase: 'MD', canonical: 'MD' },
]

/**
 * Split a free-text query into a card type, a store, and the remaining text so
 * "rei lucky draw" filters on member + type without any fuzzy AI layer.
 */
export function parseStructuredSearch(raw?: string | null): StructuredSearch {
  const result: StructuredSearch = { text: '', cardType: null, store: null }
  if (!raw) return result
  let text = String(raw).trim()
  if (!text) return result

  for (const { phrase, canonical } of SEARCH_TYPE_PHRASES) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$)`, 'i')
    if (pattern.test(text)) {
      if (!result.cardType) result.cardType = canonical
      text = text.replace(new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$)`, 'ig'), ' ')
      break
    }
  }

  for (const store of KEY_STORES) {
    // Card names write stores both as "Apple Music" and "APPLEMUSIC".
    const variants = [store.display, store.display.replace(/\s+/g, '')]
    for (const variant of variants) {
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(variant)}(?=\\s|$)`, 'i')
      if (!pattern.test(text)) continue
      result.store = store.display
      text = text.replace(new RegExp(`(^|\\s)${escapeRegExp(variant)}(?=\\s|$)`, 'ig'), ' ')
      break
    }
    if (result.store) break
  }

  result.text = text.replace(/\s+/g, ' ').trim()
  return result
}

/** Store list used by the store filter and the search parser. */
export function knownStores(): { display: string; pattern: RegExp }[] {
  return KEY_STORES.map(store => ({ display: store.display, pattern: store.pattern }))
}

/**
 * LIKE patterns for a store. Card names write them both as "Apple Music" and
 * "Applemusic", so counting and filtering must use exactly the same variants.
 */
export function storeLikePatterns(display: string): string[] {
  const upper = display.toUpperCase()
  const spaced = `%${upper}%`
  const nospace = `%${upper.replace(/\s+/g, '')}%`
  return spaced === nospace ? [spaced] : [spaced, nospace]
}

/**
 * URL slug for a release ("I'VE MINE" → "ive-mine"). The album page matches the
 * slug back against the known releases of its group, so collisions are harmless.
 */
export function releaseSlug(name?: string | null): string {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/['\u2019\u02bc`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'release'
}
