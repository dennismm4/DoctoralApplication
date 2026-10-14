/**
 * Discovery signal extraction.
 *
 * Turns an official web page into structured SIGNALS (mentions of international eligibility,
 * Home-fee-only funding, fee waivers, stipends, dates, restrictions…). Signals are leads for a
 * human to verify — they are never written into the opportunity dataset automatically, and they
 * never count as evidence for the rules engine.
 */

export interface Snippet {
  text: string
}

export interface PageSignals {
  url: string
  fetchedAt: string
  hash: string
  title: string
  international: string[]
  homeFeeOnly: string[]
  feeWaiver: string[]
  fullInternationalFees: string[]
  restrictions: string[]
  selfFunded: string[]
  stipends: { amount: number; per: 'year' | 'month' | 'unknown'; context: string }[]
  dates: { iso: string; context: string }[]
  academicYears: string[]
  ethiopiaMentioned: boolean
  countryListWithoutEthiopia: boolean
  interestMatches: string[]
}

export type Lead = 'promising' | 'home-fee-only' | 'restricted' | 'not-ethiopia' | 'self-funded' | 'stale-cycle' | 'unclear'

export const LEAD_LABEL: Record<Lead, string> = {
  promising: 'Promising — verify manually',
  'home-fee-only': 'Likely Home-fee only (shortfall)',
  restricted: 'Restricted (UK/Home only)',
  'not-ethiopia': 'Country list excludes Ethiopia',
  'self-funded': 'Self-funded',
  'stale-cycle': 'No current cycle found',
  unclear: 'Unclear — read the page',
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Strip scripts, styles, nav chrome and tags; collapse whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|tr|td|th|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&pound;/g, '£')
    .replace(/&#163;/g, '£')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export function pageTitle(html: string): string {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

/** cyrb53 — fast, stable content hash (not cryptographic; used only to detect page changes). */
export function hashText(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
}

const find = (ss: string[], re: RegExp, limit = 4) => ss.filter((s) => re.test(s)).slice(0, limit).map((s) => (s.length > 260 ? `${s.slice(0, 257)}…` : s))

const PATTERNS = {
  international: /\b(international|overseas|non-UK|all nationalities|any nationality|EU and non-EU|outside the UK)\b.*\b(eligible|apply|open|welcome|can be considered|students)\b|\b(open to|available to)\b.*\b(international|overseas|all nationalities)\b/i,
  homeFeeOnly: /\b(home (fee|rate)s? only|only (cover|pay)s? (the )?home|up to the value of home fee|at the home rate|cover(s)? (tuition )?fees at the home|pay the difference between (the )?home and international|international (students|applicants|awardees) (will )?(need|have) to (pay|cover|fund) the difference)/i,
  feeWaiver: /\b(waive[sd]?|waiver|fee difference (is|will be) (covered|met|paid)|cover(s|ed)? the (fee )?difference)\b/i,
  fullInternationalFees: /\b(full (international|overseas) (tuition )?fees?|(international|overseas) (tuition )?fees? (in full|are covered|will be covered|paid)|fees at the (international|overseas) rate|academic fees \(UK or international\)|fees \(international\))\b/i,
  restrictions: /\b(UK (nationals|citizens|residents) only|home (students|applicants) only|only (open|available) to (UK|home)|must (have|be eligible for) home fee status|not (open|available) to international|international (students|applicants) are not eligible)\b/i,
  selfFunded: /\b(self[- ]funded|no funding (is )?(attached|available)|applicants must (secure|provide) (their own )?funding)\b/i,
}

/** Countries that commonly appear on restricted country lists (e.g. Commonwealth schemes). */
const LIST_COUNTRIES = ['Bangladesh', 'Gambia', 'Kenya', 'Lesotho', 'Malawi', 'Mozambique', 'Nigeria', 'Pakistan', 'Rwanda', 'Sierra Leone', 'Sri Lanka', 'Tanzania', 'Uganda', 'Zambia', 'Ghana', 'Cameroon', 'India']

export function extractDates(text: string): { iso: string; context: string }[] {
  const out: { iso: string; context: string }[] = []
  const re = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTHS.join('|')})\s+(20\d{2})\b|\b(${MONTHS.join('|')})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const day = Number(m[1] ?? m[5])
    const month = MONTHS.indexOf((m[2] ?? m[4]).toLowerCase()) + 1
    const year = Number(m[3] ?? m[6])
    if (day < 1 || day > 31) continue
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const context = text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 40).replace(/\s+/g, ' ').trim()
    if (!out.some((d) => d.iso === iso && d.context === context)) out.push({ iso, context })
  }
  return out
}

export function extractStipends(text: string): PageSignals['stipends'] {
  const out: PageSignals['stipends'] = []
  const re = /£\s?(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d{2})?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const amount = Number(m[1].replace(/,/g, ''))
    const before = text.slice(Math.max(0, m.index - 50), m.index)
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25)
    const near = `${before} ${after}`
    const context = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 40).replace(/\s+/g, ' ')
    if (!/stipend|maintenance|living|per (annum|year|month)|a year|a month|grant/i.test(near)) continue
    if (/fee/i.test(before.slice(-30)) && !/stipend|maintenance/i.test(before)) continue
    const per = /^\s*(per month|a month|monthly)/i.test(after) || /monthly/i.test(before.slice(-25))
      ? 'month'
      : /^\s*(per (annum|year)|a year|p\.a\.)/i.test(after) || /annual/i.test(before.slice(-25)) || amount >= 10000
        ? 'year'
        : 'unknown'
    if ((per === 'year' && (amount < 10000 || amount > 45000)) || (per === 'month' && (amount < 800 || amount > 4000))) continue
    out.push({ amount, per, context: context.trim() })
  }
  return out
}

export function extractSignals(html: string, url: string, interests: string[], fetchedAt = new Date().toISOString()): PageSignals {
  const text = htmlToText(html)
  const ss = sentences(text)
  const lower = text.toLowerCase()
  const listHits = LIST_COUNTRIES.filter((c) => lower.includes(c.toLowerCase())).length
  const ethiopiaMentioned = /\bethiopia(n)?\b/i.test(text)
  return {
    url,
    fetchedAt,
    hash: hashText(text),
    title: pageTitle(html),
    international: find(ss, PATTERNS.international),
    homeFeeOnly: find(ss, PATTERNS.homeFeeOnly),
    feeWaiver: find(ss, PATTERNS.feeWaiver),
    fullInternationalFees: find(ss, PATTERNS.fullInternationalFees),
    restrictions: find(ss, PATTERNS.restrictions),
    selfFunded: find(ss, PATTERNS.selfFunded),
    stipends: extractStipends(text).slice(0, 6),
    dates: extractDates(text).slice(0, 20),
    academicYears: [...new Set(text.match(/\b20\d{2}\s?[/–-]\s?(?:20)?\d{2}\b|\b20\d{2} (?:entry|start)\b/gi) ?? [])].slice(0, 10),
    ethiopiaMentioned,
    countryListWithoutEthiopia: listHits >= 5 && /eligible countr/i.test(text) && !ethiopiaMentioned,
    interestMatches: interests.filter((i) => lower.includes(i.toLowerCase()) || i.toLowerCase().split(/\s+/).filter((w) => w.length > 5).every((w) => lower.includes(w))),
  }
}

/**
 * Classify a page as a lead. Order mirrors the rules engine: exclusions first.
 * "promising" still means only: worth a human reading the page and creating a record.
 */
export function classify(s: PageSignals, now: Date = new Date()): { lead: Lead; reasons: string[] } {
  const reasons: string[] = []
  const today = now.toISOString().slice(0, 10)
  const futureDates = s.dates.filter((d) => d.iso >= today)
  const hasStipend = s.stipends.length > 0
  const coversIntl = s.fullInternationalFees.length > 0 || s.feeWaiver.length > 0

  if (s.restrictions.length) return { lead: 'restricted', reasons: s.restrictions }
  if (s.countryListWithoutEthiopia) return { lead: 'not-ethiopia', reasons: ['Page lists eligible countries and Ethiopia is not among them.'] }
  if (s.selfFunded.length && !hasStipend) return { lead: 'self-funded', reasons: s.selfFunded }
  if (s.homeFeeOnly.length && !coversIntl) return { lead: 'home-fee-only', reasons: s.homeFeeOnly }
  if (!futureDates.length && s.dates.length) {
    reasons.push(`Only past dates found (latest ${s.dates.map((d) => d.iso).sort().at(-1)}).`)
    return { lead: 'stale-cycle', reasons }
  }
  if (s.international.length && coversIntl && hasStipend) {
    reasons.push('Mentions international eligibility, international fee coverage and a stipend.')
    if (futureDates.length) reasons.push(`Upcoming date: ${futureDates[0].iso}`)
    return { lead: 'promising', reasons }
  }
  if (!s.international.length) reasons.push('No international-eligibility statement found.')
  if (!coversIntl) reasons.push('No statement that international fees are covered.')
  if (!hasStipend) reasons.push('No stipend amount found.')
  return { lead: 'unclear', reasons }
}

/** Human-readable differences between two snapshots of the same page. */
export function diffSignals(prev: PageSignals | undefined, next: PageSignals): string[] {
  if (!prev) return ['First snapshot of this page.']
  if (prev.hash === next.hash) return []
  const out = ['Page content changed.']
  const newDates = next.dates.filter((d) => !prev.dates.some((p) => p.iso === d.iso)).map((d) => d.iso)
  if (newDates.length) out.push(`New dates: ${newDates.join(', ')}`)
  const amounts = (s: PageSignals) => s.stipends.map((x) => x.amount).sort().join(',')
  if (amounts(prev) !== amounts(next)) out.push(`Stipend figures changed: [${amounts(prev)}] → [${amounts(next)}]`)
  for (const k of ['homeFeeOnly', 'feeWaiver', 'fullInternationalFees', 'restrictions', 'international'] as const)
    if ((prev[k].length > 0) !== (next[k].length > 0)) out.push(`${k} statements ${next[k].length ? 'appeared' : 'disappeared'}.`)
  if (prev.countryListWithoutEthiopia !== next.countryListWithoutEthiopia) out.push('Country-list status changed.')
  return out
}
