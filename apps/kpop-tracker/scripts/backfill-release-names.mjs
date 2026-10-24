/**
 * Backfill cards.release_name from the MusicBrainz discography stored in Turso.
 *
 * The daily cron normally labels every card, but a run whose release index
 * came back empty (MusicBrainz + Turso both unreachable) writes NULL / raw
 * legacy tokens over good labels. This script re-resolves every card from the
 * discography already in the DB — no MusicBrainz calls — and is idempotent:
 * run it any time the discography gains releases, to label cards the Pocamarket
 * feed no longer returns.
 *
 * Usage (from apps/kpop-tracker, .env supplies TURSO_* like other scripts):
 *   bun scripts/backfill-release-names.mjs          # apply
 *   bun scripts/backfill-release-names.mjs --dry    # report only, no writes
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import {
  buildReleaseMatchIndex,
  resolveCardReleaseSync,
} from '../server/utils/releases/discography.ts'

const dryRun = process.argv.includes('--dry')

function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  } catch {
    return process.env
  }
}

const env = loadEnv()
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

const groupsResult = await db.execute('SELECT DISTINCT group_name FROM cards ORDER BY group_name')
const groups = groupsResult.rows.map(r => String(r.group_name))

let totalChanged = 0

for (const group of groups) {
  const disc = await db.execute({
    sql: 'SELECT release_key, title, release_type, release_date, mbid FROM discography WHERE group_name = ?',
    args: [group],
  })

  if (disc.rows.length === 0) {
    console.warn(`! ${group}: no discography rows — skipping (run the daily sync first)`)
    continue
  }

  const releases = disc.rows.map(row => ({
    group_name: group,
    title: String(row.title),
    // release_key is the stored discographyKey(title) — the same normalized
    // shape readGroupDiscography rebuilds on every load.
    key: String(row.release_key),
    release_type: row.release_type ? String(row.release_type) : null,
    release_date: row.release_date ? String(row.release_date) : null,
    mbid: row.mbid ? String(row.mbid) : null,
  }))
  const index = buildReleaseMatchIndex(group, releases)

  const cards = await db.execute({
    sql: 'SELECT id, name, release_name FROM cards WHERE group_name = ?',
    args: [group],
  })

  const updates = []
  let fixedNull = 0
  let normalized = 0

  for (const card of cards.rows) {
    const current = card.release_name == null ? null : String(card.release_name)
    const resolved = resolveCardReleaseSync(String(card.name), group, index)
    if (resolved === current) continue
    updates.push({ sql: 'UPDATE cards SET release_name = ? WHERE id = ?', args: [resolved, card.id] })
    if (current == null) fixedNull++
    else normalized++
  }

  console.log(
    `${group}: ${cards.rows.length} cards, ${disc.rows.length} releases, ${index.length} index entries → ${updates.length} to update (${fixedNull} were NULL, ${normalized} had a non-canonical label)`,
  )
  totalChanged += updates.length

  if (!dryRun && updates.length > 0) {
    // Only release_name — updated_at stays put so the "Synced …" badge keeps
    // reflecting the real Pocamarket sync time.
    for (let i = 0; i < updates.length; i += 50) {
      await db.batch(updates.slice(i, i + 50))
    }
  }
}

console.log(`\n${dryRun ? '[dry run] would update' : 'updated'} ${totalChanged} cards total`)
if (!dryRun && totalChanged > 0) {
  const check = await db.execute({
    sql: "SELECT COUNT(*) n FROM cards WHERE name LIKE '%looks can kill%' AND release_name = 'Looks Can Kill'",
    args: [],
  })
  console.log(`sanity check — "Looks Can Kill" cards labeled: ${check.rows[0].n}`)
}
await db.close()
