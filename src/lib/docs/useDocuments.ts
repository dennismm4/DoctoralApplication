import { generateWithBackend, buildDocRequest } from '../ai'
import { useStore } from '../store'
import { entryMet } from '../verification'
import type { AppDocument, DocKind, DocTarget, Opportunity, TopicProposal } from '../../types'
import { addVersion, contextFor, generate, newDocument, version, type BuildArgs } from './documents'
import { DEFAULT_WORD_LIMIT } from './requirements'
import type { GenResult } from './types'

export interface CreateOptions {
  target: DocTarget
  /** The limit stated on the application form; null = use the labelled default. */
  wordLimit: number | null
  question?: string
  topicId?: string | null
}

/** Approved topic for this opportunity, or a general approved topic. Never another opportunity's topic. */
export function topicFor(topics: TopicProposal[], opId: string, topicId?: string | null): TopicProposal | null {
  const approved = topics.filter((t) => t.status === 'approved')
  if (topicId) return approved.find((t) => t.id === topicId && (t.opportunityId === opId || t.opportunityId === null)) ?? null
  return approved.find((t) => t.opportunityId === opId) ?? approved.find((t) => t.opportunityId === null) ?? null
}

/** Template first; then, if a backend is configured, let it improve the prose of the same content. */
async function run(args: BuildArgs, apiBase: string, allowAiDataTransfer: boolean): Promise<{ result: GenResult; generator: 'template' | 'ai'; notice: string | null }> {
  const ctx = contextFor(args)
  const template = generate(ctx)
  if (!apiBase || !allowAiDataTransfer) return { result: template, generator: 'template', notice: apiBase && !allowAiDataTransfer ? 'Gemini is off. Enable the explicit data-sharing option in Data & Privacy to send selected profile facts for AI drafting.' : null }
  try {
    const text = await generateWithBackend(apiBase, buildDocRequest(ctx, template))
    return { result: { ...template, content: text, changes: ['AI-improved wording via your backend, built on the template below; checked by the factual audit.', ...template.changes] }, generator: 'ai', notice: null }
  } catch (e) {
    return { result: template, generator: 'template', notice: `Backend unavailable — used the local template instead. (${(e as Error).message})` }
  }
}

export function useDocumentActions() {
  const { masterCv, topics, checks, setDocs, settings, docs } = useStore()

  const argsFor = (kind: DocKind, op: Opportunity, o: CreateOptions): BuildArgs | null => {
    if (!masterCv) return null
    return {
      kind,
      op,
      master: masterCv,
      target: o.target,
      wordLimit: o.wordLimit ?? DEFAULT_WORD_LIMIT[kind] ?? null,
      question: o.question,
      topic: topicFor(topics, op.id, o.topicId),
      entryConfirmed: entryMet(checks[op.id]) === true,
    }
  }

  const create = async (kind: DocKind, op: Opportunity, o: CreateOptions): Promise<{ id: string | null; notice: string | null }> => {
    const args = argsFor(kind, op, o)
    if (!args) return { id: null, notice: 'Approve your master CV first.' }
    const { result, generator, notice } = await run(args, settings.apiBase, settings.allowAiDataTransfer)
    const doc = newDocument({ ...args, wordLimit: o.wordLimit }, result, generator)
    if (!o.wordLimit && args.wordLimit) doc.wordLimit = args.wordLimit
    setDocs((d) => [doc, ...d])
    return { id: doc.id, notice }
  }

  /** Regenerate as a new version of the same document, for the same opportunity only. */
  const regenerate = async (doc: AppDocument, op: Opportunity): Promise<string | null> => {
    const args = argsFor(doc.kind, op, { target: doc.target, wordLimit: doc.wordLimit, question: doc.question, topicId: doc.topicId })
    if (!args) return 'Approve your master CV first.'
    if (doc.opportunityId !== op.id) return 'A document can only be regenerated for its own opportunity.'
    const { result, generator, notice } = await run(args, settings.apiBase, settings.allowAiDataTransfer)
    const updated = addVersion(doc, version(0, result, generator, args.master.approvedAt, 'Regenerated'))
    setDocs((ds) => ds.map((d) => (d.id === doc.id ? updated : d)))
    return notice
  }

  return { create, regenerate, ready: !!masterCv, docs }
}
