import { describe, expect, it } from 'vitest'
import { assess } from './eligibility'
import { base } from './testHelpers'
import { scoreMatch } from './matching'
import { defaultProfile } from './profile'
import { applyManualChecks, checklistFor, validateCheck } from './verification'
import type { ManualCheck } from '../types'

const NOW = new Date('2026-10-14T12:00:00Z')
const p = defaultProfile()

describe('funding is a gate, not a score', () => {
  it('a highly relevant award with a tuition shortfall is never primary', () => {
    const op = base({ themes: p.researchInterests.map((i) => i.toLowerCase()), tuition: { coverage: 'home-only', internationalFeeCoveredInFull: 'unknown', note: '' } })
    const a = assess(op, NOW)
    const m = scoreMatch(p, op, a, { entryMet: true, docsDone: 0 })
    expect(a.verdict).toBe('shortfall')
    expect(m.primary).toBe(false)
  })
  it('only verified records are primary', () => {
    const a = assess(base(), NOW)
    expect(scoreMatch(p, base(), a, { entryMet: null, docsDone: 0 }).primary).toBe(true)
  })
  it('score has 8 components summing to at most 100', () => {
    const m = scoreMatch(p, base(), assess(base(), NOW), { entryMet: true, docsDone: 0 })
    expect(m.components).toHaveLength(8)
    expect(m.components.reduce((s, c) => s + c.max, 0)).toBe(100)
    expect(m.score).toBeLessThanOrEqual(100)
  })
  it('flags tight preparation time', () => {
    const op = base({ proposalRequired: 'yes', supervisorContactRequired: 'yes', deadline: { date: '2026-11-15', type: 'scholarship', timezone: null, note: '', steps: [] } })
    expect(scoreMatch(p, op, assess(op, NOW), { entryMet: null, docsDone: 0 }).prepStatus).toBe('too-late')
  })
})

describe('manual verification checklist', () => {
  const unverified = base({ eligibility: { international: 'yes', ethiopian: 'unknown', restrictedTo: null, note: '' }, evidence: base().evidence.filter((e) => e.field !== 'eligibility.ethiopian') })
  const check = (key: ManualCheck['key'], value: string, url = 'https://www.example.ac.uk/eligibility'): ManualCheck => ({ key, value, url, note: '', checkedAt: '2026-10-14T13:00:00Z' })

  it('lists the unconfirmed gate facts', () => {
    const items = checklistFor(unverified, assess(unverified, NOW))
    expect(items.find((i) => i.key === 'ethiopian')?.status).toBe('needed')
    expect(items.find((i) => i.key === 'tuition')?.status).toBe('confirmed')
  })
  it('confirming a fact with an official URL promotes the record', () => {
    const patched = applyManualChecks(unverified, [check('ethiopian', 'yes')])
    expect(assess(patched, NOW).verdict).toBe('verified')
    expect(patched.evidence.at(-1)?.addedBy).toBe('applicant')
  })
  it('confirming a shortfall moves it to the archive', () => {
    const patched = applyManualChecks(base(), [check('tuition', 'no')])
    expect(assess(patched, NOW).verdict).toBe('shortfall')
  })
  it('rejects non-https, search and aggregator URLs', () => {
    const item = { input: 'yesno' as const, needsUrl: true }
    expect(validateCheck(item, 'yes', 'http://example.ac.uk')).toMatch(/https/)
    expect(validateCheck(item, 'yes', 'https://www.google.com/search?q=x')).toMatch(/aggregator|search/)
    expect(validateCheck(item, 'yes', 'https://scholarshipsforafricans.com/x')).toMatch(/aggregator/)
    expect(validateCheck(item, 'yes', 'https://www.york.ac.uk/funding')).toBeNull()
  })
  it('does not modify the published record', () => {
    const before = JSON.stringify(unverified)
    applyManualChecks(unverified, [check('ethiopian', 'yes')])
    expect(JSON.stringify(unverified)).toBe(before)
  })
})
