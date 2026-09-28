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
