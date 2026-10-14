import { useState } from 'react'
import { Button, Callout, Card, Field, Input, PageHeader, SectionTitle } from '../components/ui'
import { checkBackend } from '../lib/ai'
import { downloadJson } from '../lib/exporter'
import { useStore, type AppState } from '../lib/store'
import { Badge, LinkOut } from '../components/ui'
import registry from '../../scripts/discovery/sources.json'

export default function DataPage() {
  const store = useStore()
  const { settings, setSettings, customOpportunities, addCustomOpportunities, removeCustomOpportunity, opportunities, replaceAll, reset } = store
  const [apiBase, setApiBase] = useState(settings.apiBase)
  const [backendState, setBackendState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [importMsg, setImportMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [oppMsg, setOppMsg] = useState<{ added: number; errors: string[] } | null>(null)

  const snapshot = (): AppState => ({
    profile: store.profile,
    applications: store.applications,
    dismissed: store.dismissed,
    topics: store.topics,
    docs: store.docs,
    cv: store.cv,
    masterCv: store.masterCv,
    customOpportunities: store.customOpportunities,
    checks: store.checks,
    dismissedAlerts: store.dismissedAlerts,
    settings: store.settings,
  })

  const verificationPatch = () =>
    Object.entries(store.checks)
      .filter(([, list]) => list.length)
      .map(([id, list]) => ({
        id,
        note: 'Facts confirmed by the applicant on official pages. A maintainer should re-check each URL, then update the record and its evidence in src/data/opportunities.json.',
        confirmations: list,
      }))
  const patchCount = verificationPatch().length

  const importBackup = async (file?: File) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!data.profile || !Array.isArray(data.applications)) throw new Error('Not a Doctoral Compass backup file.')
      if (confirm('Replace all data in this browser with the backup?')) {
        replaceAll(data)
        setImportMsg({ tone: 'ok', text: 'Backup restored.' })
      }
    } catch (e) {
      setImportMsg({ tone: 'bad', text: (e as Error).message })
    }
  }

  const importOpps = async (file?: File) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      setOppMsg(addCustomOpportunities(Array.isArray(data) ? data : [data]))
    } catch (e) {
      setOppMsg({ added: 0, errors: [(e as Error).message] })
    }
  }

  return (
    <>
      <PageHeader eyebrow="Settings" title="Data & Privacy" />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>Where your data lives</SectionTitle>
          <Callout tone="warn" title="Browser storage — read this">
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>Your profile, CV text, drafts and tracker are saved in this browser's <strong>localStorage</strong> on this device only. They are not uploaded to GitHub or any server.</li>
              <li>Anyone with access to this browser profile can read them. Avoid shared or public computers.</li>
              <li>Clearing browser data, private windows, or switching device loses them. <strong>Export a backup regularly.</strong></li>
              <li>Backups are plain JSON — store them somewhere private. Never commit them to a public repository.</li>
              <li>If you connect a backend, only <em>verified</em> profile facts and the selected opportunity are sent to it when you request a draft.</li>
            </ul>
          </Callout>
          <Card className="mt-4 space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => downloadJson(`doctoral-compass-backup-${new Date().toISOString().slice(0, 10)}.json`, snapshot())}>Export backup</Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:border-forest">
                Restore backup
                <input type="file" accept="application/json" className="sr-only" onChange={(e) => importBackup(e.target.files?.[0])} />
              </label>
              <Button variant="danger" onClick={() => confirm('Permanently delete ALL your data from this browser? Export a backup first.') && reset()}>Delete all my data</Button>
            </div>
            {importMsg && <p className={importMsg.tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-bad'}>{importMsg.text}</p>}
          </Card>
        </section>

        <section>
          <SectionTitle>AI drafting backend (optional)</SectionTitle>
          <Card className="space-y-3 p-4">
            <p className="text-sm text-muted">
              The public site cannot hold API keys. To enable AI drafting, deploy the small server in <code className="font-mono text-xs">/server</code> (it keeps the key in a server-side environment variable) and enter its URL. Leave blank for demo mode.
            </p>
            <Field label="Backend URL" hint="e.g. https://your-backend.example.com — never paste an API key here.">
              <Input value={apiBase} onChange={(e) => { setApiBase(e.target.value); setBackendState('idle') }} placeholder="https://…" />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (/sk-ant-|\bsk-[A-Za-z0-9]{16,}/.test(apiBase)) return alert('That looks like a secret, not a URL. Keys must stay on the server.')
                  setSettings({ apiBase: apiBase.trim() })
                }}
              >
                Save
              </Button>
              <Button onClick={async () => setBackendState((await checkBackend(apiBase.trim())) ? 'ok' : 'fail')} disabled={!apiBase}>Test connection</Button>
              {backendState === 'ok' && <span className="text-sm text-ok">✓ Reachable</span>}
              {backendState === 'fail' && <span className="text-sm text-bad">Not reachable (check URL and CORS origin)</span>}
            </div>
            <p className="text-xs text-muted">Current mode: <strong>{settings.apiBase ? `backend at ${settings.apiBase}` : 'demo (local templates)'}</strong></p>
          </Card>
        </section>

        <section className="lg:col-span-2">
          <SectionTitle aside={<span className="font-mono text-xs text-muted">{patchCount} record(s)</span>}>Your verification confirmations</SectionTitle>
          <Card className="space-y-3 p-4 text-sm">
            <p>Facts you confirmed with the checklist are applied in this browser immediately. To share them (or update the public dataset), export them and open a pull request — a maintainer re-checks each official URL before changing the data.</p>
            <Button onClick={() => downloadJson(`verification-patch-${new Date().toISOString().slice(0, 10)}.json`, verificationPatch())} disabled={!patchCount}>Export verification patch</Button>
          </Card>
        </section>

        <section className="lg:col-span-2">
          <SectionTitle aside={<span className="font-mono text-xs text-muted">{registry.sources.length} sources</span>}>Funding sources monitored</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-muted">
            A weekly job fetches these official pages, compares them with last week's copy and posts a review report. Changes are leads for a human to check — they never update the data automatically. Listing a source does <strong>not</strong> mean it is open or available to Ethiopian applicants.
          </p>
          <Card className="divide-y divide-line">
            {registry.sources.map((s) => (
              <div key={s.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-64 sm:shrink-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge tone={s.status === 'tracked' ? 'forest' : s.status === 'not-eligible' ? 'bad' : s.status === 'lead' ? 'ochre' : 'neutral'}>{s.status}</Badge>
                    {!s.enabled && <Badge>disabled</Badge>}
                    <Badge>every {s.cadenceDays}d</Badge>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-muted">{s.knownConstraints}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">{s.urls.map((u) => <LinkOut key={u} href={u}>{new URL(u).hostname}</LinkOut>)}</div>
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section className="lg:col-span-2">
          <SectionTitle>Opportunity data</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3 p-4 text-sm">
              <p>
                Active records live in <code className="font-mono text-xs">src/data/opportunities.json</code>, closed ones in <code className="font-mono text-xs">archive.json</code> ({opportunities.length - customOpportunities.length} loaded). Add records there via pull request — CI validates every record against the schema in <code className="font-mono text-xs">docs/DATA_SCHEMA.md</code>.
              </p>
              <p>You can also load records into this browser only, e.g. while drafting a new entry. They are validated with the same rules.</p>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3.5 py-2 font-medium hover:border-forest">
                Import opportunities (.json)
                <input type="file" accept="application/json" className="sr-only" onChange={(e) => importOpps(e.target.files?.[0])} />
              </label>
              <Button variant="ghost" onClick={() => downloadJson('opportunities.json', opportunities.filter((o) => o.recordType !== 'demo' || settings.showDemo))}>Export full dataset</Button>
              {oppMsg && (
                <div>
                  <p className={oppMsg.added ? 'text-ok' : 'text-muted'}>{oppMsg.added} record(s) added.</p>
                  {oppMsg.errors.length > 0 && <ul className="mt-1 max-h-40 list-inside list-disc overflow-y-auto text-xs text-bad">{oppMsg.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-forest" checked={settings.showDemo} onChange={(e) => setSettings({ showDemo: e.target.checked })} />
                Show illustrative fixtures (fictional records for testing the interface)
              </label>
            </Card>
            <Card className="p-4 text-sm">
              <h3 className="mb-2 font-sans font-semibold">Locally added records ({customOpportunities.length})</h3>
              {customOpportunities.length === 0 ? (
                <p className="text-muted">None.</p>
              ) : (
                <ul className="space-y-1">
                  {customOpportunities.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{o.title}</span>
                      <button className="text-xs text-bad" onClick={() => removeCustomOpportunity(o.id)}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </section>
      </div>
    </>
  )
}
