import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import active from '../data/opportunities.json'
import archived from '../data/archive.json'
import fixtures from '../data/fixtures/illustrative.json'
import type { AppDocument, Application, AppStatus, ManualCheck, MasterCv, Opportunity, Profile, StoredCv, TopicProposal } from '../types'
import { migrateDocs } from './docs/documents'
import { applyManualChecks } from './verification'
import { defaultProfile, normalizeProfile, uid } from './profile'
import { validateOpportunity } from './validate'
import { LEGACY_STORAGE_KEY, STORAGE_SCHEMA_VERSION, preserveCurrentRaw, readStoredState } from './storageMigration'

/**
 * Browser localStorage remains the working copy. Remote account transfer is
 * performed only from Data & Privacy after explicit applicant consent.
 */
const KEY = LEGACY_STORAGE_KEY

export interface AppState {
  profile: Profile
  applications: Application[]
  dismissed: string[]
  topics: TopicProposal[]
  docs: AppDocument[]
  cv: StoredCv | null
  /** Approved master CV snapshot. Tailoring reads only this; it is never modified by tailoring. */
  masterCv: MasterCv | null
  customOpportunities: Opportunity[]
  /** Manual verification checklist answers, per opportunity id. */
  checks: Record<string, ManualCheck[]>
  /** Deadline alert ids the applicant has dismissed. */
  dismissedAlerts: string[]
  settings: { showDemo: boolean; apiBase: string; browserAlerts: boolean; allowAiDataTransfer: boolean }
  schemaVersion?: number
}

const initial = (): AppState => ({
  profile: defaultProfile(),
  applications: [],
  dismissed: [],
  topics: [],
  docs: [],
  cv: null,
  masterCv: null,
  customOpportunities: [],
  checks: {},
  dismissedAlerts: [],
  settings: { showDemo: false, apiBase: import.meta.env.VITE_API_BASE_URL ?? '', browserAlerts: false, allowAiDataTransfer: false },
  schemaVersion: STORAGE_SCHEMA_VERSION,
})

function load(): { state: AppState; canPersist: boolean; warning: string | null } {
  try {
    const result = readStoredState(localStorage)
    if (!result.state) return { state: initial(), canPersist: result.canPersist, warning: result.warning }
    const parsed = result.state
    return { state: {
      ...initial(),
      ...parsed,
      profile: normalizeProfile(parsed.profile),
      docs: migrateDocs(Array.isArray(parsed.docs) ? parsed.docs : [], [...(active as Opportunity[]), ...(archived as Opportunity[])]),
      settings: { ...initial().settings, ...parsed.settings },
      schemaVersion: STORAGE_SCHEMA_VERSION,
    }, canPersist: result.canPersist, warning: result.warning }
  } catch {
    return { state: initial(), canPersist: false, warning: 'Saved data could not be loaded. Editing is paused so the existing record will not be overwritten.' }
  }
}

interface Store extends AppState {
  /** All records with the applicant's manual checks applied. Fixtures only when showDemo is on. */
  opportunities: Opportunity[]
  /** The same records as published in the dataset, before manual checks. */
  publishedOpportunities: Opportunity[]
  setCheck: (opportunityId: string, check: ManualCheck) => void
  removeCheck: (opportunityId: string, key: ManualCheck['key']) => void
  dismissAlert: (id: string) => void
  storageOk: boolean
  storageWarning: string | null
  saveStatus: 'saving' | 'saved' | 'error' | 'protected'
  setProfile: (p: Profile) => void
  upsertApplication: (opportunityId: string, patch?: Partial<Application>) => Application
  updateApplication: (id: string, patch: Partial<Application>) => void
  removeApplication: (id: string) => void
  toggleDismiss: (opportunityId: string) => void
  setTopics: (fn: (t: TopicProposal[]) => TopicProposal[]) => void
  setDocs: (fn: (d: AppDocument[]) => AppDocument[]) => void
  setMasterCv: (m: MasterCv | null) => void
  setCv: (cv: StoredCv | null) => void
  addCustomOpportunities: (records: unknown[]) => { added: number; errors: string[] }
  removeCustomOpportunity: (id: string) => void
  setSettings: (s: Partial<AppState['settings']>) => void
  replaceAll: (s: AppState) => void
  reset: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(load)
  const [state, setState] = useState<AppState>(loaded.state)
  const [canPersist, setCanPersist] = useState(loaded.canPersist)
  const [storageWarning, setStorageWarning] = useState<string | null>(loaded.warning)
  const [storageOk, setStorageOk] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error' | 'protected'>(loaded.canPersist ? 'saving' : 'protected')

  useEffect(() => {
    try {
      if (!canPersist) { setSaveStatus('protected'); return }
      setSaveStatus('saving')
      localStorage.setItem(KEY, JSON.stringify({ ...state, schemaVersion: STORAGE_SCHEMA_VERSION }))
      setStorageOk(true)
      setSaveStatus('saved')
    } catch {
      setStorageOk(false)
      setSaveStatus('error')
      setStorageWarning('Browser storage could not save your latest changes. Export a backup before closing this tab.')
    }
  }, [state, canPersist])

  const patch = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), [])

  const store = useMemo<Store>(() => {
    const published = [
      ...(active as Opportunity[]),
      ...(archived as Opportunity[]),
      ...(state.settings.showDemo ? (fixtures as Opportunity[]) : []),
      ...state.customOpportunities,
    ]
    const opportunities = published.map((o) => applyManualChecks(o, state.checks[o.id]))
    return {
      ...state,
      opportunities,
      publishedOpportunities: published,
      setCheck: (id, check) =>
        patch((s) => ({ ...s, checks: { ...s.checks, [id]: [...(s.checks[id] ?? []).filter((c) => c.key !== check.key), check] } })),
      removeCheck: (id, key) => patch((s) => ({ ...s, checks: { ...s.checks, [id]: (s.checks[id] ?? []).filter((c) => c.key !== key) } })),
      dismissAlert: (id) => patch((s) => ({ ...s, dismissedAlerts: [...s.dismissedAlerts, id] })),
      setProfile: (profile) => patch((s) => ({ ...s, profile })),
      upsertApplication: (opportunityId, p = {}) => {
        const now = new Date().toISOString()
        const existing = state.applications.find((a) => a.opportunityId === opportunityId)
        const app: Application = existing
          ? { ...existing, ...p, updatedAt: now }
          : { id: uid(), opportunityId, status: 'Interested' as AppStatus, shortlisted: false, createdAt: now, updatedAt: now, submittedOn: '', personalDeadline: '', reminders: [], tasks: [], notes: '', ...p }
        patch((s) => ({ ...s, applications: existing ? s.applications.map((a) => (a.id === app.id ? app : a)) : [...s.applications, app], dismissed: s.dismissed.filter((d) => d !== opportunityId) }))
        return app
      },
      updateApplication: (id, p) =>
        patch((s) => ({ ...s, applications: s.applications.map((a) => (a.id === id ? { ...a, ...p, updatedAt: new Date().toISOString() } : a)) })),
      removeApplication: (id) => patch((s) => ({ ...s, applications: s.applications.filter((a) => a.id !== id) })),
      toggleDismiss: (opportunityId) =>
        patch((s) => ({ ...s, dismissed: s.dismissed.includes(opportunityId) ? s.dismissed.filter((d) => d !== opportunityId) : [...s.dismissed, opportunityId] })),
      setTopics: (fn) => patch((s) => ({ ...s, topics: fn(s.topics) })),
      setDocs: (fn) => patch((s) => ({ ...s, docs: fn(s.docs) })),
      setCv: (cv) => patch((s) => ({ ...s, cv })),
      setMasterCv: (masterCv) => patch((s) => ({ ...s, masterCv })),
      addCustomOpportunities: (records) => {
        const errors: string[] = []
        const valid: Opportunity[] = []
        const taken = new Set([...published, ...(fixtures as Opportunity[])].map((o) => o.id))
        for (const r of records) {
          const errs = validateOpportunity(r)
          const id = (r as Opportunity)?.id
          if (id && taken.has(id)) errs.push(`${id}: id already exists`)
          if (errs.length) errors.push(...errs)
          else {
            valid.push(r as Opportunity)
            taken.add(id)
          }
        }
        if (valid.length) patch((s) => ({ ...s, customOpportunities: [...s.customOpportunities, ...valid] }))
        return { added: valid.length, errors }
      },
      removeCustomOpportunity: (id) => patch((s) => ({ ...s, customOpportunities: s.customOpportunities.filter((o) => o.id !== id) })),
      setSettings: (p) => patch((s) => ({ ...s, settings: { ...s.settings, ...p } })),
      replaceAll: (next) => {
        if (!preserveCurrentRaw(localStorage)) throw new Error('Could not create a backup of current data; import was cancelled.')
        setState({ ...initial(), ...next, profile: normalizeProfile(next.profile), docs: migrateDocs(next.docs ?? [], published), settings: { ...initial().settings, ...next.settings, allowAiDataTransfer: false }, schemaVersion: STORAGE_SCHEMA_VERSION })
        setCanPersist(true)
        setStorageWarning(null)
      },
      reset: () => {
        if (!preserveCurrentRaw(localStorage)) throw new Error('Could not create a backup of current data; deletion was cancelled.')
        setState(initial())
        setCanPersist(true)
        setStorageWarning(null)
      },
      storageOk,
      storageWarning,
      saveStatus,
    } as Store
  }, [state, patch, storageOk, storageWarning, canPersist, saveStatus])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}
