import { getTursoClient } from '../../turso'
import { sha256 } from '../text'
import { isRenderableMediaUrl } from '../url'
import type {
  NewsRewrite,
  RewriteDraft,
  RewriteImage,
  RewriteImageInput,
  RewriteSource,
  RewriteSourceInput,
  RewriteStatus,
} from './types'

/**
 * Persistence for the rewrite layer. Same rules as `news/store.ts`: the tables
 * are created once per process behind a module flag, every write is idempotent,
 * and list columns are stored as JSON strings.
 *
 * The rewrite tables are separate from `news_articles` on purpose — a draft
 * article can never be mistaken for a news record, and nothing here can ever
 * change a `verification_status`.
 */

let tablesReady = false

export async function ensureRewriteTables(): Promise<void> {
  if (tablesReady) return
  const db = getTursoClient()

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_rewrites (
      id TEXT PRIMARY KEY,
      article_id TEXT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      dek TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      category TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'id',
      reading_minutes INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      review_note TEXT,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      published_at TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rewrite_status ON news_rewrites(status, published_at)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rewrite_article ON news_rewrites(article_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rewrite_artist ON news_rewrites(artist_id, status)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_rewrite_images (
      id TEXT PRIMARY KEY,
      rewrite_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      source_url TEXT NOT NULL,
      credit_text TEXT,
      credit_url TEXT,
      caption TEXT,
      rights_status TEXT NOT NULL DEFAULT 'hotlinked_credited',
      created_at TEXT NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rewrite_images ON news_rewrite_images(rewrite_id, position)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_rewrite_sources (
      id TEXT PRIMARY KEY,
      rewrite_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      publisher_name TEXT,
      publisher_domain TEXT,
      original_title TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rewrite_sources ON news_rewrite_sources(rewrite_id, position)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_rewrite_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT,
      generated INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      provider TEXT,
      message TEXT
    )
  `)

  tablesReady = true
}

function iso(date = new Date()): string {
  return date.toISOString()
}

export function slugify(title: string): string {
  const base = (title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const limit = 60
  if (base.length <= limit) return base || 'artikel'

  // Cut at the last whole word so a URL never ends mid-word ("…sevente").
  const cut = base.slice(0, limit)
  const lastDash = cut.lastIndexOf('-')
  const trimmed = lastDash > 0 ? cut.slice(0, lastDash) : cut
  return trimmed.replace(/-+$/g, '') || 'artikel'
}

/** `judul-artikel-2026-10-<6hex>` — readable, unique, stable once written. */
export function buildSlug(title: string, publishedAt: string | null): string {
  const day = (publishedAt || '').slice(0, 10)
  const suffix = sha256(`${title}|${publishedAt || ''}|${Date.now()}`).slice(0, 6)
  const parts = [slugify(title)]
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) parts.push(day)
  parts.push(suffix)
  return parts.join('-')
}

function rowToRewrite(row: Record<string, unknown>): NewsRewrite {
  return {
    id: String(row.id),
    articleId: row.article_id ? String(row.article_id) : null,
    slug: String(row.slug),
    title: String(row.title),
    dek: String(row.dek),
    bodyMarkdown: String(row.body_markdown),
    artistId: String(row.artist_id),
    category: String(row.category),
    language: String(row.language || 'id'),
    readingMinutes: Number(row.reading_minutes) || 1,
    status: String(row.status) as RewriteStatus,
    provider: row.provider ? String(row.provider) : null,
    model: row.model ? String(row.model) : null,
    reviewNote: row.review_note ? String(row.review_note) : null,
    reviewedBy: row.reviewed_by == null ? null : Number(row.reviewed_by),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    error: row.error ? String(row.error) : null,
    attempts: Number(row.attempts) || 0,
    generatedAt: String(row.generated_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function rowToImage(row: Record<string, unknown>): RewriteImage {
  return {
    id: String(row.id),
    rewriteId: String(row.rewrite_id),
    position: Number(row.position) || 0,
    imageUrl: String(row.image_url),
    sourceUrl: String(row.source_url),
    creditText: row.credit_text ? String(row.credit_text) : null,
    creditUrl: row.credit_url ? String(row.credit_url) : null,
    caption: row.caption ? String(row.caption) : null,
    rightsStatus: String(row.rights_status || 'hotlinked_credited'),
    createdAt: String(row.created_at),
  }
}

function rowToSource(row: Record<string, unknown>): RewriteSource {
  return {
    id: String(row.id),
    rewriteId: String(row.rewrite_id),
    position: Number(row.position) || 0,
    sourceUrl: String(row.source_url),
    publisherName: row.publisher_name ? String(row.publisher_name) : null,
    publisherDomain: row.publisher_domain ? String(row.publisher_domain) : null,
    originalTitle: row.original_title ? String(row.original_title) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
  }
}

export interface RewriteRowInput {
  articleId: string | null
  /** The slug is only honoured when it is still free (regenerating is a new row). */
  slug: string
  title: string
  dek: string
  bodyMarkdown: string
  artistId: string
  category: string
  language: string
  readingMinutes: number
  provider: string | null
  model: string | null
  status: RewriteStatus
  error?: string | null
  images?: RewriteImageInput[]
  sources?: RewriteSourceInput[]
  now?: string
}

/**
 * Insert one rewrite and its children. Returns the new id.
 *
 * A slug collision (two runs, same headline) is resolved by re-inserting with a
 * fresh suffix rather than overwriting — an existing article is never replaced
 * by a new generation.
 */
export async function insertRewrite(input: RewriteRowInput): Promise<string> {
  const db = getTursoClient()
  const now = input.now || iso()
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? input.slug : `${input.slug}-${sha256(`${input.slug}|${now}|${attempt}`).slice(0, 4)}`
    const id = sha256(slug).slice(0, 32)
    try {
      await db.execute({
        sql: `INSERT INTO news_rewrites (
                id, article_id, slug, title, dek, body_markdown, artist_id, category, language,
                reading_minutes, status, provider, model, error, attempts, generated_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, input.articleId, slug, input.title, input.dek, input.bodyMarkdown, input.artistId,
          input.category, input.language, input.readingMinutes, input.status, input.provider,
          input.model, input.error ?? null, input.error ? 1 : 0, now, now, now,
        ],
      })
      await replaceRewriteImages(id, input.images || [], now)
      await replaceRewriteSources(id, input.sources || [], now)
      return id
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('could not insert rewrite')
}

/** Images and sources are replaced wholesale, like evidence in the news store. */
export async function replaceRewriteImages(rewriteId: string, images: RewriteImageInput[], now = iso()): Promise<void> {
  const db = getTursoClient()
  const statements: Array<{ sql: string, args: (string | number | null)[] }> = [
    { sql: 'DELETE FROM news_rewrite_images WHERE rewrite_id = ?', args: [rewriteId] },
  ]
  images.forEach((image, position) => {
    statements.push({
      sql: `INSERT INTO news_rewrite_images (
              id, rewrite_id, position, image_url, source_url, credit_text, credit_url, caption, rights_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `${rewriteId}:i${position}`, rewriteId, position, image.imageUrl, image.sourceUrl,
        image.creditText, image.creditUrl, image.caption, 'hotlinked_credited', now,
      ],
    })
  })
  await db.batch(statements as any)
}

export async function replaceRewriteSources(rewriteId: string, sources: RewriteSourceInput[], now = iso()): Promise<void> {
  const db = getTursoClient()
  const statements: Array<{ sql: string, args: (string | number | null)[] }> = [
    { sql: 'DELETE FROM news_rewrite_sources WHERE rewrite_id = ?', args: [rewriteId] },
  ]
  sources.forEach((source, position) => {
    statements.push({
      sql: `INSERT INTO news_rewrite_sources (
              id, rewrite_id, position, source_url, publisher_name, publisher_domain, original_title, published_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `${rewriteId}:s${position}`, rewriteId, position, source.sourceUrl,
        source.publisherName, source.publisherDomain, source.originalTitle, source.publishedAt, now,
      ],
    })
  })
  await db.batch(statements as any)
}

export async function getRewriteById(id: string): Promise<NewsRewrite | null> {
  const db = getTursoClient()
  const result = await db.execute({ sql: 'SELECT * FROM news_rewrites WHERE id = ?', args: [id] })
  return result.rows[0] ? rowToRewrite(result.rows[0] as Record<string, unknown>) : null
}

export async function getRewriteBySlug(slug: string): Promise<NewsRewrite | null> {
  const db = getTursoClient()
  const result = await db.execute({ sql: 'SELECT * FROM news_rewrites WHERE slug = ?', args: [slug] })
  return result.rows[0] ? rowToRewrite(result.rows[0] as Record<string, unknown>) : null
}

export async function listRewriteImages(rewriteId: string): Promise<RewriteImage[]> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'SELECT * FROM news_rewrite_images WHERE rewrite_id = ? ORDER BY position',
    args: [rewriteId],
  })
  return (result.rows as unknown as Array<Record<string, unknown>>).map(rowToImage)
}

export async function listRewriteSources(rewriteId: string): Promise<RewriteSource[]> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'SELECT * FROM news_rewrite_sources WHERE rewrite_id = ? ORDER BY position',
    args: [rewriteId],
  })
  return (result.rows as unknown as Array<Record<string, unknown>>).map(rowToSource)
}

export async function listRewritesByStatus(status: RewriteStatus, limit = 50): Promise<NewsRewrite[]> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT * FROM news_rewrites WHERE status = ? ORDER BY generated_at DESC LIMIT ?`,
    args: [status, limit],
  })
  return (result.rows as unknown as Array<Record<string, unknown>>).map(rowToRewrite)
}

export interface PublishedFilters {
  artist?: string | null
  category?: string | null
  q?: string | null
  page?: number | null
  limit?: number | null
}

/** A published article plus the card preview image (never rehosted). */
export type PublishedRewrite = NewsRewrite & { thumbnail: string | null }

export interface PublishedPage {
  rewrites: PublishedRewrite[]
  total: number
  page: number
  limit: number
}

/**
 * The public read path. `status = 'published'` is bound into the query *and*
 * re-checked in the caller, so a draft can never reach a visitor.
 */
export async function listPublishedRewrites(filters: PublishedFilters = {}): Promise<PublishedPage> {
  const db = getTursoClient()
  const clauses = ["status = 'published'"]
  const args: (string | number)[] = []

  const artist = (filters.artist || '').trim()
  if (artist && artist !== 'all' && artist !== 'All') {
    clauses.push('artist_id = ?')
    args.push(artist)
  }
  const category = (filters.category || '').trim()
  if (category && category !== 'all' && category !== 'All') {
    clauses.push('category = ?')
    args.push(category)
  }
  const q = (filters.q || '').trim()
  if (q) {
    const needle = `%${q.replace(/[%_\\]/g, match => `\\${match}`)}%`
    clauses.push("(title LIKE ? ESCAPE '\\' OR dek LIKE ? ESCAPE '\\')")
    args.push(needle, needle)
  }

  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 12))
  const page = Math.max(1, Number(filters.page) || 1)
  const where = `WHERE ${clauses.join(' AND ')}`

  const [rows, count] = await Promise.all([
    db.execute({
      // The card preview comes along as a subquery so a feed page stays one
      // round trip. It is a linked asset — never rehosted.
      sql: `SELECT news_rewrites.*,
                   (SELECT i.image_url FROM news_rewrite_images i
                     WHERE i.rewrite_id = news_rewrites.id
                     ORDER BY i.position LIMIT 1) AS thumbnail
            FROM news_rewrites ${where}
            ORDER BY COALESCE(published_at, generated_at) DESC, id DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, (page - 1) * limit],
    }),
    db.execute({ sql: `SELECT COUNT(*) AS total FROM news_rewrites ${where}`, args }),
  ])

  const rewrites = (rows.rows as unknown as Array<Record<string, unknown>>).map(row => {
    const raw = row.thumbnail
    return {
      ...rowToRewrite(row),
      thumbnail: isRenderableMediaUrl(typeof raw === 'string' ? raw : null) ? String(raw) : null,
    }
  })

  return {
    rewrites,
    total: Number((count.rows[0] as any)?.total) || 0,
    page,
    limit,
  }
}

export interface CandidateRow {
  id: string
  artistId: string
  verificationStatus: string
  verificationScore: number
  publisherDomain: string | null
}

/**
 * Take one candidate per publisher in turn, so a single prolific outlet (or a
 * single content type) cannot fill the whole run.
 *
 * Ordering the run purely by score meant Soompi's music-show roundups won every
 * slot and the official YouTube uploads / Korean-outlet stories never got
 * written up. Round-robin keeps the score order *within* each publisher while
 * guaranteeing the others a turn.
 */
export function interleaveByPublisher<T extends { publisherDomain: string | null }>(rows: T[], limit: number): T[] {
  const queues = new Map<string, T[]>()
  for (const row of rows) {
    const key = (row.publisherDomain || 'unknown').toLowerCase()
    const queue = queues.get(key)
    if (queue) queue.push(row)
    else queues.set(key, [row])
  }

  const keys = [...queues.keys()]
  const out: T[] = []
  while (out.length < limit && keys.some(key => (queues.get(key)?.length ?? 0) > 0)) {
    for (const key of keys) {
      if (out.length >= limit) break
      const next = queues.get(key)!.shift()
      if (next) out.push(next)
    }
  }
  return out
}

/**
 * Articles worth rewriting: the verified ones first, then the pending ones,
 * skipping anything that already has a live rewrite and anything whose last
 * attempt failed too recently to retry.
 */
export async function listRewriteCandidates(limit: number, failedBefore: string): Promise<CandidateRow[]> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT a.id, a.artist_id, a.verification_status, a.verification_score, a.publisher_domain
          FROM news_articles a
          WHERE a.verification_status IN ('VERIFIED', 'PENDING_VERIFICATION')
            AND NOT EXISTS (
              SELECT 1 FROM news_rewrites r
              WHERE r.article_id = a.id AND r.status IN ('draft', 'approved', 'published')
            )
            AND NOT EXISTS (
              SELECT 1 FROM news_rewrites f
              WHERE f.article_id = a.id AND f.status = 'failed' AND f.updated_at > ?
            )
          ORDER BY (a.verification_status = 'VERIFIED') DESC, a.verification_score DESC,
                   COALESCE(a.published_at, a.first_discovered_at) DESC
          LIMIT ?`,
    // Ask wide, then interleave: the extra rows are what lets every publisher
    // get a turn without losing score order inside each publisher.
    args: [failedBefore, Math.max(limit * 4, limit)],
  })

  const rows = (result.rows as unknown as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    artistId: String(row.artist_id),
    verificationStatus: String(row.verification_status),
    verificationScore: Number(row.verification_score) || 0,
    publisherDomain: row.publisher_domain ? String(row.publisher_domain) : null,
  }))

  return interleaveByPublisher(rows, limit)
}

export async function updateRewriteStatus(entry: {
  id: string
  status: RewriteStatus
  note?: string | null
  reviewedBy?: number | null
  error?: string | null
}): Promise<void> {
  const db = getTursoClient()
  const now = iso()
  const publishedAt = entry.status === 'published' ? now : null
  const reviewedAt = entry.reviewedBy == null ? null : now
  await db.execute({
    sql: `UPDATE news_rewrites
          SET status = ?,
              review_note = COALESCE(?, review_note),
              reviewed_by = COALESCE(?, reviewed_by),
              reviewed_at = COALESCE(?, reviewed_at),
              published_at = COALESCE(?, published_at),
              error = ?,
              updated_at = ?
          WHERE id = ?`,
    args: [entry.status, entry.note ?? null, entry.reviewedBy ?? null, reviewedAt, publishedAt, entry.error ?? null, now, entry.id],
  })
}

export async function updateRewriteContent(entry: {
  id: string
  title: string
  dek: string
  bodyMarkdown: string
  readingMinutes: number
}): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `UPDATE news_rewrites
          SET title = ?, dek = ?, body_markdown = ?, reading_minutes = ?, updated_at = ?
          WHERE id = ?`,
    args: [entry.title, entry.dek, entry.bodyMarkdown, entry.readingMinutes, iso(), entry.id],
  })
}

export async function beginRewriteLog(startedAt: string): Promise<number> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'INSERT INTO news_rewrite_log (started_at, status) VALUES (?, ?)',
    args: [startedAt, 'running'],
  })
  return Number(result.lastInsertRowid)
}

export async function finishRewriteLog(id: number, entry: {
  finishedAt: string
  status: 'ok' | 'partial' | 'error'
  generated: number
  failed: number
  provider: string
  message: string
}): Promise<void> {
  const db = getTursoClient()
  await db.execute({
    sql: `UPDATE news_rewrite_log
          SET finished_at = ?, status = ?, generated = ?, failed = ?, provider = ?, message = ?
          WHERE id = ?`,
    args: [entry.finishedAt, entry.status, entry.generated, entry.failed, entry.provider, entry.message, id],
  })
}

export async function lastRewriteRun(): Promise<Record<string, unknown> | null> {
  const db = getTursoClient()
  const result = await db.execute('SELECT * FROM news_rewrite_log ORDER BY id DESC LIMIT 1')
  return result.rows[0] ? (result.rows[0] as Record<string, unknown>) : null
}

/** Build the model's material from a stored article plus its evidence. */
export async function loadRewriteMaterial(articleId: string): Promise<{
  article: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
} | null> {
  const db = getTursoClient()
  const [article, evidence] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM news_articles WHERE id = ?', args: [articleId] }),
    db.execute({
      sql: `SELECT * FROM news_evidence WHERE article_id = ? AND image_url IS NOT NULL ORDER BY retrieved_at DESC LIMIT 6`,
      args: [articleId],
    }),
  ])
  const row = article.rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  return { article: row, evidence: evidence.rows as unknown as Array<Record<string, unknown>> }
}
