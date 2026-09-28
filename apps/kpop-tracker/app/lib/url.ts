/**
 * Only allow http(s) link targets — third-party APIs (TikTok, …) must never be
 * able to hand the page a `javascript:` or `data:` URL.
 */
export function safeExternalUrl(value: unknown, fallback = ''): string {
  const url = typeof value === 'string' ? value.trim() : ''
  return /^https?:\/\//i.test(url) ? url : fallback
}
