import type { Fact, Opportunity, Profile } from '../types'

export const uid = () => Math.random().toString(36).slice(2, 10)
const fact = (value = '', verified = false): Fact => ({ value, verified })

export const RESEARCH_AREAS = [
  'Management',
  'Supply Chain Management',
  'Food Sustainability',
  'Food Security',
  'Food Waste Reduction',
  'Organisational Sustainability in Agri-food Systems',
  'Agricultural Economics',
  'Sustainable Procurement',
  'Circular Economy',
  'Food Policy',
  'Climate Resilience',
]

/** Initial profile: only the facts given in the brief. Everything else is left blank for the applicant. */
/** Fill in fields added in later versions so older saved profiles keep working. */
export function normalizeProfile(p: Partial<Profile> | undefined): Profile {
  const d = defaultProfile()
  const merged = { ...d, ...(p ?? {}) } as Profile
  merged.publications = (merged.publications ?? []).map((x) => ({ ...x, status: x.status ?? 'published' }))
  return merged
}

export function defaultProfile(): Profile {
  return {
    fullName: fact(),
    email: fact(),
    phone: fact(),
    nationality: fact('Ethiopian', true),
    residence: fact('Ethiopia', true),
    targetQualification: 'PhD / doctorate',
    destination: 'United Kingdom only',
    fundingRequirement: 'Full funding is mandatory',
    status: 'Actively searching for suitable opportunities',
    researchInterests: [...RESEARCH_AREAS],
    degrees: [
      { id: uid(), level: 'Bachelor', title: 'BSc in Economics', institution: '', country: 'Ethiopia', graduationYear: '', classification: '', dissertation: '', verified: false },
      { id: uid(), level: 'Master', title: 'MSc in Project Management', institution: '', country: 'Ethiopia', graduationYear: '', classification: '', dissertation: '', verified: false },
    ],
    employment: [],
    skills: [],
    publications: [],
    projects: [],
    training: [],
    achievements: [],
    languageTests: [],
    referees: [],
    researchExperience: fact(),
    motivation: fact(),
    careerPlans: fact(),
  }
}

export interface CompletenessItem {
  label: string
  done: boolean
  hint: string
}

export function completeness(p: Profile): { percent: number; items: CompletenessItem[] } {
  const items: CompletenessItem[] = [
    { label: 'Full name', done: !!p.fullName.value && p.fullName.verified, hint: 'Add and confirm your name.' },
    { label: 'Contact email', done: !!p.email.value && p.email.verified, hint: 'Add and confirm an email address.' },
    { label: 'Degree institutions', done: p.degrees.length > 0 && p.degrees.every((d) => !!d.institution), hint: 'Enter the exact institution for each degree.' },
    { label: 'Graduation years', done: p.degrees.length > 0 && p.degrees.every((d) => !!d.graduationYear), hint: 'Enter graduation years.' },
    { label: 'Degree results', done: p.degrees.length > 0 && p.degrees.every((d) => !!d.classification), hint: 'Enter your CGPA or classification exactly as on your transcript.' },
    { label: 'Degrees confirmed', done: p.degrees.length > 0 && p.degrees.every((d) => d.verified), hint: 'Tick "verified" on each degree.' },
    { label: 'Employment history', done: p.employment.some((e) => e.verified), hint: 'Add at least one confirmed role (or skip if none).' },
    { label: 'English-language test', done: p.languageTests.some((t) => t.verified), hint: 'Most UK awards require IELTS/TOEFL or an exemption.' },
    { label: 'Referees', done: p.referees.filter((r) => r.verified).length >= 2, hint: 'Most applications need two academic referees.' },
    { label: 'Research experience', done: !!p.researchExperience.value && p.researchExperience.verified, hint: 'Describe your Master’s dissertation or other research.' },
    { label: 'Skills', done: p.skills.some((s) => s.verified), hint: 'List confirmed skills (methods, software).' },
    { label: 'Motivation', done: !!p.motivation.value && p.motivation.verified, hint: 'Write a short, confirmed motivation statement.' },
  ]
  const percent = Math.round((items.filter((i) => i.done).length / items.length) * 100)
  return { percent, items }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')

/** Which of the applicant's interests appear in the opportunity's themes, subjects or title. */
export function matchedInterests(p: Profile, op: Opportunity): string[] {
  const hay = norm([op.title, ...op.themes, ...op.subjects, op.department ?? '', op.programme ?? ''].join(' '))
  return p.researchInterests.filter((interest) => {
    const words = norm(interest).split(' ').filter((w) => w.length > 3 && !['systems', 'organisational'].includes(w))
    if (hay.includes(norm(interest).trim())) return true
    return words.length > 0 && words.every((w) => hay.includes(w))
  })
}

export function relevance(p: Profile, op: Opportunity): number {
  if (p.researchInterests.length === 0) return 0
  return Math.round((matchedInterests(p, op).length / p.researchInterests.length) * 100)
}
