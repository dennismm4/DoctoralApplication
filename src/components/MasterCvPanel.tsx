import { useState } from 'react'
import { Link } from 'react-router-dom'
import { collectFacts, fingerprint, unverifiedCount, type FactKind } from '../lib/docs/facts'
import { useStore } from '../lib/store'
import { Badge, Button, Callout, Card, Modal } from './ui'
import { CvImport } from './CvImport'

const GROUP: Partial<Record<FactKind, string>> = {
  identity: 'Identity & contact',
  degree: 'Degrees',
  employment: 'Employment',
  project: 'Projects',
  publication: 'Publications',
  skill: 'Skills',
  training: 'Training',
  achievement: 'Awards',
  language: 'English language',
  referee: 'Referees',
  research: 'Research experience',
  motivation: 'Motivation',
  career: 'Career plans',
}

/**
 * The approved master CV is a frozen snapshot of the verified profile. Every tailored document reads
 * only from it, and tailoring never changes it. Re-approving replaces the snapshot for future drafts;
 * existing drafts record which master CV they were built from.
 */
export function MasterCvPanel() {
  const { profile, masterCv, setMasterCv, cv } = useStore()
  const [open, setOpen] = useState(false)
  const [ok, setOk] = useState(false)
  const facts = collectFacts(profile).filter((f) => f.kind !== 'interest')
  const excluded = unverifiedCount(profile)
  const stale = masterCv && masterCv.fingerprint !== fingerprint(profile)
  const groups = Object.entries(GROUP)
    .map(([k, label]) => ({ label, items: facts.filter((f) => f.kind === k) }))
    .filter((g) => g.items.length)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl">Master CV</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Built from the entries you have marked <em>Verified</em> in your profile. Once approved, it is frozen: tailored CVs and letters are generated from it and never change it.
            </p>
          </div>
          {masterCv ? <Badge tone={stale ? 'warn' : 'ok'}>{stale ? 'Profile changed since approval' : 'Approved'}</Badge> : <Badge tone="warn">Not approved yet</Badge>}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-paper p-3"><dt className="text-[11px] tracking-wide text-muted uppercase">Verified facts</dt><dd className="font-serif text-2xl tabular">{facts.length}</dd></div>
          <div className="rounded-md bg-paper p-3"><dt className="text-[11px] tracking-wide text-muted uppercase">Excluded (unverified)</dt><dd className="font-serif text-2xl tabular">{excluded}</dd></div>
          <div className="rounded-md bg-paper p-3"><dt className="text-[11px] tracking-wide text-muted uppercase">Approved</dt><dd className="mt-1 text-sm">{masterCv ? new Date(masterCv.approvedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</dd></div>
        </dl>
        {stale && <div className="mt-3"><Callout tone="warn">Your verified profile has changed since you approved the master CV. New drafts still use the approved version until you re-approve.</Callout></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => { setOk(false); setOpen(true) }} disabled={!facts.length}>{masterCv ? 'Review and re-approve' : 'Review and approve master CV'}</Button>
          <Link to="/profile" className="inline-flex items-center rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:border-forest">Edit profile</Link>
        </div>
      </Card>
      <CvImport compact />

      <Modal open={open} title="Approve master CV" onClose={() => setOpen(false)}>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-sm">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{g.label}</div>
              <ul className="mt-1 space-y-0.5">{g.items.map((f) => <li key={f.id}>✓ {f.label === f.text ? f.text : `${f.label}${f.text ? ` — ${f.text.slice(0, 120)}${f.text.length > 120 ? '…' : ''}` : ''}`}</li>)}</ul>
            </div>
          ))}
          {excluded > 0 && <p className="text-warn">{excluded} unverified entr{excluded === 1 ? 'y is' : 'ies are'} excluded. Verify them in your profile if they should be included.</p>}
          {!cv && <p className="text-muted">No original CV uploaded — that is fine; the master CV comes from your verified profile.</p>}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-forest" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          Every item above is accurate and matches my transcripts, certificates and employment records.
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              setMasterCv({ approvedAt: new Date().toISOString(), snapshot: structuredClone(profile), fingerprint: fingerprint(profile), sourceFileName: cv?.fileName ?? null })
              setOpen(false)
            }}
          >
            Approve
          </Button>
        </div>
      </Modal>
    </div>
  )
}
