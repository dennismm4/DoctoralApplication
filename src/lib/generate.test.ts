import { describe, expect, it } from 'vitest'
import data from '../data/opportunities.json'
import type { Opportunity, TopicProposal } from '../types'
import { generateConceptNote, suggestTopics, verifiedFacts } from './generate'
import { defaultProfile } from './profile'
import { validateOpportunity } from './validate'

const op = (data as Opportunity[]).find((o) => o.id === 'york-esrc-wrdtp-2027')!

describe('verified facts', () => {
  it('unverified entries are never used', () => {
    const p = defaultProfile()
    p.fullName = { value: 'Unconfirmed Name', verified: false }
    expect(verifiedFacts(p).join(' ')).not.toContain('Unconfirmed Name')
    p.fullName.verified = true
    expect(verifiedFacts(p).join(' ')).toContain('Unconfirmed Name')
  })
})

describe('topic approval gate', () => {
  it('suggests topics aligned with the applicant and opportunity', () => {
    const topics = suggestTopics(defaultProfile(), op)
    expect(topics.length).toBeGreaterThan(0)
    expect(topics.every((t) => t.status === 'proposed')).toBe(true)
  })
  it('refuses to build a concept note from an unapproved topic', () => {
    const t: TopicProposal = suggestTopics(defaultProfile(), op)[0]
    expect(() => generateConceptNote(t, defaultProfile(), op)).toThrow(/approved/)
    expect(generateConceptNote({ ...t, status: 'approved' }, defaultProfile(), op)).toContain('CONCEPT NOTE')
  })
})

describe('record validation', () => {
  it('rejects a "full-international" claim without explicit confirmation', () => {
    const bad = { ...op, tuition: { coverage: 'full-international', internationalFeeCoveredInFull: 'unknown', note: '' } }
    expect(validateOpportunity(bad).join(' ')).toMatch(/requires internationalFeeCoveredInFull/)
  })
  it('rejects researched records with no sources', () => {
    expect(validateOpportunity({ ...op, sources: [] }).join(' ')).toMatch(/official source/)
  })
})
