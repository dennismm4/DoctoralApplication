/**
 * Move opportunities whose deadline has passed from src/data/opportunities.json to src/data/archive.json.
 *
 *   npm run archive            dry run — lists what would move
 *   npm run archive -- --write apply the move
 *
 * Uses the same rules engine as the app, so "expired" means exactly what the UI shows as "Deadline passed".
 * Shortfall and not-eligible records stay in the active file until their deadline passes, so the
 * applicant can still see why they were excluded during the current cycle.
 */
import { isExpired } from '../src/lib/eligibility'
import type { Opportunity } from '../src/types'
import { arg, p, readJson, writeJson } from './lib/common'

const activeFile = p('src/data/opportunities.json')
const archiveFile = p('src/data/archive.json')
const now = new Date(arg('now') ?? Date.now())
const active = readJson<Opportunity[]>(activeFile)
const archive = readJson<Opportunity[]>(archiveFile, [])

const moving = active.filter((o) => isExpired(o, now))
if (!moving.length) {
  console.log('Nothing to archive.')
  process.exit(0)
}
for (const o of moving) console.log(`→ ${o.id} (deadline ${o.deadline.date})`)

if (arg('write')) {
  const stamped = moving.map((o) => ({ ...o, archivedAt: now.toISOString(), archiveReason: `Deadline passed (${o.deadline.date ?? 'start date ' + o.startDate}).` }))
  writeJson(activeFile, active.filter((o) => !moving.includes(o)))
  writeJson(archiveFile, [...stamped, ...archive.filter((a) => !moving.some((m) => m.id === a.id))])
  console.log(`Archived ${moving.length} record(s).`)
} else {
  console.log(`Dry run — ${moving.length} record(s) would move. Re-run with --write to apply.`)
}
