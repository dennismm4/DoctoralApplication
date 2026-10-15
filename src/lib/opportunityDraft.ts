import type { Opportunity } from '../types'
import type { ExtractedOpportunity } from './ai'

const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55)

/** Convert reviewed metadata to a locally stored opportunity while leaving all funding gates unknown. */
export function makeUnverifiedOpportunity(input: ExtractedOpportunity, sourceUrl: string, retrievedAt: string, overrides: Partial<Pick<Opportunity, 'title' | 'university' | 'department' | 'programme' | 'description' | 'entryRequirements'>> = {}): Opportunity {
  const now = new Date().toISOString()
  const title = overrides.title ?? input.title ?? input.programme ?? 'PhD opportunity (needs review)'
  const university = overrides.university ?? input.university ?? ''
  const id = `local-${slug(`${university}-${title}`) || 'phd'}-${Date.now().toString(36)}`
  return {
    id, recordType: 'researched', title, university,
    description: overrides.description ?? input.description ?? '',
    department: overrides.department ?? input.department ?? null,
    programme: overrides.programme ?? input.programme ?? null,
    subjects: input.researchArea ? [input.researchArea] : [], researchGroup: null,
    themes: input.researchArea ? input.researchArea.split(/[,;|]/).map((x) => x.trim()).filter(Boolean) : [],
    supervisors: input.supervisor ? [{ name: input.supervisor, url: null }] : [],
    programmeUrl: sourceUrl, fundingUrl: null,
    scholarshipName: 'Funding information requires verification', fundingProvider: university || 'Not found',
    country: 'United Kingdom', fundingModel: 'unknown',
    eligibility: { international: 'unknown', ethiopian: 'unknown', restrictedTo: null, note: 'Needs verification against the official source.' },
    tuition: { coverage: 'unknown', internationalFeeCoveredInFull: 'unknown', note: input.fundingDescription || 'Not found — needs verification.' },
    stipend: { provided: 'unknown', amount: null, currency: 'GBP', frequency: null, rateYear: null, note: input.stipendDescription || 'Not found — needs verification.' },
    durationYears: null, durationNote: 'Not found — needs verification.', allowances: [],
    extraCosts: { visa: 'unknown', immigrationHealthSurcharge: 'unknown', travel: 'unknown', relocation: 'unknown', dependants: 'unknown', note: '' },
    deadline: { date: null, type: null, timezone: 'Europe/London', note: input.deadline ? `Extracted deadline (unverified): ${input.deadline}` : 'Not found — needs verification.', steps: [] },
    startDate: null, startNote: input.startDate ? `Extracted start date (unverified): ${input.startDate}` : 'Not found — needs verification.',
    entryRequirements: overrides.entryRequirements ?? input.entryRequirements ?? 'Not found — needs verification.', minimumDegree: null,
    english: { requirement: input.englishRequirement || null, tests: [] },
    requiredDocuments: input.requiredDocuments ?? [], proposalRequired: 'unknown', supervisorContactRequired: 'unknown', separateScholarshipApplication: 'unknown',
    selectionCriteria: [], selectionStages: [], competitionNote: null,
    lastVerified: retrievedAt, firstListed: now.slice(0, 10),
    sources: [{ label: `Retrieved for review on ${new Date(retrievedAt).toLocaleDateString('en-GB')}`, url: sourceUrl }],
    evidence: [], discrepancies: [],
    verificationNotes: 'AI-extracted page details are an unverified draft. Review every field against the original source; no funding or eligibility claim has been confirmed.',
    confidence: 'low', outstanding: ['Confirm all extracted details against the official page.', 'Confirm Ethiopian/international eligibility.', 'Confirm full international tuition coverage and stipend.', 'Confirm funding duration and all application deadlines.'],
  }
}
