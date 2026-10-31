/**
 * Types for the AI rewrite layer (the fanbase blog at /news).
 *
 * These statuses are deliberately a *different* vocabulary from `NewsStatus`
 * (`VERIFIED`, `PENDING_VERIFICATION`, …): the public feed's queries hardcode
 * `verification_status = 'VERIFIED'`, so a rewrite draft can never leak into it
 * by sharing a name.
 */

export const REWRITE_STATUSES = ['draft', 'approved', 'rejected', 'published', 'failed'] as const
export type RewriteStatus = (typeof REWRITE_STATUSES)[number]

export interface RewriteImageInput {
  imageUrl: string
  /** The page the image was published on — the credit link. */
  sourceUrl: string
  creditText: string | null
  creditUrl: string | null
  caption: string | null
}

export interface RewriteSourceInput {
  sourceUrl: string
  publisherName: string | null
  publisherDomain: string | null
  originalTitle: string | null
  publishedAt: string | null
}

export interface RewriteImage extends RewriteImageInput {
  id: string
  rewriteId: string
  position: number
  rightsStatus: string
  createdAt: string
}

export interface RewriteSource extends RewriteSourceInput {
  id: string
  rewriteId: string
  position: number
  createdAt: string
}

export interface NewsRewrite {
  id: string
  articleId: string | null
  slug: string
  title: string
  dek: string
  bodyMarkdown: string
  artistId: string
  category: string
  language: string
  readingMinutes: number
  status: RewriteStatus
  provider: string | null
  model: string | null
  reviewNote: string | null
  reviewedBy: number | null
  reviewedAt: string | null
  publishedAt: string | null
  error: string | null
  attempts: number
  generatedAt: string
  createdAt: string
  updatedAt: string
}

export interface RewriteDraft {
  articleId: string | null
  slug: string
  title: string
  dek: string
  bodyMarkdown: string
  artistId: string
  category: string
  language: string
  readingMinutes: number
  provider: string
  model: string
  images: RewriteImageInput[]
  sources: RewriteSourceInput[]
}

/**
 * Everything the model is allowed to know about one story. The prompt and the
 * validator are both built from this, so the model can only ever cite a source
 * or pick an image that the pipeline actually collected.
 */
export interface RewriteMaterial {
  articleId: string
  artistId: string
  category: string
  originalTitle: string
  summary: string | null
  bodyText: string
  publisherName: string | null
  publisherDomain: string | null
  publishedAt: string | null
  verificationStatus: string
  verificationScore: number
  /** Candidate images, in the stable index order the prompt quotes them. */
  images: RewriteImageInput[]
  /** Candidate sources (index 0 is always the primary article). */
  sources: RewriteSourceInput[]
}
