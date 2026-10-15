/** Three-state answer used everywhere a fact may be unconfirmed. "unknown" is never treated as "yes". */
export type Tri = 'yes' | 'no' | 'unknown'

export type TuitionCoverage =
  | 'full-international' // award terms state the international/overseas fee is paid in full
  | 'home-plus-waiver' // award pays the Home fee and the university waives the international difference
  | 'home-only' // award pays the Home fee only — leaves an international shortfall
  | 'partial' // a fixed contribution towards fees
  | 'none'
  | 'unknown'

export type FundingModel = 'studentship' | 'scholarship' | 'dtp' | 'cdt' | 'combination' | 'self-funded' | 'unknown'

export interface Source {
  label: string
  url: string
}

/** Which gate fact a piece of evidence supports. */
export type EvidenceField =
  | 'eligibility.international'
  | 'eligibility.ethiopian'
  | 'tuition'
  | 'stipend'
  | 'duration'
  | 'deadline'
  | 'entry'
  | 'english'
  | 'separateApplication'
  | 'supervisorContact'
  | 'documents'

/**
 * Only "official" and "official-pdf" evidence can confirm a gate fact.
 * "third-party" (aggregator sites) and "search-snippet" may be recorded as leads but never confirm anything.
 */
export type SourceType = 'official' | 'official-pdf' | 'third-party' | 'search-snippet'

export interface Evidence {
  field: EvidenceField
  /** The claim this evidence supports, in plain words. */
  claim: string
  url: string
  sourceType: SourceType
  /** ISO timestamp the page was read. */
  retrieved: string
  /** Short exact quote from the page, where available. */
  quote?: string
  /** "applicant" = confirmed via the in-app manual verification checklist. */
  addedBy?: 'researcher' | 'applicant'
}

/** Conflicting official statements. An unresolved discrepancy blocks "verified" status. */
export interface Discrepancy {
  id: string
  description: string
  urls: string[]
  resolved: boolean
  resolution?: string
}

export type DeadlineType = 'scholarship' | 'admissions' | 'internal' | 'final-form' | 'interview' | 'outcome' | 'other'

export interface Opportunity {
  id: string
  /** "researched" = compiled from official pages (see evidence). "demo" = illustrative fixture, never a real opportunity. */
  recordType: 'researched' | 'demo'
  /** Published selection criteria, each with its official source. Empty when none are published. */
  selectionCriteria: { text: string; url: string }[]
  /** Set by the archive script when a record is moved out of the active dataset. */
  archivedAt?: string
  archiveReason?: string
  title: string
  university: string
  /** Optional project summary for browser-added opportunity drafts. */
  description?: string
  department: string | null
  programme: string | null
  subjects: string[]
  researchGroup: string | null
  /** Keywords used for relevance matching against the applicant's research interests. */
  themes: string[]
  supervisors: { name: string; url: string | null; themes?: string[] }[]
  programmeUrl: string | null
  fundingUrl: string | null
  scholarshipName: string
  fundingProvider: string
  country: string
  fundingModel: FundingModel
  eligibility: {
    international: Tri
    ethiopian: Tri
    /** e.g. "UK nationals only", "Home fee status only". null when no restriction is stated. */
    restrictedTo: string | null
    note: string
  }
  tuition: {
    coverage: TuitionCoverage
    internationalFeeCoveredInFull: Tri
    note: string
  }
  stipend: {
    provided: Tri
    amount: number | null
    currency: 'GBP'
    frequency: 'per year' | 'per month' | null
    rateYear: string | null
    note: string
  }
  durationYears: number | null
  durationNote: string
  allowances: string[]
  /** Costs that are NOT assumed to be covered unless the award terms say so. */
  extraCosts: {
    visa: Tri
    immigrationHealthSurcharge: Tri
    travel: Tri
    relocation: Tri
    dependants: Tri
    note: string
  }
  deadline: {
    /**
     * The earliest deadline the applicant must meet for the route this record describes. ISO 8601.
     * Date-only values ("2026-12-04") are treated as 23:59 on that day, UK time.
     */
    date: string | null
    /** Whether `date` is the scholarship/funding deadline, the PhD admissions deadline, or a departmental internal deadline. */
    type: 'scholarship' | 'admissions' | 'internal' | null
    timezone: string | null
    note: string
    steps: { label: string; date: string; type: DeadlineType }[]
  }
  startDate: string | null
  startNote: string
  entryRequirements: string
  minimumDegree: string | null
  english: { requirement: string | null; tests: string[] }
  requiredDocuments: string[]
  proposalRequired: Tri
  supervisorContactRequired: Tri
  /** Does the scholarship need its own application, separate from the PhD admissions application? */
  separateScholarshipApplication: Tri
  selectionStages: string[]
  competitionNote: string | null
  lastVerified: string
  firstListed: string
  sources: Source[]
  /** Per-claim evidence. A gate fact counts as confirmed only with official evidence for that field. */
  evidence: Evidence[]
  discrepancies: Discrepancy[]
  verificationNotes: string
  confidence: 'high' | 'medium' | 'low'
  outstanding: string[]
}

/**
 * The six result states. Only "verified" appears in the primary fully funded results.
 * "potential" and "insufficient" go to the review queue. The rest go to the archive.
 */
export type Verdict = 'verified' | 'potential' | 'shortfall' | 'not-eligible' | 'expired' | 'insufficient'

export type ReasonCategory = 'eligibility' | 'funding' | 'deadline' | 'evidence' | 'academic'

export interface Reason {
  level: 'ok' | 'warn' | 'block'
  category: ReasonCategory
  text: string
}

export type GateState = 'confirmed' | 'unconfirmed' | 'failed'

export interface Gate {
  international: GateState
  ethiopian: GateState
  tuition: GateState
  stipend: GateState
  duration: GateState
  deadline: GateState
}

export interface Assessment {
  verdict: Verdict
  reasons: Reason[]
  gate: Gate
  /** 0–100: how much of the full-funding picture is confirmed by official evidence. */
  fundingCertainty: number
  deadline: Date | null
  daysToDeadline: number | null
  stale: boolean
}

/* ---------- Applicant ---------- */

export interface Fact<T = string> {
  value: T
  /** The applicant has confirmed this is accurate. Only verified facts are used in generated documents. */
  verified: boolean
}

export interface Degree {
  id: string
  level: 'Bachelor' | 'Master' | 'Other'
  title: string
  institution: string
  country: string
  graduationYear: string
  classification: string
  dissertation: string
  verified: boolean
}

export interface Employment {
  id: string
  role: string
  organisation: string
  location: string
  start: string
  end: string
  summary: string
  verified: boolean
}

/** Publication status is always shown. Coursework is never a publication — record it as a project. */
export type PublicationStatus = 'published' | 'accepted' | 'under-review' | 'working-paper' | 'conference-presentation'

export interface Publication {
  id: string
  citation: string
  url: string
  status: PublicationStatus
  verified: boolean
}

export type ProjectKind = 'dissertation' | 'research' | 'professional' | 'coursework'

export interface Project {
  id: string
  title: string
  kind: ProjectKind
  context: string
  role: string
  year: string
  description: string
  verified: boolean
}

export interface Training {
  id: string
  title: string
  provider: string
  year: string
  description: string
  verified: boolean
}

export interface Achievement {
  id: string
  title: string
  issuer: string
  year: string
  description: string
  verified: boolean
}

export interface LanguageTest {
  id: string
  test: string
  overall: string
  components: string
  date: string
  verified: boolean
}

export interface Referee {
  id: string
  name: string
  position: string
  organisation: string
  email: string
  relationship: string
  verified: boolean
}

export interface Profile {
  fullName: Fact
  email: Fact
  phone: Fact
  nationality: Fact
  residence: Fact
  targetQualification: string
  destination: string
  fundingRequirement: string
  status: string
  researchInterests: string[]
  degrees: Degree[]
  employment: Employment[]
  skills: Fact[]
  publications: Publication[]
  projects: Project[]
  training: Training[]
  achievements: Achievement[]
  languageTests: LanguageTest[]
  referees: Referee[]
  researchExperience: Fact
  motivation: Fact
  /** Her own plans after the PhD, in her words. */
  careerPlans: Fact
}

/**
 * The approved master CV: a frozen snapshot of the verified profile. Tailoring reads only this.
 * It is replaced only when she approves a new one; tailored drafts never modify it.
 */
export interface MasterCv {
  approvedAt: string
  snapshot: Profile
  /** Fingerprint of the verified profile at approval — used to warn when the profile has changed since. */
  fingerprint: string
  sourceFileName: string | null
}

export const STATUSES = [
  'Interested',
  'Eligibility Check',
  'Research Approval',
  'Preparing Documents',
  'Ready to Apply',
  'Submitted',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const
export type AppStatus = (typeof STATUSES)[number]

export interface Task {
  id: string
  text: string
  due: string
  done: boolean
}

export interface Application {
  id: string
  opportunityId: string
  status: AppStatus
  shortlisted: boolean
  createdAt: string
  updatedAt: string
  submittedOn: string
  personalDeadline: string
  reminders: { id: string; date: string; note: string }[]
  tasks: Task[]
  notes: string
}

export interface TopicProposal {
  id: string
  opportunityId: string | null
  title: string
  questions: string[]
  rationale: string
  contribution: string
  themes: string[]
  status: 'proposed' | 'approved' | 'rejected'
  approvedAt: string | null
  conceptNote: string | null
}

export type DocKind =
  | 'cv'
  | 'academic-cv'
  | 'cover-letter'
  | 'personal-statement'
  | 'research-experience'
  | 'scholarship-essay'
  | 'statement-of-purpose'
  | 'selection-criteria'
  | 'supervisor-email'
  | 'application-answer'
  | 'research-summary'
  | 'concept-note'

/** Which application the document is written for. */
export type DocTarget = 'programme' | 'scholarship' | 'supervisor' | 'form'
export type DocFormat = 'cv' | 'letter' | 'plain' | 'email' | 'form'

export interface RequirementCoverage {
  id: string
  text: string
  /** "official" = taken from the verified opportunity record; "derived" = a sensible requirement inferred from the document type. */
  source: 'official' | 'derived'
  status: 'addressed' | 'placeholder' | 'not-addressed'
  factIds: string[]
}

export interface DocVersion {
  id: string
  n: number
  content: string
  createdAt: string
  generator: 'template' | 'ai' | 'edit'
  note: string
  /** What was prioritised and why (change summary). */
  changes: string[]
  /** Information she should add herself. */
  missing: string[]
  usedFactIds: string[]
  requirements: RequirementCoverage[]
  masterCvApprovedAt: string | null
}

export interface AppDocument {
  id: string
  kind: DocKind
  /** Bound to one opportunity. A document is never reused for another university. */
  opportunityId: string | null
  university: string
  opportunityTitle: string
  target: DocTarget
  format: DocFormat
  title: string
  wordLimit: number | null
  wordLimitSource: 'application' | 'default' | null
  question?: string
  topicId?: string | null
  versions: DocVersion[]
  currentVersionId: string
  status: 'draft' | 'approved' | 'rejected'
  approvedVersionId: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

/** A fact the applicant confirmed from an official page using the manual verification checklist. */
export type CheckKey =
  | 'international'
  | 'ethiopian'
  | 'tuition'
  | 'stipend'
  | 'duration'
  | 'deadline'
  | 'separateApplication'
  | 'supervisorContact'
  | 'entry'
  | 'english'
  | 'discrepancies'

export interface ManualCheck {
  /** Which fact. */
  key: CheckKey
  /** "yes" | "no" | a number (stipend £/yr, duration years) | an ISO date (deadline) | a resolution note. */
  value: string
  url: string
  note: string
  checkedAt: string
}

export interface StoredCv {
  fileName: string
  uploadedAt: string
  /** Original extracted text — kept read-only, never overwritten by edits. */
  originalText: string
}
