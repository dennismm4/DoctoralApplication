import { useState } from 'react'
import { FilterPanel, initialFilters, useFiltered, type FilterState } from '../components/Filters'
import { OpportunityCard } from '../components/OpportunityCard'
import { Callout, Empty, PageHeader, SectionTitle } from '../components/ui'
import { useAssessed } from '../lib/useAssessed'

export default function Review() {
  const all = useAssessed()
  const [f, setF] = useState<FilterState>({ ...initialFilters, sort: 'deadline' })
  const potential = useFiltered(all.filter((i) => i.a.verdict === 'potential'), f)
  const insufficient = useFiltered(all.filter((i) => i.a.verdict === 'insufficient'), f)

  return (
    <>
      <PageHeader eyebrow="Needs confirmation" title="Review queue">
        Possible fully funded opportunities that are <strong>not confirmed</strong>. Each card lists the facts still missing. Open one and use its verification checklist: once every gate fact is confirmed from an official page, it moves to the verified results by itself.
      </PageHeader>

      <div className="mb-6">
        <Callout tone="neutral" title="How to verify">
          Read the university or funder's own page (never a scholarship aggregator site or a search snippet). Record what it says and paste the exact URL. If the official pages contradict each other, email the funding office and keep their written reply.
        </Callout>
      </div>

      <FilterPanel items={[...potential, ...insufficient]} f={f} set={setF} />

      <section className="mb-10">
        <SectionTitle aside={<span className="font-mono text-sm text-muted">{potential.length}</span>}>Potential matches — eligibility or funding still to confirm</SectionTitle>
        {potential.length === 0 ? <Empty title="None" /> : <div className="grid gap-4 md:grid-cols-2">{potential.map((i) => <OpportunityCard key={i.op.id} item={i} showGate />)}</div>}
      </section>

      <section>
        <SectionTitle aside={<span className="font-mono text-sm text-muted">{insufficient.length}</span>}>Insufficient evidence — leads only</SectionTitle>
        <p className="-mt-1 mb-3 text-sm text-muted">Two or more core facts (international eligibility, Ethiopian eligibility, international tuition, stipend) have no official evidence yet. Treat these as leads, not opportunities.</p>
        {insufficient.length === 0 ? <Empty title="None" /> : <div className="grid gap-4 md:grid-cols-2">{insufficient.map((i) => <OpportunityCard key={i.op.id} item={i} showGate />)}</div>}
      </section>
    </>
  )
}
