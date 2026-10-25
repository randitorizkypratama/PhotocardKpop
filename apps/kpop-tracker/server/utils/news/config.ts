/**
 * News engine configuration. Every value comes from an environment variable
 * with a safe default, so the pipeline runs out of the box and never depends
 * on a secret being present.
 *
 * Read from `process.env` rather than `useRuntimeConfig()` so this module can
 * be imported by plain-node tests (nitro auto-imports do not exist there) and
 * so the values are resolved at runtime, not baked into the build.
 */

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function listFromEnv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
}

export interface NewsConfig {
  /** Per-request timeout for one outbound fetch (ms). */
  fetchTimeoutMs: number
  /** How long a verified story stays verified before it must be re-checked (ms). */
  recheckIntervalMs: number
  /** Minimum deterministic score required by hard gate 10. */
  minScore: number
  /**
   * Optional allowlist of publisher domains. Empty = any public domain may be
   * fetched (SSRF guards still apply); non-empty = only these hosts resolve.
   */
  allowedSourceDomains: string[]
  /** YouTube Data API key — server-side only, never shipped to the client. */
  youtubeApiKey: string
  /** Max candidates processed in a single cron invocation (bounded work). */
  maxArticlesPerRun: number
  /** Retries per outbound request before the source is marked unavailable. */
  maxRetries: number
  /** Largest response body we will read (bytes). */
  maxResponseBytes: number
  /** Discovery window: only articles newer than this are considered (ms). */
  maxArticleAgeMs: number
  /** Wall-clock budget for one cron invocation (ms) — work continues next run. */
  runBudgetMs: number
  /**
   * Minimum gap between two requests to the *same* host (ms). Keeps a daily
   * run looking like a considerate reader instead of a scraper.
   */
  hostMinIntervalMs: number
  /** How long a host that answered 429 is left alone before the next attempt (ms). */
  hostCooldownMs: number
  /** Largest sitemap body we will read (bytes) — sitemaps can dwarf a feed. */
  sitemapMaxBytes: number
}

export function newsConfig(): NewsConfig {
  return {
    fetchTimeoutMs: intFromEnv('NEWS_FETCH_TIMEOUT', 6000, 1000, 30000),
    recheckIntervalMs: intFromEnv('NEWS_RECHECK_INTERVAL', 21600000, 300000, 604800000),
    minScore: intFromEnv('VERIFICATION_MIN_SCORE', 90, 0, 100),
    allowedSourceDomains: listFromEnv('ALLOWED_SOURCE_DOMAINS'),
    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    maxArticlesPerRun: intFromEnv('NEWS_MAX_ARTICLES_PER_RUN', 9, 1, 100),
    maxRetries: intFromEnv('NEWS_MAX_RETRIES', 1, 0, 5),
    maxResponseBytes: intFromEnv('NEWS_MAX_RESPONSE_BYTES', 1048576, 4096, 5242880),
    maxArticleAgeMs: intFromEnv('NEWS_MAX_AGE_DAYS', 14, 1, 90) * 86400000,
    runBudgetMs: intFromEnv('NEWS_RUN_BUDGET_MS', 120000, 10000, 300000),
    hostMinIntervalMs: intFromEnv('NEWS_HOST_MIN_INTERVAL_MS', 1000, 0, 10000),
    hostCooldownMs: intFromEnv('NEWS_HOST_COOLDOWN_MS', 60000, 1000, 600000),
    sitemapMaxBytes: intFromEnv('NEWS_SITEMAP_MAX_BYTES', 4194304, 4096, 8388608),
  }
}
