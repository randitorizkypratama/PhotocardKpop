import { intFromEnv } from '../config'

/**
 * Configuration for the AI rewrite layer. Same rules as the news engine's
 * config: read from `process.env`, every value has a safe default, and a
 * missing secret is an empty string — never a throw.
 */

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(value)) return true
  if (['0', 'false', 'no', 'off'].includes(value)) return false
  return fallback
}

function numFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Comma-separated list that keeps its exact case.
 *
 * `listFromEnv` (the news config's helper) lowercases and strips `www.`, which
 * is right for hostnames and catastrophic for an API key — an API key is
 * case-sensitive, so it must never go through that path.
 */
export function listRawFromEnv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

export interface RewriteConfig {
  /** Master switch — a run does nothing when the feature is off. */
  enabled: boolean
  /**
   * Gemini API keys, used in order. More than one key (different Google
   * accounts/projects) turns a quota wall into a failover instead of a stall.
   */
  geminiApiKeys: string[]
  geminiModel: string
  /** Hard cap on how many articles one run may generate. */
  maxPerRun: number
  /** Per-request timeout for one generation call (ms). */
  timeoutMs: number
  /** Response token ceiling — bounds both cost and latency. */
  maxTokens: number
  /** How long a key that reported a quota/rate error is skipped (ms). */
  keyCooldownMs: number
  /** A `failed` rewrite is not retried before this has elapsed (ms). */
  retryFailedMs: number
  /** Largest amount of source text handed to the model (chars). */
  maxInputChars: number
  temperature: number
}

export function rewriteConfig(): RewriteConfig {
  return {
    enabled: boolFromEnv('REWRITE_ENABLED', true),
    geminiApiKeys: listRawFromEnv('GEMINI_API_KEYS'),
    // Two lessons baked into this default:
    //  - Google retires dated names (a pinned `gemini-2.5-flash` answers 404
    //    "no longer available"), so use the `-latest` alias;
    //  - the full Flash tier is slow/overloaded for this job (measured: a real
    //    article prompt took 64s on `gemini-3.8-flash` and was cut off at 70s
    //    on `gemini-flash-latest`, while `gemini-flash-lite-latest` answered in
    //    under 4s). Override with GEMINI_MODEL for more quality if you accept
    //    the latency.
    geminiModel: (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim(),
    maxPerRun: intFromEnv('REWRITE_MAX_PER_RUN', 5, 1, 50),
    timeoutMs: intFromEnv('REWRITE_TIMEOUT_MS', 90000, 5000, 180000),
    maxTokens: intFromEnv('REWRITE_MAX_TOKENS', 4096, 512, 32768),
    keyCooldownMs: intFromEnv('REWRITE_KEY_COOLDOWN_MS', 900000, 60000, 86400000),
    retryFailedMs: intFromEnv('REWRITE_RETRY_FAILED_MS', 21600000, 3600000, 604800000),
    maxInputChars: intFromEnv('REWRITE_MAX_INPUT_CHARS', 6000, 500, 30000),
    temperature: numFromEnv('REWRITE_TEMPERATURE', 0.7, 0, 1),
  }
}

/** True when a run could actually call the model. */
export function isRewriteConfigured(config: RewriteConfig = rewriteConfig()): boolean {
  return config.enabled && config.geminiApiKeys.length > 0
}
