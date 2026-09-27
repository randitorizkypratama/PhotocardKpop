import type { Client } from '@libsql/client'

/**
 * Sync run log — one row per /api/cron/sync invocation. A row stuck in
 * "running" means the function was killed mid-sync (timeout), which is
 * otherwise invisible: the scheduler simply never finishes.
 */

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    total_synced INTEGER,
    results TEXT,
    error TEXT
  )
`

export async function beginSyncLog(db: Client, startedAt: string): Promise<number> {
  await db.execute(CREATE_SQL)
  const result = await db.execute({
    sql: 'INSERT INTO sync_log (started_at, status) VALUES (?, ?)',
    args: [startedAt, 'running'],
  })
  return Number(result.lastInsertRowid) || 0
}

export async function finishSyncLog(
  db: Client,
  id: number,
  entry: {
    status: 'ok' | 'partial' | 'error'
    totalSynced?: number
    results?: unknown
    error?: string
  },
): Promise<void> {
  if (!id) return
  await db.execute({
    sql: `UPDATE sync_log
          SET finished_at = ?, status = ?, total_synced = ?, results = ?, error = ?
          WHERE id = ?`,
    args: [
      new Date().toISOString(),
      entry.status,
      entry.totalSynced ?? null,
      entry.results ? JSON.stringify(entry.results) : null,
      entry.error ?? null,
      id,
    ],
  })
}

export interface SyncLogEntry {
  started_at: string
  finished_at: string | null
  status: string
  total_synced: number | null
  error: string | null
}

/** Latest run; null when the table does not exist yet (before first cron). */
export async function readLastSyncLog(db: Client): Promise<SyncLogEntry | null> {
  try {
    const result = await db.execute(
      'SELECT started_at, finished_at, status, total_synced, error FROM sync_log ORDER BY id DESC LIMIT 1',
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      started_at: String(row.started_at),
      finished_at: row.finished_at ? String(row.finished_at) : null,
      status: String(row.status),
      total_synced: row.total_synced == null ? null : Number(row.total_synced),
      error: row.error ? String(row.error) : null,
    }
  } catch {
    return null
  }
}
