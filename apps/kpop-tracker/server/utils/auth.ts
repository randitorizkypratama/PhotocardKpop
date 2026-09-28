import type { H3Event } from 'h3'

export function requireCronSecret(event: H3Event) {
  const secret = process.env.CRON_SECRET
  const authHeader = getHeader(event, 'authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

const ALLOWED_WRITE_ORIGINS = new Set([
  'https://kpop-tracker-six.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

/**
 * The site has no user accounts, so state-changing endpoints only accept
 * requests whose `Origin` is one of ours. Browsers always attach `Origin` to
 * non-GET fetches, so this blocks every cross-site script; requests without an
 * Origin (curl, scrapers) are rejected as well. This is not a substitute for
 * real auth — it stops drive-by abuse of the shared collection.
 */
export function requireSameOrigin(event: H3Event) {
  const origin = (getHeader(event, 'origin') || '').replace(/\/$/, '')
  if (!ALLOWED_WRITE_ORIGINS.has(origin)) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin writes are not allowed' })
  }
}

/** Same as requireSameOrigin, but also OK for endpoints without a body check on session. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return ALLOWED_WRITE_ORIGINS.has((origin || '').replace(/\/$/, ''))
}

/**
 * Read guard for endpoints that proxy a third-party API (TikTok quota burners).
 * Browsers send neither `Origin` on same-origin GETs nor a `Referer` strip, so
 * this accepts either header matching our origins — plain `curl` with no headers
 * is rejected. Like `requireSameOrigin`, spoofable by a determined client; it
 * stops drive-by abuse, not targeted scripts.
 */
export function requireSameOriginRead(event: H3Event) {
  const origin = (getHeader(event, 'origin') || '').replace(/\/$/, '')
  if (origin) {
    if (ALLOWED_WRITE_ORIGINS.has(origin)) return
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin requests are not allowed' })
  }
  const referer = getHeader(event, 'referer') || ''
  if (referer) {
    try {
      if (ALLOWED_WRITE_ORIGINS.has(new URL(referer).origin)) return
    } catch {
      // fall through
    }
  }
  throw createError({ statusCode: 403, statusMessage: 'Cross-origin requests are not allowed' })
}
