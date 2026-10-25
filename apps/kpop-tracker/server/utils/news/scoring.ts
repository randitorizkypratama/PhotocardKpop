import type { ScoreComponent, ScoreResult, VerificationInput } from './types'
import type { VisualEvaluation } from './evidence'

/**
 * Deterministic verification score, 0–100 (§9).
 *
 * Every rule below is fixed, explainable and unit-tested. Nothing here
 * consults an AI, a popularity number or a headline's plausibility: the score
 * describes *evidence that was actually collected*, and a high score still
 * does not publish a story — the hard gates do that (§10).
 *
 *   A. Source credibility              25
 *   B. Independent corroboration       25
 *   C. Visual evidence                 20
 *   D. Claim consistency               15
 *   E. Publication date                10
 *   F. Original source transparency     5
 */

export const SCORE_MAX = {
  source: 25,
  corroboration: 25,
  visual: 20,
  consistency: 15,
  date: 10,
  transparency: 5,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function independentCorroborations(facts: VerificationInput): VerificationInput['corroborations'] {
  const primary = (facts.publisherDomain || '').toLowerCase()
  return facts.corroborations.filter(entry =>
    entry.independent
    && entry.publisherDomain.toLowerCase() !== primary,
  )
}

/**
 * A. Source credibility — 25 points.
 *
 * The registry classifies the domain we *resolved*, not a domain quoted in
 * the article. An official agency scores full marks only for claims inside its
 * own knowledge; a well-known publisher is not auto-maximum; a discovery feed
 * is worth nothing on its own.
 */
export function scoreSource(facts: VerificationInput): { points: number, notes: string[] } {
  const notes: string[] = []
  if (!facts.publisherDomain || !facts.sourceTrust) {
    notes.push('publisher could not be resolved to a known source record')
    return { points: 0, notes }
  }
  if (facts.sourceTrust === 'discovery_only') {
    notes.push('discovery feed (e.g. Google News) carries no credibility of its own')
    return { points: 0, notes }
  }

  let points = facts.sourceCredibilityPoints
  notes.push(`registry trust "${facts.sourceTrust}" → ${points} points`)

  if (facts.sourceIsOfficialAgency && !facts.sourceDirectKnowledge) {
    points = Math.min(points, 18)
    notes.push('official agency but the claim is outside its direct knowledge — capped at 18')
  }
  if (facts.isRumor) {
    points = Math.min(points, 10)
    notes.push('story is marked as rumor/allegation — capped at 10')
  }
  if (facts.isOpinion) {
    points = Math.min(points, 12)
    notes.push('analysis/opinion piece — capped at 12')
  }
  if (!facts.hasAttribution && !facts.sourceIsOfficialAgency && points > 18) {
    points = 18
    notes.push('no named attribution in the article — capped at 18')
  }
  return { points: clamp(points, 0, SCORE_MAX.source), notes }
}

/**
 * B. Independent corroboration — 25 points.
 *
 * Copies of one press release, syndicated feeds and Google News mirrors are
 * collapsed before this runs. One official primary source confirming the claim
 * directly is strong enough on its own; anything else needs independent
 * publishers.
 */
export function scoreCorroboration(facts: VerificationInput): { points: number, notes: string[] } {
  const notes: string[] = []
  if (!facts.sourceFetched) {
    notes.push('original source could not be inspected — corroboration cannot be assessed')
    return { points: 0, notes }
  }
  if (facts.officialPrimaryConfirms) {
    notes.push('official agency confirms the claim directly — primary evidence')
    return { points: SCORE_MAX.corroboration, notes }
  }

  const independent = independentCorroborations(facts)
  const points =
    independent.length >= 3 ? 25
    : independent.length === 2 ? 21
    : independent.length === 1 ? 15
    : 0
  notes.push(
    independent.length === 0
      ? 'no independent source beyond the original publisher'
      : `${independent.length} independent publisher${independent.length === 1 ? '' : 's'} corroborate the claim`,
  )
  if (facts.corroborations.length > independent.length) {
    notes.push(`${facts.corroborations.length - independent.length} candidate link(s) dropped as syndication/duplication`)
  }
  return { points, notes }
}

/** C. Visual evidence — 20 points (see evidence.ts for the per-asset rules). */
export function scoreVisual(visual: VisualEvaluation): { points: number, notes: string[] } {
  const notes = visual.notes.length ? [...visual.notes] : ['best traceable asset assessed against the claim']
  return { points: clamp(visual.points, 0, SCORE_MAX.visual), notes }
}

/**
 * D. Claim consistency — 15 points.
 * Artist identity, event, dates, participants and wording must agree across
 * the article and every supporting source. Unresolved contradictions cost
 * points; ambiguity about *which* artist the story concerns costs points too.
 */
export function scoreConsistency(facts: VerificationInput, visual: VisualEvaluation): { points: number, notes: string[] } {
  const notes: string[] = []
  let points = SCORE_MAX.consistency

  if (facts.contradictions.length > 0) {
    const cost = Math.min(points, facts.contradictions.length * 6)
    points -= cost
    notes.push(`${facts.contradictions.length} unresolved contradiction(s): ${facts.contradictions.join('; ')}`)
  } else {
    notes.push('no contradictions between article, sources and evidence')
  }

  if (facts.artistAmbiguous || !facts.artistId) {
    points -= 5
    notes.push('artist relevance is ambiguous')
  }
  if (facts.claims.length === 0) {
    points -= 5
    notes.push('no material claim was extracted from the article')
  } else {
    notes.push(`${facts.claims.length} claim(s) evaluated for consistency`)
  }
  if (visual.staleDetected) {
    points -= 3
    notes.push('an asset is older than the story it is attached to')
  }
  return { points: clamp(points, 0, SCORE_MAX.consistency), notes }
}

/**
 * E. Publication date — 10 points.
 * The date must come from the publisher's own page. A discovery-feed timestamp
 * is only a hint, and a missing date is worth nothing — it is never replaced
 * with the time we happened to fetch the article.
 */
export function scoreDate(facts: VerificationInput): { points: number, notes: string[] } {
  const notes: string[] = []
  if (!facts.publishedAt) {
    notes.push('no publication date found in the source — left empty, not inferred')
    return { points: 0, notes }
  }
  if (!facts.publishedAtPlausible) {
    notes.push('publication date failed the plausibility check')
    return { points: 0, notes }
  }
  if (facts.publishedAtFromPageMetadata) {
    notes.push(facts.publishedAtHasTime
      ? 'publication timestamp read from publisher page metadata'
      : 'publication date read from publisher page metadata (no clock time published)')
    return { points: SCORE_MAX.date, notes }
  }
  notes.push('publication time comes from the discovery feed only — publisher page metadata not confirmed')
  return { points: 7, notes }
}

/**
 * F. Original source transparency — 5 points.
 * Resolves, belongs to the expected publisher, and was actually read: a
 * headline alone is explicitly not "having read the article".
 */
export function scoreTransparency(facts: VerificationInput): { points: number, notes: string[] } {
  const notes: string[] = []
  if (!facts.sourceFetched || !facts.sourceUrl) {
    notes.push('original source not retrieved')
    return { points: 0, notes }
  }
  if (!facts.sourceUrlResolves) {
    notes.push('original URL does not resolve')
    return { points: 0, notes }
  }
  if (!facts.sourceMatchesPublisher) {
    notes.push('retrieved host does not match the expected publisher')
    return { points: 1, notes }
  }
  if (facts.inspectedBodyLength < 500) {
    notes.push(`only ${facts.inspectedBodyLength} characters of the article were inspectable — headline-level only`)
    return { points: 3, notes }
  }
  notes.push('original URL resolves to the expected publisher and the body was inspected')
  if (!facts.canonicalUrl) notes.push('no canonical URL declared by the page')
  return { points: facts.canonicalUrl ? SCORE_MAX.transparency : 4, notes }
}

export function scoreVerification(
  facts: VerificationInput,
  visual: VisualEvaluation,
): ScoreResult {
  const source = scoreSource(facts)
  const corroboration = scoreCorroboration(facts)
  const visualScore = scoreVisual(visual)
  const consistency = scoreConsistency(facts, visual)
  const date = scoreDate(facts)
  const transparency = scoreTransparency(facts)

  const components: ScoreComponent[] = [
    { key: 'source', label: 'Source credibility', points: source.points, max: SCORE_MAX.source, notes: source.notes },
    { key: 'corroboration', label: 'Independent corroboration', points: corroboration.points, max: SCORE_MAX.corroboration, notes: corroboration.notes },
    { key: 'visual', label: 'Visual evidence', points: visualScore.points, max: SCORE_MAX.visual, notes: visualScore.notes },
    { key: 'consistency', label: 'Claim consistency', points: consistency.points, max: SCORE_MAX.consistency, notes: consistency.notes },
    { key: 'date', label: 'Publication date', points: date.points, max: SCORE_MAX.date, notes: date.notes },
    { key: 'transparency', label: 'Original source transparency', points: transparency.points, max: SCORE_MAX.transparency, notes: transparency.notes },
  ]

  const total = clamp(components.reduce((sum, component) => sum + component.points, 0), 0, 100)
  return { total, components }
}
