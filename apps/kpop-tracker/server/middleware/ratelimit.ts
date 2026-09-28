const WINDOWS = new Map<string, { count: number, resetAt: number }>()
const MAX_KEYS = 20000
const WINDOW_MS = 60_000
const READ_LIMIT = 300
const WRITE_LIMIT = 60

function hit(key: string, limit: number): boolean {
  const now = Date.now()
  if (WINDOWS.size > MAX_KEYS) {
    for (const [k, v] of WINDOWS) {
      if (v.resetAt <= now) WINDOWS.delete(k)
    }
    if (WINDOWS.size > MAX_KEYS) WINDOWS.clear()
  }
  const entry = WINDOWS.get(key)
  if (!entry || entry.resetAt <= now) {
    WINDOWS.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.count += 1
  return entry.count <= limit
}

/**
 * Best-effort in-memory rate limit for `/api/**` (per instance — serverless
 * isolates keep their own map). Generous budgets: 300 reads/min, 60 writes/min
 * per IP, so normal browsing never hits them while scrapers and abuse slow down.
 */
export default defineEventHandler((event) => {
  const path = event.path || getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return

  const forwarded = getHeader(event, 'x-forwarded-for') || ''
  const ip = (getRequestIP(event, { xForwardedFor: true })
    || getHeader(event, 'x-real-ip')
    || (forwarded.split(',')[0] ?? '').trim()
    || 'local') as string

  const isWrite = event.method !== 'GET' && event.method !== 'HEAD'
  if (isWrite && !hit(`w:${ip}`, WRITE_LIMIT)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many write requests, slow down' })
  }
  if (!hit(`r:${ip}`, READ_LIMIT)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests, slow down' })
  }
})
