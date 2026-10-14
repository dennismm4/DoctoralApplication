import { useMemo, useState } from 'react'
import { matchedInterests } from '../lib/profile'
import { useStore } from '../lib/store'
import type { Assessed } from '../lib/useAssessed'
import { Field, Input, Select } from './ui'

export type Sort = 'match' | 'deadline' | 'relevance' | 'certainty' | 'verified'

export interface FilterState {
  q: string
  within: string
  startYear: string
  minStipend: string
  minDuration: string
  degreeReq: string
  interest: string
  ethiopianOnly: boolean
  sepApp: string
  supervisor: string
  showDismissed: boolean
  sort: Sort
}

export const initialFilters: FilterState = {
  q: '',
  within: 'any',
  startYear: 'any',
  minStipend: '',
  minDuration: 'any',
  degreeReq: 'any',
  interest: 'any',
  ethiopianOnly: false,
  sepApp: 'any',
  supervisor: 'any',
  showDismissed: false,
  sort: 'match',
}

/** Shared search, filter and sort logic for the primary results and the review queue. */
export function useFiltered(items: Assessed[], f: FilterState): Assessed[] {
  const { profile, dismissed } = useStore()
  return useMemo(() => {
    const term = f.q.trim().toLowerCase()
    const list = items.filter(({ op, a }) => {
      if (!f.showDismissed && dismissed.includes(op.id)) return false
      if (term) {
        const hay = [op.title, op.university, op.department, op.programme, op.scholarshipName, op.fundingProvider, op.researchGroup, ...op.subjects, ...op.themes, ...op.supervisors.map((s) => s.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!term.split(/\s+/).every((t) => hay.includes(t))) return false
      }
      if (f.within !== 'any' && (a.daysToDeadline == null || a.daysToDeadline > Number(f.within))) return false
      if (f.startYear !== 'any' && op.startDate?.slice(0, 4) !== f.startYear) return false
      if (f.minStipend && (op.stipend.amount == null || (op.stipend.frequency === 'per month' ? op.stipend.amount * 12 : op.stipend.amount) < Number(f.minStipend))) return false
      if (f.minDuration !== 'any' && (op.durationYears == null || op.durationYears < Number(f.minDuration))) return false
      if (f.degreeReq === 'stated' && !op.minimumDegree) return false
      if (f.degreeReq === 'not-stated' && op.minimumDegree) return false
      if (f.interest !== 'any' && !matchedInterests({ ...profile, researchInterests: [f.interest] }, op).length) return false
      if (f.ethiopianOnly && a.gate.ethiopian !== 'confirmed') return false
      if (f.sepApp !== 'any' && op.separateScholarshipApplication !== f.sepApp) return false
      if (f.supervisor !== 'any' && op.supervisorContactRequired !== f.supervisor) return false
      return true
    })
    const dl = (x: Assessed) => x.a.deadline?.getTime() ?? Infinity
    return list.sort((x, y) => {
      if (f.sort === 'match') return y.match.score - x.match.score || dl(x) - dl(y)
      if (f.sort === 'deadline') return dl(x) - dl(y)
      if (f.sort === 'relevance') return y.relevance - x.relevance || dl(x) - dl(y)
      if (f.sort === 'certainty') return y.a.fundingCertainty - x.a.fundingCertainty || dl(x) - dl(y)
      return y.op.lastVerified.localeCompare(x.op.lastVerified)
    })
  }, [items, f, profile, dismissed])
}

export function FilterPanel({ items, f, set }: { items: Assessed[]; f: FilterState; set: (f: FilterState) => void }) {
  const { profile, settings, setSettings } = useStore()
  const [open, setOpen] = useState(true)
  const years = useMemo(() => [...new Set(items.map((i) => i.op.startDate?.slice(0, 4)).filter(Boolean))].sort() as string[], [items])
  const u = <K extends keyof FilterState>(k: K, v: FilterState[K]) => set({ ...f, [k]: v })
  return (
    <>
      <div className="mb-4">
        <Input value={f.q} onChange={(e) => u('q', e.target.value)} placeholder="Search university, discipline, project, supervisor, scholarship or keyword…" aria-label="Search" className="py-2.5 text-base" />
      </div>
      <details className="mb-5 rounded-lg border border-line bg-surface" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">Filters & sorting</summary>
        <div className="grid grid-cols-2 gap-3 border-t border-line p-4 md:grid-cols-4">
          <Field label="Sort by">
            <Select value={f.sort} onChange={(e) => u('sort', e.target.value as Sort)}>
              <option value="match">Match score</option>
              <option value="deadline">Deadline (soonest)</option>
              <option value="relevance">Relevance to my interests</option>
              <option value="certainty">Funding certainty</option>
              <option value="verified">Date verified</option>
            </Select>
          </Field>
          <Field label="Deadline within">
            <Select value={f.within} onChange={(e) => u('within', e.target.value)}>
              <option value="any">Any time</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">6 months</option>
            </Select>
          </Field>
          <Field label="Start year">
            <Select value={f.startYear} onChange={(e) => u('startYear', e.target.value)}>
              <option value="any">Any</option>
              {years.map((y) => <option key={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Minimum stipend (£/yr)">
            <Input type="number" inputMode="numeric" min={0} step={500} value={f.minStipend} onChange={(e) => u('minStipend', e.target.value)} placeholder="e.g. 20000" />
          </Field>
          <Field label="Minimum funded duration">
            <Select value={f.minDuration} onChange={(e) => u('minDuration', e.target.value)}>
              <option value="any">Any</option>
              <option value="3">3+ years</option>
              <option value="3.5">3.5+ years</option>
              <option value="4">4+ years</option>
            </Select>
          </Field>
          <Field label="Degree requirement">
            <Select value={f.degreeReq} onChange={(e) => u('degreeReq', e.target.value)}>
              <option value="any">Any</option>
              <option value="stated">Minimum grade stated</option>
              <option value="not-stated">Not stated (check)</option>
            </Select>
          </Field>
          <Field label="Research interest">
            <Select value={f.interest} onChange={(e) => u('interest', e.target.value)}>
              <option value="any">Any</option>
              {profile.researchInterests.map((i) => <option key={i}>{i}</option>)}
            </Select>
          </Field>
          <Field label="Separate scholarship application">
            <Select value={f.sepApp} onChange={(e) => u('sepApp', e.target.value)}>
              <option value="any">Any</option>
              <option value="no">Not needed</option>
              <option value="yes">Needed</option>
              <option value="unknown">Unknown</option>
            </Select>
          </Field>
          <Field label="Supervisor contact first">
            <Select value={f.supervisor} onChange={(e) => u('supervisor', e.target.value)}>
              <option value="any">Any</option>
              <option value="no">Not required</option>
              <option value="yes">Required</option>
              <option value="unknown">Unknown</option>
            </Select>
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm md:col-span-3">
            <input type="checkbox" checked={f.ethiopianOnly} onChange={(e) => u('ethiopianOnly', e.target.checked)} className="accent-forest" />
            Only awards with official evidence that Ethiopian applicants are eligible
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.showDismissed} onChange={(e) => u('showDismissed', e.target.checked)} className="accent-forest" />
            Show dismissed
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.showDemo} onChange={(e) => setSettings({ showDemo: e.target.checked })} className="accent-forest" />
            Include illustrative fixtures (fictional, for testing)
          </label>
        </div>
      </details>
    </>
  )
}
