import { describe, expect, it } from 'vitest'
import { base, ev, without } from './testHelpers'
import { assess, isExpired, isPrimary, isReview, parseDeadline, scoreCertainty } from './eligibility'

const NOW = new Date('2026-10-14T12:00:00Z')
const URL = 'https://www.example.ac.uk/funding'
describe('verified fully funded and eligible', () => {
  it('requires every gate fact with official evidence', () => {
    const a = assess(base(), NOW)
    expect(a.verdict).toBe('verified')
    expect(isPrimary(a)).toBe(true)
  })
})

describe('Ethiopian eligibility', () => {
  it('excludes awards whose country list leaves out Ethiopia (e.g. Commonwealth)', () => {
    const a = assess(base({ eligibility: { international: 'yes', ethiopian: 'no', restrictedTo: null, note: '' } }), NOW)
    expect(a.verdict).toBe('not-eligible')
    expect(a.gate.ethiopian).toBe('failed')
  })
  it('excludes awards closed to international applicants', () => {
    expect(assess(base({ eligibility: { international: 'no', ethiopian: 'unknown', restrictedTo: null, note: '' } }), NOW).verdict).toBe('not-eligible')
  })
  it('excludes Home-fee-status / UK-national restrictions', () => {
    expect(assess(base({ eligibility: { international: 'yes', ethiopian: 'yes', restrictedTo: 'UK nationals only', note: '' } }), NOW).verdict).toBe('not-eligible')
  })
  it('unknown Ethiopian eligibility is a potential match, never verified', () => {
    const a = assess(base({ eligibility: { international: 'yes', ethiopian: 'unknown', restrictedTo: null, note: '' } }), NOW)
    expect(a.verdict).toBe('potential')
    expect(isReview(a)).toBe(true)
  })
  it('a "yes" without official evidence counts as unknown', () => {
    const a = assess(base({ evidence: without('eligibility.ethiopian') }), NOW)
    expect(a.verdict).toBe('potential')
    expect(a.reasons.some((r) => /claimed but has no official evidence/.test(r.text))).toBe(true)
  })
  it('evidence from a scholarship aggregator does not count', () => {
    const a = assess(base({ evidence: [...without('eligibility.ethiopian'), ev('eligibility.ethiopian', 'third-party')] }), NOW)
    expect(a.gate.ethiopian).toBe('unconfirmed')
  })
  it('a search-engine snippet does not count', () => {
    const a = assess(base({ evidence: [...without('tuition'), ev('tuition', 'search-snippet')] }), NOW)
    expect(a.gate.tuition).toBe('unconfirmed')
    expect(a.verdict).not.toBe('verified')
  })
  it('recording that she does not meet entry requirements makes it not eligible', () => {
    expect(assess(base(), NOW, { entryMet: false }).verdict).toBe('not-eligible')
  })
  it('excludes non-UK institutions', () => {
    expect(assess(base({ country: 'Ireland' }), NOW).verdict).toBe('not-eligible')
  })
})

describe('international tuition coverage', () => {
  it('Home fee only → funding shortfall', () => {
    const a = assess(base({ tuition: { coverage: 'home-only', internationalFeeCoveredInFull: 'unknown', note: '' } }), NOW)
    expect(a.verdict).toBe('shortfall')
    expect(a.gate.tuition).toBe('failed')
  })
  it('partial fee contribution → shortfall', () => {
    expect(assess(base({ tuition: { coverage: 'partial', internationalFeeCoveredInFull: 'no', note: '' } }), NOW).verdict).toBe('shortfall')
  })
  it('explicit "international fee not covered in full" → shortfall', () => {
    expect(assess(base({ tuition: { coverage: 'unknown', internationalFeeCoveredInFull: 'no', note: '' } }), NOW).verdict).toBe('shortfall')
  })
  it('Home fee + evidenced university waiver → verified', () => {
    expect(assess(base({ tuition: { coverage: 'home-plus-waiver', internationalFeeCoveredInFull: 'yes', note: '' } }), NOW).verdict).toBe('verified')
  })
  it('Home fee + unconfirmed waiver (typical UKRI DTP) → potential, never verified', () => {
    const a = assess(base({ tuition: { coverage: 'home-plus-waiver', internationalFeeCoveredInFull: 'unknown', note: '' } }), NOW)
    expect(a.verdict).toBe('potential')
  })
  it('self-funded → shortfall', () => {
    expect(assess(base({ fundingModel: 'self-funded' }), NOW).verdict).toBe('shortfall')
  })
  it('tuition-only (no stipend) → shortfall', () => {
    expect(assess(base({ stipend: { provided: 'no', amount: null, currency: 'GBP', frequency: null, rateYear: null, note: '' } }), NOW).verdict).toBe('shortfall')
  })
  it('"fully funded" in the title is ignored', () => {
    const op = base({ title: 'FULLY FUNDED PhD', tuition: { coverage: 'unknown', internationalFeeCoveredInFull: 'unknown', note: '' }, evidence: without('tuition') })
    expect(assess(op, NOW).verdict).not.toBe('verified')
  })
  it('not-eligible takes precedence over shortfall', () => {
    const op = base({ eligibility: { international: 'no', ethiopian: 'no', restrictedTo: null, note: '' }, fundingModel: 'self-funded' })
    expect(assess(op, NOW).verdict).toBe('not-eligible')
  })
})

describe('incomplete funding evidence', () => {
  it('two or more core facts unconfirmed → insufficient evidence', () => {
    const op = base({ evidence: without('tuition', 'stipend') })
    expect(assess(op, NOW).verdict).toBe('insufficient')
  })
  it('no official evidence at all → insufficient evidence', () => {
    const op = base({ evidence: [ev('tuition', 'third-party')] })
    expect(assess(op, NOW).verdict).toBe('insufficient')
  })
  it('stipend confirmed but amount missing → potential', () => {
    const op = base({ stipend: { provided: 'yes', amount: null, currency: 'GBP', frequency: 'per year', rateYear: null, note: '' } })
    expect(assess(op, NOW).verdict).toBe('potential')
  })
  it('missing duration evidence → potential', () => {
    expect(assess(base({ evidence: without('duration') }), NOW).verdict).toBe('potential')
  })
  it('an unresolved discrepancy blocks verified status', () => {
    const op = base({ discrepancies: [{ id: 'd', description: 'Two pages disagree on fees', urls: [URL], resolved: false }] })
    const a = assess(op, NOW)
    expect(a.verdict).toBe('potential')
    expect(a.reasons.some((r) => /Conflicting official information/.test(r.text))).toBe(true)
  })
  it('a resolved discrepancy does not', () => {
    const op = base({ discrepancies: [{ id: 'd', description: 'x', urls: [URL], resolved: true }] })
    expect(assess(op, NOW).verdict).toBe('verified')
  })
  it('a stale verification drops to potential', () => {
    expect(assess(base({ lastVerified: '2026-03-01' }), NOW).verdict).toBe('potential')
  })
  it('illustrative fixtures can never be verified', () => {
    expect(assess(base({ recordType: 'demo' }), NOW).verdict).toBe('potential')
  })
})

describe('expired deadlines', () => {
  it('past deadline → deadline passed', () => {
    expect(assess(base({ deadline: { date: '2026-10-01T12:00:00Z', type: 'scholarship', timezone: null, note: '', steps: [] } }), NOW).verdict).toBe('expired')
  })
  it('a deadline later today is still open', () => {
    const a = assess(base({ deadline: { date: '2026-10-14T16:00:00Z', type: 'scholarship', timezone: null, note: '', steps: [] } }), NOW)
    expect(a.verdict).toBe('verified')
    expect(a.daysToDeadline).toBe(1)
  })
  it('date-only deadlines close at 23:59 UK time (GMT in winter)', () => {
    expect(parseDeadline('2026-12-04')!.toISOString()).toBe('2026-12-04T23:59:00.000Z')
  })
  it('date-only deadlines respect British Summer Time', () => {
    expect(parseDeadline('2026-07-01')!.toISOString()).toBe('2026-07-01T22:59:00.000Z')
  })
  it('missing deadline with a past start date is expired', () => {
    expect(isExpired(base({ deadline: { date: null, type: null, timezone: null, note: '', steps: [] }, startDate: '2026-09-01' }), NOW)).toBe(true)
  })
  it('missing deadline for a future start → potential', () => {
    expect(assess(base({ deadline: { date: null, type: null, timezone: null, note: '', steps: [] } }), NOW).verdict).toBe('potential')
  })
  it('admissions-only deadline with no known scholarship deadline is flagged', () => {
    const a = assess(base({ deadline: { date: '2027-01-20', type: 'admissions', timezone: null, note: '', steps: [] } }), NOW)
    expect(a.verdict).toBe('potential')
  })
  it('shortfall and not-eligible take precedence over expiry', () => {
    expect(assess(base({ fundingModel: 'self-funded', deadline: { date: '2020-01-01', type: 'scholarship', timezone: null, note: '', steps: [] } }), NOW).verdict).toBe('shortfall')
  })
})

describe('funding certainty', () => {
  it('is 100 for a fully evidenced record', () => {
    expect(scoreCertainty(base())).toBe(100)
  })
  it('drops when international tuition is unevidenced', () => {
    expect(scoreCertainty(base({ evidence: without('tuition') }))).toBe(65)
  })
})
