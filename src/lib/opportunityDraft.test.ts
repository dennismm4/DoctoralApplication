import { describe, expect, it } from 'vitest'
import { makeUnverifiedOpportunity } from './opportunityDraft'
import { validateOpportunity } from './validate'
import { assess } from './eligibility'

describe('review-first opportunity intake', () => {
  it('creates a schema-valid local draft while leaving all funding and eligibility gates unknown', () => {
    const opportunity = makeUnverifiedOpportunity({
      university: 'Example University', department: 'Economics', programme: 'PhD Economics',
      title: 'Food systems and resilience', description: 'A project description.', supervisor: 'Dr Example',
      researchArea: 'food systems; resilience', entryRequirements: '', englishRequirement: '',
      fundingDescription: 'Funding described on the page', stipendDescription: '', deadline: '', startDate: '', requiredDocuments: [],
    }, 'https://example.ac.uk/phd', '2026-10-15T08:00:00.000Z')

    expect(validateOpportunity(opportunity)).toEqual([])
    expect(opportunity.eligibility).toMatchObject({ international: 'unknown', ethiopian: 'unknown' })
    expect(opportunity.fundingModel).toBe('unknown')
    expect(opportunity.tuition).toMatchObject({ coverage: 'unknown', internationalFeeCoveredInFull: 'unknown' })
    expect(opportunity.stipend.provided).toBe('unknown')
    expect(opportunity.durationYears).toBeNull()
    expect(opportunity.deadline.date).toBeNull()
    expect(opportunity.evidence).toEqual([])
    expect(assess(opportunity, new Date('2026-10-15T00:00:00Z')).verdict).toBe('insufficient')
  })
})
