import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PageSignals } from '../../src/lib/discovery/extract'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const p = (...parts: string[]) => join(ROOT, ...parts)

export const readJson = <T>(file: string, fallback?: T): T => {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing ${file}`)
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T
}
export const writeJson = (file: string, data: unknown) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}
export const writeText = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : 'true'
}

export interface SourceEntry {
  id: string
  name: string
  provider: string
  category: string
  kind: 'official' | 'aggregator'
  enabled: boolean
  cadenceDays: number
  urls: string[]
  linkedRecordIds: string[]
  knownConstraints: string
  status: 'tracked' | 'monitor' | 'not-eligible' | 'lead'
}

export type Snapshots = Record<string, PageSignals>

const UA = 'DoctoralCompassBot/1.0 (scholarship eligibility monitor; low-frequency; contact via repository)'
const lastHit = new Map<string, number>()
const robotsCache = new Map<string, string[]>()

async function disallowed(url: URL): Promise<boolean> {
  if (!robotsCache.has(url.origin)) {
    let rules: string[] = []
    try {
      const res = await fetch(`${url.origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        let applies = false
        for (const line of (await res.text()).split('\n')) {
          const [k, ...rest] = line.split(':')
          const v = rest.join(':').trim()
          if (/^user-agent$/i.test(k.trim())) applies = v === '*' || /doctoralcompass/i.test(v)
          else if (applies && /^disallow$/i.test(k.trim()) && v) rules.push(v)
        }
      }
    } catch {
      rules = []
    }
    robotsCache.set(url.origin, rules)
  }
  return robotsCache.get(url.origin)!.some((r) => url.pathname.startsWith(r))
}

/**
 * Polite fetch: honours robots.txt, waits 2s between requests to the same host, 25s timeout.
 * Offline mode reads fixture HTML instead (used in tests and in sandboxes without network).
 */
export async function fetchPage(url: string, offlineDir?: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (offlineDir) {
    const index = readJson<Record<string, string>>(join(offlineDir, 'index.json'), {})
    const file = index[url]
    if (!file) return { ok: false, error: 'No offline fixture for this URL' }
    return { ok: true, html: readFileSync(join(offlineDir, file), 'utf8') }
  }
  try {
    const u = new URL(url)
    if (await disallowed(u)) return { ok: false, error: 'Disallowed by robots.txt' }
    const wait = (lastHit.get(u.host) ?? 0) + 2000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastHit.set(u.host, Date.now())
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, html: await res.text() }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
