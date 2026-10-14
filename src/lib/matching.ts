import type { Assessment, Opportunity, Profile } from '../types'
import { matchedInterests } from './profile'

/**
 * Match scoring. This RANKS opportunities — it never decides eligibility.
 * Funding eligibility is a hard gate applied by the rules engine first: an award with an
 * international tuition shortfall stays in the archive however high its score.
 */

export interface MatchComponent {
  key: 'academic' | 'relevance' | 'nationality' | 'tuition' | 'stipend' | 'deadline' | 'preparation' | 'fit'
  label: string
  points: number
  max: number
  note: string
}

export interface MatchResult {
  score: number
  components: MatchComponent[]
  reasons: string[]
  prepDays: number
  prepStatus: 'comfortable' | 'tight' | 'too-late' | 'unknown'
  /** Only true for verified records — the score alone never makes something a primary result. */
  primary: boolean
}

export interface MatchContext {
  entryMet: boolean | null
  docsDone: number
}

/** Rough working days needed to prepare a strong application from Ethiopia. */
export function estimatePrepDays(op: Opportunity, p: Profile): number {
  let days = 10 // certified transcripts, degree certificates, passport, references
  days += op.proposalRequired === 'yes' ? 21 : op.proposalRequired === 'unknown' ? 10 : 0
  days += op.supervisorContactRequired === 'yes' ? 14 : op.supervisorContactRequired === 'unknown' ? 5 : 0
  days += op.separateScholarshipApplication === 'yes' ? 7 : 0
  days += Math.min(14, Math.max(0, op.requiredDocuments.length - 3) * 4)
  if (!p.languageTests.some((t) => t.verified)) days += 21 // booking and receiving an IELTS/TOEFL result
  return days
}

export function scoreMatch(p: Profile, op: Opportunity, a: Assessment, ctx: MatchContext): MatchResult {
  const components: MatchComponent[] = []
  const reasons: string[] = []
  const push = (c: MatchComponent) => components.push(c)

  // Academic eligibility (15)
  const degreesReady = p.degrees.length >= 2 && p.degrees.every((d) => d.verified && d.classification)
  const academic = ctx.entryMet === true ? 15 : ctx.entryMet === false ? 0 : degreesReady ? 9 : 4
  push({ key: 'academic', label: 'Academic eligibility', points: academic, max: 15, note: ctx.entryMet === true ? 'You confirmed you meet the entry requirements.' : ctx.entryMet === false ? 'You recorded that you do not meet them.' : degreesReady ? 'Results entered — confirm equivalence on the university\'s country page.' : 'Enter and verify your degree results.' })

  // Research relevance (20)
  const matched = matchedInterests(p, op)
  const rel = p.researchInterests.length ? Math.min(1, matched.length / Math.min(4, p.researchInterests.length)) : 0
  push({ key: 'relevance', label: 'Research relevance', points: Math.round(rel * 20), max: 20, note: matched.length ? `Matches: ${matched.join(', ')}` : 'No overlap with your interests.' })
  if (matched.length) reasons.push(`Aligned with your interest in ${matched.slice(0, 3).join(', ')}.`)

  // Nationality (10)
  const nat = a.gate.ethiopian === 'confirmed' && a.gate.international === 'confirmed' ? 10 : a.gate.international === 'confirmed' ? 5 : 0
  push({ key: 'nationality', label: 'Ethiopian / international eligibility', points: nat, max: 10, note: nat === 10 ? 'Confirmed by official evidence.' : 'Not fully confirmed.' })

  // Tuition (15)
  push({ key: 'tuition', label: 'Full international tuition', points: a.gate.tuition === 'confirmed' ? 15 : 0, max: 15, note: a.gate.tuition === 'confirmed' ? 'Confirmed.' : a.gate.tuition === 'failed' ? 'Shortfall — excluded.' : 'Not confirmed.' })
  if (a.gate.tuition === 'confirmed') reasons.push('International tuition is covered in full.')

  // Stipend + duration (10)
  const stip = (a.gate.stipend === 'confirmed' ? 6 : 0) + (a.gate.duration === 'confirmed' ? 4 : 0)
  push({ key: 'stipend', label: 'Stipend and duration', points: stip, max: 10, note: [op.stipend.amount ? `£${op.stipend.amount.toLocaleString('en-GB')}/${op.stipend.frequency === 'per month' ? 'month' : 'yr'}` : 'amount unconfirmed', op.durationYears ? `${op.durationYears} yrs` : 'duration unconfirmed'].join(' · ') })

  // Deadline status (10) + preparation time (10)
  const prepDays = estimatePrepDays(op, p)
  const left = a.daysToDeadline
  let prepStatus: MatchResult['prepStatus'] = 'unknown'
  let dl = 0
  let prep = 0
  if (left == null) dl = 3
  else if (left < 0) prepStatus = 'too-late'
  else {
    dl = a.gate.deadline === 'confirmed' ? 10 : 5
    const ratio = left / prepDays
    prepStatus = ratio >= 1.5 ? 'comfortable' : ratio >= 0.8 ? 'tight' : 'too-late'
    prep = prepStatus === 'comfortable' ? 10 : prepStatus === 'tight' ? 5 : 1
  }
  push({ key: 'deadline', label: 'Deadline status', points: dl, max: 10, note: left == null ? 'Deadline unconfirmed.' : left < 0 ? 'Passed.' : `${left} days left${a.gate.deadline === 'confirmed' ? '' : ' (unconfirmed)'}.` })
  const docsTotal = Math.max(1, op.requiredDocuments.length)
  push({ key: 'preparation', label: 'Preparation time', points: prep, max: 10, note: `~${prepDays} days needed${ctx.docsDone ? `; ${ctx.docsDone}/${docsTotal} documents ready` : ''}. ${prepStatus === 'tight' ? 'Tight — start now.' : prepStatus === 'too-late' ? 'Very unlikely to be ready in time.' : ''}`.trim() })
  if (prepStatus === 'tight') reasons.push('Deadline is tight for the preparation required.')

  // Supervisor / department fit (10)
  const deptText = [op.department, op.programme, ...op.subjects, ...op.supervisors.flatMap((s) => s.themes ?? [])].filter(Boolean).join(' ').toLowerCase()
  const deptHits = p.researchInterests.filter((i) => i.toLowerCase().split(/\s+/).some((w) => w.length > 4 && deptText.includes(w))).length
  const named = op.supervisors.some((s) => s.url)
  const fit = Math.min(10, deptHits * 3 + (named ? 3 : 0))
  push({ key: 'fit', label: 'Supervisor & department fit', points: fit, max: 10, note: named ? 'Named supervisor with profile.' : op.supervisors.length ? 'Supervisor named.' : 'No supervisor identified yet — find one in the department.' })

  const score = components.reduce((s, c) => s + c.points, 0)
  return { score, components, reasons, prepDays, prepStatus, primary: a.verdict === 'verified' }
}
