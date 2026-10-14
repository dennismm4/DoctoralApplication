import type { AppDocument, Opportunity, Profile } from '../../types'
import { collectFacts } from './facts'
import { wordCount } from './requirements'

/**
 * Factual-accuracy audit. Runs on every draft — template, AI-generated, or edited by hand —
 * and blocks approval when it finds an "error".
 *
 * It cannot prove a sentence is true, but it catches the most damaging failures:
 * numbers, grades, software, publications and awards that are not in her verified facts;
 * text written for another university; word-limit breaches; unfinished [ADD] prompts.
 */

export interface AuditIssue {
  level: 'error' | 'warning'
  code: 'placeholder' | 'word-limit' | 'number' | 'grade' | 'software' | 'publication' | 'award' | 'other-university' | 'cliche' | 'spelling' | 'empty'
  message: string
}

export const UK_INSTITUTIONS = [
  'University of York', 'University of Leeds', 'University of Cambridge', 'University of Oxford', 'University of Warwick', 'University of Manchester',
  'University of Edinburgh', 'University of Stirling', 'University of Glasgow', 'University of Sheffield', 'University of Nottingham', 'University of Birmingham',
  'University of Exeter', 'University of Bristol', 'University of Reading', 'University of Greenwich', 'University of Sussex', 'University of Bath',
  'University of Southampton', 'University of Liverpool', 'University of Leicester', 'University of Surrey', 'University of Aberdeen', 'University of St Andrews',
  'University of East Anglia', 'University of Kent', 'University of Lincoln', 'Durham University', 'Lancaster University', 'Newcastle University',
  'Loughborough University', 'Aston University', 'Cranfield University', 'Brunel University', 'Imperial College London', 'University College London',
  "King's College London", 'London School of Economics', 'SOAS', 'Queen Mary University of London', 'Royal Holloway', 'Nottingham Trent University',
  'De Montfort University', 'Sheffield Hallam University', 'Manchester Metropolitan University', 'University of Hull', 'University of Bradford',
  'Gates Cambridge', 'Cambridge Trust', 'Clarendon', 'White Rose', 'Midlands Graduate School', 'SGSSS', 'Commonwealth Scholarship',
]

const SOFTWARE = ['Stata', 'SPSS', 'EViews', 'MATLAB', 'Python', 'NVivo', 'ATLAS.ti', 'SQL', 'Power BI', 'Tableau', 'ArcGIS', 'QGIS', 'Primavera', 'MS Project', 'Microsoft Project', 'SAS', 'Minitab', 'LaTeX', 'Excel', 'GAMS', 'R Studio', 'RStudio']
const CLICHES = [/always been (deeply )?passionate/i, /since (I was )?(a (young )?child|childhood)/i, /\bmy dream\b/i, /ever since I can remember/i, /burning desire/i, /\bpassionate about\b/i, /make the world a better place/i, /from a young age/i]
const US_SPELLINGS: [RegExp, string][] = [
  [/\borganiz(e|ed|es|ing|ation|ations|ational)\b/i, 'organis…'],
  [/\banalyz(e|ed|es|ing)\b/i, 'analys…'],
  [/\bprogram\b(?! (code|software))/i, 'programme'],
  [/\bbehavior/i, 'behaviour'],
  [/\bcenter\b/i, 'centre'],
  [/\bcolor/i, 'colour'],
  [/\bfavor/i, 'favour'],
  [/\blabor\b/i, 'labour'],
  [/\bmodeling\b/i, 'modelling'],
  [/\benrollment\b/i, 'enrolment'],
  [/\bfulfill\b/i, 'fulfil'],
  [/\bprioritiz/i, 'prioritis…'],
  [/\butiliz/i, 'utilis…'],
]

const NUM = /(?<![A-Za-z])£?\d[\d,]*(?:\.\d+)?%?/g

function norm(n: string) {
  return n.replace(/[£,%]/g, '').replace(/\.0+$/, '')
}

export interface AuditInput {
  text: string
  profile: Profile
  op: Opportunity | null
  wordLimit: number | null
  extraAllowedText?: string
  today?: Date
}

export function audit({ text, profile, op, wordLimit, extraAllowedText = '', today = new Date() }: AuditInput): AuditIssue[] {
  const issues: AuditIssue[] = []
  const facts = collectFacts(profile)
  const factText = facts.map((f) => `${f.label} ${f.text}`).join(' \n ')
  const opText = op ? JSON.stringify(op) : ''
  const allowed = `${factText}\n${opText}\n${extraAllowedText}`
  const allowedLower = allowed.toLowerCase()
  const body = text.replace(/\[ADD:[^\]]*\]/g, ' ')

  if (!text.trim()) issues.push({ level: 'error', code: 'empty', message: 'The document is empty.' })

  const ph = (text.match(/\[ADD:/g) ?? []).length
  if (ph) issues.push({ level: 'error', code: 'placeholder', message: `${ph} [ADD: …] prompt${ph > 1 ? 's' : ''} still to complete or remove.` })

  if (wordLimit) {
    const wc = wordCount(text).total
    if (wc > wordLimit) issues.push({ level: 'error', code: 'word-limit', message: `${wc} words — over the ${wordLimit}-word limit by ${wc - wordLimit}.` })
  }

  // Numbers: every figure must appear in her facts, the opportunity record, or today's date.
  const allowedNums = new Set((allowed.match(NUM) ?? []).map(norm))
  const dateNums = [today.getFullYear(), today.getDate(), today.getFullYear() + 1].map(String)
  const badNums = new Set<string>()
  for (const raw of body.match(NUM) ?? []) {
    const n = norm(raw)
    if (allowedNums.has(n) || dateNums.includes(n)) continue
    if (/^\d$/.test(n) || /^\d\d?$/.test(n) && Number(n) <= 12 && !raw.includes('%') && !raw.includes('£')) continue // list numbering, days, months
    badNums.add(raw)
  }
  if (badNums.size)
    issues.push({ level: 'error', code: 'number', message: `Figures not found in your verified facts or the opportunity record: ${[...badNums].slice(0, 6).join(', ')}. Remove them or add the evidence to your profile.` })

  // Grades / classifications
  for (const m of body.match(/\b(c?gpa\s*(of\s*)?\d(\.\d+)?|first[- ]class( honours)?|upper[- ]second|2:1|very great distinction|great distinction|with distinction|summa cum laude|magna cum laude)\b/gi) ?? []) {
    if (!allowedLower.includes(m.toLowerCase().replace(/\s+/g, ' '))) issues.push({ level: 'error', code: 'grade', message: `“${m}” does not match any verified degree result or the stated entry requirements.` })
  }

  // Software and tools
  for (const s of SOFTWARE) {
    const re = new RegExp(`(?<![A-Za-z])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i')
    if (re.test(body) && !re.test(factText)) issues.push({ level: 'error', code: 'software', message: `Mentions ${s}, which is not among your verified skills.` })
  }

  // Publications
  const hasPublished = profile.publications.some((p) => p.verified && (p.status === 'published' || p.status === 'accepted'))
  if (/\b(published|peer[- ]reviewed|journal article|in press|my publications?)\b/i.test(body) && !hasPublished && !/\bpublished\b/i.test(opText))
    issues.push({ level: 'error', code: 'publication', message: 'Describes published work, but you have no verified published or accepted publication. Coursework and working papers are not publications.' })

  // Awards
  if (/\b(won|received|awarded|recipient of|winner of)\b[^.]{0,60}\b(award|prize|medal|fellowship|scholarship|distinction|honour)/i.test(body) && !profile.achievements.some((a) => a.verified))
    issues.push({ level: 'error', code: 'award', message: 'Claims an award or prize, but you have no verified achievements.' })

  // Text written for another institution
  if (op) {
    const own = new Set(profile.degrees.map((d) => d.institution.toLowerCase()).concat(profile.employment.map((e) => e.organisation.toLowerCase()), profile.referees.map((r) => r.organisation.toLowerCase())))
    const opLower = opText.toLowerCase()
    for (const inst of UK_INSTITUTIONS) {
      const re = new RegExp(`\\b${inst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(body) && !opLower.includes(inst.toLowerCase()) && ![...own].some((o) => o.includes(inst.toLowerCase())))
        issues.push({ level: 'error', code: 'other-university', message: `Mentions ${inst}, but this document is for ${op.university}. Never reuse a letter written for another university.` })
    }
  }

  // Style
  const motivation = profile.motivation.verified ? profile.motivation.value : ''
  for (const re of CLICHES) {
    const m = body.match(re)
    if (m && !motivation.toLowerCase().includes(m[0].toLowerCase())) issues.push({ level: 'warning', code: 'cliche', message: `Generic phrase “${m[0]}” — replace it with something specific to you.` })
  }
  for (const [re, uk] of US_SPELLINGS) {
    const m = body.match(re)
    if (m && !allowedLower.includes(m[0].toLowerCase())) issues.push({ level: 'warning', code: 'spelling', message: `American spelling “${m[0]}” — British English uses “${uk}”.` })
  }
  return issues
}

/** Approval is allowed only with no errors. */
export const canApprove = (issues: AuditIssue[]) => !issues.some((i) => i.level === 'error')

/** The text and limit to audit for a document's current version. */
export function auditDocument(doc: AppDocument, content: string, profile: Profile, op: Opportunity | null, extraAllowedText = ''): AuditIssue[] {
  return audit({ text: content, profile, op, wordLimit: doc.wordLimit, extraAllowedText: `${extraAllowedText}\n${doc.question ?? ''}` })
}
