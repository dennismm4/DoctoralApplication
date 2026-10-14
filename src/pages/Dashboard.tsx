import { Link } from 'react-router-dom'
import { DeadlineAlerts } from '../components/DeadlineAlerts'
import { Badge, Callout, Card, PageHeader, Progress, ScoreRing, SectionTitle } from '../components/ui'
import { isPrimary, isReview } from '../lib/eligibility'
import { completeness } from '../lib/profile'
import { useStore } from '../lib/store'
import { isNew, useAssessed } from '../lib/useAssessed'

function Stat({ label, value, to, note }: { label: string; value: number | string; to: string; note?: string }) {
  return (
    <Link to={to} className="group block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-forest">
      <div className="text-[11px] tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 font-serif text-4xl leading-none text-ink tabular group-hover:text-forest">{value}</div>
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
    </Link>
  )
}

export default function Dashboard() {
  const items = useAssessed()
  const { applications, profile, topics, docs } = useStore()
  const verified = items.filter((i) => isPrimary(i.a)).sort((x, y) => y.match.score - x.match.score)
  const review = items.filter((i) => isReview(i.a))
  const archived = items.filter((i) => !isPrimary(i.a) && !isReview(i.a))
  const fresh = [...verified, ...review].filter((i) => isNew(i.op))
  const inProgress = applications.filter((a) => !['Interested', 'Submitted', 'Offer', 'Rejected', 'Withdrawn'].includes(a.status))
  const { percent, items: checklist } = completeness(profile)
  const lastReview = items.filter((i) => i.op.recordType === 'researched').map((i) => i.op.lastVerified).sort().at(-1)?.slice(0, 10) ?? '—'

  const actions: { text: string; to: string }[] = []
  const missing = checklist.filter((c) => !c.done)
  const soonest = [...verified].filter((u) => u.a.daysToDeadline != null).sort((x, y) => x.a.daysToDeadline! - y.a.daysToDeadline!).find((u) => !applications.some((a) => a.opportunityId === u.op.id))
  if (soonest) actions.push({ text: `Start on ${soonest.op.university.split('(')[0]} — ${soonest.op.deadline.type ?? ''} deadline in ${soonest.a.daysToDeadline} days`, to: `/opportunity/${soonest.op.id}` })
  const reviewSoon = review.filter((r) => r.a.verdict === 'potential' && r.a.daysToDeadline != null).sort((x, y) => x.a.daysToDeadline! - y.a.daysToDeadline!)[0]
  if (reviewSoon) actions.push({ text: `Confirm the missing facts for ${reviewSoon.op.university.split('(')[0]} (deadline in ${reviewSoon.a.daysToDeadline} days)`, to: `/opportunity/${reviewSoon.op.id}` })
  if (missing.length) actions.push({ text: `Complete your profile: ${missing[0].hint}`, to: '/profile' })
  if (!topics.some((t) => t.status === 'approved')) actions.push({ text: 'Shortlist research topics and approve one', to: '/topics' })
  if (applications.length && !docs.some((d) => d.kind === 'cv')) actions.push({ text: 'Tailor your CV for a saved opportunity', to: '/documents' })

  return (
    <>
      <PageHeader eyebrow="Overview" title={profile.fullName.value ? `Welcome, ${profile.fullName.value.split(' ')[0]}` : 'Your doctoral search'}>
        UK-only PhD funding for an Ethiopian applicant. An opportunity counts as verified only when official pages confirm eligibility, the full international fee, a stipend, the duration and an open deadline.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Verified fully funded" value={verified.length} to="/find" />
        <Stat label="Review queue" value={review.length} to="/review" />
        <Stat label="Archived" value={archived.length} to="/archive" />
        <Stat label="New (14 days)" value={fresh.length} to="/review" />
        <Stat label="In progress" value={inProgress.length} to="/applications" />
        <Stat label="Profile" value={`${percent}%`} to="/profile" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionTitle aside={<span className="text-xs text-muted">next 45 days</span>}>Deadline alerts</SectionTitle>
          <DeadlineAlerts />
        </section>

        <section className="lg:col-span-2">
          <SectionTitle>Recommended next actions</SectionTitle>
          <Card className="p-2">
            <ol className="space-y-1">
              {actions.slice(0, 5).map((x, i) => (
                <li key={i}>
                  <Link to={x.to} className="flex gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-paper">
                    <span className="font-mono text-xs text-ochre">{String(i + 1).padStart(2, '0')}</span>
                    <span>{x.text}</span>
                  </Link>
                </li>
              ))}
              {actions.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">You are up to date.</li>}
            </ol>
          </Card>

          <div className="mt-6">
            <SectionTitle aside={<span className="font-mono text-sm tabular">{percent}%</span>}>Profile completeness</SectionTitle>
            <Progress value={percent} />
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {checklist.map((c) => (
                <li key={c.label} className={c.done ? 'text-ok' : 'text-muted'}>{c.done ? '✓' : '○'} {c.label}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="mt-8">
        <SectionTitle aside={<Link to="/find" className="text-sm text-forest hover:underline">All verified →</Link>}>Top verified matches</SectionTitle>
        <Card>
          <ul className="divide-y divide-line">
            {verified.slice(0, 5).map(({ op, match }) => (
              <li key={op.id}>
                <Link to={`/opportunity/${op.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper/60">
                  <ScoreRing score={match.score} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{op.university}</div>
                    <div className="truncate text-xs text-muted">{op.scholarshipName}</div>
                  </div>
                  <span className="hidden text-xs text-muted sm:block">{match.reasons[0]}</span>
                </Link>
              </li>
            ))}
            {verified.length === 0 && <li className="p-5 text-sm text-muted">No verified opportunities yet. Check the review queue.</li>}
          </ul>
        </Card>
      </section>

      <div className="mt-8">
        <Callout tone="warn" title="Before you apply">
          Funding terms change between rounds — re-open the official page and re-confirm international fee coverage, stipend and deadline before submitting. Visa fees, the Immigration Health Surcharge, flights and dependants' costs are <strong>not assumed</strong> to be covered. <Badge tone="neutral">Latest record check: {lastReview}</Badge>
        </Callout>
      </div>
    </>
  )
}
