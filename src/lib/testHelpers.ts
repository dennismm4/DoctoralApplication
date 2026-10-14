import type { Evidence, EvidenceField, Opportunity } from '../types'

/** Test helpers: a fully evidenced, verified opportunity. Not a real record. */
export const URL = 'https://www.example.ac.uk/funding'
export const ev = (field: EvidenceField, sourceType: Evidence['sourceType'] = 'official'): Evidence => ({ field, claim: 'x', url: URL, sourceType, retrieved: '2026-10-14T12:00:00Z' })
export const ALL_EVIDENCE: Evidence[] = (['eligibility.international', 'eligibility.ethiopian', 'tuition', 'stipend', 'duration', 'deadline'] as EvidenceField[]).map((f) => ev(f))

/** A fully verified, fully funded, open opportunity with complete official evidence. Each test breaks one thing. */
export function base(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'test',
    recordType: 'researched',
    selectionCriteria: [],
    title: 'Test PhD',
    university: 'University of Test',
    department: 'School of Management',
    programme: null,
    subjects: ['Management'],
    researchGroup: null,
    themes: ['food security', 'supply chain management'],
    supervisors: [],
    programmeUrl: null,
    fundingUrl: URL,
    scholarshipName: 'Test Award',
    fundingProvider: 'Test',
    country: 'United Kingdom',
    fundingModel: 'studentship',
    eligibility: { international: 'yes', ethiopian: 'yes', restrictedTo: null, note: '' },
    tuition: { coverage: 'full-international', internationalFeeCoveredInFull: 'yes', note: '' },
    stipend: { provided: 'yes', amount: 21805, currency: 'GBP', frequency: 'per year', rateYear: '2026/27', note: '' },
    durationYears: 3.5,
    durationNote: '',
    allowances: [],
    extraCosts: { visa: 'unknown', immigrationHealthSurcharge: 'unknown', travel: 'unknown', relocation: 'unknown', dependants: 'unknown', note: '' },
    deadline: { date: '2027-01-20T17:00:00Z', type: 'scholarship', timezone: 'Europe/London', note: '', steps: [] },
    startDate: '2027-10-01',
    startNote: '',
    entryRequirements: '',
    minimumDegree: null,
    english: { requirement: null, tests: [] },
    requiredDocuments: [],
    proposalRequired: 'unknown',
    supervisorContactRequired: 'unknown',
    separateScholarshipApplication: 'unknown',
    selectionStages: [],
    competitionNote: null,
    lastVerified: '2026-10-14T12:00:00Z',
    firstListed: '2026-10-14',
    sources: [{ label: 'x', url: URL }],
    evidence: ALL_EVIDENCE,
    discrepancies: [],
    verificationNotes: '',
    confidence: 'high',
    outstanding: [],
    ...over,
  }
}
export const without = (...fields: EvidenceField[]) => ALL_EVIDENCE.filter((e) => !fields.includes(e.field))

