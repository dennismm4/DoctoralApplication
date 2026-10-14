import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MasterCvPanel } from '../components/MasterCvPanel'
import { Badge, Button, Callout, Card, Empty, Field, Input, Modal, PageHeader, SectionTitle, Select, TextArea, VerdictBadge, cx } from '../components/ui'
import { DEFAULT_WORD_LIMIT, KIND_LABEL, relevantKinds, type KindRelevance } from '../lib/docs/requirements'
import { useDocumentActions } from '../lib/docs/useDocuments'
import { isActionable } from '../lib/eligibility'
import { useStore } from '../lib/store'
import { useAssessed } from '../lib/useAssessed'
import type { AppDocument, DocKind, DocTarget } from '../types'

const LEVEL_TONE = { required: 'bad', recommended: 'forest', optional: 'neutral', 'not-relevant': 'neutral' } as const
const TARGET_LABEL: Record<DocTarget, string> = { programme: 'for PhD admission', scholarship: 'for the scholarship', supervisor: 'to a supervisor', form: 'for the form' }
const STATUS_TONE = { draft: 'warn', approved: 'ok', rejected: 'bad' } as const

export default function Documents() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const items = useAssessed().filter((i) => isActionable(i.a))
  const { docs, topics, settings, opportunities } = useStore()
  const { create, ready } = useDocumentActions()
  const [opId, setOpId] = useState(params.get('op') ?? items[0]?.op.id ?? '')
  const [dialog, setDialog] = useState<{ kind: DocKind; target: DocTarget } | null>(null)
  const [notice, setNotice] = useState('')
  const autoRan = useRef(false)
  const item = items.find((i) => i.op.id === opId)
  const op = item?.op
  const hasTopic = !!op && topics.some((t) => t.status === 'approved' && (t.opportunityId === op.id || t.opportunityId === null))
  const kinds = op ? relevantKinds(op, hasTopic) : []

  // Arriving from "Tailor my CV" / "Generate cover letter" on an opportunity page.
  useEffect(() => {
    if (autoRan.current || params.get('new') !== '1' || !op || !ready) return
    autoRan.current = true
    const kind = (params.get('kind') as DocKind) ?? 'cv'
    const rel = kinds.find((k) => k.kind === kind)
    if (!rel?.relevant) return setNotice(`${KIND_LABEL[kind]} is not relevant to this opportunity: ${rel?.reason ?? ''}`)
    if (rel.targets.length > 1 || kind === 'application-answer') return setDialog({ kind, target: rel.targets[0] })
    create(kind, op, { target: rel.targets[0], wordLimit: null }).then((r) => r.id && nav(`/documents/${r.id}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, op])

  const byOp = new Map<string, AppDocument[]>()
  for (const d of docs) byOp.set(d.opportunityId ?? '', [...(byOp.get(d.opportunityId ?? '') ?? []), d])

  return (
    <>
      <PageHeader eyebrow="Drafting" title="Documents Studio">
        Every document is generated for one opportunity from your approved master CV, shows the facts it used and what it still needs, and must pass a factual check and your explicit approval before export.
      </PageHeader>

      <div className="mb-6">
        {settings.apiBase ? (
          <Callout tone="ok" title="AI drafting via your backend">Wording is improved by your own backend; the facts, structure and checks come from the local engine, and every AI draft is audited.</Callout>
        ) : (
          <Callout tone="neutral" title="Demo mode — template drafting, no AI">
            Drafts are assembled from your verified facts by built-in templates. Your own sentences are reused verbatim, and <code className="font-mono text-xs">[ADD: …]</code> prompts mark what only you can write. To enable AI drafting, deploy the backend and set its URL on <Link to="/data" className="text-forest underline">Data & Sources</Link>; API keys never go into this site.
          </Callout>
        )}
      </div>

      <section className="mb-10">
        <MasterCvPanel />
      </section>

      <section className="mb-10">
        <SectionTitle>Create documents for an opportunity</SectionTitle>
        <Card className="mb-4 p-4">
          <Field label="Opportunity (verified or in the review queue)">
            <Select value={opId} onChange={(e) => { setOpId(e.target.value); setParams({ op: e.target.value }) }}>
              {items.length === 0 && <option value="">No open opportunities</option>}
              {items.map(({ op, a }) => <option key={op.id} value={op.id}>{a.verdict === 'verified' ? '● ' : '◐ '}{op.university} — {op.scholarshipName}</option>)}
            </Select>
          </Field>
          {item && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <VerdictBadge verdict={item.a.verdict} />
              <Link to={`/opportunity/${item.op.id}`} className="text-forest underline">Open opportunity</Link>
              {item.op.separateScholarshipApplication === 'yes' && <Badge tone="ochre">Separate scholarship application</Badge>}
              {item.a.verdict !== 'verified' && <span className="text-warn">Not yet confirmed fully funded — check the review queue before investing time.</span>}
            </div>
          )}
        </Card>
        {notice && <div className="mb-4"><Callout tone="warn">{notice}</Callout></div>}
        {!ready && <div className="mb-4"><Callout tone="warn" title="Approve your master CV first">Documents are generated only from an approved master CV, so nothing unverified can slip in.</Callout></div>}

        {op && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kinds.map((k) => <KindCard key={k.kind} k={k} existing={(byOp.get(op.id) ?? []).filter((d) => d.kind === k.kind)} disabled={!ready} onCreate={(target) => setDialog({ kind: k.kind, target })} />)}
          </div>
        )}
      </section>

      <section>
        <SectionTitle aside={<span className="font-mono text-xs text-muted">{docs.length}</span>}>Your documents</SectionTitle>
        {docs.length === 0 ? (
          <Empty title="No documents yet">Approve your master CV, choose an opportunity and create a document.</Empty>
        ) : (
          <div className="space-y-4">
            {[...byOp.entries()].map(([id, list]) => {
              const o = opportunities.find((x) => x.id === id)
              return (
                <Card key={id || 'none'}>
                  <div className="border-b border-line px-4 py-2.5">
                    <div className="text-xs font-medium tracking-wide text-ochre uppercase">{o?.university ?? list[0].university ?? 'General'}</div>
                    <div className="truncate text-sm">{o?.title ?? 'Not linked to an opportunity'}</div>
                  </div>
                  <ul className="divide-y divide-line">
                    {list.map((d) => (
                      <li key={d.id}>
                        <Link to={`/documents/${d.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-paper/60">
                          <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                          <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                          <span className="font-mono text-xs text-muted">v{d.versions.length}</span>
                          <span className="text-xs text-muted">{new Date(d.updatedAt).toLocaleDateString('en-GB')}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {dialog && op && (
        <CreateDialog
          kind={dialog.kind}
          target={dialog.target}
          targets={kinds.find((k) => k.kind === dialog.kind)?.targets ?? [dialog.target]}
          opName={op.university}
          topics={topics.filter((t) => t.status === 'approved' && (t.opportunityId === op.id || t.opportunityId === null))}
          onClose={() => setDialog(null)}
          onCreate={async (o) => {
            const r = await create(dialog.kind, op, o)
            setDialog(null)
            if (r.notice) setNotice(r.notice)
            if (r.id) nav(`/documents/${r.id}`)
          }}
        />
      )}
    </>
  )
}

function KindCard({ k, existing, disabled, onCreate }: { k: KindRelevance; existing: AppDocument[]; disabled: boolean; onCreate: (t: DocTarget) => void }) {
  return (
    <Card className={cx('flex flex-col p-4', !k.relevant && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-serif text-lg leading-snug">{KIND_LABEL[k.kind]}</h3>
        <Badge tone={LEVEL_TONE[k.level]}>{k.level.replace('-', ' ')}</Badge>
      </div>
      <p className="mt-1 flex-1 text-xs text-muted">{k.reason}</p>
      {existing.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs">
          {existing.map((d) => <Link key={d.id} to={`/documents/${d.id}`} className="block truncate text-forest underline">{d.title} · {d.status} · v{d.versions.length}</Link>)}
        </div>
      )}
      {k.relevant && (
        <div className="mt-3 flex flex-wrap gap-2">
          {k.targets.map((t) => (
            <Button key={t} size="sm" variant={existing.length ? 'secondary' : 'primary'} disabled={disabled} onClick={() => onCreate(t)}>
              {k.kind === 'cv' ? 'Tailor my CV' : k.kind === 'cover-letter' ? 'Generate cover letter' : 'Create'}{k.targets.length > 1 ? ` ${TARGET_LABEL[t]}` : ''}
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}

function CreateDialog({ kind, target, targets, opName, topics, onClose, onCreate }: { kind: DocKind; target: DocTarget; targets: DocTarget[]; opName: string; topics: { id: string; title: string }[]; onClose: () => void; onCreate: (o: { target: DocTarget; wordLimit: number | null; question?: string; topicId?: string | null }) => void }) {
  const [t, setT] = useState(target)
  const [limit, setLimit] = useState('')
  const [question, setQuestion] = useState('')
  const [topicId, setTopicId] = useState(topics[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const def = DEFAULT_WORD_LIMIT[kind]
  const needsQuestion = kind === 'application-answer'
  return (
    <Modal open title={`${KIND_LABEL[kind]} — ${opName}`} onClose={onClose}>
      <div className="space-y-3">
        {targets.length > 1 && (
          <Field label="Written for">
            <Select value={t} onChange={(e) => setT(e.target.value as DocTarget)}>
              {targets.map((x) => <option key={x} value={x}>{x === 'programme' ? 'PhD admission application' : x === 'scholarship' ? 'Separate scholarship application' : x}</option>)}
            </Select>
          </Field>
        )}
        {needsQuestion && (
          <Field label="Exact question from the application form">
            <TextArea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </Field>
        )}
        {kind !== 'cv' && kind !== 'academic-cv' && (
          <Field label="Word limit stated on the application" hint={def ? `Leave blank to use a default of ${def} words (labelled as a default, not the official limit).` : 'Leave blank if there is none.'}>
            <Input type="number" min={50} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={def ? String(def) : ''} />
          </Field>
        )}
        {topics.length > 0 && ['cover-letter', 'statement-of-purpose', 'research-summary', 'supervisor-email', 'personal-statement'].includes(kind) && (
          <Field label="Approved research topic to use">
            <Select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              <option value="">Automatic (best match)</option>
            </Select>
          </Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={busy || (needsQuestion && !question.trim())}
          onClick={() => {
            setBusy(true)
            onCreate({ target: t, wordLimit: limit ? Number(limit) : null, question: question.trim() || undefined, topicId: topicId || null })
          }}
        >
          {busy ? 'Drafting…' : 'Generate draft'}
        </Button>
      </div>
    </Modal>
  )
}
