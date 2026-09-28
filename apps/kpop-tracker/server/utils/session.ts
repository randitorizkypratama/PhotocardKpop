import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { ensureAuthTables } from './turso'

const COOKIE_NAME = 'hp_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionUser {
  id: number
  username: string
  role: string
}

export async function createSession(event: H3Event, user: SessionUser) {
  await ensureAuthTables()
  const db = getTursoClient()
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()

  await db.execute({
    sql: 'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    args: [token, user.id, now + SESSION_TTL_MS, new Date(now).toISOString()],
  })

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, COOKIE_NAME)
  if (!token) return null
  await ensureAuthTables()
  const db = getTursoClient()

  const result = await db.execute({
    sql: `SELECT u.id, u.username, u.role, s.expires_at
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ?`,
    args: [token],
  })
  const row = result.rows[0]
  if (!row) return null

  if (Number(row.expires_at) < Date.now()) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] }).catch(() => {})
    return null
  }
  return { id: Number(row.id), username: String(row.username), role: String(row.role || 'user') }
}

export async function destroySession(event: H3Event) {
  const token = getCookie(event, COOKIE_NAME)
  if (token) {
    const db = getTursoClient()
    await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] }).catch(() => {})
  }
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Login required' })
  }
  return user
}

export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin only' })
  }
  return user
}
