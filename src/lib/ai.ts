import type { DocKind, DocTarget, Opportunity, Profile } from '../types'
import type { GenContext, GenResult } from './docs/types'
import { KIND_LABEL } from './docs/requirements'
import { verifiedFacts } from './generate'

/**
 * Optional AI drafting backend — integration interface.
 *
 * The static GitHub Pages build never holds an API key. If a backend from /server is deployed and
 * its URL configured (VITE_API_BASE_URL at build time, or Data & Sources), drafting works like this:
 *
 *   1. The local template engine runs first and decides WHICH verified facts, requirements and
 *      structure the document uses (and what is missing).
 *   2. Only those verified facts, the opportunity's public details and the template draft are sent
 *      to the backend, which may improve the prose. It is told not to add facts.
 *   3. The returned text is put through the same factual audit as any other draft.
 *
 * With no backend configured the app is in demo mode: drafts are template-based and labelled so.
 */

export interface DocRequest {
  kind: DocKind
  kindLabel: string
  target: DocTarget
  wordLimit: number | null
  question?: string
  facts: { id: string; text: string }[]
  opportunity: Pick<Opportunity, 'title' | 'university' | 'department' | 'programme' | 'scholarshipName' | 'themes' | 'entryRequirements' | 'english' | 'requiredDocuments' | 'separateScholarshipApplication'> & { selectionCriteria: string[] }
  topic: { title: string; questions: string[]; rationale: string; contribution: string } | null
  templateDraft: string
  rules: string[]
}

export const DRAFTING_RULES = [
  'Use ONLY the facts provided. Do not add grades, dates, figures, employers, responsibilities, software, publications, awards, research experience or achievements.',
  'Keep every [ADD: …] prompt where information is missing; do not fill it in.',
  'Never describe coursework as published or independent research.',
  'Address only the university and scholarship named in the opportunity. Never mention any other university.',
  'Write in professional British English. Avoid stock phrases such as "I have always been passionate".',
  'Stay within the word limit if one is given.',
  'Distinguish the PhD admission application from a separate scholarship application when the target says so.',
]

export function buildDocRequest(ctx: GenContext, template: GenResult): DocRequest {
  const { op } = ctx
  return {
    kind: ctx.kind,
    kindLabel: KIND_LABEL[ctx.kind],
    target: ctx.target,
    wordLimit: ctx.wordLimit,
    question: ctx.question,
    facts: ctx.facts.filter((f) => template.usedFactIds.includes(f.id) || f.kind === 'interest').map((f) => ({ id: f.id, text: `${f.label}: ${f.text}` })),
    opportunity: {
      title: op.title,
      university: op.university,
      department: op.department,
      programme: op.programme,
      scholarshipName: op.scholarshipName,
      themes: op.themes,
      entryRequirements: op.entryRequirements,
      english: op.english,
      requiredDocuments: op.requiredDocuments,
      separateScholarshipApplication: op.separateScholarshipApplication,
      selectionCriteria: op.selectionCriteria.map((c) => c.text),
    },
    topic: ctx.topic ? { title: ctx.topic.title, questions: ctx.topic.questions, rationale: ctx.topic.rationale, contribution: ctx.topic.contribution } : null,
    templateDraft: template.content,
    rules: DRAFTING_RULES,
  }
}

/** Legacy helper kept for the concept-note flow. */
export function legacyFacts(p: Profile): string[] {
  return verifiedFacts(p)
}

export interface BackendStatus { reachable: boolean; aiAvailable: boolean; provider: string | null; model: string | null }

export async function checkBackend(base: string): Promise<BackendStatus> {
  if (!base) return { reachable: false, aiAvailable: false, provider: null, model: null }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { method: 'GET' })
    if (!res.ok) return { reachable: false, aiAvailable: false, provider: null, model: null }
    const data = await res.json() as { aiAvailable?: boolean; provider?: string; model?: string }
    return { reachable: true, aiAvailable: data.aiAvailable === true, provider: data.provider ?? null, model: data.model ?? null }
  } catch {
    return { reachable: false, aiAvailable: false, provider: null, model: null }
  }
}

export interface ExtractedOpportunity {
  university: string; department: string; programme: string; title: string; description: string
  supervisor: string; researchArea: string; entryRequirements: string; englishRequirement: string
  fundingDescription: string; stipendDescription: string; deadline: string; startDate: string
  requiredDocuments: string[]
}

export async function extractOpportunity(base: string, input: { url: string; university: string; programme: string }) {
  const res = await fetch(`${base.replace(/\/$/, '')}/extract-opportunity`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await res.json() as { error?: string; sourceUrl?: string; retrievedAt?: string; note?: string; extracted?: ExtractedOpportunity }
  if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
  if (!data.extracted || !data.sourceUrl || !data.retrievedAt) throw new Error('Backend returned incomplete opportunity data.')
  return data as { sourceUrl: string; retrievedAt: string; note: string; extracted: ExtractedOpportunity }
}

export async function generateWithBackend(base: string, req: DocRequest | Record<string, unknown>): Promise<string> {
  const res = await fetch(`${base.replace(/\/$/, '')}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    let message = `Backend error ${res.status}`
    try { message = ((await res.json()) as { error?: string }).error || message } catch { /* Keep the stable HTTP fallback. */ }
    throw new Error(message)
  }
  const data = (await res.json()) as { text?: string }
  if (!data.text) throw new Error('Backend returned no text')
  return data.text
}
