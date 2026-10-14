import { describe, expect, it } from 'vitest'
import active from '../data/opportunities.json'
import archived from '../data/archive.json'
import fixtures from '../data/fixtures/illustrative.json'
import type { Opportunity } from '../types'
import { assess } from './eligibility'
import { validateDataset } from './validate'

const NOW = new Date('2026-10-14T18:00:00Z')
const all = [...active, ...archived] as Opportunity[]
const verdict = (id: string) => assess(all.find((o) => o.id === id)!, NOW).verdict

/** Run in CI on every push: a malformed or unsupported record fails the build. */
describe('datasets', () => {
  it('active dataset passes schema and evidence validation', () => expect(validateDataset(active)).toEqual([]))
  it('archive passes schema and evidence validation', () => expect(validateDataset(archived)).toEqual([]))
  it('fixtures pass schema validation', () => expect(validateDataset(fixtures)).toEqual([]))
  it('ids are unique across all files', () => {
    const ids = [...all, ...(fixtures as Opportunity[])].map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('the live datasets contain no fabricated (demo) records', () => {
    expect(all.every((o) => o.recordType === 'researched')).toBe(true)
  })
  it('fixtures are all labelled illustrative and link nowhere', () => {
    for (const o of fixtures as Opportunity[]) {
      expect(o.recordType).toBe('demo')
      expect(o.title).toMatch(/DEMO/)
      expect(o.fundingUrl).toBeNull()
    }
  })
  it('every archived record has an archive date and reason', () => {
    for (const o of archived as Opportunity[]) expect(o.archivedAt && o.archiveReason).toBeTruthy()
  })
})

describe('verdicts on the researched data (as of 14 Oct 2026)', () => {
  it.each([
    ['york-esrc-wrdtp-2027', 'verified'],
    ['gates-cambridge-2027', 'verified'],
    ['warwick-chancellors-2027', 'verified'],
    ['leeds-esrc-wrdtp-2027', 'potential'],
    ['cambridge-trust-international-2027', 'potential'],
    ['clarendon-2027', 'potential'],
    ['lse-phd-studentship-2027', 'potential'],
    ['manchester-pds-humanities-2027', 'potential'],
    ['mgs-esrc-dtp-2027', 'insufficient'],
    ['sgsss-edinburgh-2027', 'insufficient'],
    ['commonwealth-phd-2027', 'not-eligible'],
    ['stirling-sgsss-2026', 'shortfall'],
    ['edinburgh-economics-cra-2026', 'expired'],
    ['ukfs-cdt-food-systems', 'expired'],
  ])('%s → %s', (id, expected) => expect(verdict(id)).toBe(expected))
})
