import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, Empty, Input, Modal, SectionTitle, TextArea, cx } from '../components/ui'
import { audit, canApprove } from '../lib/docs/audit'
import { approve, approvedVersion, currentVersion, reject, restore, saveEdit } from '../lib/docs/documents'
import { exportDocx, exportPdf, fileBase } from '../lib/docs/exportDoc'
import { collectFacts } from '../lib/docs/facts'
import { KIND_LABEL, wordCount } from '../lib/docs/requirements'
import { useDocumentActions } from '../lib/docs/useDocuments'
import { downloadText } from '../lib/exporter'
import { useStore } from '../lib/store'
import type { AppDocument } from '../types'

const TARGET_TEXT = { programme: 'PhD admission application', scholarship: 'Separate scholarship application', supervisor: 'Supervisor enquiry (not sent by the app)', form: 'Application form answer' }
const REQ_ICON = { addressed: { i: '✓', c: 'text-ok' }, placeholder: { i: '◐', c: 'text-warn' }, 'not-addressed': { i: '○', c: 'text-bad' } }

export default function DocumentReview() {
  const { id } = useParams()
  const { docs, setDocs, opportunities, masterCv, profile, topics } = useStore()
  const { regenerate } = useDocumentActions()
  const doc = docs.find((d) => d.id === id)
  const op = opportunities.find((o) => o.id === doc?.opportunityId) ?? null
  const cur = doc ? currentVersion(doc) : null
  const [text, setText] = useState(cur?.content ?? '')
  const [viewing, setViewing] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [limitDraft, setLimitDraft] = useState(doc?.wordLimit ? String(doc.wordLimit) : '')

  useEffect(() => {
    setText(cur?.content ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id])

  const basis = masterCv?.snapshot ?? profile
  const topic = topics.find((t) => t.id === doc?.topicId)
  const issues = useMemo(
    () => (doc ? audit({ text, profile: basis, op, wordLimit: doc.wordLimit, extraAllowedText: `${doc.question ?? ''}\n${topic ? JSON.stringify(topic) : ''}` }) : []),
    [text, basis, op, doc, topic],
  )
  if (!doc || !cur) return <Empty title="Document not found"><Link className="text-forest underline" to="/documents">Back to the studio</Link></Empty>

  const set = (d: AppDocument) => setDocs((ds) => ds.map((x) => (x.id === d.id ? d : x)))
  const dirty = text !== cur.content
  const wc = wordCount(text)
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const approvedV = approvedVersion(doc)
  const facts = collectFacts(basis)
  const used = facts.filter((f) => cur.usedFactIds.includes(f.id))
  const staleMaster = masterCv && cur.masterCvApprovedAt && cur.masterCvApprovedAt !== masterCv.approvedAt
  const shown = viewing ? doc.versions.find((v) => v.id === viewing) : null
  const exportText = approvedV?.content ?? ''

  const doRegenerate = async () => {
    if (!op) return setNotice('This document is not linked to an opportunity, so it cannot be regenerated here.')
    if (dirty && !confirm('Discard your unsaved edits and generate a new version?')) return
    setBusy(true)
    const n = await regenerate(doc, op)
    setBusy(false)
    setNotice(n ?? '')
  }

  return (
    <>
      <div className="mb-4 text-sm"><Link to={`/documents${op ? `?op=${op.id}` : ''}`} className="text-forest hover:underline">← Documents Studio</Link></div>

      <header className="mb-6 border-b border-line pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="forest">{KIND_LABEL[doc.kind]}</Badge>
          <Badge tone={doc.status === 'approved' ? 'ok' : doc.status === 'rejected' ? 'bad' : 'warn'}>{doc.status === 'approved' ? `Approved v${approvedV?.n}` : doc.status}</Badge>
          <Badge>{TARGET_TEXT[doc.target]}</Badge>
          <Badge tone={cur.generator === 'ai' ? 'ochre' : 'neutral'}>{cur.generator === 'ai' ? 'AI draft via your backend' : cur.generator === 'edit' ? 'Edited by you' : 'Template draft (no AI)'}</Badge>
        </div>
        <div className="text-xs font-medium tracking-wide text-ochre uppercase">{doc.university || 'Not linked to an opportunity'}</div>
        <h1 className="mt-1 text-2xl leading-tight font-medium sm:text-3xl">{doc.opportunityTitle || doc.title}</h1>
        {op && <Link to={`/opportunity/${op.id}`} className="mt-1 inline-block text-sm text-forest underline">View opportunity record</Link>}
      </header>

      {staleMaster && <div className="mb-4"><Callout tone="warn">This version was built from an earlier master CV. Regenerate to use your latest approved master CV.</Callout></div>}
      {doc.status === 'approved' && approvedV && approvedV.id !== cur.id && <div className="mb-4"><Callout tone="warn">You are viewing version {cur.n}, which is not approved. Exports use the approved version {approvedV.n}.</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="warn">{notice}</Callout></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm">
                <span className={cx('font-mono tabular', doc.wordLimit && wc.total > doc.wordLimit ? 'text-bad' : 'text-ink')}>
                  {wc.total}{doc.wordLimit ? ` / ${doc.wordLimit}` : ''} words
                </span>
                {wc.total !== wc.excludingPlaceholders && <span className="text-xs text-muted">({wc.excludingPlaceholders} excluding [ADD] prompts)</span>}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="limit" className="text-muted">Word limit</label>
                <Input id="limit" type="number" value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} onBlur={() => set({ ...doc, wordLimit: limitDraft ? Number(limitDraft) : null, wordLimitSource: limitDraft ? 'application' : null })} className="w-20 py-1" />
                {doc.wordLimitSource === 'default' && <Badge tone="warn">default — replace with the form's limit</Badge>}
                {doc.wordLimitSource === 'application' && <Badge tone="ok">from application</Badge>}
              </div>
            </div>
            {doc.wordLimit && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div className={cx('h-full rounded-full', wc.total > doc.wordLimit ? 'bg-bad' : 'bg-forest')} style={{ width: `${Math.min(100, (wc.total / doc.wordLimit) * 100)}%` }} /></div>
            )}
            {doc.question && <p className="mb-2 rounded bg-paper px-3 py-2 text-sm"><span className="font-semibold">Question:</span> {doc.question}</p>}
            <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={28} className={cx('min-h-[520px]', doc.format === 'cv' ? 'font-mono text-[13px] leading-relaxed' : 'doc-editor')} aria-label="Draft content" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" disabled={!dirty} onClick={() => set(saveEdit(doc, text))}>Save edit as v{doc.versions.length + 1}</Button>
              <Button disabled={!dirty} variant="ghost" onClick={() => setText(cur.content)}>Discard edits</Button>
              <Button onClick={doRegenerate} disabled={busy || !op}>{busy ? 'Regenerating…' : 'Regenerate'}</Button>
              <Button variant="accent" disabled={dirty} onClick={() => { setConfirmed(false); setApproving(true) }}>Approve v{cur.n}…</Button>
              <Button variant="danger" onClick={() => confirm('Reject this document? It stays in your history.') && set(reject(doc))}>Reject</Button>
            </div>
            {dirty && <p className="mt-2 text-xs text-muted">Save your edits as a new version before approving.</p>}
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle aside={<span className="text-xs text-muted">{approvedV ? `approved v${approvedV.n}` : 'approve first'}</span>}>Export</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!approvedV} onClick={() => approvedV && exportDocx(doc, exportText)}>Word (.docx)</Button>
              <Button disabled={!approvedV} onClick={() => approvedV && exportPdf(doc, exportText)}>PDF</Button>
              <Button disabled={!approvedV} variant="ghost" onClick={() => approvedV && downloadText(`${fileBase(doc)}.txt`, exportText)}>.txt</Button>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(text)}>Copy current text</Button>
            </div>
            <p className="mt-2 text-xs text-muted">Files are created in your browser. Nothing is sent to any university — you submit through the official portal.</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle aside={<span className="font-mono text-xs text-muted">{doc.versions.length}</span>}>Version history</SectionTitle>
            <ul className="divide-y divide-line text-sm">
              {[...doc.versions].reverse().map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-mono text-xs">v{v.n}</span>
                  <span className="flex-1">{v.note}</span>
                  <Badge tone={v.generator === 'ai' ? 'ochre' : 'neutral'}>{v.generator}</Badge>
                  {v.id === doc.approvedVersionId && <Badge tone="ok">approved</Badge>}
                  {v.id === cur.id && <Badge tone="forest">current</Badge>}
                  <span className="text-xs text-muted">{new Date(v.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <button className="text-xs text-forest underline" onClick={() => setViewing(viewing === v.id ? null : v.id)}>{viewing === v.id ? 'hide' : 'view'}</button>
                  {v.id !== cur.id && <button className="text-xs text-forest underline" onClick={() => set(restore(doc, v.id))}>restore</button>}
                </li>
              ))}
            </ul>
            {shown && <pre className="mt-3 max-h-80 overflow-auto rounded border border-line bg-paper p-3 font-mono text-[12px] whitespace-pre-wrap">{shown.content}</pre>}
            <p className="mt-2 text-xs text-muted">This history belongs to {doc.university || 'this document'} only. Documents are never copied between universities — generate a new one for each opportunity.</p>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-2 font-sans text-sm font-semibold">Factual check</h3>
            {issues.length === 0 ? (
              <p className="text-sm text-ok">✓ No problems found.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {errors.map((i, n) => <li key={`e${n}`} className="text-bad">✕ {i.message}</li>)}
                {warnings.map((i, n) => <li key={`w${n}`} className="text-warn">! {i.message}</li>)}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">Checks figures, grades, software, publications, awards and university names against your verified facts and this opportunity. Errors block approval.</p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 font-sans text-sm font-semibold">Requirements addressed</h3>
            {cur.requirements.length === 0 ? (
              <p className="text-sm text-muted">None recorded for this version.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {cur.requirements.map((r) => (
                  <li key={r.id}>
                    <span className={REQ_ICON[r.status].c}>{REQ_ICON[r.status].i}</span> {r.text}
                    <Badge className="ml-1" tone={r.source === 'official' ? 'forest' : 'neutral'}>{r.source}</Badge>
                    {r.factIds.length > 0 && <div className="ml-4 text-xs text-muted">Evidence: {r.factIds.map((fid) => facts.find((f) => f.id === fid)?.label ?? (fid.startsWith('topic:') ? 'approved topic' : fid.startsWith('op:') ? 'opportunity record' : fid)).join('; ')}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {cur.missing.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 font-sans text-sm font-semibold text-warn">Missing information — add it yourself</h3>
              <ul className="list-inside list-disc space-y-1 text-sm">{cur.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              <Link to="/profile" className="mt-2 inline-block text-xs text-forest underline">Open profile</Link>
            </Card>
          )}

          {cur.changes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 font-sans text-sm font-semibold">What was prioritised and why</h3>
              <ul className="list-inside list-disc space-y-1 text-sm">{cur.changes.map((c) => <li key={c}>{c}</li>)}</ul>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="mb-2 font-sans text-sm font-semibold">Source facts used ({used.length})</h3>
            {used.length === 0 ? (
              <p className="text-sm text-muted">No verified facts recorded for this version.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
                {used.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium">{f.label}</span>
                    {f.text && f.text !== f.label && <div className="text-muted">{f.text.length > 160 ? `${f.text.slice(0, 157)}…` : f.text}</div>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">From your master CV approved {masterCv ? new Date(masterCv.approvedAt).toLocaleDateString('en-GB') : '—'}.</p>
          </Card>
        </aside>
      </div>

      <Modal open={approving} title={`Approve version ${cur.n}?`} onClose={() => setApproving(false)}>
        {!canApprove(issues) ? (
          <>
            <Callout tone="bad" title="This version cannot be approved yet">
              <ul className="list-inside list-disc">{errors.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
            </Callout>
            <div className="mt-4 flex justify-end"><Button onClick={() => setApproving(false)}>Back to editing</Button></div>
          </>
        ) : (
          <>
            {warnings.length > 0 && <Callout tone="warn" title="Warnings">{warnings.map((w) => w.message).join(' ')}</Callout>}
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-forest" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I have read every sentence. It is accurate, written by or approved by me, and written specifically for {doc.university || 'this application'}.</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setApproving(false)}>Cancel</Button>
              <Button variant="primary" disabled={!confirmed} onClick={() => { set(approve(doc, cur.id)); setApproving(false) }}>Approve</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
