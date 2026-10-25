import type { ClaimType, EvidenceType, NewsEvidence, NewsCategory } from './types'

/**
 * Visual evidence assessment (§7, score component C = 20 points).
 *
 * The trap this guards against: "there is a photo of the artist on the page"
 * is not evidence that the *reported event* happened. Points are awarded for
 * traceability, known publication context, relevance to this story and, only
 * then, for actually supporting the claim.
 */

export interface EvidenceContext {
  articlePublishedAt: string | null
  category: NewsCategory
  claimTypes: ClaimType[]
  /** The URL of the article page — an image served from it is story-bound. */
  articleUrl: string | null
}

export interface EvidenceAssessment {
  id: string
  type: EvidenceType
  points: number
  supportsClaim: boolean
  traceable: boolean
  reasons: string[]
}

export interface VisualEvaluation {
  points: number
  hasTraceable: boolean
  supportsClaim: boolean
  hasRelevant: boolean
  aiGeneratedPresent: boolean
  staleDetected: boolean
  notes: string[]
  assessments: EvidenceAssessment[]
}

const RELEVANT_TYPES_FOR_CATEGORY: Record<NewsCategory, EvidenceType[]> = {
  release: ['official_poster', 'official_teaser', 'official_video', 'official_announcement'],
  schedule: ['official_announcement', 'official_poster', 'official_photo'],
  performance: ['official_video', 'official_poster', 'official_photo'],
  award: ['official_announcement', 'publisher_image', 'official_photo'],
  chart: ['publisher_image', 'official_photo'],
  business: ['official_announcement', 'publisher_image'],
  media: ['publisher_image', 'official_photo', 'official_video'],
  personnel: ['official_photo', 'official_announcement', 'publisher_image'],
  other: ['official_announcement', 'publisher_image', 'official_photo'],
}

/**
 * An asset older than 60 days while the story is about something current is a
 * stock/back-catalogue photo: it can illustrate, it cannot prove.
 */
const STALE_AFTER_DAYS = 60

function daysBetween(olderIso: string | null, newerIso: string | null): number | null {
  if (!olderIso || !newerIso) return null
  const older = new Date(olderIso.length === 10 ? `${olderIso}T00:00:00Z` : olderIso)
  const newer = new Date(newerIso.length === 10 ? `${newerIso}T00:00:00Z` : newerIso)
  if (Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime())) return null
  return Math.abs(newer.getTime() - older.getTime()) / 86400000
}

function sameHost(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '')
  } catch {
    return false
  }
}

export function evaluateVisualEvidence(
  evidence: NewsEvidence[],
  ctx: EvidenceContext,
): VisualEvaluation {
  const notes: string[] = []
  const assessments: EvidenceAssessment[] = []
  let aiGeneratedPresent = false
  let staleDetected = false
  let hasTraceable = false
  let supportsClaim = false
  let hasRelevant = false

  const relevantTypes = new Set(RELEVANT_TYPES_FOR_CATEGORY[ctx.category])

  for (const item of evidence) {
    const reasons: string[] = []
    let points = 0

    if (item.verification_status === 'ai_generated' || item.verification_status === 'manipulated') {
      aiGeneratedPresent = true
      reasons.push('AI-generated/manipulated assets are never documentary evidence')
      assessments.push({ id: item.id, type: item.evidence_type, points: 0, supportsClaim: false, traceable: false, reasons })
      continue
    }

    const traceable = Boolean(item.image_url || item.video_url)
      && Boolean(item.source_url)
      && Boolean(item.source_domain || item.canonical_source_url)
    if (traceable) {
      points += 6
      reasons.push('origin and embedding page recorded (traceable)')
      hasTraceable = true
    } else {
      reasons.push('missing origin or embedding page — not traceable')
    }

    const hasContext = Boolean(item.retrieved_at)
      && Boolean(item.published_at || item.creator_or_publisher || item.original_caption)
    if (hasContext) {
      points += 4
      reasons.push('publication context known (date/creator/caption)')
    } else if (item.retrieved_at) {
      points += 2
      reasons.push('only retrieval time known — context incomplete')
    }

    // Relevance: story-bound assets beat a generic artist photo.
    const fromArticlePage = sameHost(item.source_url, ctx.articleUrl) && sameHost(item.canonical_source_url || item.image_url, ctx.articleUrl)
    const isPreferredType = relevantTypes.has(item.evidence_type)
    const isGenericPhoto = item.evidence_type === 'official_photo' && !item.original_caption

    let relevance = 0
    if (fromArticlePage) {
      relevance = 5
      reasons.push('image is the publisher\u2019s own asset for this story')
    } else if (isPreferredType) {
      relevance = 5
      reasons.push(`${item.evidence_type} matches the reported event`)
    } else if (item.evidence_type === 'publisher_image') {
      relevance = 4
      reasons.push('publisher image, story relevance partial')
    } else if (isGenericPhoto) {
      relevance = 1
      reasons.push('generic artist photo — shows the artist, not the event')
    } else {
      relevance = 2
      reasons.push('traceable visual with limited tie to the claim')
    }

    const ageDays = daysBetween(item.published_at, ctx.articlePublishedAt)
    if (ageDays !== null && ageDays > STALE_AFTER_DAYS && item.evidence_type !== 'official_photo') {
      staleDetected = true
      relevance = Math.min(relevance, 1)
      reasons.push(`asset predates the story by ${Math.round(ageDays)} days — cannot corroborate a current event`)
    }

    points += Math.min(5, relevance)
    if (relevance >= 4) hasRelevant = true

    // Claim support — the last and strictest step.
    let supports = false
    if (item.verification_status === 'traceable' && relevance >= 4 && ageDays !== null && ageDays <= STALE_AFTER_DAYS) {
      if (isPreferredType || fromArticlePage) {
        supports = true
        reasons.push('supports the reported claim (date and origin consistent)')
      }
    } else if (item.verification_status === 'traceable' && relevance >= 4 && ageDays === null) {
      // No dates anywhere: consistent, but "unknown" is not "consistent".
      if (isPreferredType || fromArticlePage) {
        supports = true
        reasons.push('supports the claim within known context (asset undated)')
      }
    } else if (!supports) {
      reasons.push('does not independently support the claim')
    }

    if (supports) points += 5
    const capped = Math.min(20, Math.max(0, points))
    if (supports) supportsClaim = true

    assessments.push({ id: item.id, type: item.evidence_type, points: capped, supportsClaim: supports, traceable, reasons })
  }

  // Total for component C is the best single asset, capped at 20: several weak
  // photos must not add up to proof.
  const best = assessments.reduce((max, entry) => Math.max(max, entry.points), 0)
  const points = Math.min(20, Math.max(0, best))

  if (evidence.length === 0) notes.push('no visual evidence attached')
  if (!hasTraceable && evidence.length > 0) notes.push('no traceable visual evidence')
  if (aiGeneratedPresent) notes.push('AI-generated imagery excluded from scoring')
  if (staleDetected) notes.push('at least one asset is older than the story')

  return {
    points,
    hasTraceable,
    supportsClaim,
    hasRelevant,
    aiGeneratedPresent,
    staleDetected,
    notes,
    assessments,
  }
}
