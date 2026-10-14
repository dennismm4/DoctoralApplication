import type { Profile } from '../../types'

/**
 * A single verified, citable fact from the master CV. Documents may only state what these facts say.
 * Each fact has a stable id so a draft can list exactly which facts it used.
 */
export type FactKind =
  | 'identity'
  | 'degree'
  | 'employment'
  | 'project'
  | 'publication'
  | 'skill'
  | 'training'
  | 'achievement'
  | 'language'
  | 'referee'
  | 'research'
  | 'motivation'
  | 'career'
  | 'interest'

export interface SourceFact {
  id: string
  kind: FactKind
  /** Short label for the review panel. */
  label: string
  /** The applicant's own words / data — quoted verbatim in drafts. */
  text: string
  /** Lower-case words used for relevance matching. */
  keywords: string[]
  /** Year used for recency ordering (0 if unknown). */
  year: number
  /** Sub-type, e.g. project kind or publication status. */
  tag?: string
}

const STOP = new Set(
  'the and for with from that this have has had are was were will been into over under about their there which while where when what your you our its also such than then them they these those more most other some very through within without upon onto using used use based including include includes across between among each per not but can may should would could'.split(' '),
)

export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/^-+|-+$/g, ''))
        .filter((w) => w.length > 3 && !STOP.has(w)),
    ),
  ]
}

const yearOf = (s: string) => Number(s.match(/(19|20)\d{2}/)?.[0] ?? 0)

/** All VERIFIED facts in a profile. Unverified entries are excluded entirely. */
export function collectFacts(p: Profile): SourceFact[] {
  const out: SourceFact[] = []
  const add = (f: Omit<SourceFact, 'keywords'> & { keywords?: string[] }) => out.push({ ...f, keywords: f.keywords ?? keywords(`${f.label} ${f.text}`) })

  if (p.fullName.verified && p.fullName.value.trim()) add({ id: 'id:name', kind: 'identity', label: 'Name', text: p.fullName.value.trim(), year: 0 })
  if (p.email.verified && p.email.value.trim()) add({ id: 'id:email', kind: 'identity', label: 'Email', text: p.email.value.trim(), year: 0 })
  if (p.phone.verified && p.phone.value.trim()) add({ id: 'id:phone', kind: 'identity', label: 'Phone', text: p.phone.value.trim(), year: 0 })
  if (p.nationality.verified) add({ id: 'id:nationality', kind: 'identity', label: 'Nationality', text: p.nationality.value, year: 0 })
  if (p.residence.verified) add({ id: 'id:residence', kind: 'identity', label: 'Residence', text: p.residence.value, year: 0 })

  for (const d of p.degrees.filter((x) => x.verified && x.title.trim()))
    add({
      id: `deg:${d.id}`,
      kind: 'degree',
      label: d.title,
      text: [d.title, d.institution, d.country, d.graduationYear, d.classification && `Result: ${d.classification}`, d.dissertation && `Dissertation: ${d.dissertation}`].filter(Boolean).join(' | '),
      year: yearOf(d.graduationYear),
      tag: d.level,
    })
  for (const e of p.employment.filter((x) => x.verified && x.role.trim()))
    add({ id: `emp:${e.id}`, kind: 'employment', label: `${e.role}, ${e.organisation}`, text: [e.summary.trim(), e.location, `${e.start}–${e.end || 'present'}`].filter(Boolean).join(' | '), year: yearOf(e.end || '9999') || yearOf(e.start) })
  for (const x of p.projects.filter((y) => y.verified && y.title.trim()))
    add({ id: `proj:${x.id}`, kind: 'project', label: x.title, text: [x.context, x.role, x.description, x.year].filter(Boolean).join(' — '), year: yearOf(x.year), tag: x.kind })
  for (const x of p.publications.filter((y) => y.verified && y.citation.trim()))
    add({ id: `pub:${x.id}`, kind: 'publication', label: x.citation, text: x.citation, year: yearOf(x.citation), tag: x.status })
  p.skills.forEach((s, i) => s.verified && s.value.trim() && add({ id: `skill:${i}:${s.value.trim().toLowerCase()}`, kind: 'skill', label: s.value.trim(), text: s.value.trim(), year: 0 }))
  for (const x of p.training.filter((y) => y.verified && y.title.trim()))
    add({ id: `train:${x.id}`, kind: 'training', label: x.title, text: [x.provider, x.year, x.description].filter(Boolean).join(' — '), year: yearOf(x.year) })
  for (const x of p.achievements.filter((y) => y.verified && y.title.trim()))
    add({ id: `ach:${x.id}`, kind: 'achievement', label: x.title, text: [x.issuer, x.year, x.description].filter(Boolean).join(' — '), year: yearOf(x.year) })
  for (const t of p.languageTests.filter((x) => x.verified && x.test.trim()))
    add({ id: `lang:${t.id}`, kind: 'language', label: t.test, text: [`${t.test}: overall ${t.overall}`, t.components, t.date].filter(Boolean).join(', '), year: yearOf(t.date), keywords: ['english', 'language', ...keywords(t.test)] })
  for (const r of p.referees.filter((x) => x.verified && x.name.trim()))
    add({ id: `ref:${r.id}`, kind: 'referee', label: r.name, text: [r.name, r.position, r.organisation, r.email].filter(Boolean).join(', '), year: 0 })
  if (p.researchExperience.verified && p.researchExperience.value.trim())
    add({ id: 'research', kind: 'research', label: 'Research experience', text: p.researchExperience.value.trim(), year: 0 })
  if (p.motivation.verified && p.motivation.value.trim()) add({ id: 'motivation', kind: 'motivation', label: 'Motivation', text: p.motivation.value.trim(), year: 0 })
  if (p.careerPlans?.verified && p.careerPlans.value.trim()) add({ id: 'career', kind: 'career', label: 'Career plans', text: p.careerPlans.value.trim(), year: 0 })
  p.researchInterests.forEach((r) => add({ id: `int:${r.toLowerCase()}`, kind: 'interest', label: r, text: r, year: 0 }))
  return out
}

/** Count of entries that exist in the profile but are NOT verified (and so are excluded from documents). */
export function unverifiedCount(p: Profile): number {
  const lists = [p.degrees, p.employment, p.projects, p.publications, p.training, p.achievements, p.languageTests, p.referees] as { verified: boolean }[][]
  return lists.flat().filter((x) => !x.verified).length + p.skills.filter((s) => !s.verified && s.value.trim()).length
}

/** Stable fingerprint of the verified content, used to tell when the master CV is out of date. */
export function fingerprint(p: Profile): string {
  const s = JSON.stringify(collectFacts(p).map((f) => [f.id, f.label, f.text]))
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Split the applicant's text into sentences without changing any words. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|;\s+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ''))
    .filter((s) => s.length > 2)
}

/** Simple synonym expansion so "leadership" can match "led" and "coordinated", etc. */
const EXPAND: Record<string, string[]> = {
  research: ['research', 'dissertation', 'thesis', 'survey', 'study', 'analysis', 'data', 'methods', 'fieldwork', 'interviews', 'questionnaire'],
  potential: ['research', 'dissertation', 'thesis', 'analysis'],
  intellectual: ['degree', 'result', 'dissertation', 'research', 'analysis'],
  academic: ['degree', 'result', 'dissertation', 'master', 'bachelor', 'economics', 'project', 'management'],
  merit: ['degree', 'result', 'achievement'],
  examination: ['result', 'degree', 'cgpa', 'distinction'],
  leadership: ['lead', 'led', 'leader', 'leadership', 'managed', 'coordinated', 'coordinator', 'supervised', 'team', 'chair', 'organised'],
  improving: ['community', 'development', 'public', 'food', 'security', 'volunteer', 'ngo', 'humanitarian', 'livelihoods', 'farmers'],
  lives: ['community', 'development', 'food', 'security', 'volunteer', 'farmers', 'households'],
  commitment: ['volunteer', 'community', 'development'],
  course: ['interest', 'research'],
  references: ['referee'],
  english: ['english', 'ielts', 'toefl', 'language'],
  degree: ['degree', 'bachelor', 'master', 'result'],
  supply: ['supply', 'chain', 'logistics', 'procurement', 'distribution'],
  sustainability: ['sustainability', 'sustainable', 'environment', 'circular', 'waste', 'climate'],
  food: ['food', 'agri', 'agricultural', 'agriculture', 'farmers', 'nutrition'],
  management: ['management', 'project', 'organisation', 'organisational', 'planning', 'governance'],
}

export function expand(words: string[]): string[] {
  return [...new Set(words.flatMap((w) => [w, ...(EXPAND[w] ?? [])]))]
}

/** How strongly a fact relates to a set of target keywords (0 = unrelated). */
export function relevanceScore(f: SourceFact, target: string[]): number {
  if (!target.length) return 0
  const t = new Set(expand(target))
  const hay = `${f.label} ${f.text}`.toLowerCase()
  let score = 0
  for (const w of t) if (w.length > 3 && hay.includes(w)) score += 1
  return score
}
