import { useMemo } from 'react'
import type { Assessment, Opportunity } from '../types'
import { assess } from './eligibility'
import { scoreMatch, type MatchResult } from './matching'
import { relevance } from './profile'
import { useStore } from './store'
import { entryMet } from './verification'

export interface Assessed {
  op: Opportunity
  a: Assessment
  relevance: number
  match: MatchResult
}

/** Every opportunity with its rule assessment and gated match score. */
export function useAssessed(): Assessed[] {
  const { opportunities, profile, checks, applications } = useStore()
  return useMemo(() => {
    const now = new Date()
    return opportunities.map((op) => {
      const met = entryMet(checks[op.id])
      const a = assess(op, now, { entryMet: met })
      const app = applications.find((x) => x.opportunityId === op.id)
      const docsDone = app?.tasks.filter((t) => t.done && t.text.startsWith('Document:')).length ?? 0
      return { op, a, relevance: relevance(profile, op), match: scoreMatch(profile, op, a, { entryMet: met, docsDone }) }
    })
  }, [opportunities, profile, checks, applications])
}

export const isNew = (op: Opportunity, days = 14) => Date.now() - new Date(op.firstListed).getTime() < days * 86_400_000

export interface DeadlineAlert {
  id: string
  op: Opportunity
  label: string
  date: Date
  days: number
  level: 'urgent' | 'soon' | 'upcoming'
  prep: MatchResult['prepStatus']
  saved: boolean
}

/**
 * Deadline alerts for verified and review-queue opportunities: every upcoming step (scholarship,
 * admissions, internal) within 45 days, plus the applicant's own reminders handled in the tracker.
 */
export function useDeadlineAlerts(items: Assessed[]): DeadlineAlert[] {
  const { applications, dismissedAlerts } = useStore()
  return useMemo(() => {
    const now = Date.now()
    const out: DeadlineAlert[] = []
    for (const { op, a, match } of items) {
      if (!(a.verdict === 'verified' || a.verdict === 'potential' || a.verdict === 'insufficient')) continue
      const saved = applications.some((x) => x.opportunityId === op.id && !['Submitted', 'Interview', 'Offer', 'Rejected', 'Withdrawn'].includes(x.status))
      const steps = [
        ...(op.deadline.date ? [{ label: `${op.deadline.type ?? 'Main'} deadline`, date: op.deadline.date }] : []),
        ...op.deadline.steps.filter((s) => ['scholarship', 'admissions', 'internal', 'final-form'].includes(s.type)),
      ]
      const seen = new Set<string>()
      for (const s of steps) {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s.date) ? `${s.date}T23:59:00Z` : s.date)
        const days = Math.ceil((d.getTime() - now) / 86_400_000)
        const id = `${op.id}:${s.date}`
        if (days < 0 || days > 45 || seen.has(id) || dismissedAlerts.includes(id)) continue
        seen.add(id)
        out.push({ id, op, label: s.label, date: d, days, level: days <= 7 ? 'urgent' : days <= 21 ? 'soon' : 'upcoming', prep: match.prepStatus, saved })
      }
    }
    return out.sort((x, y) => x.days - y.days)
  }, [items, applications, dismissedAlerts])
}
