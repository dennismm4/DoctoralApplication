import type { Assessment, CheckKey, Evidence, EvidenceField, ManualCheck, Opportunity } from '../types'
import { hasOfficialEvidence, parseDeadline } from './eligibility'

/**
 * Manual verification checklist.
 *
 * For each record the app lists the facts that still need confirming. The applicant opens the
 * official page, records what it says and the exact https URL. Confirmed facts are applied to the
 * record as evidence (addedBy: "applicant") and the rules engine re-evaluates it. Nothing is
 * accepted without an official URL. The confirmations can be exported as a patch for the dataset.
 */

export interface CheckItem {
  key: CheckKey
  label: string
  question: string
  /** What kind of answer is expected. */
  input: 'yesno' | 'amount' | 'years' | 'date' | 'resolve'
  status: 'confirmed' | 'needed' | 'failed' | 'optional'
  /** Where to look first. */
  lookAt: string | null
  current: string
  /** URL is mandatory for facts about the award; optional for facts about the applicant herself. */
  needsUrl: boolean
}

export function checklistFor(op: Opportunity, a: Assessment, checks: ManualCheck[] = []): CheckItem[] {
  const look = op.fundingUrl ?? op.programmeUrl
  const done = (k: CheckKey) => checks.some((c) => c.key === k)
  const st = (g: 'confirmed' | 'unconfirmed' | 'failed') => (g === 'confirmed' ? 'confirmed' : g === 'failed' ? 'failed' : 'needed')
  const items: CheckItem[] = [
    { key: 'international', label: 'International applicants eligible', question: 'Does the official page say international (overseas) applicants can apply?', input: 'yesno', status: st(a.gate.international), lookAt: look, current: op.eligibility.note, needsUrl: true },
    { key: 'ethiopian', label: 'Ethiopian nationals eligible', question: 'Is there any nationality, country-list or residence restriction that excludes Ethiopian citizens living in Ethiopia?', input: 'yesno', status: st(a.gate.ethiopian), lookAt: look, current: op.eligibility.note, needsUrl: true },
    { key: 'tuition', label: 'International tuition covered in full', question: 'Do the award terms pay the full international/overseas fee (or explicitly waive the difference above the Home fee)?', input: 'yesno', status: st(a.gate.tuition), lookAt: op.fundingUrl, current: op.tuition.note, needsUrl: true },
    { key: 'stipend', label: 'Stipend amount', question: 'What annual living stipend (£ per year) is stated?', input: 'amount', status: st(a.gate.stipend), lookAt: op.fundingUrl, current: op.stipend.amount ? `£${op.stipend.amount}` : op.stipend.note, needsUrl: true },
    { key: 'duration', label: 'Funded duration', question: 'For how many years is funding provided?', input: 'years', status: st(a.gate.duration), lookAt: op.fundingUrl, current: op.durationYears ? `${op.durationYears} years` : op.durationNote, needsUrl: true },
    { key: 'deadline', label: 'Scholarship deadline', question: 'What is the scholarship / funding deadline (not just the admissions deadline)?', input: 'date', status: st(a.gate.deadline), lookAt: look, current: op.deadline.note, needsUrl: true },
    { key: 'separateApplication', label: 'Separate scholarship application', question: 'Is a separate scholarship application needed in addition to the PhD application?', input: 'yesno', status: op.separateScholarshipApplication !== 'unknown' && hasOfficialEvidence(op, 'separateApplication') ? 'confirmed' : 'optional', lookAt: look, current: op.separateScholarshipApplication, needsUrl: true },
    { key: 'supervisorContact', label: 'Supervisor contact before applying', question: 'Must she contact or secure a supervisor before applying?', input: 'yesno', status: op.supervisorContactRequired !== 'unknown' && hasOfficialEvidence(op, 'supervisorContact') ? 'confirmed' : 'optional', lookAt: op.programmeUrl, current: op.supervisorContactRequired, needsUrl: true },
    { key: 'entry', label: 'She meets academic entry requirements', question: `Do her BSc and MSc results meet "${op.entryRequirements || op.minimumDegree || 'the entry requirements'}"? Check the university's country page for Ethiopia.`, input: 'yesno', status: done('entry') ? 'confirmed' : 'needed', lookAt: op.programmeUrl, current: op.minimumDegree ?? '', needsUrl: false },
    { key: 'english', label: 'She meets the English requirement', question: `Does her English test/exemption meet: ${op.english.requirement ?? 'the course requirement'}?`, input: 'yesno', status: done('english') ? 'confirmed' : 'optional', lookAt: op.programmeUrl, current: op.english.requirement ?? '', needsUrl: false },
  ]
  const unresolved = (op.discrepancies ?? []).filter((d) => !d.resolved)
  if (unresolved.length)
    items.push({ key: 'discrepancies', label: 'Resolve conflicting information', question: unresolved.map((d) => d.description).join(' · '), input: 'resolve', status: 'needed', lookAt: unresolved[0].urls[0] ?? look, current: '', needsUrl: true })
  return items
}

export function validateCheck(item: Pick<CheckItem, 'input' | 'needsUrl'>, value: string, url: string): string | null {
  if (item.needsUrl && !/^https:\/\/\S+\.\S+/.test(url.trim())) return 'Enter the official https:// page where you confirmed this.'
  if (item.needsUrl && /google\.|bing\.|duckduckgo|scholarship(s)?(roar|central|sforafricans)|opportunitiesforyouth|afterschoolafrica|indiascholarships|studyabroad\.pk/i.test(url))
    return 'Use the university or funder\'s own page — search results and scholarship aggregator sites are not accepted as evidence.'
  if (item.input === 'yesno' && !['yes', 'no'].includes(value)) return 'Choose yes or no.'
  if (item.input === 'amount' && value !== 'no' && !(Number(value) >= 1000 && Number(value) <= 100000)) return 'Enter the annual amount in £ (e.g. 21805), or "no" if no stipend.'
  if (item.input === 'years' && !(Number(value) > 0 && Number(value) <= 8)) return 'Enter the number of years (e.g. 3.5).'
  if (item.input === 'date' && !parseDeadline(value)) return 'Enter a valid date.'
  if (item.input === 'resolve' && !value.trim()) return 'Describe how the conflict was resolved.'
  return null
}

const FIELD_OF: Partial<Record<CheckKey, EvidenceField>> = {
  international: 'eligibility.international',
  ethiopian: 'eligibility.ethiopian',
  tuition: 'tuition',
  stipend: 'stipend',
  duration: 'duration',
  deadline: 'deadline',
  separateApplication: 'separateApplication',
  supervisorContact: 'supervisorContact',
  entry: 'entry',
  english: 'english',
}

/** Return a copy of the record with the applicant's confirmed facts applied as evidence. */
export function applyManualChecks(op: Opportunity, checks: ManualCheck[] | undefined): Opportunity {
  if (!checks?.length) return op
  const next: Opportunity = structuredClone(op)
  const evidence: Evidence[] = [...next.evidence]
  for (const c of checks) {
    const v = c.value.trim()
    switch (c.key) {
      case 'international':
        next.eligibility.international = v as 'yes' | 'no'
        break
      case 'ethiopian':
        next.eligibility.ethiopian = v as 'yes' | 'no'
        break
      case 'tuition':
        if (v === 'yes') {
          next.tuition.internationalFeeCoveredInFull = 'yes'
          if (!['full-international', 'home-plus-waiver'].includes(next.tuition.coverage)) next.tuition.coverage = 'full-international'
        } else {
          next.tuition.internationalFeeCoveredInFull = 'no'
          if (next.tuition.coverage === 'unknown' || next.tuition.coverage === 'full-international') next.tuition.coverage = 'home-only'
        }
        break
      case 'stipend':
        if (v === 'no') Object.assign(next.stipend, { provided: 'no', amount: null })
        else Object.assign(next.stipend, { provided: 'yes', amount: Number(v), frequency: 'per year', rateYear: next.stipend.rateYear ?? 'confirmed by applicant' })
        break
      case 'duration':
        next.durationYears = Number(v)
        break
      case 'deadline':
        next.deadline = { ...next.deadline, date: v, type: 'scholarship' }
        break
      case 'separateApplication':
        next.separateScholarshipApplication = v as 'yes' | 'no'
        break
      case 'supervisorContact':
        next.supervisorContactRequired = v as 'yes' | 'no'
        break
      case 'discrepancies':
        next.discrepancies = next.discrepancies.map((d) => (d.resolved ? d : { ...d, resolved: true, resolution: `Applicant: ${v}` }))
        break
    }
    const field = FIELD_OF[c.key]
    if (field && c.url)
      evidence.push({ field, claim: `${c.note ? `${c.note} — ` : ''}confirmed by applicant: ${v}`, url: c.url, sourceType: 'official', retrieved: c.checkedAt, addedBy: 'applicant' })
  }
  next.evidence = evidence
  const latest = checks.map((c) => c.checkedAt).sort().at(-1)
  if (latest && latest > next.lastVerified) next.lastVerified = latest
  return next
}

/** Entry-requirement answer from the checklist: true, false, or null if not answered. */
export function entryMet(checks: ManualCheck[] | undefined): boolean | null {
  const c = checks?.find((x) => x.key === 'entry')
  return c ? c.value === 'yes' : null
}
