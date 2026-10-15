import type { AppState } from './store'

export const STORAGE_SCHEMA_VERSION = 2
export const LEGACY_STORAGE_KEY = 'doctoral-compass:v1'
export const STORAGE_BACKUP_KEY = 'doctoral-compass:backup:v1-before-v2'

export interface StorageLoadResult {
  state: Partial<AppState> | null
  canPersist: boolean
  warning: string | null
}

/**
 * Migrate in place without discarding unknown legacy fields. A raw backup must be
 * written successfully before any migrated state can be persisted.
 */
export function readStoredState(storage: Storage): StorageLoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return { state: null, canPersist: false, warning: 'Browser storage could not be read. Your existing data was left untouched.' }
  }
  if (raw === null) return { state: null, canPersist: true, warning: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: null, canPersist: false, warning: 'Saved data could not be parsed. Saving is paused so the existing record is not overwritten. Export the recovery copy from Data & Privacy before restoring a valid backup.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: null, canPersist: false, warning: 'Saved data has an unsupported format. Saving is paused so the existing record is not overwritten.' }
  }

  const record = parsed as Record<string, unknown>
  const version = Number(record.schemaVersion ?? 1)
  if (!Number.isInteger(version) || version < 1 || version > STORAGE_SCHEMA_VERSION) {
    return { state: null, canPersist: false, warning: 'Saved data uses an unsupported schema version. Saving is paused; it was preserved without changes.' }
  }
  if (version < STORAGE_SCHEMA_VERSION) {
    try {
      if (storage.getItem(STORAGE_BACKUP_KEY) === null) storage.setItem(STORAGE_BACKUP_KEY, raw)
    } catch {
      return { state: record as Partial<AppState>, canPersist: false, warning: 'A safety backup could not be created, so the app will not write migrated data. Export your data and free browser storage space before continuing.' }
    }
  }
  return {
    state: { ...record, schemaVersion: STORAGE_SCHEMA_VERSION } as Partial<AppState>,
    canPersist: true,
    warning: version < STORAGE_SCHEMA_VERSION ? `Your data was upgraded to schema ${STORAGE_SCHEMA_VERSION}. A raw backup is saved in this browser.` : null,
  }
}

export function validateBackup(value: unknown): { valid: true; state: Partial<AppState> } | { valid: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, error: 'Backup must be a JSON object.' }
  const root = value as Record<string, unknown>
  if (root.app !== undefined && root.app !== 'doctoral-compass') return { valid: false, error: 'This file is not a Doctoral Compass backup.' }
  const envelopeVersion = root.app === 'doctoral-compass' ? Number(root.schemaVersion ?? 1) : null
  if (envelopeVersion !== null && (!Number.isInteger(envelopeVersion) || envelopeVersion < 1 || envelopeVersion > STORAGE_SCHEMA_VERSION)) return { valid: false, error: 'This backup uses an unsupported schema version.' }
  const candidate = root.app === 'doctoral-compass' && 'state' in root ? root.state : value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { valid: false, error: 'Backup data is missing.' }
  const s = candidate as Record<string, unknown>
  const stateVersion = Number(s.schemaVersion ?? envelopeVersion ?? 1)
  if (!Number.isInteger(stateVersion) || stateVersion < 1 || stateVersion > STORAGE_SCHEMA_VERSION) return { valid: false, error: 'This backup uses an unsupported schema version.' }
  if (!s.profile || typeof s.profile !== 'object' || Array.isArray(s.profile)) return { valid: false, error: 'Backup is missing the applicant profile.' }
  for (const key of ['applications', 'topics', 'docs', 'customOpportunities']) {
    if (s[key] !== undefined && !Array.isArray(s[key])) return { valid: false, error: `Backup field "${key}" must be a list.` }
  }
  if (s.settings !== undefined && (!s.settings || typeof s.settings !== 'object' || Array.isArray(s.settings))) return { valid: false, error: 'Backup settings are malformed.' }
  return { valid: true, state: { ...s, schemaVersion: STORAGE_SCHEMA_VERSION } as Partial<AppState> }
}

export function exportEnvelope(state: AppState) {
  return { app: 'doctoral-compass', schemaVersion: STORAGE_SCHEMA_VERSION, exportedAt: new Date().toISOString(), state }
}

export function preserveCurrentRaw(storage: Storage): boolean {
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY)
    if (raw === null) return true
    const key = `doctoral-compass:backup:before-import:${new Date().toISOString()}`
    storage.setItem(key, raw)
    return true
  } catch {
    return false
  }
}

export function exportRecoveryRaw(storage: Storage): string | null {
  try { return storage.getItem(LEGACY_STORAGE_KEY) } catch { return null }
}
