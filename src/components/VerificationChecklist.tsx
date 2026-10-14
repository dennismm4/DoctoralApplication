import { useState } from 'react'
import { useStore } from '../lib/store'
import { checklistFor, validateCheck, type CheckItem } from '../lib/verification'
import type { Assessment, Opportunity } from '../types'
import { Badge, Button, Card, Input, LinkOut, Select, cx } from './ui'

const STATUS: Record<CheckItem['status'], { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string }> = {
  confirmed: { tone: 'ok', text: 'Confirmed' },
  needed: { tone: 'warn', text: 'Needed' },
  failed: { tone: 'bad', text: 'Fails rule' },
  optional: { tone: 'neutral', text: 'Optional' },
}

function Row({ op, item }: { op: Opportunity; item: CheckItem }) {
  const { checks, setCheck, removeCheck } = useStore()
  const mine = (checks[op.id] ?? []).find((c) => c.key === item.key)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(mine?.value ?? '')
  const [url, setUrl] = useState(mine?.url ?? item.lookAt ?? '')
  const [note, setNote] = useState(mine?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const err = validateCheck(item, value, url)
    if (err) return setError(err)
    setCheck(op.id, { key: item.key, value: value.trim(), url: url.trim(), note: note.trim(), checkedAt: new Date().toISOString() })
    setEditing(false)
    setError(null)
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].text}</Badge>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{item.label}</div>
          <div className="text-xs text-muted">{item.question}</div>
          {item.current && item.status !== 'confirmed' && <div className="mt-1 text-xs text-muted">Recorded so far: <em>{item.current}</em></div>}
          {mine && (
            <div className="mt-1 text-xs text-forest">
              You confirmed <strong>{mine.value}</strong> on {new Date(mine.checkedAt).toLocaleDateString('en-GB')}
              {mine.url && <> — <LinkOut href={mine.url}>source</LinkOut></>}
              {mine.note && <> · “{mine.note}”</>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {item.lookAt && <LinkOut href={item.lookAt} className="text-xs">Open page</LinkOut>}
          <Button size="sm" onClick={() => setEditing((e) => !e)}>{mine ? 'Edit' : 'Record'}</Button>
          {mine && <Button size="sm" variant="ghost" onClick={() => removeCheck(op.id, item.key)}>Undo</Button>}
        </div>
      </div>
      {editing && (
        <div className="mt-3 grid gap-2 rounded-md border border-line bg-paper/60 p-3 sm:grid-cols-[160px_1fr]">
          {item.input === 'yesno' ? (
            <Select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Answer">
              <option value="">Choose…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          ) : item.input === 'amount' ? (
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="£ per year, or no" aria-label="Annual stipend" />
          ) : item.input === 'years' ? (
            <Input type="number" step="0.25" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Years" aria-label="Years" />
          ) : item.input === 'date' ? (
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Deadline date (treated as 23:59 UK time)" title="Treated as 23:59 UK time on that day" />
          ) : (
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="How was it resolved?" aria-label="Resolution" />
          )}
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={item.needsUrl ? 'Official page URL (https://…) — required' : 'Official page URL (optional)'} aria-label="Evidence URL" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Exact wording from the page (recommended)" className="sm:col-span-2" aria-label="Quote or note" />
          {error && <p className="text-xs text-bad sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" variant="primary" onClick={save}>Save confirmation</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  )
}

export function VerificationChecklist({ op, a }: { op: Opportunity; a: Assessment }) {
  const { checks } = useStore()
  const items = checklistFor(op, a, checks[op.id])
  const needed = items.filter((i) => i.status === 'needed').length
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-sans text-sm font-semibold">Manual verification checklist</h3>
        <span className={cx('font-mono text-xs', needed ? 'text-warn' : 'text-ok')}>{needed ? `${needed} needed` : 'complete'}</span>
      </div>
      <p className="text-xs text-muted">
        Confirm each fact on the official page and record the exact URL. Confirmations are stored in this browser, applied as evidence, and re-checked by the same rules. Answering “No” can move the record to the archive.
      </p>
      <ul className="mt-2 divide-y divide-line">
        {items.map((i) => <Row key={i.key} op={op} item={i} />)}
      </ul>
    </Card>
  )
}
