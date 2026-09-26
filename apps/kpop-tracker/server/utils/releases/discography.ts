import type { Client } from '@libsql/client'
import { extractReleaseName } from '../pocamarket'

/**
 * MusicBrainz-backed discography — the authoritative list of Album / EP /
 * Single releases per group.
 *
 * Card names from Pocamarket never mention which release they belong to, so
 * previously `extractReleaseName` guessed it from hardcoded tokens. Here the
 * direction is reversed: we pull the real discography from MusicBrainz and
 * match every card name against it. Version siblings (Japanese / English /
 * track-video) are merged into one entry taking the earliest release date.
 */

export const DISCOGRAPHY_GROUPS = ['IVE', 'aespa', 'Hearts2Hearts'] as const

/** MusicBrainz artist ids — fixed so a lookup can never pick a namesake artist. */
const ARTIST_MBID: Record<string, string> = {
  IVE: 'b2f2216a-d7a9-4ce0-8b8f-f494d9a8c196',
  aespa: 'b51c672b-85e0-48fe-8648-470a2422229f',
  Hearts2Hearts: '066080a4-84c7-46c6-91d3-dc10d572749b',
}

const MB_BASE = 'https://musicbrainz.org/ws/2'
const MB_UA = 'HIBIKISHOP-PC/1.0 (contact: hibikishop@example.com)'
const DISCOGRAPHY_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MIN_MATCH_CHARS = 4

const PRIMARY_TYPES = new Set(['Album', 'EP', 'Single'])
const EXCLUDED_SECONDARY_TYPES = new Set([
  'Compilation',
  'Live',
  'Soundtrack',
  'Remix',
  'Demo',
  'DJ-mix',
  'Broadcast',
])

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface DiscographyRelease {
  group_name: string
  title: string
  key: string
  release_type: string | null
  release_date: string | null
  mbid: string | null
}

/** Normalised comparison key: upper case, no apostrophes, punctuation collapsed. */
export function discographyKey(value?: string | null): string {
  if (!value) return ''
  return String(value)
    .toUpperCase()
    .replace(/[’‘`´']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Drops version markers so "ELEVEN -Japanese ver.-", "Whiplash (English
 * version)" and "Salty & Sweet (track video version)" collapse onto their
 * base title — they are one release for our timeline, not three.
 */
export function stripVersionSuffix(title: string): string {
  let text = String(title).trim()
  for (let i = 0; i < 3; i++) {
    const before = text
    text = text.replace(/\s*\(([^()]*)\)\s*$/, (match, inner) =>
      /\bver(?:sion)?\.?\b|\bremix|\binstrumental|\binst\b|\bacoustic|\bdeluxe|\bremaster|\btrack video|\bremake/i.test(String(inner))
        ? ''
        : match,
    )
    text = text.replace(/\s*-\s*(?:japanese|korean|english|chinese)\s*ver\.?\s*[-.]*\s*$/i, '')
    if (text === before) break
  }
  return text.replace(/\s*-\s*(?:ep|single|album|mini album|full album|repackage)\s*$/i, '').trim()
}

async function mbFetch(path: string) {
  const response = await fetch(`${MB_BASE}${path}`, {
    headers: { 'User-Agent': MB_UA, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`MusicBrainz error ${response.status} for ${path}`)
  return response.json() as Promise<any>
}

interface RawReleaseGroup {
  id?: string
  title?: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'first-release-date'?: string
}

/** Groups raw release-groups by base title, keeping the earliest version. */
export function mergeReleaseGroups(group: string, releaseGroups: RawReleaseGroup[]): DiscographyRelease[] {
  const merged = new Map<string, { title: string, type: string, date: string | null, mbid: string | null }>()

  for (const rg of releaseGroups) {
    const primary = String(rg['primary-type'] || '')
    if (!PRIMARY_TYPES.has(primary)) continue
    if ((rg['secondary-types'] || []).some(type => EXCLUDED_SECONDARY_TYPES.has(type))) continue

    const title = stripVersionSuffix(String(rg.title || ''))
    const key = discographyKey(title)
    if (!key) continue
    const date = rg['first-release-date'] ? String(rg['first-release-date']) : null

    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { title, type: primary, date, mbid: rg.id || null })
      continue
    }
    if (date && (!existing.date || date < existing.date)) {
      existing.date = date
      existing.type = primary
      if (rg.id) existing.mbid = rg.id
    }
  }

  return [...merged.values()]
    .map(entry => ({
      group_name: group,
      title: entry.title,
      key: discographyKey(entry.title),
      release_type: entry.type,
      release_date: entry.date,
      mbid: entry.mbid,
    }))
    .sort((a, b) => {
      if (a.release_date && b.release_date) return a.release_date < b.release_date ? -1 : 1
      if (a.release_date) return -1
      if (b.release_date) return 1
      return a.title.localeCompare(b.title)
    })
}

/** Fetches the full Album/EP/Single discography of one group (paced to 1 req/s). */
export async function fetchGroupDiscography(group: string): Promise<DiscographyRelease[]> {
  const mbid = ARTIST_MBID[group]
  if (!mbid) throw new Error(`No MusicBrainz artist configured for group ${group}`)

  const releaseGroups: RawReleaseGroup[] = []
  let offset = 0
  for (;;) {
    const page = await mbFetch(`/release-group?artist=${mbid}&limit=100&offset=${offset}&fmt=json`)
    const batch = (page['release-groups'] || []) as RawReleaseGroup[]
    releaseGroups.push(...batch)
    offset += batch.length
    if (batch.length === 0 || offset >= Number(page.count || 0) || offset >= 1000) break
    await sleep(1100)
  }

  return mergeReleaseGroups(group, releaseGroups)
}

async function defaultDb(): Promise<Client> {
  // Imported lazily so Node-side scripts can use the pure helpers above
  // without dragging in Nuxt's runtime config.
  const { getTursoClient } = await import('../turso')
  return getTursoClient()
}

async function ensureTable(db: Client) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS discography (
      group_name TEXT NOT NULL,
      release_key TEXT NOT NULL,
      title TEXT NOT NULL,
      release_type TEXT,
      release_date TEXT,
      mbid TEXT,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (group_name, release_key)
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_discography_group ON discography(group_name)`)
}

export async function readGroupDiscography(
  group: string,
  db?: Client,
): Promise<{ rows: DiscographyRelease[], fetchedAt: number } | null> {
  try {
    const client = db || (await defaultDb())
    const result = await client.execute({
      sql: `SELECT title, release_type, release_date, mbid, fetched_at
            FROM discography WHERE group_name = ?`,
      args: [group],
    })
    if (result.rows.length === 0) return null

    const fetchedAt = result.rows.reduce((max, row) => Math.max(max, Number(row.fetched_at) || 0), 0)
    return {
      fetchedAt,
      rows: result.rows.map(row => ({
        group_name: group,
        title: String(row.title),
        key: discographyKey(String(row.title)),
        release_type: row.release_type ? String(row.release_type) : null,
        release_date: row.release_date ? String(row.release_date) : null,
        mbid: row.mbid ? String(row.mbid) : null,
      })),
    }
  } catch {
    return null
  }
}

export async function writeGroupDiscography(releases: DiscographyRelease[], db?: Client) {
  if (releases.length === 0) return
  const client = db || (await defaultDb())
  await ensureTable(client)

  const now = Date.now()
  const group = releases[0].group_name
  await client.execute({ sql: 'DELETE FROM discography WHERE group_name = ?', args: [group] })

  const statements = releases.map(entry => ({
    sql: `INSERT INTO discography (group_name, release_key, title, release_type, release_date, mbid, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [entry.group_name, entry.key, entry.title, entry.release_type, entry.release_date, entry.mbid, now],
  }))
  for (let i = 0; i < statements.length; i += 50) {
    await client.batch(statements.slice(i, i + 50), 'write')
  }
}

/** Cached discography read; refreshes from MusicBrainz when older than 30 days. */
export async function getGroupDiscography(
  group: string,
  options: { refresh?: boolean, db?: Client } = {},
): Promise<DiscographyRelease[]> {
  const cached = await readGroupDiscography(group, options.db)
  if (!options.refresh && cached && cached.rows.length && Date.now() - cached.fetchedAt < DISCOGRAPHY_TTL_MS) {
    return cached.rows
  }

  try {
    const rows = await fetchGroupDiscography(group)
    if (rows.length > 0) await writeGroupDiscography(rows, options.db)
    return rows
  } catch (error) {
    // A stale discography still beats an empty timeline when MB is down.
    if (cached && cached.rows.length > 0) return cached.rows
    throw error
  }
}

export interface ReleaseMatchEntry {
  title: string
  key: string
  /** key with the group-name prefix removed ("IVE SECRET" → "SECRET"). */
  altKey: string | null
}

export function buildReleaseMatchIndex(
  group: string,
  releases: DiscographyRelease[],
): ReleaseMatchEntry[] {
  const groupKey = discographyKey(group)

  return releases
    .map((release) => {
      let altKey: string | null = null
      if (groupKey && release.key.startsWith(`${groupKey} `)) {
        const rest = release.key.slice(groupKey.length + 1)
        if (rest.length >= MIN_MATCH_CHARS && rest !== groupKey) altKey = rest
      }
      return { title: release.title, key: release.key, altKey }
    })
    .filter(entry => entry.key.length >= MIN_MATCH_CHARS)
}

/**
 * Best release for a card name: word-boundary match on the longest key that
 * starts earliest in the name (release titles sit at the front of Pocamarket
 * names far more often than anywhere else).
 */
export function matchReleaseForCard(
  cardName: string,
  index: ReleaseMatchEntry[],
): { title: string, key: string } | null {
  const haystack = discographyKey(cardName)
  if (!haystack) return null

  let best: { title: string, key: string, start: number, length: number } | null = null

  for (const entry of index) {
    for (const candidate of [entry.key, entry.altKey]) {
      if (!candidate || candidate.length < MIN_MATCH_CHARS) continue
      // A single-word title ("WAVE") must open the card name — otherwise it
      // fires on store names like "… SOUND WAVE LUCKY DRAW". Multi-word titles
      // ("SYNK : PARALLEL LINE") may sit after a concert/year prefix.
      const singleWord = !candidate.includes(' ')

      let from = 0
      let found: number
      while ((found = haystack.indexOf(candidate, from)) !== -1) {
        const before = found === 0 || haystack[found - 1] === ' '
        const end = found + candidate.length
        const after = end === haystack.length || haystack[end] === ' '
        if (before && after && (!singleWord || found === 0)) {
          if (
            !best
            || found < best.start
            || (found === best.start && candidate.length > best.length)
          ) {
            best = { title: entry.title, key: entry.key, start: found, length: candidate.length }
          }
        }
        from = found + 1
      }
    }
  }

  return best ? { title: best.title, key: best.key } : null
}

/** Maps a legacy token ("SECRET") onto the discography title ("IVE SECRET"). */
export function canonicalizeReleaseToken(
  token: string,
  index: ReleaseMatchEntry[],
): string | null {
  const key = discographyKey(token)
  if (!key) return null
  for (const entry of index) {
    if (entry.key === key || entry.altKey === key) return entry.title
    if (entry.key.endsWith(` ${key}`)) return entry.title
  }
  return null
}

/**
 * Release label for a card: MusicBrainz discography first, legacy token list
 * only as a fallback when no discography title appears in the card name.
 */
export function resolveCardReleaseSync(
  cardName: string,
  groupName: string,
  index: ReleaseMatchEntry[],
): string | null {
  const hit = matchReleaseForCard(cardName, index)
  if (hit) return hit.title

  const token = extractReleaseName(cardName, groupName)
  if (!token) return null
  return canonicalizeReleaseToken(token, index) || token
}

export async function loadReleaseIndex(group: string): Promise<ReleaseMatchEntry[]> {
  try {
    return buildReleaseMatchIndex(group, await getGroupDiscography(group))
  } catch {
    // Sync must keep working when MusicBrainz and the cache are both down —
    // the token fallback then labels cards the way it always has.
    return []
  }
}
