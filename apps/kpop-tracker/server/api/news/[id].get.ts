import { ensureNewsTables, getArticleById, getTranslation, listAudit, listClaims, listEvidence } from '../../utils/news/store'
import { localizeArticle, parseFeedLang, toPublicArticle } from '../../utils/news/feed'
import { isRenderableMediaUrl, validateExternalUrl } from '../../utils/news/url'

/**
 * Article detail.
 *
 * Only a VERIFIED row is served to the public: anything else is a 404 (not a
 * 403, which would confirm the row's existence). The administrator may read
 * every status, including the audit trail, which is what makes the pipeline
 * reviewable without ever widening the public feed.
 *
 * `?lang=en|id` selects the display wording only; the verified original always
 * rides along as `original_title`, and a missing translation falls back to it.
 */
export default defineEventHandler(async (event) => {
  await ensureNewsTables()
  const id = getRouterParam(event, 'id') || ''
  const row = await getArticleById(id)

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const user = await getSessionUser(event)
  const isAdmin = user?.role === 'admin'
  const article = toPublicArticle(row)

  if (!article) {
    if (isAdmin) return { success: true, admin: true, data: adminDetail(row) }
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const lang = parseFeedLang(getQuery(event).lang)
  const [evidenceRows, claimRows, translation] = await Promise.all([
    listEvidence(article.id),
    listClaims(article.id),
    getTranslation(article.id, lang),
  ])

  const detail = {
    ...localizeArticle(article, translation, lang),
    verification_version: Number(row.verification_version) || 0,
    evidence_complete: Boolean(row.evidence_complete),
    first_discovered_at: str(row.first_discovered_at),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
    verification_reasons: json<string[]>(row.verification_reasons, []),
    score_breakdown: json<Record<string, number>>(row.score_breakdown, {}),
    failed_gates: json<string[]>(row.failed_gates, []),
    corroborations: json<Array<Record<string, unknown>>>(row.corroborations, []).map(publicCorroboration),
    evidence: evidenceRows.map(publicEvidence),
    claims: claimRows.map(publicClaim),
    status_filter: 'VERIFIED',
    lang,
  }

  if (!isAdmin) return { success: true, data: detail }

  const audit = await listAudit(article.id, 10)
  return { success: true, admin: true, data: { ...detail, audit: audit.map(publicAudit) } }
})

function str(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value)
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Evidence the browser may render: links to the origin, never rehosted. */
function publicEvidence(row: Record<string, unknown>) {
  const url = str(row.source_url) || str(row.image_url)
  return {
    id: str(row.id),
    evidence_type: str(row.evidence_type, 'other'),
    source_url: linkUrl(url),
    image_url: mediaUrl(row.image_url),
    thumbnail_url: mediaUrl(row.thumbnail_url),
    video_url: mediaUrl(row.video_url),
    source_name: str(row.source_name) || null,
    source_domain: str(row.source_domain) || null,
    published_at: str(row.published_at) || null,
    retrieved_at: str(row.retrieved_at) || null,
    original_caption: str(row.original_caption) || null,
    evidence_description: str(row.evidence_description) || null,
    rights_status: str(row.rights_status, 'linked_to_origin_not_rehosted'),
    attribution_text: str(row.attribution_text) || null,
    verification_status: str(row.verification_status, 'unverified'),
  }
}

function publicClaim(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    claim_text: str(row.claim_text),
    subject: str(row.subject),
    predicate: str(row.predicate),
    relevant_dates: str(row.relevant_dates) || null,
    claim_type: str(row.claim_type),
    category: str(row.category),
    claim_status: str(row.claim_status, 'unassessed'),
    verification_notes: json<string[]>(row.verification_notes, []),
  }
}

function publicCorroboration(entry: Record<string, unknown>) {
  return {
    url: str(entry.url),
    source_id: str(entry.sourceId) || null,
    domain: str(entry.publisherDomain) || null,
    independent: Boolean(entry.independent),
  }
}

function publicAudit(row: Record<string, unknown>) {
  return {
    timestamp: str(row.timestamp),
    verification_version: Number(row.verification_version) || 0,
    decision: str(row.decision),
    previous_status: str(row.previous_status) || null,
    new_status: str(row.new_status),
    reason: str(row.reason),
    score_breakdown: json<Record<string, number>>(row.score_breakdown, {}),
    failed_gates: json<string[]>(row.failed_gates, []),
    contradictions: json<string[]>(row.contradictions, []),
    sources_inspected: json<string[]>(row.sources_inspected, []),
    claims_evaluated: json<string[]>(row.claims_evaluated, []),
    evidence_discovered: json<string[]>(row.evidence_discovered, []),
  }
}

/** Administrator view of a non-VERIFIED row — never reachable by the public. */
function adminDetail(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    artist_id: str(row.artist_id),
    title: str(row.original_title),
    summary: str(row.summary) || null,
    category: str(row.category),
    original_url: linkUrl(row.original_url),
    publisher_name: str(row.publisher_name) || null,
    publisher_domain: str(row.publisher_domain) || null,
    published_at: str(row.published_at) || null,
    verification_status: str(row.verification_status),
    verification_score: Number(row.verification_score) || 0,
    verification_reasons: json<string[]>(row.verification_reasons, []),
    score_breakdown: json<Record<string, number>>(row.score_breakdown, {}),
    failed_gates: json<string[]>(row.failed_gates, []),
    last_checked_at: str(row.last_checked_at) || null,
  }
}

/** Only http(s) URLs that pass the SSRF allowlist are echoed back to a client. */
function linkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const check = validateExternalUrl(value)
  return check.ok ? check.url.toString() : null
}

/** Renderable media must be https on a public host — the browser fetches it. */
function mediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return isRenderableMediaUrl(value) ? value : null
}
