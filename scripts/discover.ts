/**
 * Discovery + refresh pipeline.
 *
 *   npx tsx scripts/discover.ts                     live run (needs network — runs in GitHub Actions)
 *   npx tsx scripts/discover.ts --offline <dir>     use fixture HTML (index.json maps url → file)
 *   npx tsx scripts/discover.ts --sources <file>    alternative source registry (used with fixtures)
 *   npx tsx scripts/discover.ts --out <dir>         output folder (default: discovery-output)
 *   npx tsx scripts/discover.ts --update-snapshots  save page hashes/signals for the next diff
 *
 * DISCOVER: fetch every enabled source in scripts/discovery/sources.json, extract signals,
 *           classify each page as a lead, and diff it against the previous snapshot.
 * REFRESH:  for every active record, flag expired deadlines (→ archive), stale verifications,
 *           changed evidence pages, and conflicts between a verified record and what its page now says.
 *
 * Output is a REVIEW QUEUE for a human. The script never edits src/data/*.json.
 */
import active from '../src/data/opportunities.json'
import { assess, isStale, STALE_DAYS } from '../src/lib/eligibility'
import { classify, diffSignals, extractSignals, LEAD_LABEL, type Lead, type PageSignals } from '../src/lib/discovery/extract'
import { RESEARCH_AREAS } from '../src/lib/profile'
import type { Opportunity } from '../src/types'
import { arg, fetchPage, p, readJson, writeJson, writeText, type Snapshots, type SourceEntry } from './lib/common'

const now = new Date()
const offline = arg('offline')
const outDir = arg('out') ?? p('discovery-output')
const snapshotFile = p('scripts/discovery/state/snapshots.json')
const sources = readJson<{ sources: SourceEntry[] }>(arg('sources') ?? p('scripts/discovery/sources.json')).sources
const snapshots = readJson<Snapshots>(snapshotFile, {})
const records = active as Opportunity[]

interface QueueItem {
  sourceId: string
  sourceName: string
  url: string
  status: 'needs-manual-verification' | 'fetch-failed'
  lead?: Lead
  leadLabel?: string
  reasons: string[]
  changes: string[]
  linkedRecordIds: string[]
  signals?: Omit<PageSignals, 'hash'>
  error?: string
}

interface RefreshItem {
  recordId: string
  title: string
  action: 'archive' | 're-verify' | 'conflict' | 'ok'
  details: string[]
}

async function main() {
  const queue: QueueItem[] = []
  const nextSnapshots: Snapshots = { ...snapshots }
  const pageByUrl = new Map<string, PageSignals>()

  // Pages to fetch: every enabled source URL plus every evidence URL used by an active record.
  const evidenceUrls = new Set(records.flatMap((r) => r.evidence.map((e) => e.url)))
  const work: { source: SourceEntry | null; url: string }[] = []
  for (const s of sources.filter((x) => x.enabled)) for (const url of s.urls) work.push({ source: s, url })
  for (const url of evidenceUrls) if (!work.some((w) => w.url === url)) work.push({ source: null, url })

  for (const { source, url } of work) {
    const res = await fetchPage(url, offline)
    if (!res.ok) {
      if (source) queue.push({ sourceId: source.id, sourceName: source.name, url, status: 'fetch-failed', reasons: [], changes: [], linkedRecordIds: source.linkedRecordIds, error: res.error })
      continue
    }
    const signals = extractSignals(res.html, url, RESEARCH_AREAS, now.toISOString())
    pageByUrl.set(url, signals)
    const changes = diffSignals(snapshots[url], signals)
    nextSnapshots[url] = signals
    if (!source) continue
    const { lead, reasons } = classify(signals, now)
    const { hash: _h, ...rest } = signals
    void _h
    queue.push({
      sourceId: source.id,
      sourceName: source.name,
      url,
      status: 'needs-manual-verification',
      lead,
      leadLabel: LEAD_LABEL[lead],
      reasons: source.kind === 'aggregator' ? ['Aggregator lead — verify on the official page before creating a record.', ...reasons] : reasons,
      changes,
      linkedRecordIds: source.linkedRecordIds,
      signals: rest,
    })
  }

  // REFRESH existing records
  const refresh: RefreshItem[] = records.map((r) => {
    const a = assess(r, now)
    const details: string[] = []
    let action: RefreshItem['action'] = 'ok'
    if (a.verdict === 'expired') {
      action = 'archive'
      details.push('Deadline passed — run `npm run archive -- --write` to move it to archive.json.')
    }
    if (isStale(r, now)) {
      action = action === 'ok' ? 're-verify' : action
      details.push(`Last verified ${r.lastVerified.slice(0, 10)} (> ${STALE_DAYS} days).`)
    }
    for (const url of new Set(r.evidence.map((e) => e.url))) {
      const prev = snapshots[url]
      const cur = pageByUrl.get(url)
      if (!cur) continue
      if (prev && prev.hash !== cur.hash) {
        action = action === 'ok' ? 're-verify' : action
        details.push(`Evidence page changed since last snapshot: ${url} — ${diffSignals(prev, cur).slice(1).join('; ') || 'wording changed'}`)
      }
      if (a.verdict === 'verified' && cur.homeFeeOnly.length && !cur.fullInternationalFees.length && !cur.feeWaiver.length) {
        action = 'conflict'
        details.push(`Verified record but ${url} now mentions Home-fee-only funding: "${cur.homeFeeOnly[0]}"`)
      }
      if (a.gate.ethiopian === 'confirmed' && cur.countryListWithoutEthiopia) {
        action = 'conflict'
        details.push(`${url} now shows an eligible-country list without Ethiopia.`)
      }
    }
    return { recordId: r.id, title: r.title, action, details }
  })

  writeJson(`${outDir}/review-queue.json`, { generatedAt: now.toISOString(), mode: offline ? 'offline-fixtures' : 'live', queue })
  writeJson(`${outDir}/refresh.json`, { generatedAt: now.toISOString(), refresh })
  writeText(`${outDir}/report.md`, report(queue, refresh))
  if (arg('update-snapshots')) writeJson(snapshotFile, nextSnapshots)

  const failed = queue.filter((q) => q.status === 'fetch-failed').length
  console.log(`Discovery: ${queue.length - failed} pages analysed, ${failed} failed. Refresh: ${refresh.filter((r) => r.action !== 'ok').length} records need attention.`)
  console.log(`Report: ${outDir}/report.md`)
}

function report(queue: QueueItem[], refresh: RefreshItem[]): string {
  const lines = [
    `# Scholarship discovery report — ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    offline ? '> **Offline run against illustrative fixtures — not real data.**\n' : '',
    'Every item below is a lead for **manual verification** on the official page. Nothing here changes the dataset.',
    '',
    '## Records needing attention',
    '',
    '| Record | Action | Details |',
    '|---|---|---|',
    ...refresh.filter((r) => r.action !== 'ok').map((r) => `| ${r.recordId} | **${r.action}** | ${r.details.join('<br>')} |`),
    refresh.every((r) => r.action === 'ok') ? '| — | none | |' : '',
    '',
    '## Source pages',
    '',
  ]
  const order: Lead[] = ['promising', 'unclear', 'home-fee-only', 'restricted', 'not-ethiopia', 'self-funded', 'stale-cycle']
  for (const lead of order) {
    const items = queue.filter((q) => q.lead === lead)
    if (!items.length) continue
    lines.push(`### ${LEAD_LABEL[lead]} (${items.length})`, '')
    for (const q of items) {
      lines.push(`- **${q.sourceName}** — ${q.url}`)
      for (const r of q.reasons.slice(0, 3)) lines.push(`  - ${r}`)
      if (q.changes.length && q.changes[0] !== 'First snapshot of this page.') lines.push(`  - Changes: ${q.changes.join('; ')}`)
      const upcoming = q.signals?.dates.filter((d) => d.iso >= now.toISOString().slice(0, 10)).slice(0, 3)
      if (upcoming?.length) lines.push(`  - Dates: ${upcoming.map((d) => d.iso).join(', ')}`)
    }
    lines.push('')
  }
  const failed = queue.filter((q) => q.status === 'fetch-failed')
  if (failed.length) lines.push('### Could not fetch', '', ...failed.map((q) => `- ${q.sourceName} — ${q.url} (${q.error})`), '')
  return lines.filter((l) => l !== undefined).join('\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
