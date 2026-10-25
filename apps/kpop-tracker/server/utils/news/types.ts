/**
 * Normalized models for the Verified K-Pop News Engine.
 *
 * Everything in this file is plain data — no Nitro, no DB, no fetch — so the
 * verification services built on top of it can be unit-tested under vitest
 * (which has none of Nuxt's auto-imports).
 */

export const ARTIST_IDS = ['aespa', 'hearts2hearts', 'ive'] as const
export type ArtistId = (typeof ARTIST_IDS)[number]

/**
 * Lifecycle of a candidate story. Only `VERIFIED` may ever reach the public
 * feed; the rest are retained for auditing and re-verification.
 */
export const NEWS_STATUSES = [
  'DISCOVERED',
  'FETCH_FAILED',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'CONFLICTED',
  'EXPIRED',
  'REVOKED',
] as const
export type NewsStatus = (typeof NEWS_STATUSES)[number]

/** Score components A–F. Weights are frozen here and asserted by tests. */
export const SCORE_COMPONENTS = ['source', 'corroboration', 'visual', 'consistency', 'date', 'transparency'] as const
export type ScoreComponentKey = (typeof SCORE_COMPONENTS)[number]

export interface ScoreComponent {
  key: ScoreComponentKey
  label: string
  points: number
  max: number
  notes: string[]
}

export interface ScoreResult {
  total: number
  components: ScoreComponent[]
}

/** Hard gate ids — the 12 conditions of §10. A gate never returns a score. */
export type GateId =
  | 'relevant_artist'
  | 'source_accessible'
  | 'claims_supported'
  | 'date_verified'
  | 'has_visual_evidence'
  | 'visual_supports_story'
  | 'no_contradiction'
  | 'not_rumor'
  | 'not_duplicate'
  | 'min_score'
  | 'evidence_complete'
  | 'auditable'

export interface GateResult {
  id: GateId
  passed: boolean
  detail: string
}

export type EvidenceType =
  | 'official_photo'
  | 'official_poster'
  | 'official_teaser'
  | 'official_video'
  | 'publisher_image'
  | 'official_announcement'
  | 'other_traceable_visual'

export interface NewsEvidence {
  id: string
  article_id: string
  evidence_type: EvidenceType
  /** Where the asset was found (the page that embeds it). */
  source_url: string
  /** The asset's own origin when it can be determined. */
  canonical_source_url: string | null
  image_url: string | null
  thumbnail_url: string | null
  video_url: string | null
  video_id: string | null
  source_name: string | null
  source_domain: string | null
  creator_or_publisher: string | null
  published_at: string | null
  retrieved_at: string
  original_caption: string | null
  evidence_description: string | null
  supports_claim_ids: string[]
  rights_status: string
  attribution_text: string | null
  content_hash: string | null
  /**
   * `ai_generated` / `manipulated` assets are never documentary evidence —
   * the pipeline records the flag instead of trusting the image.
   */
  verification_status: 'traceable' | 'untraceable' | 'ai_generated' | 'manipulated'
}

export type ClaimType =
  | 'official_announcement'
  | 'confirmed_fact'
  | 'attributed_report'
  | 'analysis_opinion'
  | 'rumor'
  | 'speculation'

export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted' | 'unassessed'

export interface NewsClaim {
  id: string
  article_id: string
  claim_text: string
  normalized_claim: string
  subject: string
  predicate: string
  /** ISO date or a timeframe phrase — never invented when absent. */
  relevant_dates: string | null
  claim_type: ClaimType
  category: NewsCategory
  supporting_source_ids: string[]
  contradicting_source_ids: string[]
  claim_status: ClaimStatus
  verification_notes: string[]
}

export const NEWS_CATEGORIES = [
  'release',
  'schedule',
  'performance',
  'award',
  'chart',
  'business',
  'media',
  'personnel',
  'other',
] as const
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]

export interface NewsArticle {
  id: string
  story_key: string
  artist_id: ArtistId
  original_title: string
  normalized_title: string
  summary: string | null
  language: string | null
  category: NewsCategory
  original_url: string
  canonical_url: string | null
  publisher_name: string | null
  publisher_domain: string | null
  /** UTC ISO when a time was published; `YYYY-MM-DD` when only a date. */
  published_at: string | null
  published_at_timezone: string | null
  /** True when `published_at` carries a real clock time (not invented). */
  published_at_has_time: boolean
  first_discovered_at: string
  last_checked_at: string
  /** The day the event happened, when it differs from publication. */
  event_date: string | null
  verification_status: NewsStatus
  verification_score: number
  verification_reasons: string[]
  verification_version: number
  evidence_complete: boolean
  created_at: string
  updated_at: string
}

/** Everything the deterministic verifier needs about one candidate story. */
export interface VerificationInput {
  artistId: ArtistId | null
  /** Two artists scored equally — relevance itself is unresolved. */
  artistAmbiguous: boolean
  /** Publisher identity actually resolved from the fetched page / registry. */
  publisherDomain: string | null
  publisherName: string | null
  sourceTrust: SourceTrust | null
  /** Registry credibility for this publisher (0 when unclassified). */
  sourceCredibilityPoints: number
  /** The claim lies within what this source directly knows. */
  sourceDirectKnowledge: boolean
  sourceIsOfficialAgency: boolean
  /** The original source was fetched and inspected (body available). */
  sourceFetched: boolean
  sourceUrl: string | null
  sourceUrlResolves: boolean
  sourceMatchesPublisher: boolean
  inspectedBodyLength: number
  canonicalUrl: string | null
  publishedAt: string | null
  publishedAtHasTime: boolean
  /** Date read from the publisher's own page metadata (not the discovery feed). */
  publishedAtFromPageMetadata: boolean
  publishedAtPlausible: boolean
  /** The day the event happened, when it differs from publication. */
  eventDate: string | null
  category: NewsCategory
  claims: NewsClaim[]
  evidence: NewsEvidence[]
  /** Independent corroborations, already de-syndicated. */
  corroborations: Corroboration[]
  contradictions: string[]
  isDuplicate: boolean
  isRumor: boolean
  isOpinion: boolean
  hasAttribution: boolean
  /** An official primary source directly confirms the material claim. */
  officialPrimaryConfirms: boolean
  evidenceComplete: boolean
  injectionDetected: boolean
}

export interface Corroboration {
  sourceId: string
  publisherDomain: string
  url: string
  /** Same story reached through a copy/syndication → never counted. */
  independent: boolean
}

export type SourceTrust =
  | 'primary_official'
  | 'primary_wire'
  | 'secondary_reputable'
  | 'discovery_only'
  | 'unclassified'

export interface VerificationOutcome {
  status: NewsStatus
  score: number
  breakdown: ScoreResult
  gates: GateResult[]
  failedGates: GateId[]
  reasons: string[]
  /** True only when every gate passed and score ≥ the configured minimum. */
  approved: boolean
}
