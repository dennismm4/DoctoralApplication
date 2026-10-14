import type { Opportunity } from '../types'

const TRI = ['yes', 'no', 'unknown']
const COVERAGE = ['full-international', 'home-plus-waiver', 'home-only', 'partial', 'none', 'unknown']
const MODELS = ['studentship', 'scholarship', 'dtp', 'cdt', 'combination', 'self-funded']
const FIELDS = ['eligibility.international', 'eligibility.ethiopian', 'tuition', 'stipend', 'duration', 'deadline', 'entry', 'english', 'separateApplication', 'supervisorContact', 'documents']
const SOURCE_TYPES = ['official', 'official-pdf', 'third-party', 'search-snippet']
const STEP_TYPES = ['scholarship', 'admissions', 'internal', 'final-form', 'interview', 'outcome', 'other']
const OFFICIAL = ['official', 'official-pdf']

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNullableStr = (v: unknown) => v === null || isStr(v)
const isUrl = (v: unknown) => isStr(v) && /^https:\/\/[^\s]+$/.test(v)
const isDate = (v: unknown) => isStr(v) && !Number.isNaN(new Date(v).getTime())

/**
 * Validate one record. Returns human-readable problems (empty = valid).
 * Beyond shape checks, it enforces the evidence rule: in a researched record every stated gate fact
 * ("yes" or "no") must be backed by official evidence for that field.
 */
export function validateOpportunity(raw: unknown): string[] {
  const errs: string[] = []
  if (typeof raw !== 'object' || raw === null) return ['Record is not an object']
  const o = raw as Record<string, any>
  const id = isStr(o.id) ? o.id : '(no id)'
  const e = (msg: string) => errs.push(`${id}: ${msg}`)

  if (!isStr(o.id) || !/^[a-z0-9-]+$/.test(o.id)) e('id must be kebab-case')
  if (!['researched', 'demo'].includes(o.recordType)) e('recordType must be researched|demo')
  for (const k of ['title', 'university', 'scholarshipName', 'fundingProvider', 'country', 'entryRequirements', 'verificationNotes', 'durationNote', 'startNote'])
    if (!isStr(o[k])) e(`${k} must be a string`)
  for (const k of ['department', 'programme', 'researchGroup', 'minimumDegree']) if (!isNullableStr(o[k])) e(`${k} must be string or null`)
  for (const k of ['subjects', 'themes', 'allowances', 'requiredDocuments', 'selectionStages', 'outstanding'])
    if (!Array.isArray(o[k]) || !o[k].every(isStr)) e(`${k} must be a string array`)
  if (!MODELS.includes(o.fundingModel)) e('invalid fundingModel')
  if (!['high', 'medium', 'low'].includes(o.confidence)) e('invalid confidence')
  if (!isDate(o.lastVerified)) e('lastVerified must be a date or timestamp')
  if (!isDate(o.firstListed)) e('firstListed must be a date')
  if (o.startDate !== null && !isDate(o.startDate)) e('startDate must be a date or null')

  for (const k of ['programmeUrl', 'fundingUrl']) if (o[k] !== null && !isUrl(o[k])) e(`${k} must be an https URL or null`)
  if (!Array.isArray(o.sources)) e('sources must be an array')
  else {
    o.sources.forEach((s: any, i: number) => (!isStr(s?.label) || !isUrl(s?.url)) && e(`sources[${i}] needs label and https url`))
    if (o.recordType === 'researched' && o.sources.length === 0) e('researched records must cite at least one official source')
  }
  if (o.recordType === 'demo') {
    if (!/demo/i.test(o.title)) e('demo records must say DEMO in the title')
    if (o.programmeUrl || o.fundingUrl) e('demo records must not link anywhere')
  }
  if (!Array.isArray(o.supervisors) || !o.supervisors.every((s: any) => isStr(s?.name) && (s.url === null || isUrl(s.url))))
    e('supervisors must be [{name, url|null, themes?}]')

  const el = o.eligibility
  if (!el || !TRI.includes(el.international) || !TRI.includes(el.ethiopian) || !isNullableStr(el.restrictedTo) || !isStr(el.note)) e('eligibility block invalid')
  const t = o.tuition
  if (!t || !COVERAGE.includes(t.coverage) || !TRI.includes(t.internationalFeeCoveredInFull) || !isStr(t.note)) e('tuition block invalid')
  if (t?.coverage === 'full-international' && t.internationalFeeCoveredInFull !== 'yes')
    e('coverage "full-international" requires internationalFeeCoveredInFull = "yes"')
  const s = o.stipend
  if (!s || !TRI.includes(s.provided) || !(s.amount === null || (typeof s.amount === 'number' && s.amount > 0)) || s.currency !== 'GBP') e('stipend block invalid')
  if (s?.provided !== 'yes' && s?.amount != null) e('stipend amount given but provided != "yes"')
  if (!(o.durationYears === null || (typeof o.durationYears === 'number' && o.durationYears > 0 && o.durationYears <= 8))) e('durationYears must be null or 0–8')
  const x = o.extraCosts
  if (!x || !['visa', 'immigrationHealthSurcharge', 'travel', 'relocation', 'dependants'].every((k) => TRI.includes(x[k]))) e('extraCosts block invalid')

  const d = o.deadline
  if (!d || !(d.date === null || isDate(d.date)) || !isStr(d.note) || !Array.isArray(d.steps)) e('deadline block invalid')
  else {
    if (!(d.type === null || ['scholarship', 'admissions', 'internal'].includes(d.type))) e('deadline.type must be scholarship|admissions|internal|null')
    if (d.date && !d.type) e('deadline.type is required when deadline.date is set')
    d.steps.forEach((st: any, i: number) => (!isStr(st?.label) || !isDate(st?.date) || !STEP_TYPES.includes(st?.type)) && e(`deadline.steps[${i}] needs label, date, type`))
  }
  if (!o.english || !isNullableStr(o.english.requirement) || !Array.isArray(o.english.tests)) e('english block invalid')
  for (const k of ['proposalRequired', 'supervisorContactRequired', 'separateScholarshipApplication']) if (!TRI.includes(o[k])) e(`${k} invalid`)

  // Evidence
  if (!Array.isArray(o.selectionCriteria) || !o.selectionCriteria.every((c: any) => isStr(c?.text) && isUrl(c?.url)))
    e('selectionCriteria must be [{text, url (https)}]')
  if (!Array.isArray(o.evidence)) e('evidence must be an array')
  else
    o.evidence.forEach((ev: any, i: number) => {
      if (!FIELDS.includes(ev?.field)) e(`evidence[${i}].field invalid`)
      if (!isStr(ev?.claim) || !ev.claim.trim()) e(`evidence[${i}].claim required`)
      if (!isUrl(ev?.url)) e(`evidence[${i}].url must be https`)
      if (!SOURCE_TYPES.includes(ev?.sourceType)) e(`evidence[${i}].sourceType invalid`)
      if (!isDate(ev?.retrieved)) e(`evidence[${i}].retrieved must be a timestamp`)
    })
  if (!Array.isArray(o.discrepancies) || !o.discrepancies.every((x: any) => isStr(x?.id) && isStr(x?.description) && Array.isArray(x?.urls) && typeof x?.resolved === 'boolean'))
    e('discrepancies must be [{id, description, urls, resolved}]')

  if (o.recordType === 'researched' && Array.isArray(o.evidence)) {
    const has = (f: string) => o.evidence.some((ev: any) => ev.field === f && OFFICIAL.includes(ev.sourceType) && isUrl(ev.url))
    const need: [boolean, string][] = [
      [el?.international !== 'unknown', 'eligibility.international'],
      [el?.ethiopian !== 'unknown', 'eligibility.ethiopian'],
      [t?.internationalFeeCoveredInFull !== 'unknown' || ['full-international', 'home-only', 'partial', 'none'].includes(t?.coverage), 'tuition'],
      [s?.provided !== 'unknown', 'stipend'],
      [o.durationYears != null, 'duration'],
      [!!d?.date, 'deadline'],
    ]
    for (const [stated, field] of need) if (stated && !has(field)) e(`states a value for "${field}" but has no official evidence for it`)
  }
  return errs
}

export function validateDataset(records: unknown): string[] {
  if (!Array.isArray(records)) return ['Dataset must be an array']
  const errs = records.flatMap(validateOpportunity)
  const ids = new Set<string>()
  for (const r of records as Opportunity[]) {
    if (ids.has(r.id)) errs.push(`Duplicate id: ${r.id}`)
    ids.add(r.id)
  }
  return errs
}
