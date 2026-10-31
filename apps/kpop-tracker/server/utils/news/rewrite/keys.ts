/**
 * Gemini API key pool.
 *
 * Several keys (different Google accounts/projects) turn a quota wall into a
 * failover instead of a stall: a key that answers 429 / RESOURCE_EXHAUSTED is
 * put on cooldown and the next key is used. This is deliberately *sequential*
 * failover, not parallel spraying — the run never tries to outrun the quota.
 *
 * Keys are never logged; `maskKey` is what may appear in a summary.
 */

/** `AIza…abcd` — enough to tell keys apart in a log, useless to an attacker. */
export function maskKey(key: string): string {
  const trimmed = (key || '').trim()
  if (trimmed.length <= 8) return '****'
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

export interface GeminiKeyPool {
  readonly size: number
  /** Keys usable right now, in configured order. */
  available(now?: number): string[]
  /** Skip `key` until `cooldownMs` has elapsed. */
  cooldown(key: string, now?: number): void
  isCoolingDown(key: string, now?: number): boolean
  cooldownUntil(key: string): number
  /** Masked labels, for run summaries. */
  labels(): string[]
}

export function createGeminiKeyPool(keys: string[], cooldownMs: number): GeminiKeyPool {
  const unique = [...new Set((keys || []).map(key => key.trim()).filter(Boolean))]
  const until = new Map<string, number>()
  const cooldownUntil = (key: string): number => until.get(key) ?? 0

  return {
    size: unique.length,
    available(now = Date.now()) {
      return unique.filter(key => cooldownUntil(key) <= now)
    },
    cooldown(key, now = Date.now()) {
      until.set(key, now + Math.max(0, cooldownMs))
    },
    isCoolingDown(key, now = Date.now()) {
      return cooldownUntil(key) > now
    },
    cooldownUntil,
    labels() {
      return unique.map(maskKey)
    },
  }
}
