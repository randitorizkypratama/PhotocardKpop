import type { ReleaseMatch } from './types'
import { normalizeArtist, normalizeTitle } from './matching'

const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000

let tableReady = false

/** Imported lazily so a broken/unavailable DB never takes enrichment down with it. */
async function getDb() {
  const { getTursoClient } = await import('../turso')
  return getTursoClient()
}

async function ensureTable() {
  if (tableReady) return
  const db = await getDb()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS release_cache (
      cache_key TEXT PRIMARY KEY,
      artist TEXT,
      title TEXT,
      status TEXT NOT NULL,
      payload TEXT,
      source TEXT,
      fetched_at INTEGER NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_release_cache_fetched ON release_cache(fetched_at)`)
  tableReady = true
}

export function releaseCacheKey(artist?: string | null, title?: string | null): string {
  return `${normalizeArtist(artist)}|${normalizeTitle(title)}`
}

export type ReleaseCacheEntry =
  | { status: 'hit', match: ReleaseMatch }
  | { status: 'negative' }
  | { status: 'miss' }

export async function readReleaseCache(key: string): Promise<ReleaseCacheEntry> {
  if (!key || key === '|') return { status: 'miss' }
  try {
    await ensureTable()
    const db = await getDb()
    const result = await db.execute({
      sql: 'SELECT status, payload, fetched_at FROM release_cache WHERE cache_key = ?',
      args: [key],
    })
    const row = result.rows[0]
    if (!row) return { status: 'miss' }

    const fetchedAt = Number(row.fetched_at) || 0
    const ttl = row.status === 'hit' ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS
    if (Date.now() - fetchedAt > ttl) {
      try {
        await db.execute({ sql: 'DELETE FROM release_cache WHERE cache_key = ?', args: [key] })
      } catch {}
      return { status: 'miss' }
    }

    if (row.status === 'hit' && row.payload) {
      try {
        return { status: 'hit', match: JSON.parse(String(row.payload)) as ReleaseMatch }
      } catch {
        return { status: 'miss' }
      }
    }
    return { status: 'negative' }
  } catch {
    return { status: 'miss' }
  }
}

export async function writeReleaseCache(
  key: string,
  artist: string,
  title: string,
  match: ReleaseMatch | null,
) {
  if (!key || key === '|') return
  try {
    await ensureTable()
    const db = await getDb()
    await db.execute({
      sql: `INSERT INTO release_cache (cache_key, artist, title, status, payload, source, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
              status = excluded.status, payload = excluded.payload,
              source = excluded.source, fetched_at = excluded.fetched_at`,
      args: [
        key,
        artist || '',
        title || '',
        match ? 'hit' : 'negative',
        match ? JSON.stringify(match) : null,
        match ? match.source : null,
        Date.now(),
      ],
    })
  } catch {
    // Cache failures must never break enrichment.
  }
}
