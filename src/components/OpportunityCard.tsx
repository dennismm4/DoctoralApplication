import { Link } from 'react-router-dom'
import { GATE_LABEL } from '../lib/eligibility'
import type { Assessed } from '../lib/useAssessed'
import { isNew } from '../lib/useAssessed'
import { useStore } from '../lib/store'
import type { Gate } from '../types'
import { Badge, Card, DeadlineText, FundingMeter, GateText, LinkOut, ScoreRing, VerdictBadge } from './ui'

const PREP: Record<string, { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string }> = {
  comfortable: { tone: 'ok', text: 'Time to prepare' },
  tight: { tone: 'warn', text: 'Tight timeline' },
  'too-late': { tone: 'bad', text: 'Very tight' },
  unknown: { tone: 'neutral', text: 'Prep time unknown' },
}

export function OpportunityCard({ item, showGate }: { item: Assessed; showGate?: boolean }) {
  const { op, a, match } = item
  const { applications, checks } = useStore()
  const app = applications.find((x) => x.opportunityId === op.id)
  const mine = (checks[op.id] ?? []).length
  const open = (Object.keys(a.gate) as (keyof Gate)[]).filter((k) => a.gate[k] === 'unconfirmed')
  const prep = PREP[match.prepStatus]
  return (
    <Card className="flex flex-col p-4 transition-shadow hover:shadow-[0_2px_0_0_var(--color-line-strong)] sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <VerdictBadge verdict={a.verdict} />
        {op.recordType === 'demo' && <Badge tone="ochre">Illustrative fixture</Badge>}
        {isNew(op) && op.recordType !== 'demo' && <Badge tone="forest">New</Badge>}
        {app && <Badge tone="forest">{app.status}</Badge>}
        {mine > 0 && <Badge tone="forest">{mine} fact{mine > 1 ? 's' : ''} you confirmed</Badge>}
      </div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium tracking-wide text-ochre uppercase">{op.university}</div>
          <h3 className="mt-0.5 text-[1.15rem] leading-snug">
            <Link to={`/opportunity/${op.id}`} className="decoration-line-strong underline-offset-4 hover:text-forest hover:underline">
              {op.title}
            </Link>
          </h3>
          <div className="mt-1 text-sm text-muted">{op.scholarshipName}</div>
        </div>
        <ScoreRing score={match.score} muted={!match.primary} />
      </div>

      <div className="mt-4">
        <FundingMeter op={op} a={a} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">{op.deadline.type ? `${op.deadline.type} deadline` : 'Deadline'}</dt>
          <dd><DeadlineText a={a} /></dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">Ethiopian applicants</dt>
          <dd><GateText state={a.gate.ethiopian} confirmed="Eligible" failed="Not eligible" /></dd>
        </div>
      </dl>

      {showGate && open.length > 0 && (
        <div className="mt-3 rounded-md border border-warn/25 bg-warn-50 px-3 py-2 text-xs">
          <span className="font-semibold text-warn">To confirm:</span> {open.map((k) => GATE_LABEL[k]).join(' · ')}
        </div>
      )}

      {match.reasons.length > 0 && <p className="mt-3 text-xs text-muted">{match.reasons.slice(0, 2).join(' ')}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <Badge tone={prep.tone}>{prep.text} · ~{match.prepDays}d</Badge>
        <div className="flex items-center gap-3">
          <LinkOut href={op.fundingUrl ?? op.programmeUrl}>Official page</LinkOut>
          <Link to={`/opportunity/${op.id}`} className="font-medium text-forest hover:underline">{showGate ? 'Verify →' : 'Details →'}</Link>
        </div>
      </div>
    </Card>
  )
}
