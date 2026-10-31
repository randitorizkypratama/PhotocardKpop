/**
 * News engine configuration. Every value comes from an environment variable
 * with a safe default, so the pipeline runs out of the box and never depends
 * on a secret being present.
 *
 * Read from `process.env` rather than `useRuntimeConfig()` so this module can
 * be imported by plain-node tests (nitro auto-imports do not exist there) and
 * so the values are resolved at runtime, not baked into the build.
 */

export function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Comma-separated list, lowercased. Deliberately case-folding because it is
 * only ever used for hostnames — never for secrets (see `listRawFromEnv`).
 */
export function listFromEnv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
}

/**
 * `artist:channelId` pairs from `YOUTUBE_CHANNELS`.
 *
 * Only a well-formed channel ID (`UC` + at least 20 word chars) is accepted —
 * a display name or a handle can never grant official status, so a malformed
 * entry is dropped instead of guessed at.
 */
export function parseYoutubeChannels(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of (raw || '').split(',')) {
    const [artist, channel] = entry.split(':').map(part => part.trim())
    if (!artist || !channel) continue
    if (!/^UC[\w-]{20,}$/.test(channel)) continue
    out[artist.toLowerCase()] = channel
  }
  return out
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
  /**
   * Allowlisted official YouTube channels, keyed by artist id.
   * `YOUTUBE_CHANNELS=aespa:UC…,ive:UC…` — a channel ID is the only thing that
   * can grant "official" status; a display name never does.
   */
  youtubeChannels: Record<string, string>
  /** Naver Search API credentials — empty disables Korean discovery. */
  naverClientId: string
  naverClientSecret: string
  /** Max candidates processed in a single cron invocation (bounded work). */
  maxArticlesPerRun: number
  /**
   * Max candidates *discovered* per artist before grouping. Deliberately wider
   * than the publish budget: independent corroboration (§12) needs the same
   * event to be seen at several publishers before it can be linked.
   */
  discoveryCandidatesPerArtist: number
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
    youtubeChannels: parseYoutubeChannels(process.env.YOUTUBE_CHANNELS),
    naverClientId: process.env.NAVER_CLIENT_ID || '',
    naverClientSecret: process.env.NAVER_CLIENT_SECRET || '',
    maxArticlesPerRun: intFromEnv('NEWS_MAX_ARTICLES_PER_RUN', 9, 1, 100),
    discoveryCandidatesPerArtist: intFromEnv('NEWS_DISCOVERY_CANDIDATES_PER_ARTIST', 12, 1, 60),
    maxRetries: intFromEnv('NEWS_MAX_RETRIES', 1, 0, 5),
    maxResponseBytes: intFromEnv('NEWS_MAX_RESPONSE_BYTES', 1048576, 4096, 5242880),
    maxArticleAgeMs: intFromEnv('NEWS_MAX_AGE_DAYS', 14, 1, 90) * 86400000,
    runBudgetMs: intFromEnv('NEWS_RUN_BUDGET_MS', 120000, 10000, 300000),
    hostMinIntervalMs: intFromEnv('NEWS_HOST_MIN_INTERVAL_MS', 1000, 0, 10000),
    hostCooldownMs: intFromEnv('NEWS_HOST_COOLDOWN_MS', 60000, 1000, 600000),
    sitemapMaxBytes: intFromEnv('NEWS_SITEMAP_MAX_BYTES', 4194304, 4096, 8388608),
  }
}
