import type { AppDocument, DocKind, DocTarget, DocVersion, MasterCv, Opportunity, TopicProposal } from '../../types'
import { uid } from '../profile'
import { collectFacts } from './facts'
import { DEFAULT_WORD_LIMIT, KIND_FORMAT, KIND_LABEL } from './requirements'
import { tailorCv } from './tailorCv'
import type { GenContext, GenResult } from './types'
import * as W from './writers'

/* ---------------- Generation ---------------- */

export function generate(ctx: GenContext): GenResult {
  switch (ctx.kind) {
    case 'cv':
    case 'academic-cv':
      return tailorCv(ctx)
    case 'cover-letter':
      return W.coverLetter(ctx)
    case 'personal-statement':
      return W.personalStatement(ctx)
    case 'research-experience':
      return W.researchExperience(ctx)
    case 'statement-of-purpose':
      return W.statementOfPurpose(ctx)
    case 'scholarship-essay':
      return W.scholarshipEssay(ctx)
    case 'selection-criteria':
      return W.selectionCriteria(ctx)
    case 'supervisor-email':
      return W.supervisorEmail(ctx)
    case 'application-answer':
      return W.applicationAnswer(ctx)
    case 'research-summary':
      return W.researchSummary(ctx)
    case 'concept-note':
      throw new Error('Concept notes are created from an approved topic in the Topic Workshop.')
  }
}

export interface BuildArgs {
  kind: DocKind
  op: Opportunity
  master: MasterCv
  target: DocTarget
  wordLimit: number | null
  question?: string
  topic: TopicProposal | null
  entryConfirmed: boolean
  today?: Date
}

export function contextFor(a: BuildArgs): GenContext {
  // Work on a deep copy so nothing downstream can modify the approved master CV.
  const profile = structuredClone(a.master.snapshot)
  return { kind: a.kind, profile, facts: collectFacts(profile), op: a.op, target: a.target, wordLimit: a.wordLimit, question: a.question, topic: a.topic, entryConfirmed: a.entryConfirmed, today: a.today ?? new Date() }
}

/* ---------------- Document model ---------------- */

const TARGET_LABEL: Record<DocTarget, string> = { programme: 'PhD admission', scholarship: 'scholarship application', supervisor: 'supervisor enquiry', form: 'application form' }

export function newDocument(a: BuildArgs, result: GenResult, generator: DocVersion['generator'], now = new Date().toISOString()): AppDocument {
  const id = uid()
  const v = version(1, result, generator, a.master.approvedAt, 'First draft', now)
  const limit = a.wordLimit ?? DEFAULT_WORD_LIMIT[a.kind] ?? null
  return {
    id,
    kind: a.kind,
    opportunityId: a.op.id,
    university: a.op.university,
    opportunityTitle: a.op.title,
    target: a.target,
    format: KIND_FORMAT[a.kind],
    title: `${KIND_LABEL[a.kind]}${a.kind === 'cover-letter' && a.op.separateScholarshipApplication === 'yes' ? ` (${TARGET_LABEL[a.target]})` : ''} — ${a.op.university.split('(')[0].trim()}`,
    wordLimit: limit,
    wordLimitSource: a.wordLimit ? 'application' : limit ? 'default' : null,
    question: a.question,
    topicId: a.topic?.id ?? null,
    versions: [v],
    currentVersionId: v.id,
    status: 'draft',
    approvedVersionId: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function version(n: number, r: GenResult, generator: DocVersion['generator'], masterAt: string | null, note: string, now = new Date().toISOString()): DocVersion {
  return { id: uid(), n, content: r.content, createdAt: now, generator, note, changes: r.changes, missing: r.missing, usedFactIds: r.usedFactIds, requirements: r.requirements, masterCvApprovedAt: masterAt }
}

export const currentVersion = (d: AppDocument) => d.versions.find((v) => v.id === d.currentVersionId) ?? d.versions.at(-1)!
export const approvedVersion = (d: AppDocument) => d.versions.find((v) => v.id === d.approvedVersionId) ?? null

/** Add a new version (regeneration or saved edit). A new version is a draft until approved again. */
export function addVersion(d: AppDocument, v: Omit<DocVersion, 'n'>, now = new Date().toISOString()): AppDocument {
  const nv = { ...v, n: Math.max(...d.versions.map((x) => x.n)) + 1 } as DocVersion
  return { ...d, versions: [...d.versions, nv], currentVersionId: nv.id, status: 'draft', updatedAt: now }
}

/** Save hand edits as a new version, keeping the generation metadata of the version they came from. */
export function saveEdit(d: AppDocument, content: string, now = new Date().toISOString()): AppDocument {
  const base = currentVersion(d)
  if (base.content === content) return d
  return addVersion(d, { ...base, id: uid(), content, createdAt: now, generator: 'edit', note: 'Edited by you' }, now)
}

/** Explicit approval of one specific version. */
export function approve(d: AppDocument, versionId: string, now = new Date().toISOString()): AppDocument {
  if (!d.versions.some((v) => v.id === versionId)) throw new Error('Unknown version')
  return { ...d, status: 'approved', approvedVersionId: versionId, approvedAt: now, currentVersionId: versionId, updatedAt: now }
}

export function reject(d: AppDocument, now = new Date().toISOString()): AppDocument {
  return { ...d, status: 'rejected', approvedVersionId: null, approvedAt: null, updatedAt: now }
}

export function restore(d: AppDocument, versionId: string, now = new Date().toISOString()): AppDocument {
  const v = d.versions.find((x) => x.id === versionId)
  if (!v) return d
  return addVersion(d, { ...v, id: uid(), createdAt: now, note: `Restored from version ${v.n}` }, now)
}

/* ---------------- Migration from the first app version ---------------- */

interface LegacyDraft {
  id: string
  kind: string
  opportunityId: string | null
  title: string
  content: string
  generator: 'template' | 'ai'
  createdAt: string
  updatedAt: string
  approved: boolean
  approvedAt: string | null
}

export function migrateDocs(raw: unknown[], opportunities: Opportunity[]): AppDocument[] {
  return raw.map((r) => {
    if ((r as AppDocument).versions) return r as AppDocument
    const o = r as LegacyDraft
    const op = opportunities.find((x) => x.id === o.opportunityId)
    const kind = (o.kind as DocKind) in KIND_LABEL ? (o.kind as DocKind) : 'application-answer'
    const v: DocVersion = { id: uid(), n: 1, content: o.content, createdAt: o.createdAt, generator: o.generator, note: 'Imported from earlier version of the app', changes: [], missing: [], usedFactIds: [], requirements: [], masterCvApprovedAt: null }
    return {
      id: o.id,
      kind,
      opportunityId: o.opportunityId,
      university: op?.university ?? '',
      opportunityTitle: op?.title ?? '',
      target: 'programme',
      format: KIND_FORMAT[kind],
      title: o.title,
      wordLimit: null,
      wordLimitSource: null,
      versions: [v],
      currentVersionId: v.id,
      status: o.approved ? 'approved' : 'draft',
      approvedVersionId: o.approved ? v.id : null,
      approvedAt: o.approvedAt,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }
  })
}

/** A document created outside the generators (e.g. a concept note from the Topic Workshop). */
export function simpleDocument(args: { kind: DocKind; op: Opportunity | null; title: string; content: string; generator: DocVersion['generator']; topicId?: string | null; masterAt?: string | null; note?: string }, now = new Date().toISOString()): AppDocument {
  const v: DocVersion = { id: uid(), n: 1, content: args.content, createdAt: now, generator: args.generator, note: args.note ?? 'First draft', changes: [], missing: [], usedFactIds: [], requirements: [], masterCvApprovedAt: args.masterAt ?? null }
  return {
    id: uid(),
    kind: args.kind,
    opportunityId: args.op?.id ?? null,
    university: args.op?.university ?? '',
    opportunityTitle: args.op?.title ?? '',
    target: 'programme',
    format: KIND_FORMAT[args.kind],
    title: args.title,
    wordLimit: null,
    wordLimitSource: null,
    topicId: args.topicId ?? null,
    versions: [v],
    currentVersionId: v.id,
    status: 'draft',
    approvedVersionId: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}
