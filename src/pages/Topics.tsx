import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, Empty, Field, Modal, PageHeader, Select, cx } from '../components/ui'
import { DRAFTING_RULES, generateWithBackend, legacyFacts } from '../lib/ai'
import { simpleDocument } from '../lib/docs/documents'
import { isActionable } from '../lib/eligibility'
import { generateConceptNote, suggestTopics } from '../lib/generate'
import { useStore } from '../lib/store'
import { useAssessed } from '../lib/useAssessed'
import type { TopicProposal } from '../types'

export default function Topics() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { profile, topics, setTopics, setDocs, opportunities, settings } = useStore()
  const items = useAssessed().filter((i) => isActionable(i.a))
  const opId = params.get('op') ?? ''
  const op = opportunities.find((o) => o.id === opId) ?? null
  const [approving, setApproving] = useState<TopicProposal | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const shown = topics.filter((t) => (opId ? t.opportunityId === opId : true))
  const suggest = () => {
    const existing = new Set(topics.filter((t) => t.opportunityId === (op?.id ?? null)).map((t) => t.title))
    const fresh = suggestTopics(profile, op).filter((t) => !existing.has(t.title))
    setTopics((t) => [...fresh, ...t])
  }

  const update = (id: string, patch: Partial<TopicProposal>) => setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const develop = async (t: TopicProposal) => {
    if (t.status !== 'approved') return
    setBusy(t.id)
    setError('')
    const topicOp = opportunities.find((o) => o.id === t.opportunityId) ?? null
    let content = generateConceptNote(t, profile, topicOp)
    let generator: 'template' | 'ai' = 'template'
    if (settings.apiBase && topicOp) {
      try {
        content = await generateWithBackend(settings.apiBase, { kind: 'concept-note', kindLabel: 'Concept note', target: 'programme', wordLimit: null, facts: legacyFacts(profile).map((text, i) => ({ id: String(i), text })), opportunity: { title: topicOp.title, university: topicOp.university, themes: topicOp.themes }, topic: { title: t.title, questions: t.questions, rationale: t.rationale, contribution: t.contribution }, templateDraft: content, rules: DRAFTING_RULES })
        generator = 'ai'
      } catch (e) {
        setError(`Backend unavailable — used the local template instead. (${(e as Error).message})`)
      }
    }
    const doc = simpleDocument({ kind: 'concept-note', op: topicOp, title: `Concept note — ${t.title}`, content, generator, topicId: t.id })
    const id = doc.id
    setDocs((d) => [doc, ...d])
    update(t.id, { conceptNote: id })
    setBusy(null)
    nav(`/documents/${id}`)
  }

  return (
    <>
      <PageHeader eyebrow="Research design" title="Research Topic Workshop">
        Suggestions are starting points matched to your interests and the selected opportunity. A topic must be explicitly approved before any concept note or proposal is drafted.
      </PageHeader>

      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Align topics with" className="flex-1">
          <Select value={opId} onChange={(e) => setParams(e.target.value ? { op: e.target.value } : {})}>
            <option value="">My research interests (no specific opportunity)</option>
            {items.map(({ op }) => <option key={op.id} value={op.id}>{op.university} — {op.scholarshipName}</option>)}
          </Select>
        </Field>
        <Button variant="primary" onClick={suggest}>Suggest research topics</Button>
      </Card>

      {op && (
        <div className="mb-6">
          <Callout title={`Programme themes — ${op.university}`}>
            {op.themes.join(' · ')}. {op.proposalRequired === 'yes' ? 'This award requires a research proposal.' : op.proposalRequired === 'unknown' ? 'Whether a proposal is required is not verified.' : ''}{' '}
            <Link to={`/opportunity/${op.id}`} className="text-forest underline">View record</Link>
          </Callout>
        </div>
      )}
      {error && <div className="mb-4"><Callout tone="warn">{error}</Callout></div>}

      {shown.length === 0 ? (
        <Empty title="No topics yet">Choose an opportunity (or keep it general) and click <em>Suggest research topics</em>.</Empty>
      ) : (
        <div className="space-y-4">
          {shown.map((t) => {
            const tOp = opportunities.find((o) => o.id === t.opportunityId)
            return (
              <Card key={t.id} className={cx('p-5', t.status === 'approved' && 'border-ok/50', t.status === 'rejected' && 'opacity-60')}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={t.status === 'approved' ? 'ok' : t.status === 'rejected' ? 'bad' : 'neutral'}>{t.status === 'approved' ? '✓ Approved' : t.status === 'rejected' ? 'Rejected' : 'Proposed'}</Badge>
                  {tOp && <Badge tone="forest">{tOp.university}</Badge>}
                  {t.approvedAt && <span className="text-xs text-muted">approved {new Date(t.approvedAt).toLocaleDateString('en-GB')}</span>}
                </div>
                <h2 className="text-xl leading-snug">{t.title}</h2>
                <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <h3 className="mb-1 font-sans text-xs font-semibold tracking-wide text-muted uppercase">Research questions</h3>
                    <ol className="list-inside list-decimal space-y-1">{t.questions.map((q) => <li key={q}>{q}</li>)}</ol>
                  </div>
                  <div className="space-y-3">
                    <div><h3 className="mb-1 font-sans text-xs font-semibold tracking-wide text-muted uppercase">Rationale</h3>{t.rationale}</div>
                    <div><h3 className="mb-1 font-sans text-xs font-semibold tracking-wide text-muted uppercase">Potential contribution</h3>{t.contribution}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">{t.themes.map((th) => <span key={th} className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-muted">{th}</span>)}</div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  {t.status !== 'approved' && <Button variant="primary" onClick={() => { setApproving(t); setConfirmed(false) }}>Approve topic</Button>}
                  {t.status === 'approved' && (
                    t.conceptNote ? <Button onClick={() => nav(`/documents/${t.conceptNote}`)}>Open concept note</Button>
                    : <Button variant="accent" onClick={() => develop(t)} disabled={busy === t.id}>{busy === t.id ? 'Drafting…' : 'Develop concept note'}</Button>
                  )}
                  {t.status === 'approved' && <Button variant="ghost" onClick={() => update(t.id, { status: 'proposed', approvedAt: null })}>Withdraw approval</Button>}
                  {t.status === 'proposed' && <Button variant="ghost" onClick={() => update(t.id, { status: 'rejected' })}>Reject</Button>}
                  {t.status === 'rejected' && <Button variant="ghost" onClick={() => update(t.id, { status: 'proposed' })}>Reconsider</Button>}
                  <Button variant="danger" size="sm" className="ml-auto" onClick={() => setTopics((ts) => ts.filter((x) => x.id !== t.id))}>Delete</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={!!approving} title="Approve this research topic?" onClose={() => setApproving(null)}>
        <p className="font-serif text-lg leading-snug">{approving?.title}</p>
        <p className="mt-3 text-sm text-muted">Approving unlocks a concept-note draft for this topic. The draft is a scaffold for <em>your</em> thinking — you will need to add real literature, data sources and methods you can justify.</p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-forest" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I have read this topic and want to develop it further.
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setApproving(null)}>Cancel</Button>
          <Button variant="primary" disabled={!confirmed} onClick={() => { if (approving) update(approving.id, { status: 'approved', approvedAt: new Date().toISOString() }); setApproving(null) }}>Approve</Button>
        </div>
      </Modal>
    </>
  )
}
