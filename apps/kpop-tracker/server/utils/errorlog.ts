import type { H3Event } from 'h3'
import { ensureAuthTables } from './turso'

const MAX_MESSAGE = 500
const MAX_STACK = 4000
const MAX_PATH = 300

/**
 * Persist an error row for the /status error-log panel. Never throws —
 * monitoring must not break the request it is attached to.
 */
export async function logError(scope: 'server' | 'client', message: string, stack?: string | null, path?: string | null) {
  try {
    await ensureAuthTables()
    const db = getTursoClient()
    await db.execute({
      sql: 'INSERT INTO error_log (scope, message, stack, path, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [
        scope,
        String(message).slice(0, MAX_MESSAGE),
        stack ? String(stack).slice(0, MAX_STACK) : null,
        path ? String(path).slice(0, MAX_PATH) : null,
        new Date().toISOString(),
      ],
    })
    await db.execute({ sql: 'DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT 500)' }).catch(() => {})
  } catch (e) {
    console.error('logError failed:', e)
  }
}

const AUTH_WINDOW_MS = 10 * 60 * 1000
const AUTH_MAX_ATTEMPTS = 15
const authAttempts = new Map<string, { count: number; resetAt: number }>()

export function clientIp(event: H3Event): string {
  return (getRequestIP(event, { xForwardedFor: true })
    || getHeader(event, 'x-real-ip')
    || 'local').slice(0, 64)
}

/** Stricter per-IP budget for login/register than the global write limit. */
export function checkAuthAttempt(event: H3Event): boolean {
  const key = clientIp(event)
  const now = Date.now()
  const entry = authAttempts.get(key)
  if (!entry || entry.resetAt < now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS })
    return true
  }
  entry.count += 1
  if (authAttempts.size > 1000) authAttempts.clear()
  return entry.count <= AUTH_MAX_ATTEMPTS
}
