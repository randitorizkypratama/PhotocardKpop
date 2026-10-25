import type { GateId, GateResult, VerificationInput } from './types'
import type { VisualEvaluation } from './evidence'

/**
 * Hard verification gates (§10).
 *
 * A score is a summary, never an authorization: these twelve conditions must
 * *all* pass for a story to become VERIFIED. A gate that cannot be evaluated
 * counts as failed — missing evidence never implies a pass.
 */

export const GATE_ORDER: GateId[] = [
  'relevant_artist',
  'source_accessible',
  'claims_supported',
  'date_verified',
  'has_visual_evidence',
  'visual_supports_story',
  'no_contradiction',
  'not_rumor',
  'not_duplicate',
  'min_score',
  'evidence_complete',
  'auditable',
]

export const GATE_LABELS: Record<GateId, string> = {
  relevant_artist: 'Relevant to a supported artist',
  source_accessible: 'Original source identifiable and accessible',
  claims_supported: 'Material claims have supporting evidence',
  date_verified: 'Publication date verified',
  has_visual_evidence: 'At least one traceable visual asset',
  visual_supports_story: 'Visual evidence supports the story',
  no_contradiction: 'No unresolved material contradiction',
  not_rumor: 'Not an unverified rumor',
  not_duplicate: 'Not a duplicate of an existing story',
  min_score: 'Verification score meets the minimum',
  evidence_complete: 'Required evidence fields complete',
  auditable: 'Verification record reproducible and auditable',
}

function independentCount(facts: VerificationInput): number {
  const primary = (facts.publisherDomain || '').toLowerCase()
  return facts.corroborations.filter(entry => entry.independent && entry.publisherDomain.toLowerCase() !== primary).length
}

export function evaluateGates(
  facts: VerificationInput,
  visual: VisualEvaluation,
  score: number,
  minScore: number,
): GateResult[] {
  const independent = independentCount(facts)

  const checks: Record<GateId, () => { passed: boolean, detail: string }> = {
    relevant_artist: () => ({
      passed: Boolean(facts.artistId) && !facts.artistAmbiguous,
      detail: facts.artistId
        ? (facts.artistAmbiguous ? 'two artists matched with equal strength' : `matched artist "${facts.artistId}"`)
        : 'no supported artist matched with context',
    }),

    source_accessible: () => ({
      passed: Boolean(facts.sourceUrl) && facts.sourceUrlResolves && facts.sourceFetched,
      detail: !facts.sourceUrl
        ? 'no original source URL'
        : !facts.sourceUrlResolves
          ? 'original URL did not resolve'
          : facts.sourceFetched
            ? `original source retrieved (${facts.inspectedBodyLength} chars inspected)`
            : 'original source could not be retrieved or inspected sufficiently',
    }),

    claims_supported: () => ({
      passed: facts.claims.length > 0 && (facts.officialPrimaryConfirms || independent >= 1),
      detail: facts.claims.length === 0
        ? 'no material claim extracted'
        : facts.officialPrimaryConfirms
          ? 'official primary source confirms the claim'
          : independent >= 1
            ? `${independent} independent source(s) support the claim`
            : 'claim rests on a single unconfirmed source',
    }),

    date_verified: () => ({
      passed: Boolean(facts.publishedAt) && facts.publishedAtPlausible && facts.publishedAtFromPageMetadata,
      detail: !facts.publishedAt
        ? 'no publication date in the source'
        : !facts.publishedAtPlausible
          ? 'publication date failed the plausibility check'
          : facts.publishedAtFromPageMetadata
            ? 'publication date confirmed from publisher page metadata'
            : 'publication date only seen in the discovery feed',
    }),

    has_visual_evidence: () => ({
      passed: visual.hasTraceable,
      detail: visual.hasTraceable
        ? 'at least one traceable visual asset recorded'
        : 'no traceable visual evidence',
    }),

    visual_supports_story: () => ({
      passed: visual.supportsClaim,
      detail: visual.supportsClaim
        ? 'visual evidence is tied to this story and its claim'
        : visual.aiGeneratedPresent
          ? 'only AI-generated/manipulated imagery was available'
          : 'images show the artist but do not support the reported event',
    }),

    no_contradiction: () => ({
      passed: facts.contradictions.length === 0,
      detail: facts.contradictions.length === 0
        ? 'no contradictions found'
        : facts.contradictions.join('; '),
    }),

    not_rumor: () => {
      if (facts.injectionDetected) {
        return { passed: false, detail: 'content contains prompt-injection markers and is treated as untrusted' }
      }
      if (facts.isRumor) {
        return { passed: false, detail: 'story is an unverified rumor/allegation' }
      }
      return {
        passed: facts.claims.every(claim => claim.claim_type !== 'rumor'),
        detail: facts.isRumor ? 'rumor' : 'no rumor markers in the extracted claims',
      }
    },

    not_duplicate: () => ({
      passed: !facts.isDuplicate,
      detail: facts.isDuplicate ? 'matches an existing story' : 'no duplicate detected',
    }),

    min_score: () => ({
      passed: score >= minScore,
      detail: `${score} / ${minScore} required`,
    }),

    evidence_complete: () => ({
      passed: facts.evidenceComplete,
      detail: facts.evidenceComplete
        ? 'all required evidence fields present'
        : 'required evidence fields are incomplete',
    }),

    auditable: () => {
      const parts: string[] = []
      if (!facts.publisherDomain) parts.push('publisher domain')
      if (!facts.sourceUrl) parts.push('source url')
      if (!facts.canonicalUrl) parts.push('canonical url')
      if (facts.claims.length === 0) parts.push('claims')
      if (facts.evidence.length === 0) parts.push('evidence records')
      if (!facts.sourceTrust) parts.push('source trust classification')
      return {
        passed: parts.length === 0,
        detail: parts.length === 0 ? 'every field required to reproduce the decision is stored' : `missing: ${parts.join(', ')}`,
      }
    },
  }

  return GATE_ORDER.map((id) => {
    const result = checks[id]()
    return { id, passed: result.passed, detail: result.detail }
  })
}
