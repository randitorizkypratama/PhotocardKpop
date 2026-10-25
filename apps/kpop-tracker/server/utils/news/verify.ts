import type {
  GateId,
  NewsStatus,
  VerificationInput,
  VerificationOutcome,
} from './types'
import { evaluateGates, GATE_LABELS } from './gates'
import { evaluateVisualEvidence } from './evidence'
import { scoreVerification } from './scoring'
import { newsConfig } from './config'

export interface VerifyOptions {
  /** Status the record already holds — required to detect revocation. */
  previousStatus?: NewsStatus | null
  /** Overrides VERIFICATION_MIN_SCORE (tests use the default config). */
  minScore?: number
  /** Recheck found the information is stale/superseded → EXPIRED. */
  superseded?: boolean
  /** The event itself has passed and the item is no longer current. */
  expired?: boolean
}

/**
 * The single decision point of the engine (§13.10–13.12).
 *
 * Nothing else in the codebase is allowed to write `VERIFIED`: this function
 * is the deterministic verification service, it re-derives the score from
 * stored facts, applies all twelve hard gates, and produces the audit record
 * in the same call. Callers (including any future AI assist) can only supply
 * *facts*, never a status.
 */
export function verifyCandidate(
  facts: VerificationInput,
  options: VerifyOptions = {},
): VerificationOutcome {
  const minScore = options.minScore ?? newsConfig().minScore
  const previous = options.previousStatus ?? null

  const visual = evaluateVisualEvidence(facts.evidence, {
    articlePublishedAt: facts.publishedAt,
    category: facts.category,
    claimTypes: facts.claims.map(claim => claim.claim_type),
    articleUrl: facts.sourceUrl,
  })

  const breakdown = scoreVerification(facts, visual)
  const gates = evaluateGates(facts, visual, breakdown.total, minScore)
  const failedGates = gates.filter(gate => !gate.passed).map(gate => gate.id)
  const approved = failedGates.length === 0 && breakdown.total >= minScore

  const status = decideStatus({
    facts,
    approved,
    failedGates,
    previous,
    expired: options.expired === true,
    superseded: options.superseded === true,
  })

  const reasons = buildReasons(gates, breakdown.total, minScore, status, previous)

  return {
    status,
    score: breakdown.total,
    breakdown,
    gates,
    failedGates,
    reasons,
    approved: status === 'VERIFIED',
  }
}

interface DecisionInput {
  facts: VerificationInput
  approved: boolean
  failedGates: GateId[]
  previous: NewsStatus | null
  expired: boolean
  superseded: boolean
}

/**
 * Status transitions (§11). Order matters: a credibility conflict outranks a
 * plain rejection, and anything that *was* published and now fails is revoked
 * rather than quietly demoted — the audit trail must show the loss.
 */
export function decideStatus(input: DecisionInput): NewsStatus {
  const { facts, approved, failedGates, previous, expired, superseded } = input

  if (approved) return 'VERIFIED'

  if (failedGates.includes('not_rumor') && facts.injectionDetected) return 'REJECTED'
  if (failedGates.includes('relevant_artist')) return 'REJECTED'
  if (failedGates.includes('not_duplicate')) return 'REJECTED'
  if (facts.contradictions.length > 0) return 'CONFLICTED'
  if (facts.isRumor) return 'REJECTED'

  if (failedGates.includes('source_accessible')) {
    return previous === 'VERIFIED' ? 'REVOKED' : 'FETCH_FAILED'
  }

  if (previous === 'VERIFIED') {
    if (superseded || expired) return 'EXPIRED'
    return 'REVOKED'
  }
  if ((superseded || expired) && previous) return 'EXPIRED'

  if (failedGates.length > 0) return 'PENDING_VERIFICATION'
  return 'PENDING_VERIFICATION'
}

function buildReasons(
  gates: ReturnType<typeof evaluateGates>,
  score: number,
  minScore: number,
  status: NewsStatus,
  previous: NewsStatus | null,
): string[] {
  const failed = gates.filter(gate => !gate.passed)
  const passed = gates.filter(gate => gate.passed)
  const reasons: string[] = []

  if (previous && previous !== status) {
    reasons.push(`status changed from ${previous} to ${status}`)
  }
  reasons.push(`score ${score} (minimum ${minScore})`)
  if (failed.length === 0) {
    reasons.push('every hard gate passed')
  }
  for (const gate of failed) {
    reasons.push(`${GATE_LABELS[gate.id]} — FAILED: ${gate.detail}`)
  }
  for (const gate of passed.slice(0, 4)) {
    reasons.push(`${GATE_LABELS[gate.id]} — ok: ${gate.detail}`)
  }
  return reasons
}

export interface AuditRecord {
  article_id: string
  verification_version: number
  timestamp: string
  sources_inspected: string[]
  claims_evaluated: string[]
  evidence_discovered: string[]
  score_breakdown: Record<string, number>
  failed_gates: GateId[]
  contradictions: string[]
  decision: string
  previous_status: string | null
  new_status: NewsStatus
  reason: string
}

/** §15: every verification attempt leaves a record that explains itself. */
export function buildAuditRecord(input: {
  articleId: string
  verificationVersion: number
  facts: VerificationInput
  outcome: VerificationOutcome
  previousStatus: NewsStatus | null
  timestamp?: string,
}): AuditRecord {
  const { facts, outcome } = input
  const breakdown: Record<string, number> = {}
  for (const component of outcome.breakdown.components) {
    breakdown[component.key] = component.points
  }
  return {
    article_id: input.articleId,
    verification_version: input.verificationVersion,
    timestamp: input.timestamp || new Date().toISOString(),
    sources_inspected: [
      ...(facts.sourceUrl ? [facts.sourceUrl] : []),
      ...facts.corroborations.map(entry => entry.url),
    ],
    claims_evaluated: facts.claims.map(claim => `${claim.subject} / ${claim.predicate} / ${claim.claim_type}`),
    evidence_discovered: facts.evidence.map(item => `${item.evidence_type} @ ${item.source_url}`),
    score_breakdown: breakdown,
    failed_gates: outcome.failedGates,
    contradictions: facts.contradictions,
    decision: outcome.status,
    previous_status: input.previousStatus,
    new_status: outcome.status,
    reason: outcome.reasons.join(' | '),
  }
}
