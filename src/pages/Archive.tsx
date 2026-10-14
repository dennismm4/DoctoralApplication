import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Empty, LinkOut, PageHeader, VerdictBadge, cx } from '../components/ui'
import { useAssessed } from '../lib/useAssessed'
import type { Verdict } from '../types'

const TABS: { key: Verdict; label: string; help: string }[] = [
  { key: 'shortfall', label: 'Funding shortfall', help: 'Self-funded, tuition-only, Home-fee-only or partial awards that would leave an Ethiopian applicant paying part of the international fee or living costs.' },
  { key: 'not-eligible', label: 'Not eligible', help: 'Nationality, country-list or residence rules exclude Ethiopian applicants, the institution is outside the UK, or you recorded that you do not meet the entry requirements.' },
  { key: 'expired', label: 'Deadline passed', help: 'Closed rounds. Kept for planning the next cycle — many awards recur annually.' },
]

export default function Archive() {
  const all = useAssessed()
  const [tab, setTab] = useState<Verdict>('shortfall')
  const list = all.filter((i) => i.a.verdict === tab)
  const meta = TABS.find((t) => t.key === tab)!

  return (
    <>
      <PageHeader eyebrow="Kept separate" title="Archive">
        Never mixed with actionable results. Each record shows the rule it failed and the official source.
      </PageHeader>

      <div className="mb-3 inline-flex flex-wrap rounded-md border border-line-strong bg-surface p-0.5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cx('rounded px-3 py-1.5 text-sm', tab === t.key ? 'bg-forest text-white' : 'text-muted')}>
            {t.label} <span className="font-mono text-xs opacity-70">{all.filter((i) => i.a.verdict === t.key).length}</span>
          </button>
        ))}
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">{meta.help}</p>

      {list.length === 0 ? (
        <Empty title="Nothing here" />
      ) : (
        <div className="space-y-3">
          {list.map(({ op, a }) => (
            <Card key={op.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={a.verdict} />
                {op.recordType === 'demo' && <Badge tone="ochre">Illustrative fixture</Badge>}
                {op.archivedAt && <Badge>archived {op.archivedAt.slice(0, 10)}</Badge>}
                <span className="text-xs text-muted">verified {op.lastVerified.slice(0, 10)}</span>
              </div>
              <div className="mt-2 text-xs font-medium tracking-wide text-ochre uppercase">{op.university}</div>
              <Link to={`/opportunity/${op.id}`} className="font-serif text-lg leading-snug hover:underline">{op.title}</Link>
              <ul className="mt-2 space-y-0.5 text-sm">
                {a.reasons.filter((r) => r.level === 'block').map((r) => <li key={r.text} className="text-bad">✕ {r.text}</li>)}
              </ul>
              {op.verificationNotes && <p className="mt-2 text-sm text-muted">{op.verificationNotes}</p>}
              <div className="mt-2 text-sm"><LinkOut href={op.fundingUrl ?? op.programmeUrl}>Official page</LinkOut></div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
