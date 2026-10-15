import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { VerificationChecklist } from '../components/VerificationChecklist'
import { Badge, Button, Callout, Card, DeadlineText, Empty, FundingMeter, GateText, LinkOut, Modal, ScoreRing, SectionTitle, TriText, VerdictBadge, cx } from '../components/ui'
import { GATE_LABEL, isActionable, parseDeadline } from '../lib/eligibility'
import { downloadIcs, slug } from '../lib/exporter'
import { matchedInterests, uid } from '../lib/profile'
import { useStore } from '../lib/store'
import { useAssessed } from '../lib/useAssessed'
import type { EvidenceField, Gate, Opportunity, Profile } from '../types'

function profileGaps(p: Profile, op: Opportunity): string[] {
  const gaps: string[] = []
  if (op.english.requirement && !p.languageTests.some((t) => t.verified)) gaps.push(`English requirement: ${op.english.requirement}. No confirmed test result in your profile yet.`)
  if (op.minimumDegree && !p.degrees.every((d) => d.classification)) gaps.push(`Minimum degree: ${op.minimumDegree}. Add your results so equivalence can be checked against the university's requirements for Ethiopia.`)
  if (op.fundingModel === 'dtp') gaps.push('ESRC DTPs assess whether your Master’s includes enough research-methods training for a +3.5 route; otherwise a 1+3.5 route may apply.')
  if (op.supervisorContactRequired === 'yes') gaps.push('A supervisor must be identified or provide a supporting statement before you apply.')
  if (op.proposalRequired === 'yes') gaps.push('A research proposal is required — approve a topic in the Topic Workshop.')
  if (op.separateScholarshipApplication === 'yes') gaps.push('A separate scholarship application is required in addition to the PhD application.')
  if (op.competitionNote) gaps.push(op.competitionNote)
  return gaps
}

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-1 border-b border-line py-2.5 text-sm last:border-0 sm:grid-cols-[200px_1fr] sm:gap-4">
    <dt className="text-muted">{k}</dt>
    <dd>{children}</dd>
  </div>
)

const FIELD_LABEL: Record<EvidenceField, string> = {
  'eligibility.international': 'International eligibility',
  'eligibility.ethiopian': 'Ethiopian eligibility',
  tuition: 'Tuition',
  stipend: 'Stipend',
  duration: 'Duration',
  deadline: 'Deadline',
  entry: 'Entry requirements',
  english: 'English',
  separateApplication: 'Separate application',
  supervisorContact: 'Supervisor contact',
  documents: 'Documents',
}

const STEP_TONE: Record<string, 'forest' | 'ochre' | 'neutral' | 'warn'> = { scholarship: 'ochre', admissions: 'forest', internal: 'warn', 'final-form': 'ochre' }
const STD_DOCS = ['Academic transcripts (BSc and MSc)', 'Degree certificates', 'Passport (bio page)', 'English test certificate (or exemption)', 'CV', 'Two references']

export default function Details() {
  const { id } = useParams()
  const nav = useNavigate()
  const items = useAssessed()
  const { profile, applications, upsertApplication, updateApplication, toggleDismiss, dismissed, checks, docs: allDocs } = useStore()
  const item = items.find((i) => i.op.id === id)
  const [confirmApplied, setConfirmApplied] = useState(false)
  const [submittedOn, setSubmittedOn] = useState(new Date().toISOString().slice(0, 10))
  if (!item) return <Empty title="Opportunity not found"><Link className="text-forest underline" to="/find">Back to search</Link></Empty>

  const { op, a, match } = item
  const app = applications.find((x) => x.opportunityId === op.id)
  const matched = matchedInterests(profile, op)
  const gaps = profileGaps(profile, op)
  const blocks = a.reasons.filter((r) => r.level === 'block')
  const warns = a.reasons.filter((r) => r.level === 'warn')
  const oks = a.reasons.filter((r) => r.level === 'ok')
  const actionable = isActionable(a)
  const docs = [...new Set([...op.requiredDocuments, ...STD_DOCS])]
  const docTask = (d: string) => app?.tasks.find((t) => t.text === `Document: ${d}`)
  const back = a.verdict === 'verified' ? '/find' : isActionable(a) ? '/review' : '/archive'
  const mine = checks[op.id] ?? []
  const myDocs = allDocs.filter((d) => d.opportunityId === op.id)

  const toggleDoc = (d: string) => {
    const target = app ?? upsertApplication(op.id)
    const existing = target.tasks.find((t) => t.text === `Document: ${d}`)
    const tasks = existing ? target.tasks.map((t) => (t.id === existing.id ? { ...t, done: !t.done } : t)) : [...target.tasks, { id: uid(), text: `Document: ${d}`, due: '', done: true }]
    updateApplication(target.id, { tasks })
  }

  return (
    <>
      <div className="mb-4 text-sm"><Link to={back} className="text-forest hover:underline">← Back</Link></div>

      <header className="mb-6 border-b border-line pb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={a.verdict} />
          {op.recordType === 'demo' && <Badge tone="ochre">Illustrative fixture — fictional</Badge>}
          <Badge tone={op.confidence === 'high' ? 'ok' : op.confidence === 'medium' ? 'warn' : 'bad'}>Evidence confidence: {op.confidence}</Badge>
          <Badge tone={a.stale ? 'warn' : 'neutral'}>Verified {new Date(op.lastVerified).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Badge>
          {mine.length > 0 && <Badge tone="forest">{mine.length} fact{mine.length > 1 ? 's' : ''} confirmed by you</Badge>}
          {op.archivedAt && <Badge>Archived: {op.archiveReason}</Badge>}
          {app && <Badge tone="forest">Tracking: {app.status}</Badge>}
        </div>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium tracking-wide text-ochre uppercase">{op.university}</div>
            <h1 className="mt-1 text-3xl leading-tight font-medium">{op.title}</h1>
            <p className="mt-2 text-muted">{op.scholarshipName} · {op.fundingProvider}</p>
          </div>
          <div className="hidden flex-col items-center sm:flex">
            <ScoreRing score={match.score} muted={!match.primary} />
            <span className="mt-1 text-[10px] tracking-wide text-muted uppercase">Match</span>
          </div>
        </div>

        <div className="no-print mt-5 flex flex-wrap gap-2">
          {!app && <Button variant="primary" onClick={() => upsertApplication(op.id)} disabled={!actionable}>Save to applications</Button>}
          {app && (
            <Button variant={app.shortlisted ? 'primary' : 'secondary'} onClick={() => updateApplication(app.id, { shortlisted: !app.shortlisted, status: app.status === 'Interested' ? 'Eligibility Check' : app.status })}>
              {app.shortlisted ? '★ Shortlisted' : '☆ Shortlist'}
            </Button>
          )}
          {!app && <Button onClick={() => upsertApplication(op.id, { shortlisted: true, status: 'Eligibility Check' })} disabled={!actionable}>☆ Shortlist</Button>}
          <Button onClick={() => setConfirmApplied(true)} disabled={!actionable || app?.status === 'Submitted'}>Mark as applied</Button>
          <Button variant="danger" onClick={() => toggleDismiss(op.id)}>{dismissed.includes(op.id) ? 'Restore' : 'Not for me'}</Button>
          {a.deadline && a.daysToDeadline != null && a.daysToDeadline > 0 && (
            <Button variant="ghost" onClick={() => downloadIcs(`${slug(op.university)}-deadline.ics`, `Deadline: ${op.scholarshipName}`, a.deadline!, `${op.title}\n${op.fundingUrl ?? ''}`)}>Add deadline to calendar</Button>
          )}
        </div>
      </header>

      {blocks.length > 0 && (
        <div className="mb-6">
          <Callout tone="bad" title={a.verdict === 'expired' ? 'Deadline passed — archived' : a.verdict === 'shortfall' ? 'Funding shortfall — not fully funded for an international student' : 'Not eligible'}>
            <ul className="list-inside list-disc">{blocks.map((r) => <li key={r.text}>{r.text}</li>)}</ul>
          </Callout>
        </div>
      )}
      {a.verdict === 'potential' && (
        <div className="mb-6">
          <Callout tone="warn" title="Potential match — not confirmed">This is in the review queue. Use the verification checklist below; it moves to the verified results only when every gate fact is confirmed from an official page.</Callout>
        </div>
      )}
      {a.verdict === 'insufficient' && (
        <div className="mb-6">
          <Callout tone="warn" title="Insufficient evidence">Two or more core funding or eligibility facts have no official evidence. Treat this as a lead only.</Callout>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionTitle aside={<span className="font-mono text-xs text-muted">Step 1</span>}>Eligibility & funding gate</SectionTitle>
            <Card className="p-5">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {(Object.keys(a.gate) as (keyof Gate)[]).map((k) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
                    <dt className="text-muted">{GATE_LABEL[k]}</dt>
                    <dd><GateText state={a.gate[k]} /></dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-sans text-sm font-semibold text-ok">Why you may be a match</h3>
                  <ul className="space-y-1.5 text-sm">
                    {oks.map((r) => <li key={r.text}>✓ {r.text}</li>)}
                    {matched.length > 0 && <li>✓ Overlaps your interests: {matched.join(', ')}.</li>}
                    <li>✓ BSc Economics + MSc Project Management — relevant to {op.subjects.slice(0, 2).join(' / ') || 'this field'}.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 font-sans text-sm font-semibold text-warn">Gaps to resolve</h3>
                  <ul className="space-y-1.5 text-sm">
                    {warns.map((r) => <li key={r.text}>? {r.text}</li>)}
                    {gaps.map((g) => <li key={g}>? {g}</li>)}
                    {warns.length + gaps.length === 0 && <li className="text-muted">None identified from the recorded terms.</li>}
                  </ul>
                </div>
              </div>
            </Card>
          </section>

          {isActionable(a) && <VerificationChecklist op={op} a={a} />}

          {isActionable(a) && (
            <section className="no-print">
              <SectionTitle aside={<span className="font-mono text-xs text-muted">Steps 2–4 · nothing is sent anywhere</span>}>Prepare your application</SectionTitle>
              {a.verdict !== 'verified' && <p className="-mt-1 mb-3 text-xs text-warn">This opportunity is not yet confirmed as fully funded. You can draft documents, but confirm the missing facts first.</p>}
              {myDocs.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  {myDocs.map((d) => <Link key={d.id} to={`/documents/${d.id}`} className="rounded-full border border-line bg-surface px-2.5 py-1 hover:border-forest">{d.title.split(' — ')[0]} · {d.status} · v{d.versions.length}</Link>)}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { n: '2', t: 'Tailor my CV', d: 'Draft from your verified profile only.', to: `/documents?op=${op.id}&kind=cv&new=1` },
                  { n: '3', t: 'Generate cover letter', d: 'Uses verified facts + this award’s criteria.', to: `/documents?op=${op.id}&kind=cover-letter&new=1` },
                  { n: '4', t: 'Suggest research topics', d: 'You approve one before any proposal is drafted.', to: `/topics?op=${op.id}` },
                  { n: '5', t: 'Other documents', d: 'Only the documents relevant to this opportunity.', to: `/documents?op=${op.id}` },
                ].map((s) => (
                  <button key={s.n} onClick={() => { if (!app) upsertApplication(op.id); nav(s.to) }} className="rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-forest">
                    <div className="font-mono text-xs text-ochre">STEP {s.n}</div>
                    <div className="mt-1 font-serif text-lg">{s.t}</div>
                    <div className="mt-1 text-xs text-muted">{s.d}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle aside={<span className="font-mono text-sm tabular">{match.score}/100</span>}>Match score</SectionTitle>
            <Card className="p-5">
              <p className="mb-3 text-xs text-muted">The score ranks opportunities. It never overrides the funding gate — {match.primary ? 'this one passed it.' : 'this one has not passed it.'}</p>
              <ul className="space-y-2.5">
                {match.components.map((c) => (
                  <li key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm sm:grid-cols-[200px_1fr_auto]">
                    <span>{c.label}</span>
                    <span className="order-3 col-span-2 text-xs text-muted sm:order-none sm:col-span-1">
                      <span className="mb-1 block h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-forest" style={{ width: `${(c.points / c.max) * 100}%` }} /></span>
                      {c.note}
                    </span>
                    <span className="font-mono text-xs tabular">{c.points}/{c.max}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionTitle>Funding breakdown</SectionTitle>
            <Card className="p-5">
              <FundingMeter op={op} a={a} />
              <dl className="mt-4">
                <Row k="Tuition coverage">
                  <div className="font-medium">{op.tuition.coverage.replace(/-/g, ' ')}</div>
                  <div>International fee covered in full: <GateText state={a.gate.tuition} /></div>
                  <div className="mt-1 text-muted">{op.tuition.note}</div>
                </Row>
                <Row k="Stipend">
                  {op.stipend.amount != null ? <span className="font-medium tabular">£{op.stipend.amount.toLocaleString('en-GB')} {op.stipend.frequency}{op.stipend.rateYear && ` (${op.stipend.rateYear})`}</span> : <TriText value={op.stipend.provided === 'yes' ? 'unknown' : op.stipend.provided} unknown="Amount not verified" no="No stipend" />}
                  {op.stipend.note && <div className="mt-1 text-muted">{op.stipend.note}</div>}
                </Row>
                <Row k="Funded duration">{op.durationYears != null ? `${op.durationYears} years` : <TriText value="unknown" />}{op.durationNote && <div className="mt-1 text-muted">{op.durationNote}</div>}</Row>
                <Row k="Allowances">{op.allowances.length ? <ul className="list-inside list-disc">{op.allowances.map((x) => <li key={x}>{x}</li>)}</ul> : <span className="text-muted">None recorded</span>}</Row>
              </dl>
            </Card>
            <Card className="mt-3 p-5">
              <h3 className="mb-1 font-sans text-sm font-semibold">Costs shown separately — not assumed covered</h3>
              <dl>
                <Row k="Visa application fee"><TriText value={op.extraCosts.visa} yes="Covered" no="Not covered" /></Row>
                <Row k="Immigration Health Surcharge"><TriText value={op.extraCosts.immigrationHealthSurcharge} yes="Covered" no="Not covered" /></Row>
                <Row k="Travel to the UK"><TriText value={op.extraCosts.travel} yes="Covered" no="Not covered" /></Row>
                <Row k="Relocation / deposits"><TriText value={op.extraCosts.relocation} yes="Covered" no="Not covered" /></Row>
                <Row k="Dependants"><TriText value={op.extraCosts.dependants} yes="Covered" no="Not covered" /></Row>
              </dl>
              {op.extraCosts.note && <p className="mt-2 text-sm text-muted">{op.extraCosts.note}</p>}
              <p className="mt-2 text-xs text-muted">Check current UK visa and IHS fees on gov.uk before budgeting.</p>
            </Card>
          </section>

          <section>
            <SectionTitle>Programme & requirements</SectionTitle>
            <Card className="p-5">
              <dl>
                <Row k="Department">{op.department ?? <TriText value="unknown" />}</Row>
                <Row k="Programme">{op.programme ?? <TriText value="unknown" />}</Row>
                {op.description && <Row k="Project description">{op.description}</Row>}
                <Row k="Subjects">{op.subjects.join(', ')}</Row>
                {op.researchGroup && <Row k="Research group">{op.researchGroup}</Row>}
                <Row k="Supervisors">{op.supervisors.length ? op.supervisors.map((s) => <div key={s.name}>{s.url ? <LinkOut href={s.url}>{s.name}</LinkOut> : s.name}</div>) : <span className="text-muted">Not specified — identify via the department</span>}</Row>
                <Row k="Entry requirements">{op.entryRequirements || <TriText value="unknown" />}</Row>
                <Row k="Minimum degree">{op.minimumDegree ?? <TriText value="unknown" />}</Row>
                <Row k="English language">{op.english.requirement ?? <TriText value="unknown" />}{op.english.tests.length > 0 && <div className="text-muted">Tests: {op.english.tests.join(', ')}</div>}</Row>
                <Row k="Separate scholarship application"><TriText value={op.separateScholarshipApplication} yes="Yes — apply separately" no="No — considered via PhD application" /></Row>
                <Row k="Research proposal required"><TriText value={op.proposalRequired} /></Row>
                <Row k="Contact supervisor first"><TriText value={op.supervisorContactRequired} /></Row>
                <Row k="Selection stages">{op.selectionStages.length ? <ol className="list-inside list-decimal">{op.selectionStages.map((s) => <li key={s}>{s}</li>)}</ol> : <TriText value="unknown" />}</Row>
                <Row k="Start">{op.startDate ? new Date(op.startDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—'} <span className="text-muted">{op.startNote}</span></Row>
              </dl>
            </Card>
          </section>

          <section>
            <SectionTitle aside={<span className="font-mono text-xs text-muted">{op.evidence.length} items</span>}>Evidence</SectionTitle>
            <Card className="divide-y divide-line">
              {op.evidence.length === 0 && <p className="p-4 text-sm text-muted">No evidence recorded.</p>}
              {op.evidence.map((e, i) => (
                <div key={i} className="p-4 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="forest">{FIELD_LABEL[e.field]}</Badge>
                    <Badge tone={e.sourceType.startsWith('official') ? 'ok' : 'bad'}>{e.sourceType}</Badge>
                    {e.addedBy === 'applicant' && <Badge tone="ochre">confirmed by you</Badge>}
                    <span className="text-xs text-muted">read {new Date(e.retrieved).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div>{e.claim}</div>
                  {e.quote && <blockquote className="mt-1 border-l-2 border-ochre pl-2 font-serif text-muted italic">“{e.quote}”</blockquote>}
                  <div className="mt-1 truncate text-xs"><LinkOut href={e.url}>{e.url.replace(/^https:\/\//, '')}</LinkOut></div>
                </div>
              ))}
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <div className="text-[11px] tracking-wide text-muted uppercase">{op.deadline.type ? `${op.deadline.type} deadline` : 'Deadline'}</div>
            <div className="mt-1 text-lg"><DeadlineText a={a} /></div>
            {op.deadline.note && <p className="mt-2 text-xs text-muted">{op.deadline.note}</p>}
            {match.prepStatus !== 'unknown' && a.daysToDeadline != null && a.daysToDeadline >= 0 && (
              <p className={cx('mt-2 text-xs font-medium', match.prepStatus === 'comfortable' ? 'text-ok' : match.prepStatus === 'tight' ? 'text-warn' : 'text-bad')}>
                Estimated preparation: ~{match.prepDays} days · {match.prepStatus === 'comfortable' ? 'enough time' : match.prepStatus === 'tight' ? 'tight — start now' : 'very tight'}
              </p>
            )}
            {op.deadline.steps.length > 0 && (
              <ol className="mt-4 space-y-2.5 border-l border-line pl-4">
                {op.deadline.steps.map((s) => {
                  const d = parseDeadline(s.date)
                  const past = d ? d.getTime() < Date.now() : false
                  return (
                    <li key={s.label + s.date} className={cx('relative text-sm', past && 'text-muted line-through')}>
                      <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-ochre" />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs tabular">{d?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}</span>
                        <Badge tone={STEP_TONE[s.type] ?? 'neutral'}>{s.type}</Badge>
                      </div>
                      <div>{s.label}</div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>

          {op.discrepancies.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-2 font-sans text-sm font-semibold">Conflicting information</h3>
              <ul className="space-y-3 text-sm">
                {op.discrepancies.map((d) => (
                  <li key={d.id}>
                    <Badge tone={d.resolved ? 'ok' : 'warn'}>{d.resolved ? 'Resolved' : 'Manual review needed'}</Badge>
                    <p className="mt-1">{d.description}</p>
                    {d.resolution && <p className="mt-1 text-xs text-muted">{d.resolution}</p>}
                    <div className="mt-1 space-x-2 text-xs">{d.urls.map((u, i) => <LinkOut key={u} href={u}>{`source ${i + 1}`}</LinkOut>)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-sans text-sm font-semibold">Document checklist</h3>
              <span className="font-mono text-xs text-muted">{docs.filter((d) => docTask(d)?.done).length}/{docs.length}</span>
            </div>
            <ul className="space-y-1.5">
              {docs.map((d) => (
                <li key={d}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 accent-forest" checked={!!docTask(d)?.done} onChange={() => toggleDoc(d)} />
                    <span>{d}{!op.requiredDocuments.includes(d) && <span className="text-muted"> (typical)</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">Items marked “typical” are common UK requirements — confirm on the official page.</p>
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 font-sans text-sm font-semibold">Official pages</h3>
            <ul className="space-y-1.5 text-sm">
              {op.programmeUrl && <li><LinkOut href={op.programmeUrl}>Programme page</LinkOut></li>}
              {op.fundingUrl && op.fundingUrl !== op.programmeUrl && <li><LinkOut href={op.fundingUrl}>Funding / studentship page</LinkOut></li>}
              {op.sources.map((s) => <li key={s.url}><LinkOut href={s.url}>{s.label}</LinkOut></li>)}
              {op.sources.length === 0 && <li className="text-muted">No sources (illustrative fixture).</li>}
            </ul>
            <p className="mt-3 text-sm text-muted">{op.verificationNotes}</p>
            {op.outstanding.length > 0 && (
              <>
                <h4 className="mt-4 mb-1 font-sans text-xs font-semibold tracking-wide text-warn uppercase">Still to verify</h4>
                <ul className="list-inside list-disc space-y-1 text-sm">{op.outstanding.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
          </Card>
        </aside>
      </div>

      <Modal open={confirmApplied} title="Record this application as submitted?" onClose={() => setConfirmApplied(false)}>
        <p className="text-sm text-muted">This only updates your tracker. Doctoral Compass never submits applications or contacts anyone on your behalf — you submit through the university's own portal.</p>
        <label className="mt-4 block text-sm">
          Date you submitted
          <input type="date" value={submittedOn} onChange={(e) => setSubmittedOn(e.target.value)} className="mt-1 block rounded-md border border-line-strong px-2 py-1.5" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmApplied(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { upsertApplication(op.id, { status: 'Submitted', submittedOn }); setConfirmApplied(false) }}>Yes, I have submitted it</Button>
        </div>
      </Modal>
    </>
  )
}
