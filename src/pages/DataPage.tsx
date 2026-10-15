import { useState } from 'react'
import { Button, Callout, Card, Field, Input, PageHeader, SectionTitle } from '../components/ui'
import { checkBackend } from '../lib/ai'
import { downloadJson, downloadText } from '../lib/exporter'
import { useStore, type AppState } from '../lib/store'
import { exportEnvelope, exportRecoveryRaw, validateBackup } from '../lib/storageMigration'
import { extractOpportunity as requestOpportunityExtraction, type ExtractedOpportunity } from '../lib/ai'
import { makeUnverifiedOpportunity } from '../lib/opportunityDraft'
import { Badge, LinkOut } from '../components/ui'
import registry from '../../scripts/discovery/sources.json'
import { deleteRemoteState, getRemoteSession, readRemoteState, remoteSyncConfigured, signInRemote, signOutRemote, writeRemoteState, type RemoteSession } from '../lib/remoteSync'

export default function DataPage() {
  const store = useStore()
  const { settings, setSettings, customOpportunities, addCustomOpportunities, removeCustomOpportunity, opportunities, replaceAll, reset, upsertApplication } = store
  const [apiBase, setApiBase] = useState(settings.apiBase)
  const [backendState, setBackendState] = useState<'idle' | 'gemini' | 'demo' | 'fail'>('idle')
  const [backendModel, setBackendModel] = useState('')
  const [importMsg, setImportMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [oppMsg, setOppMsg] = useState<{ added: number; errors: string[] } | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [universityInput, setUniversityInput] = useState('')
  const [programmeInput, setProgrammeInput] = useState('')
  const [reviewFields, setReviewFields] = useState<ExtractedOpportunity | null>(null)
  const [retrievedAt, setRetrievedAt] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [intakeMsg, setIntakeMsg] = useState('')
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(() => getRemoteSession())
  const [remoteEmail, setRemoteEmail] = useState('')
  const [remotePassword, setRemotePassword] = useState('')
  const [remoteConsent, setRemoteConsent] = useState(false)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [remoteMsg, setRemoteMsg] = useState('')
  const [remoteRecord, setRemoteRecord] = useState<{ state: AppState; updatedAt: string } | null>(null)

  const extractFromPage = async () => {
    setExtracting(true)
    setIntakeMsg('')
    try {
      const result = await requestOpportunityExtraction(apiBase.trim(), { url: sourceUrl.trim(), university: universityInput.trim(), programme: programmeInput.trim() })
      setReviewFields(result.extracted)
      setSourceUrl(result.sourceUrl)
      setUniversityInput(result.extracted.university || universityInput)
      setProgrammeInput(result.extracted.programme || programmeInput)
      setRetrievedAt(result.retrievedAt)
      setIntakeMsg(result.note)
    } catch (e) {
      setIntakeMsg(`${(e as Error).message} You can still enter the details manually below.`)
    } finally { setExtracting(false) }
  }

  const saveReviewedOpportunity = () => {
    if (!reviewFields || !/^https:\/\//i.test(sourceUrl.trim()) || !universityInput.trim() || !reviewFields.title.trim()) {
      setIntakeMsg('Add an HTTPS source URL, university, and project title before saving.')
      return
    }
    const input = { ...reviewFields, university: universityInput.trim(), programme: programmeInput.trim() || reviewFields.programme }
    const record = makeUnverifiedOpportunity(input, sourceUrl.trim(), retrievedAt || new Date().toISOString(), { university: universityInput.trim(), programme: programmeInput.trim() || null })
    const result = addCustomOpportunities([record])
    setOppMsg(result)
    if (result.added) {
      upsertApplication(record.id)
      setIntakeMsg('Saved to your local review queue. Eligibility and funding remain unverified.')
      setReviewFields(null)
      setSourceUrl('')
      setUniversityInput('')
      setProgrammeInput('')
      setRetrievedAt('')
    }
  }

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

  const connectRemote = async (createAccount: boolean) => {
    setRemoteBusy(true); setRemoteMsg('')
    try {
      const session = await signInRemote(remoteEmail.trim(), remotePassword, createAccount)
      setRemoteSession(session)
      setRemotePassword('')
      setRemoteMsg(createAccount ? 'Account created. If email confirmation is enabled, confirm your address and sign in.' : `Signed in as ${session.user.email ?? remoteEmail.trim()}. Your browser data has not been uploaded.`)
      if (!createAccount) setRemoteRecord(await readRemoteState())
    } catch (e) { setRemoteMsg((e as Error).message) } finally { setRemoteBusy(false) }
  }

  const downloadRemote = async () => {
    if (!remoteConsent) { setRemoteMsg('Check the consent box before transferring applicant data.'); return }
    if (!remoteRecord) { setRemoteMsg('There is no cloud record to download.'); return }
    if (!confirm('Replace the data in this browser with the cloud copy? A raw backup of this browser record will be created first.')) return
    setRemoteBusy(true)
    try { replaceAll(remoteRecord.state); setRemoteMsg('Cloud data loaded. This browser now has a local copy; changes are not uploaded automatically.') }
    catch (e) { setRemoteMsg((e as Error).message) } finally { setRemoteBusy(false) }
  }

  const uploadRemote = async () => {
    if (!remoteConsent) { setRemoteMsg('Check the consent box before transferring applicant data.'); return }
    if (!confirm(`Upload this browser's profile, CV, drafts, opportunity records, and tracker to the private account ${remoteSession?.user.email ?? ''}? This replaces that account's current cloud copy.`)) return
    setRemoteBusy(true)
    try {
      const updatedAt = await writeRemoteState(snapshot())
      setRemoteRecord({ state: snapshot(), updatedAt })
      setRemoteMsg(`Uploaded successfully at ${new Date(updatedAt).toLocaleString()}.`)
    } catch (e) { setRemoteMsg((e as Error).message) } finally { setRemoteBusy(false) }
  }

  const importBackup = async (file?: File) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      const validated = validateBackup(data)
      if (!validated.valid) throw new Error(validated.error)
      if (confirm('Replace all data in this browser with the backup? The current raw data will be backed up first.')) {
        replaceAll(validated.state as AppState)
        setImportMsg({ tone: 'ok', text: 'Backup restored. Gemini data-sharing consent is off on this device; enable it separately if you want AI drafting.' })
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
        <section className="lg:col-span-2">
          <SectionTitle>Use your data on multiple devices</SectionTitle>
          <Card className="space-y-4 p-4">
            {!remoteSyncConfigured ? <Callout tone="warn" title="Remote storage needs setup">Create a Supabase project and add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the GitHub Actions repository variables, then redeploy. Setup steps are in the README.</Callout> : <p className="text-sm text-muted">Sign in on each laptop using the same account. Data transfer is manual and requires your consent; signing in never uploads or replaces data by itself. The cloud copy contains the profile, CV text, drafts, tracker, and custom opportunities.</p>}
            {!remoteSession ? <>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Email"><Input type="email" autoComplete="email" value={remoteEmail} onChange={(e) => setRemoteEmail(e.target.value)} /></Field>
                <Field label="Password"><Input type="password" autoComplete="current-password" value={remotePassword} onChange={(e) => setRemotePassword(e.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={!remoteSyncConfigured || remoteBusy || !remoteEmail || !remotePassword} onClick={() => connectRemote(false)}>{remoteBusy ? 'Connecting…' : 'Sign in'}</Button><Button disabled={!remoteSyncConfigured || remoteBusy || !remoteEmail || remotePassword.length < 8} onClick={() => connectRemote(true)}>Create account</Button></div>
            </> : <>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ok">Signed in as {remoteSession.user.email ?? remoteEmail}</p><Button onClick={() => { signOutRemote(); setRemoteSession(null); setRemoteRecord(null); setRemoteMsg('Signed out.') }}>Sign out</Button></div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-forest" checked={remoteConsent} onChange={(e) => setRemoteConsent(e.target.checked)} /><span><strong>I consent to transferring my applicant data to my private remote account.</strong> The cloud provider stores it on its servers; use a unique password and sign out on shared devices. I understand that upload replaces the account's previous copy, while download replaces this browser's copy after making a recovery backup.</span></label>
              <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={remoteBusy || !remoteConsent} onClick={uploadRemote}>Upload this device to cloud</Button><Button disabled={remoteBusy || !remoteConsent || !remoteRecord} onClick={downloadRemote}>Download cloud copy to this device</Button><Button disabled={remoteBusy} onClick={async () => { setRemoteBusy(true); try { setRemoteRecord(await readRemoteState()); setRemoteMsg('Cloud record checked.') } catch (e) { setRemoteMsg((e as Error).message) } finally { setRemoteBusy(false) } }}>Check cloud copy</Button><Button variant="danger" disabled={remoteBusy || !remoteRecord} onClick={async () => { if (!confirm('Permanently delete the remote data copy for this account? Your browser data will not be affected.')) return; setRemoteBusy(true); try { await deleteRemoteState(); setRemoteRecord(null); setRemoteMsg('Remote data deleted. Local browser data remains unchanged.') } catch (e) { setRemoteMsg((e as Error).message) } finally { setRemoteBusy(false) } }}>Delete cloud copy</Button></div>
              <p className="text-xs text-muted">{remoteRecord ? `Cloud copy last updated ${new Date(remoteRecord.updatedAt).toLocaleString()}.` : 'No cloud copy has been checked or created yet.'} After editing on a device, upload the latest data; on another device, check then download it. Downloads preserve a recovery copy first.</p>
            </>}
            {remoteMsg && <p className="text-sm" role="status">{remoteMsg}</p>}
          </Card>
        </section>
        <section className="lg:col-span-2">
          <SectionTitle>Add a university or PhD opportunity</SectionTitle>
          <Card className="space-y-4 p-4">
            <p className="text-sm text-muted">Enter an official HTTPS URL, university and programme. With Gemini connected, the backend retrieves the public page and sends that page text and your entry to Gemini for a review draft; your saved applicant profile is not included. The draft is never treated as evidence of funding or eligibility.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Official opportunity URL"><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://university.ac.uk/phd-project" /></Field>
              <Field label="University"><Input value={universityInput} onChange={(e) => setUniversityInput(e.target.value)} placeholder="University name" /></Field>
              <Field label="Programme"><Input value={programmeInput} onChange={(e) => setProgrammeInput(e.target.value)} placeholder="PhD programme" /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={extractFromPage} disabled={extracting || !sourceUrl.trim() || !apiBase.trim()}>{extracting ? 'Retrieving page…' : 'Retrieve and extract with Gemini'}</Button>
              {!reviewFields && <Button onClick={() => setReviewFields({ university: universityInput, department: '', programme: programmeInput, title: '', description: '', supervisor: '', researchArea: '', entryRequirements: '', englishRequirement: '', fundingDescription: '', stipendDescription: '', deadline: '', startDate: '', requiredDocuments: [] })}>Enter details manually</Button>}
            </div>
            {intakeMsg && <Callout tone="warn">{intakeMsg}</Callout>}
            {reviewFields && <div className="space-y-3 rounded-md border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>Review extracted details</strong><Badge tone="ochre">Needs verification</Badge></div>
              <p className="text-xs text-muted">Check each value against the source page. Funding, international eligibility, stipend, dates, and requirements are saved as unverified details.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {(['title','university','department','programme','supervisor','researchArea','entryRequirements','englishRequirement','fundingDescription','stipendDescription','deadline','startDate'] as const).map((key) => <Field key={key} label={key.replace(/[A-Z]/g, (m) => ` ${m.toLowerCase()}`)}><Input value={key === 'university' ? universityInput : key === 'programme' ? programmeInput : reviewFields[key]} onChange={(e) => { if (key === 'university') setUniversityInput(e.target.value); else if (key === 'programme') setProgrammeInput(e.target.value); setReviewFields((f) => f ? { ...f, [key]: e.target.value } : f) }} /></Field>)}
              </div>
              <Field label="Project description"><textarea className="min-h-28 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm" value={reviewFields.description} onChange={(e) => setReviewFields((f) => f ? { ...f, description: e.target.value } : f)} /></Field>
              <Field label="Required documents (one per line)"><textarea className="min-h-16 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm" value={reviewFields.requiredDocuments.join('\n')} onChange={(e) => setReviewFields((f) => f ? { ...f, requiredDocuments: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) } : f)} /></Field>
              <Button variant="primary" onClick={saveReviewedOpportunity}>Approve details and add to review queue</Button>
            </div>}
          </Card>
        </section>
        <section>
          <SectionTitle>Where your data lives</SectionTitle>
          <Callout tone="warn" title="Browser storage — read this">
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>Your profile, CV text, drafts and tracker stay in this browser unless you explicitly upload them using Remote storage below. Remote sync requires your consent each time.</li>
              <li>Anyone with access to this browser profile can read them. Avoid shared or public computers.</li>
              <li>Clearing browser data or using a private window can remove the local copy. Remote account storage lets you move a copy between devices; export a backup regularly.</li>
              <li>Backups are plain JSON — store them somewhere private. Never commit them to a public repository.</li>
              <li>Gemini drafting sends only selected verified facts when requested and separately consented. Remote storage transfers the full selected app snapshot only when you use its upload/download controls.</li>
            </ul>
          </Callout>
          <Card className="mt-4 space-y-3 p-4">
            <p className={store.saveStatus === 'saved' ? 'text-sm text-ok' : store.saveStatus === 'error' ? 'text-sm text-bad' : 'text-sm text-muted'} role="status">
              {store.saveStatus === 'saved' ? '✓ Changes saved in this browser.' : store.saveStatus === 'saving' ? 'Saving changes to this browser…' : store.saveStatus === 'protected' ? 'Saving is paused to protect the existing stored record.' : 'Changes could not be saved. Export a backup before closing this tab.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => downloadJson(`doctoral-compass-backup-${new Date().toISOString().slice(0, 10)}.json`, exportEnvelope(snapshot()))}>Export my data</Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:border-forest">
                Restore backup
                <input type="file" accept="application/json" className="sr-only" onChange={(e) => importBackup(e.target.files?.[0])} />
              </label>
              <Button variant="danger" onClick={() => confirm('Permanently delete ALL your data from this browser? Export a backup first.') && reset()}>Delete all my data</Button>
            </div>
            {store.storageWarning && <Button variant="ghost" onClick={() => { const raw = exportRecoveryRaw(localStorage); if (raw) downloadText('doctoral-compass-recovery-raw.json', raw) }}>Export raw recovery copy</Button>}
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
              <Button onClick={async () => { const status = await checkBackend(apiBase.trim()); setBackendState(status.reachable ? status.aiAvailable ? 'gemini' : 'demo' : 'fail'); setBackendModel(status.model || '') }} disabled={!apiBase}>Test connection</Button>
              {backendState === 'gemini' && <span className="text-sm text-ok">✓ Gemini backend configured{backendModel ? ` (${backendModel})` : ''}. Each draft shows the provider actually used.</span>}
              {backendState === 'demo' && <span className="text-sm text-muted">Backend reachable; Gemini is not configured, so templates are used.</span>}
              {backendState === 'fail' && <span className="text-sm text-bad">Not reachable (check URL and CORS origin)</span>}
            </div>
            <p className="text-xs text-muted">Current mode: <strong>{backendState === 'gemini' ? 'Gemini AI' : 'demo (local templates)'}</strong>{settings.apiBase ? ` — backend ${settings.apiBase}` : ''}</p>
            <label className="flex items-start gap-2 border-t border-line pt-3 text-sm">
              <input type="checkbox" className="mt-0.5 accent-forest" checked={settings.allowAiDataTransfer} onChange={(e) => setSettings({ allowAiDataTransfer: e.target.checked })} />
              <span><strong>Allow profile facts to be sent for Gemini drafting.</strong> When you request an AI draft, the app sends only the verified profile facts selected for that document, the selected public opportunity details, and its local template draft to the backend. The server does not store or log them. Leave this off to keep drafts entirely in local demo mode. This does not upload your full profile or CV file.</span>
            </label>
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
