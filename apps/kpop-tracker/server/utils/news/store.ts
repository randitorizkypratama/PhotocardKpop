import { getTursoClient } from '../turso'
import type { NewsArticle, NewsClaim, NewsEvidence, NewsStatus } from './types'
import { NEWS_STATUSES } from './types'
import { buildFeedQuery, filterPublicFeed, type FeedFilters, type PublicArticle } from './feed'

/**
 * Persistence for the news engine. It reuses the project's existing Turso
 * database (§16 — no second datastore on a serverless deployment) and keeps
 * every write idempotent, because the cron that drives it will run again over
 * the same articles.
 *
 * Not imported by tests: those exercise the pure services and the SQL builder
 * in feed.ts instead, exactly like the rest of this repo.
 */

let tablesReady = false

export async function ensureNewsTables(): Promise<void> {
  if (tablesReady) return
  const db = getTursoClient()

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      story_key TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      original_title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      summary TEXT,
      language TEXT,
      category TEXT NOT NULL,
      original_url TEXT NOT NULL,
      canonical_url TEXT,
      publisher_name TEXT,
      publisher_domain TEXT,
      published_at TEXT,
      published_at_timezone TEXT,
      published_at_has_time INTEGER NOT NULL DEFAULT 0,
      first_discovered_at TEXT NOT NULL,
      last_checked_at TEXT NOT NULL,
      event_date TEXT,
      verification_status TEXT NOT NULL,
      verification_score INTEGER NOT NULL DEFAULT 0,
      verification_reasons TEXT,
      verification_version INTEGER NOT NULL DEFAULT 1,
      evidence_complete INTEGER NOT NULL DEFAULT 0,
      score_breakdown TEXT,
      failed_gates TEXT,
      corroborations TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_status ON news_articles(verification_status, published_at)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_artist ON news_articles(artist_id, verification_status)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_story ON news_articles(story_key)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_checked ON news_articles(last_checked_at)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_evidence (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      canonical_source_url TEXT,
      image_url TEXT,
      thumbnail_url TEXT,
      video_url TEXT,
      video_id TEXT,
      source_name TEXT,
      source_domain TEXT,
      creator_or_publisher TEXT,
      published_at TEXT,
      retrieved_at TEXT NOT NULL,
      original_caption TEXT,
      evidence_description TEXT,
      supports_claim_ids TEXT,
      rights_status TEXT,
      attribution_text TEXT,
      content_hash TEXT,
      verification_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_evidence_article ON news_evidence(article_id)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_claims (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      normalized_claim TEXT,
      subject TEXT,
      predicate TEXT,
      relevant_dates TEXT,
      claim_type TEXT NOT NULL,
      category TEXT,
      supporting_source_ids TEXT,
      contradicting_source_ids TEXT,
      claim_status TEXT,
      verification_notes TEXT,
      created_at TEXT NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_claims_article ON news_claims(article_id)`)

  // Append-only: reverification writes a new row, it never rewrites history.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL,
      verification_version INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      sources_inspected TEXT,
      claims_evaluated TEXT,
      evidence_discovered TEXT,
      score_breakdown TEXT,
      failed_gates TEXT,
      contradictions TEXT,
      decision TEXT,
      previous_status TEXT,
      new_status TEXT,
      reason TEXT
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_news_audit_article ON news_audit_log(article_id, timestamp)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_source_status (
      source_id TEXT PRIMARY KEY,
      display_name TEXT,
      availability TEXT,
      last_attempt TEXT,
      last_success TEXT,
      last_error TEXT,
      item_count INTEGER DEFAULT 0
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_ingest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT,
      discovered INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      rejected INTEGER DEFAULT 0,
      pending INTEGER DEFAULT 0,
      message TEXT
    )
  `)

  // Display-only translations. The original title/summary stay authoritative
  // on news_articles; these rows are an addition, never a replacement.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_translations (
      article_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      translated_at TEXT NOT NULL,
      PRIMARY KEY (article_id, lang)
    )
  `)

  tablesReady = true
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export async function upsertArticle(
  article: NewsArticle,
  extra: { scoreBreakdown: string, failedGates: string[], corroborations: unknown[] },
): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `INSERT INTO news_articles (
            id, story_key, artist_id, original_title, normalized_title, summary, language, category,
            original_url, canonical_url, publisher_name, publisher_domain,
            published_at, published_at_timezone, published_at_has_time,
            first_discovered_at, last_checked_at, event_date,
            verification_status, verification_score, verification_reasons, verification_version,
            evidence_complete, score_breakdown, failed_gates, corroborations, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            story_key = excluded.story_key,
            summary = COALESCE(excluded.summary, news_articles.summary),
            language = COALESCE(excluded.language, news_articles.language),
            category = excluded.category,
            canonical_url = COALESCE(excluded.canonical_url, news_articles.canonical_url),
            publisher_name = COALESCE(excluded.publisher_name, news_articles.publisher_name),
            publisher_domain = COALESCE(excluded.publisher_domain, news_articles.publisher_domain),
            published_at = COALESCE(excluded.published_at, news_articles.published_at),
            published_at_timezone = COALESCE(excluded.published_at_timezone, news_articles.published_at_timezone),
            published_at_has_time = excluded.published_at_has_time,
            last_checked_at = excluded.last_checked_at,
            event_date = COALESCE(excluded.event_date, news_articles.event_date),
            verification_status = excluded.verification_status,
            verification_score = excluded.verification_score,
            verification_reasons = excluded.verification_reasons,
            verification_version = excluded.verification_version,
            evidence_complete = excluded.evidence_complete,
            score_breakdown = excluded.score_breakdown,
            failed_gates = excluded.failed_gates,
            corroborations = excluded.corroborations,
            updated_at = excluded.updated_at`,
    args: [
      article.id,
      article.story_key,
      article.artist_id,
      article.original_title,
      article.normalized_title,
      article.summary,
      article.language,
      article.category,
      article.original_url,
      article.canonical_url,
      article.publisher_name,
      article.publisher_domain,
      article.published_at,
      article.published_at_timezone,
      article.published_at_has_time ? 1 : 0,
      article.first_discovered_at,
      article.last_checked_at,
      article.event_date,
      article.verification_status,
      article.verification_score,
      json(article.verification_reasons),
      article.verification_version,
      article.evidence_complete ? 1 : 0,
      extra.scoreBreakdown,
      json(extra.failedGates),
      json(extra.corroborations),
      article.created_at,
      article.updated_at,
    ],
  })
}

/** Evidence and claims are replaced wholesale per verification pass (idempotent). */
export async function replaceArticleEvidence(articleId: string, evidence: NewsEvidence[], claims: NewsClaim[]): Promise<void> {
  const db = getTursoClient()
  const now = new Date().toISOString()
  const statements: Array<{ sql: string, args: (string | number | null)[] }> = [
    { sql: 'DELETE FROM news_evidence WHERE article_id = ?', args: [articleId] },
  ]
  for (const item of evidence) {
    statements.push({
      sql: `INSERT INTO news_evidence (
              id, article_id, evidence_type, source_url, canonical_source_url, image_url, thumbnail_url,
              video_url, video_id, source_name, source_domain, creator_or_publisher, published_at,
              retrieved_at, original_caption, evidence_description, supports_claim_ids, rights_status,
              attribution_text, content_hash, verification_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        item.id, articleId, item.evidence_type, item.source_url, item.canonical_source_url,
        item.image_url, item.thumbnail_url, item.video_url, item.video_id, item.source_name,
        item.source_domain, item.creator_or_publisher, item.published_at, item.retrieved_at,
        item.original_caption, item.evidence_description, json(item.supports_claim_ids),
        item.rights_status, item.attribution_text, item.content_hash, item.verification_status, now,
      ],
    })
  }
  statements.push({ sql: 'DELETE FROM news_claims WHERE article_id = ?', args: [articleId] })
  for (const claim of claims) {
    statements.push({
      sql: `INSERT INTO news_claims (
              id, article_id, claim_text, normalized_claim, subject, predicate, relevant_dates,
              claim_type, category, supporting_source_ids, contradicting_source_ids, claim_status,
              verification_notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        claim.id, articleId, claim.claim_text, claim.normalized_claim, claim.subject, claim.predicate,
        claim.relevant_dates, claim.claim_type, claim.category, json(claim.supporting_source_ids),
        json(claim.contradicting_source_ids), claim.claim_status, json(claim.verification_notes), now,
      ],
    })
  }
  for (let index = 0; index < statements.length; index += 40) {
    await db.batch(statements.slice(index, index + 40))
  }
}

export async function appendAudit(record: {
  articleId: string
  verificationVersion: number
  timestamp: string
  sourcesInspected: string[]
  claimsEvaluated: string[]
  evidenceDiscovered: string[]
  scoreBreakdown: Record<string, number>
  failedGates: string[]
  contradictions: string[]
  decision: string
  previousStatus: string | null
  newStatus: string
  reason: string
}): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `INSERT INTO news_audit_log (
            article_id, verification_version, timestamp, sources_inspected, claims_evaluated,
            evidence_discovered, score_breakdown, failed_gates, contradictions, decision,
            previous_status, new_status, reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.articleId, record.verificationVersion, record.timestamp, json(record.sourcesInspected),
      json(record.claimsEvaluated), json(record.evidenceDiscovered), json(record.scoreBreakdown),
      json(record.failedGates), json(record.contradictions), record.decision,
      record.previousStatus, record.newStatus, record.reason,
    ],
  })
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export interface ArticleRow extends Record<string, unknown> {
  id: string
}

export async function getArticleById(id: string): Promise<Record<string, unknown> | null> {
  const db = getTursoClient()
  const result = await db.execute({ sql: 'SELECT * FROM news_articles WHERE id = ?', args: [id] })
  return result.rows[0] ? (result.rows[0] as Record<string, unknown>) : null
}

/** Existing stories for one artist — the candidate pool for duplicate matching. */
export async function listStoriesForArtist(artistId: string): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT id, story_key, artist_id, normalized_title, original_url, canonical_url,
                 published_at, publisher_domain, verification_status
          FROM news_articles WHERE artist_id = ?`,
    args: [artistId],
  })
  return result.rows as unknown as Array<Record<string, unknown>>
}

export async function listEvidence(articleId: string): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'SELECT * FROM news_evidence WHERE article_id = ? ORDER BY retrieved_at DESC',
    args: [articleId],
  })
  return result.rows as unknown as Array<Record<string, unknown>>
}

export async function listClaims(articleId: string): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'SELECT * FROM news_claims WHERE article_id = ? ORDER BY id',
    args: [articleId],
  })
  return result.rows as unknown as Array<Record<string, unknown>>
}

export async function listAudit(articleId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'SELECT * FROM news_audit_log WHERE article_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?',
    args: [articleId, limit],
  })
  return result.rows as unknown as Array<Record<string, unknown>>
}

/** Verified stories whose recheck window has elapsed. */
export async function listDueForRecheck(sinceIso: string): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT id FROM news_articles
          WHERE verification_status IN ('VERIFIED', 'PENDING_VERIFICATION')
            AND last_checked_at < ?
          ORDER BY last_checked_at ASC LIMIT 10`,
    args: [sinceIso],
  })
  return result.rows as unknown as Array<Record<string, unknown>>
}

export interface FeedResult {
  articles: PublicArticle[]
  total: number
  page: number
  pages: number
  limit: number
}

/**
 * The only read path the public API uses. The VERIFIED filter lives inside
 * `buildFeedQuery`, and `filterPublicFeed` re-checks every row on the way out.
 */
export async function listPublicFeed(filters: FeedFilters): Promise<FeedResult> {
  const db = getTursoClient()
  const query = buildFeedQuery(filters)
  const [rows, count] = await Promise.all([
    db.execute({ sql: query.sql, args: query.args }),
    db.execute({ sql: query.countSql, args: query.countArgs }),
  ])
  const total = Number((count.rows[0] as any)?.total) || 0
  const articles = filterPublicFeed(rows.rows as unknown as Array<Record<string, unknown>>)
  return {
    articles,
    total,
    page: query.page,
    limit: query.limit,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  }
}

/** Distinct publishers with verified stories — powers the publisher filter. */
export async function listVerifiedPublishers(): Promise<Array<{ domain: string, name: string, count: number }>> {
  const db = getTursoClient()
  const result = await db.execute(`
    SELECT publisher_domain AS domain, MAX(publisher_name) AS name, COUNT(*) AS count
    FROM news_articles
    WHERE verification_status = 'VERIFIED' AND publisher_domain IS NOT NULL
    GROUP BY publisher_domain
    ORDER BY count DESC
  `)
  return (result.rows as any[]).map(row => ({
    domain: String(row.domain),
    name: row.name ? String(row.name) : String(row.domain),
    count: Number(row.count) || 0,
  }))
}

export async function newsStatusCounts(): Promise<Record<string, number>> {
  const db = getTursoClient()
  const result = await db.execute('SELECT verification_status AS status, COUNT(*) AS count FROM news_articles GROUP BY verification_status')
  const counts: Record<string, number> = {}
  for (const row of result.rows as any[]) counts[String(row.status)] = Number(row.count) || 0
  return counts
}

export async function recordSourceStatus(entry: {
  id: string
  displayName: string
  availability: 'ok' | 'error' | 'blocked' | 'needs_api_key' | 'skipped'
  lastAttempt: string
  lastSuccess?: string | null
  lastError?: string | null
  itemCount?: number
}): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `INSERT INTO news_source_status (source_id, display_name, availability, last_attempt, last_success, last_error, item_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            display_name = excluded.display_name,
            availability = excluded.availability,
            last_attempt = excluded.last_attempt,
            last_success = COALESCE(excluded.last_success, news_source_status.last_success),
            last_error = excluded.last_error,
            item_count = excluded.item_count`,
    args: [
      entry.id, entry.displayName, entry.availability, entry.lastAttempt,
      entry.lastSuccess || null, entry.lastError || null, entry.itemCount || 0,
    ],
  })
}

export async function listSourceStatuses(): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute('SELECT * FROM news_source_status ORDER BY display_name')
  return result.rows as unknown as Array<Record<string, unknown>>
}

export async function beginIngestLog(startedAt: string): Promise<number> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'INSERT INTO news_ingest_log (started_at, status) VALUES (?, ?)',
    args: [startedAt, 'running'],
  })
  return Number(result.lastInsertRowid)
}

export async function finishIngestLog(id: number, entry: {
  finishedAt: string
  status: 'ok' | 'partial' | 'error'
  discovered: number
  verified: number
  rejected: number
  pending: number
  message: string
}): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `UPDATE news_ingest_log
          SET finished_at = ?, status = ?, discovered = ?, verified = ?, rejected = ?, pending = ?, message = ?
          WHERE id = ?`,
    args: [entry.finishedAt, entry.status, entry.discovered, entry.verified, entry.rejected, entry.pending, entry.message, id],
  })
}

export async function lastIngestRun(): Promise<Record<string, unknown> | null> {
  const db = getTursoClient()
  const result = await db.execute('SELECT * FROM news_ingest_log ORDER BY id DESC LIMIT 1')
  return result.rows[0] ? (result.rows[0] as Record<string, unknown>) : null
}

/** Status histogram with every lifecycle state present (admin views). */
export async function articleCountsByStatus(): Promise<Record<NewsStatus, number>> {
  const counts = await newsStatusCounts()
  const out = {} as Record<NewsStatus, number>
  for (const status of NEWS_STATUSES) out[status] = counts[status] || 0
  return out
}

/** Non-VERIFIED records, for the optional administration view (§11). */
export async function listUnverifiedArticles(limit = 50): Promise<Array<Record<string, unknown>>> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT id, artist_id, original_title, summary, category, original_url,
                 publisher_name, publisher_domain, published_at,
                 verification_status, verification_score, verification_reasons, failed_gates,
                 first_discovered_at, last_checked_at
          FROM news_articles
          WHERE verification_status != 'VERIFIED'
          ORDER BY last_checked_at DESC LIMIT ?`,
    args: [limit],
  })
  return result.rows as unknown as Array<Record<string, unknown>>
}

export interface TranslationRow {
  article_id: string
  lang: string
  title: string | null
  summary: string | null
  status: string
  provider: string
  translated_at: string
}

/**
 * Store one display translation. A failed attempt is stored too (`status:
 * 'failed'`) so a run that cannot reach the provider does not retry the same
 * article forever — and so the API can honestly report "no translation".
 */
export async function upsertTranslation(entry: {
  articleId: string
  lang: string
  title: string | null
  summary: string | null
  provider: string
  status: 'ok' | 'failed'
  error: string | null
  translatedAt: string
}): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `INSERT INTO news_translations (article_id, lang, title, summary, provider, status, error, translated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(article_id, lang) DO UPDATE SET
            title = excluded.title,
            summary = excluded.summary,
            provider = excluded.provider,
            status = excluded.status,
            error = excluded.error,
            translated_at = excluded.translated_at`,
    args: [
      entry.articleId, entry.lang, entry.title, entry.summary,
      entry.provider, entry.status, entry.error, entry.translatedAt,
    ],
  })
}

/** Translations for several articles in one query (a feed page = one round trip). */
export async function getTranslations(articleIds: string[], lang: string): Promise<Map<string, TranslationRow>> {
  const out = new Map<string, TranslationRow>()
  if (articleIds.length === 0) return out
  const db = getTursoClient()
  const placeholders = articleIds.map(() => '?').join(', ')
  const result = await db.execute({
    sql: `SELECT article_id, lang, title, summary, status, provider, translated_at
          FROM news_translations
          WHERE lang = ? AND article_id IN (${placeholders})`,
    args: [lang, ...articleIds],
  })
  for (const raw of result.rows as unknown as Array<Record<string, unknown>>) {
    out.set(String(raw.article_id), {
      article_id: String(raw.article_id),
      lang: String(raw.lang),
      title: raw.title ? String(raw.title) : null,
      summary: raw.summary ? String(raw.summary) : null,
      status: String(raw.status),
      provider: String(raw.provider),
      translated_at: String(raw.translated_at),
    })
  }
  return out
}

/**
 * One article's row in one language, *whatever* its status: the pipeline needs
 * to see a stored failure so it does not hammer the provider on every run,
 * while the API only serves rows whose status is `ok`.
 */
export async function getTranslation(articleId: string, lang: string): Promise<TranslationRow | null> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT article_id, lang, title, summary, status, provider, translated_at
          FROM news_translations
          WHERE article_id = ? AND lang = ?`,
    args: [articleId, lang],
  })
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  return {
    article_id: String(row.article_id),
    lang: String(row.lang),
    title: row.title ? String(row.title) : null,
    summary: row.summary ? String(row.summary) : null,
    status: String(row.status),
    provider: String(row.provider),
    translated_at: String(row.translated_at),
  }
}
