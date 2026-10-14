import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, DeadlineText, Empty, Field, Input, Modal, PageHeader, Select, TextArea, cx } from '../components/ui'
import { assess, parseDeadline } from '../lib/eligibility'
import { downloadIcs, slug } from '../lib/exporter'
import { uid } from '../lib/profile'
import { useStore } from '../lib/store'
import { STATUSES, type AppStatus, type Application } from '../types'

const STATUS_TONE: Partial<Record<AppStatus, string>> = {
  Submitted: 'border-t-forest',
  Interview: 'border-t-ochre',
  Offer: 'border-t-ok',
  Rejected: 'border-t-bad',
  Withdrawn: 'border-t-line-strong',
}

export default function Applications() {
  const { applications, opportunities, updateApplication, removeApplication } = useStore()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [editing, setEditing] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<AppStatus | null>(null)

  const opOf = (a: Application) => opportunities.find((o) => o.id === a.opportunityId)
  const current = applications.find((a) => a.id === editing)

  const card = (app: Application) => {
    const op = opOf(app)
    if (!op) return null
    const a = assess(op)
    const openTasks = app.tasks.filter((t) => !t.done && !t.text.startsWith('Document:')).length
    const docsDone = app.tasks.filter((t) => t.done && t.text.startsWith('Document:')).length
    return (
      <div
        key={app.id}
        draggable
        onDragStart={() => setDragId(app.id)}
        onDragEnd={() => { setDragId(null); setOver(null) }}
        className={cx('cursor-grab rounded-md border border-line bg-surface p-3 text-sm shadow-[0_1px_0_0_var(--color-line)] active:cursor-grabbing', dragId === app.id && 'opacity-50')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] font-medium tracking-wide text-ochre uppercase">{op.university.split('(')[0]}</div>
          {app.shortlisted && <span title="Shortlisted" className="text-ochre">★</span>}
        </div>
        <button onClick={() => setEditing(app.id)} className="mt-0.5 text-left leading-snug font-medium hover:text-forest hover:underline">{op.scholarshipName}</button>
        <div className="mt-2 text-xs"><DeadlineText a={a} /></div>
        {app.personalDeadline && <div className="text-xs text-muted">My target: {new Date(app.personalDeadline).toLocaleDateString('en-GB')}</div>}
        <div className="mt-2 flex flex-wrap gap-1">
          {openTasks > 0 && <Badge>{openTasks} task{openTasks > 1 ? 's' : ''}</Badge>}
          {docsDone > 0 && <Badge tone="forest">{docsDone} docs ready</Badge>}
          {app.reminders.length > 0 && <Badge tone="ochre">{app.reminders.length} reminder{app.reminders.length > 1 ? 's' : ''}</Badge>}
        </div>
        <Select aria-label="Move to status" value={app.status} onChange={(e) => updateApplication(app.id, { status: e.target.value as AppStatus })} className="mt-2 py-1 text-xs">
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Tracker"
        title="My Applications"
        actions={
          <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
            {(['board', 'list'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cx('rounded px-3 py-1 text-sm capitalize', view === v ? 'bg-forest text-white' : 'text-muted')}>{v}</button>
            ))}
          </div>
        }
      >
        One record per university and project. Drag cards between columns or use the status menu. Nothing here is ever sent to a university.
      </PageHeader>

      {applications.length === 0 ? (
        <Empty title="No saved opportunities yet">
          Open an opportunity and choose <em>Save to applications</em>. <Link to="/find" className="text-forest underline">Find PhDs →</Link>
        </Empty>
      ) : view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
          <div className="flex min-w-max gap-3">
            {STATUSES.map((s) => {
              const list = applications.filter((a) => a.status === s)
              return (
                <div
                  key={s}
                  onDragOver={(e) => { e.preventDefault(); setOver(s) }}
                  onDragLeave={() => setOver((o) => (o === s ? null : o))}
                  onDrop={() => { if (dragId) updateApplication(dragId, { status: s }); setDragId(null); setOver(null) }}
                  className={cx('w-60 shrink-0 rounded-lg border border-t-4 border-line bg-paper/60 p-2', STATUS_TONE[s] ?? 'border-t-line', over === s && 'bg-forest-50')}
                >
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="font-sans text-xs font-semibold tracking-wide uppercase">{s}</h2>
                    <span className="font-mono text-xs text-muted">{list.length}</span>
                  </div>
                  <div className="min-h-16 space-y-2">{list.map(card)}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-[11px] tracking-wide text-muted uppercase">
                <tr><th className="p-3">Opportunity</th><th className="p-3">Status</th><th className="p-3">Deadline</th><th className="p-3">Submitted</th><th className="p-3">Tasks</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {applications.map((app) => {
                  const op = opOf(app)
                  if (!op) return null
                  return (
                    <tr key={app.id}>
                      <td className="p-3"><Link to={`/opportunity/${op.id}`} className="font-medium hover:underline">{op.scholarshipName}</Link><div className="text-xs text-muted">{op.university}</div></td>
                      <td className="p-3">
                        <Select value={app.status} onChange={(e) => updateApplication(app.id, { status: e.target.value as AppStatus })} className="py-1 text-xs">
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </Select>
                      </td>
                      <td className="p-3 whitespace-nowrap"><DeadlineText a={assess(op)} /></td>
                      <td className="p-3 tabular">{app.submittedOn || '—'}</td>
                      <td className="p-3 tabular">{app.tasks.filter((t) => t.done).length}/{app.tasks.length}</td>
                      <td className="p-3 text-right"><Button size="sm" onClick={() => setEditing(app.id)}>Edit</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {current && <Editor app={current} onClose={() => setEditing(null)} onRemove={() => { removeApplication(current.id); setEditing(null) }} />}
    </>
  )
}

function Editor({ app, onClose, onRemove }: { app: Application; onClose: () => void; onRemove: () => void }) {
  const { opportunities, updateApplication } = useStore()
  const op = opportunities.find((o) => o.id === app.opportunityId)!
  const [task, setTask] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [remDate, setRemDate] = useState('')
  const [remNote, setRemNote] = useState('')
  const set = (p: Partial<Application>) => updateApplication(app.id, p)
  const due = app.reminders.filter((r) => parseDeadline(r.date) && parseDeadline(r.date)!.getTime() < Date.now() + 7 * 86400000)

  return (
    <Modal open title={op.scholarshipName} onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <p className="text-sm text-muted">{op.university} · <Link to={`/opportunity/${op.id}`} className="text-forest underline" onClick={onClose}>open record</Link></p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={app.status} onChange={(e) => set({ status: e.target.value as AppStatus })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
          </Field>
          <Field label="My target date">
            <Input type="date" value={app.personalDeadline} onChange={(e) => set({ personalDeadline: e.target.value })} />
          </Field>
          <Field label="Submitted on">
            <Input type="date" value={app.submittedOn} onChange={(e) => set({ submittedOn: e.target.value })} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className="accent-forest" checked={app.shortlisted} onChange={(e) => set({ shortlisted: e.target.checked })} /> Shortlisted
          </label>
        </div>

        <div>
          <h3 className="mb-1 font-sans text-sm font-semibold">Tasks & follow-ups</h3>
          <ul className="space-y-1">
            {app.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-forest" checked={t.done} onChange={() => set({ tasks: app.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })} />
                <span className={cx('flex-1', t.done && 'text-muted line-through')}>{t.text}{t.due && <span className="ml-1 text-xs text-muted">· {t.due}</span>}</span>
                <button className="text-xs text-bad" onClick={() => set({ tasks: app.tasks.filter((x) => x.id !== t.id) })} aria-label="Delete task">✕</button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!task.trim()) return; set({ tasks: [...app.tasks, { id: uid(), text: task.trim(), due: taskDue, done: false }] }); setTask(''); setTaskDue('') }}>
            <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Email referees" />
            <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="w-36" aria-label="Task due date" />
            <Button type="submit">Add</Button>
          </form>
        </div>

        <div>
          <h3 className="mb-1 font-sans text-sm font-semibold">Reminders</h3>
          {due.length > 0 && <p className="mb-1 text-xs text-bad">{due.length} reminder(s) due within 7 days.</p>}
          <ul className="space-y-1 text-sm">
            {app.reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="font-mono text-xs tabular">{r.date}</span>
                <span className="flex-1">{r.note}</span>
                <button className="text-xs text-forest underline" onClick={() => downloadIcs(`${slug(op.university)}-reminder.ics`, r.note || op.scholarshipName, parseDeadline(r.date)!, op.title)}>.ics</button>
                <button className="text-xs text-bad" onClick={() => set({ reminders: app.reminders.filter((x) => x.id !== r.id) })} aria-label="Delete reminder">✕</button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!remDate) return; set({ reminders: [...app.reminders, { id: uid(), date: remDate, note: remNote }] }); setRemDate(''); setRemNote('') }}>
            <Input type="date" value={remDate} onChange={(e) => setRemDate(e.target.value)} className="w-40" aria-label="Reminder date" />
            <Input value={remNote} onChange={(e) => setRemNote(e.target.value)} placeholder="Reminder note" />
            <Button type="submit">Add</Button>
          </form>
          <p className="mt-1 text-[11px] text-muted">Browsers can't send alerts from a static site — download the .ics to get a calendar alarm.</p>
        </div>

        <Field label="Notes">
          <TextArea rows={3} value={app.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4 flex justify-between border-t border-line pt-3">
        <Button variant="danger" onClick={() => confirm('Remove this application record?') && onRemove()}>Remove record</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}
