import type { DocFormat, DocKind, DocTarget, Opportunity, RequirementCoverage } from '../../types'
import { expand, keywords, relevanceScore, type SourceFact } from './facts'

export interface Requirement {
  id: string
  text: string
  source: 'official' | 'derived'
  keywords: string[]
  /** Fact kinds that can genuinely evidence this requirement. */
  kinds: SourceFact['kind'][]
  url?: string
}

export const KIND_LABEL: Record<DocKind, string> = {
  cv: 'Tailored CV',
  'academic-cv': 'Academic CV',
  'cover-letter': 'Cover letter',
  'personal-statement': 'Personal statement',
  'research-experience': 'Research experience statement',
  'scholarship-essay': 'Scholarship essay',
  'statement-of-purpose': 'Statement of purpose',
  'selection-criteria': 'Responses to selection criteria',
  'supervisor-email': 'Supervisor enquiry email',
  'application-answer': 'Application form answer',
  'research-summary': 'Research summary / abstract',
  'concept-note': 'Concept note',
}

export const KIND_FORMAT: Record<DocKind, DocFormat> = {
  cv: 'cv',
  'academic-cv': 'cv',
  'cover-letter': 'letter',
  'personal-statement': 'plain',
  'research-experience': 'plain',
  'scholarship-essay': 'plain',
  'statement-of-purpose': 'plain',
  'selection-criteria': 'plain',
  'supervisor-email': 'email',
  'application-answer': 'form',
  'research-summary': 'plain',
  'concept-note': 'plain',
}

/** Defaults used only when the application form's limit is not known. Always labelled "default" in the UI. */
export const DEFAULT_WORD_LIMIT: Partial<Record<DocKind, number>> = {
  'cover-letter': 500,
  'personal-statement': 750,
  'research-experience': 500,
  'scholarship-essay': 500,
  'statement-of-purpose': 1000,
  'supervisor-email': 250,
  'application-answer': 300,
  'research-summary': 300,
}

/** True only for a meaningful department name (records sometimes hold descriptive text instead). */
export function departmentName(op: Opportunity): string | null {
  const d = op.department?.trim()
  if (!d || /^(any|depends|nominating|various|incl)/i.test(d) || /\bany\b.*\b(department|faculty)/i.test(d)) return null
  return d.split(';')[0].trim()
}

/** Requirements a document should address: official criteria from the record first, then derived ones. */
export function requirementsFor(op: Opportunity, kind: DocKind, target: DocTarget): Requirement[] {
  const reqs: Requirement[] = []
  const evidenceUrl = (field: string) => op.evidence.find((e) => e.field === field && e.sourceType.startsWith('official'))?.url
  op.selectionCriteria.forEach((c, i) =>
    reqs.push({ id: `crit:${i}`, text: c.text, source: 'official', url: c.url, keywords: keywords(c.text), kinds: ['degree', 'research', 'project', 'publication', 'employment', 'achievement', 'training', 'motivation', 'career', 'referee'] }),
  )
  const research = ['cv', 'academic-cv', 'research-experience', 'statement-of-purpose', 'cover-letter', 'research-summary', 'supervisor-email', 'personal-statement']
  if (research.includes(kind) && op.themes.length)
    reqs.push({ id: 'fit', text: `Fit with the research themes: ${op.themes.slice(0, 5).join(', ')}`, source: 'official', keywords: op.themes.flatMap(keywords), kinds: ['degree', 'research', 'project', 'publication', 'employment', 'interest', 'training'] })
  if (op.entryRequirements && ['cv', 'academic-cv', 'cover-letter', 'selection-criteria'].includes(kind) && !op.selectionCriteria.some((c) => /degree|honours/i.test(c.text)))
    reqs.push({ id: 'entry', text: `Entry requirements: ${op.entryRequirements}`, source: 'official', url: evidenceUrl('entry'), keywords: ['degree', 'result', 'master', 'bachelor'], kinds: ['degree'] })
  if (op.english.requirement && ['cv', 'academic-cv', 'cover-letter', 'selection-criteria'].includes(kind))
    reqs.push({ id: 'english', text: `English language: ${op.english.requirement}`, source: 'official', url: evidenceUrl('english'), keywords: ['english', 'ielts', 'toefl', 'language'], kinds: ['language'] })
  if (['cover-letter', 'personal-statement', 'statement-of-purpose', 'scholarship-essay'].includes(kind))
    reqs.push({ id: 'motivation', text: 'Motivation for doctoral research (in her own words)', source: 'derived', keywords: ['motivation'], kinds: ['motivation'] })
  if (['cover-letter', 'statement-of-purpose', 'personal-statement'].includes(kind))
    reqs.push({ id: 'background', text: 'Relevance of the Economics and Project Management background', source: 'derived', keywords: ['economics', 'project', 'management'], kinds: ['degree'] })
  if (['statement-of-purpose', 'personal-statement', 'scholarship-essay'].includes(kind))
    reqs.push({ id: 'career', text: 'Plans after the PhD', source: 'derived', keywords: ['career', 'plans'], kinds: ['career'] })
  if (op.proposalRequired === 'yes' && ['research-summary', 'statement-of-purpose', 'cover-letter'].includes(kind))
    reqs.push({ id: 'proposal', text: 'A research proposal is required — state the proposed topic', source: 'official', keywords: ['topic'], kinds: [] })
  if (target === 'scholarship' && op.separateScholarshipApplication === 'yes')
    reqs.push({ id: 'separate', text: `Separate scholarship application for the ${op.scholarshipName}`, source: 'official', url: evidenceUrl('separateApplication'), keywords: [], kinds: [] })
  return reqs
}

/** Best supporting facts for a requirement — only fact kinds that can genuinely evidence it. */
export function supportFor(req: Requirement, facts: SourceFact[], limit = 2): SourceFact[] {
  const kw = req.keywords.length ? req.keywords : []
  return facts
    .filter((f) => req.kinds.includes(f.kind))
    .map((f) => ({ f, s: kw.length ? relevanceScore(f, kw) : 1 }))
    .filter((x) => x.s > 0 || req.kinds.length === 1)
    .sort((a, b) => b.s - a.s || b.f.year - a.f.year)
    .slice(0, limit)
    .map((x) => x.f)
}

export function coverage(req: Requirement, factIds: string[], placeholder: boolean): RequirementCoverage {
  return { id: req.id, text: req.text, source: req.source, status: factIds.length ? 'addressed' : placeholder ? 'placeholder' : 'not-addressed', factIds }
}

/* ---------------- Which documents are relevant to an opportunity ---------------- */

export interface KindRelevance {
  kind: DocKind
  relevant: boolean
  level: 'required' | 'recommended' | 'optional' | 'not-relevant'
  reason: string
  targets: DocTarget[]
}

const mentions = (op: Opportunity, re: RegExp) => op.requiredDocuments.some((d) => re.test(d))

export function relevantKinds(op: Opportunity, hasApprovedTopic: boolean): KindRelevance[] {
  const sep = op.separateScholarshipApplication
  const letterTargets: DocTarget[] = sep === 'yes' ? ['programme', 'scholarship'] : ['programme']
  const r = (kind: DocKind, level: KindRelevance['level'], reason: string, targets: DocTarget[] = ['programme']): KindRelevance => ({ kind, relevant: level !== 'not-relevant', level, reason, targets })
  return [
    r('cv', mentions(op, /\bcv\b|curriculum/i) ? 'required' : 'recommended', mentions(op, /\bcv\b/i) ? 'Listed in the required documents.' : 'UK PhD applications almost always ask for a CV.'),
    r('academic-cv', 'optional', 'Research-focused CV: use if the form asks for an academic CV.'),
    r('cover-letter', mentions(op, /cover letter|covering letter/i) ? 'required' : 'recommended', sep === 'yes' ? 'Separate scholarship application — write one letter for admission and one for the scholarship.' : 'Usually expected with a PhD application.', letterTargets),
    r('personal-statement', mentions(op, /personal statement/i) ? 'required' : 'optional', 'Use if the application form asks for a personal statement.'),
    r('statement-of-purpose', mentions(op, /statement of purpose/i) ? 'required' : 'optional', 'Use only if the form asks for a statement of purpose.'),
    r('research-experience', op.fundingModel === 'dtp' || op.proposalRequired !== 'no' ? 'recommended' : 'optional', 'Shows research preparation — important for DTP and research-council awards.'),
    sep === 'yes' || op.fundingModel === 'scholarship'
      ? r('scholarship-essay', sep === 'yes' ? 'recommended' : 'optional', sep === 'yes' ? 'This award has its own application.' : 'Use if the scholarship asks for an essay or statement.', ['scholarship'])
      : r('scholarship-essay', 'not-relevant', 'No separate scholarship application for this award.'),
    op.selectionCriteria.length
      ? r('selection-criteria', 'recommended', `${op.selectionCriteria.length} published selection criteria.`, sep === 'yes' ? ['scholarship'] : ['programme'])
      : r('selection-criteria', 'not-relevant', 'No published selection criteria recorded for this opportunity.'),
    op.supervisorContactRequired === 'no'
      ? r('supervisor-email', 'not-relevant', 'Supervisor contact is not required before applying.')
      : r('supervisor-email', op.supervisorContactRequired === 'yes' ? 'required' : 'optional', op.supervisorContactRequired === 'yes' ? 'You must contact a supervisor before applying.' : 'Supervisor contact requirement not confirmed — often helpful.', ['supervisor']),
    r('application-answer', 'optional', 'Paste a question from the application form and its word limit.', ['form']),
    op.proposalRequired === 'no'
      ? r('research-summary', 'not-relevant', 'No research proposal is required.')
      : hasApprovedTopic
        ? r('research-summary', op.proposalRequired === 'yes' ? 'required' : 'optional', 'Summarises your approved research topic.')
        : r('research-summary', 'not-relevant', 'Approve a research topic in the Topic Workshop first.'),
  ]
}

/* ---------------- Word limits ---------------- */

/** Words in the text. [ADD: …] placeholders are counted separately because they will be replaced. */
export function wordCount(text: string): { total: number; excludingPlaceholders: number } {
  const count = (s: string) => (s.match(/[A-Za-z0-9£$€%'’-]+/g) ?? []).filter((w) => /[A-Za-z0-9]/.test(w)).length
  return { total: count(text), excludingPlaceholders: count(text.replace(/\[ADD:[^\]]*\]/g, ' ')) }
}

export interface Para {
  text: string
  /** 1 = essential, 2 = important, 3 = nice to have. Lower-priority paragraphs are dropped first to meet a word limit. */
  priority: 1 | 2 | 3
}

/**
 * Assemble paragraphs within a word limit by dropping the lowest-priority paragraphs first
 * (latest first within the same priority). Essential paragraphs are never dropped; if they
 * alone exceed the limit, the result is flagged rather than truncated mid-sentence.
 */
export function fitToLimit(paras: Para[], limit: number | null, separator = '\n\n'): { text: string; dropped: number; over: boolean } {
  let kept = paras.filter((p) => p.text.trim())
  const size = (ps: Para[]) => wordCount(ps.map((p) => p.text).join(' ')).total
  let dropped = 0
  if (limit) {
    for (const pr of [3, 2] as const) {
      while (size(kept) > limit) {
        const idx = kept.map((p, i) => (p.priority === pr ? i : -1)).filter((i) => i >= 0).pop()
        if (idx === undefined) break
        kept = kept.filter((_, i) => i !== idx)
        dropped++
      }
    }
  }
  return { text: kept.map((p) => p.text).join(separator), dropped, over: !!limit && size(kept) > limit }
}

export { expand }
