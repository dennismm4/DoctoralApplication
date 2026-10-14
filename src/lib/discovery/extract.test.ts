import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESEARCH_AREAS } from '../profile'
import { classify, diffSignals, extractDates, extractSignals, extractStipends, hashText, htmlToText } from './extract'

// Illustrative fixtures — invented pages, used only to test the parser.
const FIX = join(__dirname, '../../../scripts/discovery/fixtures')
const load = (f: string) => readFileSync(join(FIX, f), 'utf8')
const NOW = new Date('2026-10-14T12:00:00Z')
const sig = (f: string) => extractSignals(load(f), `https://fixture.example/${f}`, RESEARCH_AREAS, NOW.toISOString())

describe('text extraction', () => {
  it('strips tags, nav and entities', () => {
    const t = htmlToText('<nav>menu</nav><p>Stipend &pound;21,805</p><script>x()</script>')
    expect(t).toBe('Stipend £21,805')
  })
  it('parses UK and US style dates', () => {
    expect(extractDates('closes 4 December 2026 and January 6, 2027').map((d) => d.iso)).toEqual(['2026-12-04', '2027-01-06'])
  })
  it('finds stipends but not fee amounts', () => {
    const s = extractStipends('International fee £19,500. A stipend of £21,805 per year. Monthly stipend of £1,712 per month.')
    expect(s.map((x) => [x.amount, x.per])).toEqual([[21805, 'year'], [1712, 'month']])
  })
  it('hash changes with content', () => {
    expect(hashText('a')).not.toBe(hashText('b'))
    expect(hashText('a')).toBe(hashText('a'))
  })
})

describe('lead classification on illustrative fixtures', () => {
  it('promising: international + full international fees + stipend + future date', () => {
    const s = sig('promising.html')
    expect(classify(s, NOW).lead).toBe('promising')
    expect(s.interestMatches).toEqual(expect.arrayContaining(['Food Security', 'Supply Chain Management']))
  })
  it('home-fee-only DTP wording → shortfall lead', () => {
    expect(classify(sig('home-fee-only.html'), NOW).lead).toBe('home-fee-only')
  })
  it('eligible-country list without Ethiopia → not-ethiopia', () => {
    expect(classify(sig('country-list.html'), NOW).lead).toBe('not-ethiopia')
  })
  it('only past dates → stale cycle', () => {
    expect(classify(sig('stale.html'), NOW).lead).toBe('stale-cycle')
  })
  it('UK-only restriction → restricted', () => {
    expect(classify(sig('restricted.html'), NOW).lead).toBe('restricted')
  })
})

describe('snapshot diffing', () => {
  it('reports new dates and stipend changes', () => {
    const a = sig('promising.html')
    const b = extractSignals(load('promising.html').replace('15 January 2027', '22 January 2027').replace('21,805', '22,500'), a.url, RESEARCH_AREAS)
    const changes = diffSignals(a, b)
    expect(changes.join(' ')).toMatch(/2027-01-22/)
    expect(changes.join(' ')).toMatch(/Stipend figures changed/)
  })
  it('no changes when the page is identical', () => {
    expect(diffSignals(sig('stale.html'), sig('stale.html'))).toEqual([])
  })
})
