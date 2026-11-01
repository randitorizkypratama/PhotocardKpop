import type { ArtistId } from './types'
import { ARTISTS } from './artists'
import { conceptsIn, normalizeConceptText } from './eventLexicon'
import { coreTokens, normalizeNewsTitle, newsTitleSimilarity, storyKey } from './text'

/**
 * Duplicate detection (§12).
 *
 * Two URLs reporting the same event become *one* story with several source
 * links — and, just as important, copies of one press release are never
 * counted twice as independent corroboration.
 */

export interface ExistingStory {
  id: string
  artist_id: string
  normalized_title: string
  original_url: string
  canonical_url: string | null
  story_key: string | null
  published_at: string | null
  publisher_domain: string | null
  verification_status: string
}

export interface CandidateIdentity {
  artistId: ArtistId | null
  title: string
  canonicalUrl: string
  publisherDomain: string | null
  publishedAt: string | null
}

export interface DuplicateMatch {
  duplicate: boolean
  storyId: string | null
  reason: string
  similarity: number
  /** Same story seen through a copy/syndicated URL → not corroboration. */
  syndicated: boolean
}

/** Similarity at or above this is the same headline, not a related story. */
export const SIMILARITY_THRESHOLD = 0.72
/** Stories published this far apart may be about the same event. */
export const TIME_WINDOW_DAYS = 7

export function withinTimeWindow(a: string | null, b: string | null, days = TIME_WINDOW_DAYS): boolean {
  if (!a || !b) return true // no dates to separate them — let wording decide
  const left = new Date(a.length === 10 ? `${a}T00:00:00Z` : a)
  const right = new Date(b.length === 10 ? `${b}T00:00:00Z` : b)
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return true
  return Math.abs(left.getTime() - right.getTime()) <= days * 86400000
}

export function findDuplicate(
  candidate: CandidateIdentity,
  existing: ExistingStory[],
): DuplicateMatch {
  const normalized = normalizeNewsTitle(candidate.title)
  const key = candidate.artistId ? storyKey(candidate.artistId, candidate.title) : null
  const canonical = candidate.canonicalUrl

  for (const story of existing) {
    if (candidate.artistId && story.artist_id !== candidate.artistId) continue

    if (canonical && story.canonical_url && canonical === story.canonical_url) {
      return { duplicate: true, storyId: story.id, reason: 'identical canonical URL', similarity: 1, syndicated: false }
    }
    if (canonical && story.original_url && canonical === story.original_url) {
      return { duplicate: true, storyId: story.id, reason: 'identical source URL', similarity: 1, syndicated: false }
    }
    if (key && story.story_key && key === story.story_key) {
      return { duplicate: true, storyId: story.id, reason: 'identical story key', similarity: 1, syndicated: false }
    }

    const similarity = newsTitleSimilarity(normalized, story.normalized_title || '')
    if (similarity >= SIMILARITY_THRESHOLD && withinTimeWindow(candidate.publishedAt, story.published_at)) {
      const samePublisher = Boolean(
        candidate.publisherDomain
        && story.publisher_domain
        && candidate.publisherDomain === story.publisher_domain,
      )
      return {
        duplicate: true,
        storyId: story.id,
        reason: samePublisher
          ? `same wording from the same publisher (${similarity.toFixed(2)})`
          : `same wording, same event window (${similarity.toFixed(2)})`,
        similarity,
        syndicated: !samePublisher,
      }
    }
  }

  return { duplicate: false, storyId: null, reason: 'no match', similarity: 0, syndicated: false }
}

/**
 * Corroboration may only count when the two articles are not just copies of
 * one another: different publisher, different wording, not the same feed item
 * mirrored around the web.
 */
export function isIndependentCorroboration(
  a: { publisherDomain: string | null, title: string, canonicalUrl: string },
  b: { publisherDomain: string | null, title: string, canonicalUrl: string },
): boolean {
  if (a.canonicalUrl && a.canonicalUrl === b.canonicalUrl) return false
  const domainA = (a.publisherDomain || '').toLowerCase()
  const domainB = (b.publisherDomain || '').toLowerCase()
  if (!domainA || !domainB || domainA === domainB) return false
  const similarity = newsTitleSimilarity(a.title, b.title)
  // Near-identical wording across domains is a wire copy, not independent work.
  if (similarity >= 0.92) return false
  const tokensA = new Set(coreTokens(a.title))
  const shared = coreTokens(b.title).filter(token => tokensA.has(token)).length
  // Headlines sharing almost no content words describe different events.
  return shared > 0
}

export interface EventIdentity {
  artistId: ArtistId | null
  title: string
  publisherDomain: string | null
  publishedAt: string | null
  /** Event date stated by the article, when one was extracted. */
  eventDate?: string | null
}

/**
 * Content words two differently worded articles must share to be one event.
 * Kept low — two independent outlets rarely reuse a third of each other's
 * wording, and the artist/time/date guards below already exclude unrelated
 * stories about the same group.
 */
export const SAME_EVENT_MIN_SHARED_TOKENS = 2
/** …and this much of the shorter headline must be covered by them. */
export const SAME_EVENT_MIN_OVERLAP = 0.4

/**
 * The artist's own name in both scripts, normalised.
 *
 * Identity is a *precondition* of the match, never evidence for it: two
 * headlines about IVE that only agree on the word "IVE" are two stories, so the
 * alias is dropped from the shared-subject set before anything is counted.
 */
function artistIdentityForms(artistId: ArtistId | null): Set<string> {
  const profile = artistId ? ARTISTS[artistId] : null
  if (!profile) return new Set()
  return new Set(profile.aliases.map(alias => normalizeConceptText(alias)))
}

/**
 * §12 second half: *two URLs reporting the same event* become one story with
 * several source links — and this is what makes component B (independent
 * corroboration) reachable at all, because independent outlets word the same
 * occurrence differently and therefore never look like duplicates.
 *
 * Two signals are tried, and either is enough:
 *
 *  A. **wording** — shared content words inside the seven-day window. This is
 *     the original rule and still the one that links two English outlets.
 *
 *  B. **bilingual event match** — the shared *context* (a music show, a chart,
 *     a comeback) plus a shared *subject* (a named award, a view milestone, a
 *     brand, or a phrase the publisher quoted). This is what links a Korean
 *     headline to its English counterpart, which share no word at all.
 *
 * Signal B demands one of each on purpose: context alone would merge two
 * different wins on the same show, and a subject alone would merge two
 * unrelated stories that quote the same song.
 *
 * Deliberately conservative either way: same artist, different publisher,
 * inside the same seven-day window, agreeing event dates when both state one.
 */
export function isSameEvent(a: EventIdentity, b: EventIdentity): boolean {
  if (!a.artistId || !b.artistId || a.artistId !== b.artistId) return false

  const domainA = (a.publisherDomain || '').toLowerCase()
  const domainB = (b.publisherDomain || '').toLowerCase()
  if (!domainA || !domainB || domainA === domainB) return false

  if (!withinTimeWindow(a.publishedAt, b.publishedAt)) return false
  if (a.eventDate && b.eventDate && a.eventDate !== b.eventDate) return false

  const left = new Set(coreTokens(a.title))
  const right = new Set(coreTokens(b.title))
  if (left.size === 0 || right.size === 0) return false

  const shared = [...left].filter(token => right.has(token))
  const wordingMatch =
    shared.length >= SAME_EVENT_MIN_SHARED_TOKENS
    && shared.length / Math.min(left.size, right.size) >= SAME_EVENT_MIN_OVERLAP
  if (wordingMatch) return true

  const identity = artistIdentityForms(a.artistId)
  const leftConcepts = conceptsIn(a.title)
  const rightConcepts = conceptsIn(b.title)

  const sharedContext = [...leftConcepts.context].filter(id => rightConcepts.context.has(id))
  if (sharedContext.length === 0) return false

  const sharedSubject = [...leftConcepts.subject]
    .filter(id => rightConcepts.subject.has(id) && !identity.has(id.replace(/^quoted:/, '')))
  return sharedSubject.length > 0
}
