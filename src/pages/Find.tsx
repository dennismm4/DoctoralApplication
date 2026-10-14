import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FilterPanel, initialFilters, useFiltered } from '../components/Filters'
import { OpportunityCard } from '../components/OpportunityCard'
import { Button, Callout, Empty, PageHeader } from '../components/ui'
import { isPrimary, isReview } from '../lib/eligibility'
import { useAssessed } from '../lib/useAssessed'

export default function Find() {
  const all = useAssessed()
  const primary = all.filter((i) => isPrimary(i.a))
  const review = all.filter((i) => isReview(i.a))
  const [f, setF] = useState(initialFilters)
  const results = useFiltered(primary, f)

  return (
    <>
      <PageHeader eyebrow="Primary results" title="Verified fully funded PhDs" actions={<Link to="/review" className="text-sm text-forest hover:underline">Review queue ({review.length}) →</Link>}>
        Only opportunities where official evidence confirms <strong>all</strong> of these: open to Ethiopian applicants, international tuition paid in full, a stated living stipend and duration, and an open deadline. A high research match never compensates for a funding gap.
      </PageHeader>

      <FilterPanel items={primary} f={f} set={setF} />

      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>
          <span className="font-medium text-ink tabular">{results.length}</span> verified result{results.length === 1 ? '' : 's'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setF(initialFilters)}>Clear filters</Button>
      </div>

      {results.length === 0 ? (
        <Empty title="No verified opportunities match">Clear the filters, or check the review queue for potential matches that still need a fact confirmed.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((item) => <OpportunityCard key={item.op.id} item={item} />)}
        </div>
      )}

      {review.length > 0 && (
        <div className="mt-8">
          <Callout tone="warn" title={`${review.length} more in the review queue`}>
            These may be fully funded but are missing official confirmation of at least one fact (e.g. whether the international fee is covered). They are kept separate and are never shown as confirmed. <Link to="/review" className="font-medium text-forest underline">Open the review queue</Link>
          </Callout>
        </div>
      )}
    </>
  )
}
