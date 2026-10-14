import type { Assessment, EvidenceField, Gate, GateState, Opportunity, Reason, ReasonCategory, Tri, Verdict } from '../types'

const DAY = 86_400_000

/** A verification older than this is treated as stale: the record drops to the review queue until re-checked. */
export const STALE_DAYS = 120

/* ---------------- Dates ---------------- */

/**
 * Parse a deadline. Date-only strings ("2026-12-04") mean the end of that day in UK time
 * (GMT in winter, BST between the last Sundays of March and October).
 */
export function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    const offset = isUkSummerTime(y, m, d) ? 1 : 0
    return new Date(Date.UTC(y, m - 1, d, 23 - offset, 59, 0))
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function lastSunday(year: number, monthIndex: number): number {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0))
  return last.getUTCDate() - last.getUTCDay()
}

function isUkSummerTime(y: number, m: number, d: number): boolean {
  const start = Date.UTC(y, 2, lastSunday(y, 2))
  const end = Date.UTC(y, 9, lastSunday(y, 9))
  const t = Date.UTC(y, m - 1, d)
  return t >= start && t < end
}

export function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY)
}

export function isExpired(op: Opportunity, now: Date): boolean {
  const deadline = parseDeadline(op.deadline.date)
  if (deadline) return deadline.getTime() < now.getTime()
  // No deadline recorded: if the programme start has already passed, the round is over.
  const start = parseDeadline(op.startDate)
  return start ? start.getTime() < now.getTime() : false
}

export function isStale(op: Opportunity, now: Date): boolean {
  const v = new Date(op.lastVerified)
  return Number.isNaN(v.getTime()) || now.getTime() - v.getTime() > STALE_DAYS * DAY
}

/* ---------------- Evidence ---------------- */

const OFFICIAL = new Set(['official', 'official-pdf'])

/** True when at least one official https source supports this field. Aggregators and search snippets never count. */
export function hasOfficialEvidence(op: Opportunity, field: EvidenceField): boolean {
  return (op.evidence ?? []).some((e) => e.field === field && OFFICIAL.has(e.sourceType) && /^https:\/\//.test(e.url))
}

/** A stated "yes"/"no" without official evidence is treated as "unknown". */
export function evidenced(value: Tri, op: Opportunity, field: EvidenceField): Tri {
  return value !== 'unknown' && hasOfficialEvidence(op, field) ? value : 'unknown'
}

/** True only when official evidence confirms the international fee is paid in full. */
export function internationalTuitionConfirmed(op: Opportunity): boolean {
  const { coverage, internationalFeeCoveredInFull } = op.tuition
  return (
    internationalFeeCoveredInFull === 'yes' &&
    (coverage === 'full-international' || coverage === 'home-plus-waiver') &&
    hasOfficialEvidence(op, 'tuition')
  )
}

export interface AssessOptions {
  /** From the applicant's manual checklist: true = confirmed she meets entry requirements, false = confirmed she does not. */
  entryMet?: boolean | null
}

/**
 * Core rule engine. Funding eligibility is a gate, never a score.
 *
 *   1. not-eligible  — nationality/residence/fee-status rules exclude her, or non-UK, or entry requirements not met
 *   2. shortfall     — self-funded, tuition-only, Home-fee-only, partial, or no stipend
 *   3. expired       — the deadline has passed
 *   4. insufficient  — two or more core facts lack official evidence, or no official source at all
 *   5. potential     — one or more facts still need confirming (or a discrepancy / stale verification)
 *   6. verified      — every gate fact confirmed by official evidence
 *
 * A "yes" without official evidence counts as unknown. Labels like "fully funded" in a title are ignored.
 */
export function assess(op: Opportunity, now: Date = new Date(), opts: AssessOptions = {}): Assessment {
  const reasons: Reason[] = []
  const add = (level: Reason['level'], category: ReasonCategory, text: string) => reasons.push({ level, category, text })

  /* --- 1. Eligibility --- */
  let notEligible = false
  const block = (cat: ReasonCategory, text: string) => {
    add('block', cat, text)
    if (cat === 'eligibility' || cat === 'academic') notEligible = true
  }
  if (op.country.trim().toLowerCase() !== 'united kingdom') block('eligibility', `Not a UK institution (${op.country}).`)
  if (op.eligibility.restrictedTo) block('eligibility', `Restricted to: ${op.eligibility.restrictedTo}.`)
  if (opts.entryMet === false) block('academic', 'You recorded that you do not meet the academic entry requirements.')

  const intl = evidenced(op.eligibility.international, op, 'eligibility.international')
  const eth = evidenced(op.eligibility.ethiopian, op, 'eligibility.ethiopian')
  const gate: Gate = {
    international: 'unconfirmed',
    ethiopian: 'unconfirmed',
    tuition: 'unconfirmed',
    stipend: 'unconfirmed',
    duration: 'unconfirmed',
    deadline: 'unconfirmed',
  }

  if (op.eligibility.international === 'no') {
    block('eligibility', 'International applicants are not eligible.')
    gate.international = 'failed'
  } else if (intl === 'yes') {
    add('ok', 'eligibility', 'Open to international applicants (official evidence).')
    gate.international = 'confirmed'
  } else {
    add('warn', 'evidence', op.eligibility.international === 'yes' ? 'International eligibility is claimed but has no official evidence recorded.' : 'International eligibility is not verified.')
  }

  if (op.eligibility.ethiopian === 'no') {
    block('eligibility', 'Ethiopian nationals are not eligible for this award.')
    gate.ethiopian = 'failed'
  } else if (eth === 'yes') {
    add('ok', 'eligibility', 'Ethiopian applicants are eligible (official evidence).')
    gate.ethiopian = 'confirmed'
  } else {
    add('warn', 'evidence', op.eligibility.ethiopian === 'yes' ? 'Ethiopian eligibility is claimed but has no official evidence recorded.' : 'Eligibility for Ethiopian nationals is not confirmed.')
  }

  /* --- 2. Funding --- */
  let shortfall = false
  const fund = (text: string) => {
    add('block', 'funding', text)
    shortfall = true
  }
  if (op.fundingModel === 'self-funded') fund('Self-funded PhD — no funding attached.')

  const { coverage, internationalFeeCoveredInFull: feeFull } = op.tuition
  if (coverage === 'none') fund('Tuition fees are not covered.')
  else if (coverage === 'partial' && feeFull !== 'yes') fund('Only a partial fee contribution — leaves an international tuition shortfall.')
  else if (coverage === 'home-only' && feeFull !== 'yes') fund('Covers the Home fee only — leaves an international tuition shortfall.')
  else if (feeFull === 'no') fund('The international tuition fee is not covered in full.')
  if (shortfall && gate.tuition === 'unconfirmed' && op.fundingModel !== 'self-funded') gate.tuition = 'failed'
  if (op.fundingModel === 'self-funded') gate.tuition = 'failed'

  if (gate.tuition !== 'failed') {
    if (internationalTuitionConfirmed(op)) {
      add('ok', 'funding', 'International tuition fee covered in full (official evidence).')
      gate.tuition = 'confirmed'
    } else if (feeFull === 'yes' || coverage === 'full-international') {
      add('warn', 'evidence', 'Full international tuition coverage is claimed but has no official evidence recorded.')
    } else if (coverage === 'home-plus-waiver') {
      add('warn', 'funding', 'Award pays the Home fee; a university waiver of the international difference is not confirmed.')
    } else {
      add('warn', 'funding', 'Full coverage of the international tuition fee is not verified.')
    }
  }

  if (op.stipend.provided === 'no') {
    fund('No living stipend — tuition-only awards are excluded.')
    gate.stipend = 'failed'
  } else if (evidenced(op.stipend.provided, op, 'stipend') !== 'yes') {
    add('warn', 'evidence', op.stipend.provided === 'yes' ? 'A stipend is claimed but has no official evidence recorded.' : 'A living stipend is not verified.')
  } else if (op.stipend.amount == null) {
    add('warn', 'funding', 'A stipend is confirmed but the amount is not verified.')
  } else {
    add('ok', 'funding', `Stipend £${op.stipend.amount.toLocaleString('en-GB')} ${op.stipend.frequency ?? ''}${op.stipend.rateYear ? ` (${op.stipend.rateYear} rate)` : ''}.`)
    gate.stipend = 'confirmed'
  }

  if (op.durationYears != null && hasOfficialEvidence(op, 'duration')) gate.duration = 'confirmed'
  else add('warn', 'funding', 'Funded duration is not verified.')

  /* --- 3. Deadline --- */
  const deadline = parseDeadline(op.deadline.date)
  const daysToDeadline = deadline ? daysUntil(deadline, now) : null
  const expired = isExpired(op, now)
  if (expired) {
    gate.deadline = 'failed'
  } else if (!deadline) {
    add('warn', 'deadline', 'Application deadline is not verified.')
  } else if (!hasOfficialEvidence(op, 'deadline')) {
    add('warn', 'evidence', 'Deadline has no official evidence recorded.')
  } else {
    gate.deadline = 'confirmed'
    if (op.deadline.type === 'admissions' && !op.deadline.steps.some((s) => s.type === 'scholarship'))
      add('warn', 'deadline', 'Only the PhD admissions deadline is known — the scholarship deadline may be earlier.')
  }

  /* --- 4. Other evidence quality --- */
  const unresolved = (op.discrepancies ?? []).filter((d) => !d.resolved)
  for (const d of unresolved) add('warn', 'evidence', `Conflicting official information — manual review needed: ${d.description}`)
  const stale = isStale(op, now)
  if (stale) add('warn', 'evidence', `Last verified more than ${STALE_DAYS} days ago — re-check the official pages.`)
  if (op.recordType === 'demo') add('warn', 'evidence', 'Illustrative fixture — not a real opportunity.')
  const officialSources = (op.evidence ?? []).filter((e) => OFFICIAL.has(e.sourceType)).length

  // Core facts: international eligibility, Ethiopian eligibility, international tuition, stipend provided.
  const stipendProvidedConfirmed = evidenced(op.stipend.provided, op, 'stipend') === 'yes'
  const coreUnconfirmed = [gate.international === 'confirmed', gate.ethiopian === 'confirmed', gate.tuition === 'confirmed', stipendProvidedConfirmed].filter((c) => !c).length

  const fundingCertainty = scoreCertainty(op, gate)

  let verdict: Verdict
  if (notEligible) verdict = 'not-eligible'
  else if (shortfall) verdict = 'shortfall'
  else if (expired) {
    verdict = 'expired'
    reasons.unshift({ level: 'block', category: 'deadline', text: 'The application deadline has passed.' })
  } else if (officialSources === 0 || coreUnconfirmed >= 2) {
    verdict = 'insufficient'
    reasons.unshift({ level: 'warn', category: 'evidence', text: `Insufficient official evidence: ${coreUnconfirmed} of 4 core funding/eligibility facts are unconfirmed.` })
  } else if (reasons.some((r) => r.level === 'warn')) verdict = 'potential'
  else verdict = 'verified'

  return { verdict, reasons, gate, fundingCertainty, deadline, daysToDeadline, stale }
}

/** Weighted share of the full-funding facts confirmed by official evidence. */
export function scoreCertainty(op: Opportunity, gate?: Gate): number {
  const g = gate ?? assessGateOnly(op)
  let score = 0
  if (g.tuition === 'confirmed') score += 35
  if (g.stipend === 'confirmed') score += 25
  else if (evidenced(op.stipend.provided, op, 'stipend') === 'yes') score += 12
  if (g.international === 'confirmed') score += 15
  if (g.ethiopian === 'confirmed') score += 5
  if (g.duration === 'confirmed') score += 10
  if (g.deadline === 'confirmed') score += 10
  return score
}

function assessGateOnly(op: Opportunity): Gate {
  return assess(op, new Date(0)).gate
}

/** Primary results: verified only. */
export const isPrimary = (a: Assessment) => a.verdict === 'verified'
/** Review queue: potential matches and records lacking evidence. */
export const isReview = (a: Assessment) => a.verdict === 'potential' || a.verdict === 'insufficient'
/** Archive: shortfall, not eligible, deadline passed. */
export const isArchived = (a: Assessment) => a.verdict === 'shortfall' || a.verdict === 'not-eligible' || a.verdict === 'expired'
/** Anything she could still act on (primary or review). */
export const isActionable = (a: Assessment) => isPrimary(a) || isReview(a)

export const VERDICT_LABEL: Record<Verdict, string> = {
  verified: 'Verified fully funded & eligible',
  potential: 'Potential match — confirm eligibility',
  insufficient: 'Insufficient evidence',
  shortfall: 'Funding shortfall / partial',
  'not-eligible': 'Not eligible',
  expired: 'Deadline passed',
}

export const GATE_LABEL: Record<keyof Gate, string> = {
  international: 'International applicants',
  ethiopian: 'Ethiopian nationals',
  tuition: 'International tuition in full',
  stipend: 'Living stipend (amount)',
  duration: 'Funded duration',
  deadline: 'Deadline',
}

export type { GateState }
