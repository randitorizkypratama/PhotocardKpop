/**
 * Date parsing for news metadata (§6).
 *
 * Rules this module exists to enforce:
 *  - a date without a clock time stays a date; no time is invented for it;
 *  - real times are normalized to UTC for storage;
 *  - the discovery timestamp is never mistaken for the publication timestamp;
 *  - nothing is fabricated when a source simply omits the date.
 */

export interface ParsedDate {
  /** UTC `…Z` ISO when a time was known, otherwise `YYYY-MM-DD`. */
  iso: string
  hasTime: boolean
  /** How the value was interpreted — surfaced in the audit trail. */
  precision: 'second' | 'minute' | 'day'
  /** Set when the source gave no timezone and the value was read as UTC. */
  assumedTimezone: boolean
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const SLASHED_DATE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
const HAS_CLOCK_TIME = /\b\d{1,2}:\d{2}(:\d{2})?\b/
const HAS_ZONE = /(GMT|UTC|Z\b|[+-]\d{2}:?\d{2}$)/
const KOREAN_DATE = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateOnlyIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null
  }
  return `${pad(year)}-${pad(month)}-${pad(day)}`
}

/**
 * Parse an article/RSS/JSON-LD date. Returns `null` when the value is missing
 * or unparseable — callers must treat that as "no publication date", never as
 * "use the fetch time instead".
 */
export function parsePublicationDate(raw: string | null | undefined, now: Date = new Date()): ParsedDate | null {
  const value = (raw || '').trim()
  if (!value) return null

  // Epoch seconds / milliseconds (Naver and some APIs emit these).
  if (/^\d{10}$/.test(value) || /^\d{13}$/.test(value)) {
    const millis = value.length === 10 ? Number(value) * 1000 : Number(value)
    const date = new Date(millis)
    if (Number.isNaN(date.getTime())) return null
    return { iso: date.toISOString(), hasTime: true, precision: 'second', assumedTimezone: false }
  }

  const korean = KOREAN_DATE.exec(value)
  if (korean) {
    const iso = dateOnlyIso(Number(korean[1]), Number(korean[2]), Number(korean[3]))
    return iso ? { iso, hasTime: false, precision: 'day', assumedTimezone: false } : null
  }

  const dateOnly = DATE_ONLY.exec(value) || SLASHED_DATE.exec(value)
  if (dateOnly) {
    const iso = dateOnlyIso(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))
    return iso ? { iso, hasTime: false, precision: 'day', assumedTimezone: false } : null
  }

  const hasTime = HAS_CLOCK_TIME.test(value)
  const hasZone = HAS_ZONE.test(value)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  if (!hasTime) {
    // A calendar date with no clock: keep the *date* the source wrote, not the
    // UTC day of the midnight it was parsed as.
    const iso = dateOnlyIso(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate())
    return iso ? { iso, hasTime: false, precision: 'day', assumedTimezone: false } : null
  }

  return {
    iso: parsed.toISOString(),
    hasTime: true,
    precision: value.includes(':') && /:\d{2}:\d{2}/.test(value) ? 'second' : 'minute',
    assumedTimezone: !hasZone,
  }
}

/**
 * Publication dates must sit between 2001 and "now + 48h" (the headroom
 * covers a publisher posting in a timezone ahead of the server). Anything
 * outside is metadata damage, not a fact.
 */
export function isPlausiblePublicationDate(iso: string | null, now: Date = new Date()): boolean {
  if (!iso) return false
  const value = iso.length === 10 ? `${iso}T00:00:00Z` : iso
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  if (parsed.getTime() > now.getTime() + 48 * 3600 * 1000) return false
  return parsed.getTime() >= Date.UTC(2001, 0, 1)
}

const UI_TIME_ZONE = 'Asia/Jakarta'

/**
 * Render a stored value in the site's timezone (Asia/Jakarta — WIB — unless a
 * caller passes another). Date-only values are printed verbatim: shifting them
 * would display a day the publisher never wrote down.
 */
export function formatInTimeZone(
  iso: string | null | undefined,
  options: { timeZone?: string, withTime?: boolean, locale?: string } = {},
): string {
  if (!iso) return ''
  const timeZone = options.timeZone || UI_TIME_ZONE
  const locale = options.locale || 'en-GB'
  if (iso.length === 10) return iso

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(options.withTime === false ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
  }).format(date)
}

/** Day portion of a stored value in a timezone — used for date grouping. */
export function dayInTimeZone(iso: string, timeZone: string = UI_TIME_ZONE): string {
  if (iso.length === 10) return iso
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
