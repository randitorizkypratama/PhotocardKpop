import type { H3Event } from 'h3'

export function requireCronSecret(event: H3Event) {
  const secret = process.env.CRON_SECRET
  const authHeader = getHeader(event, 'authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}
