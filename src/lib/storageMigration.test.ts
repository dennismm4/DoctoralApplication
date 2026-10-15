import { describe, expect, it } from 'vitest'
import { exportEnvelope, LEGACY_STORAGE_KEY, preserveCurrentRaw, readStoredState, STORAGE_BACKUP_KEY, STORAGE_SCHEMA_VERSION, validateBackup } from './storageMigration'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed))
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

describe('local data migration and backups', () => {
  it('backs up the exact legacy record before returning a versioned migration', () => {
    const legacy = JSON.stringify({ profile: { fullName: { value: 'Applicant', verified: true } }, applications: [], docs: [] })
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: legacy })
    const result = readStoredState(storage)
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBe(legacy)
    expect(result.canPersist).toBe(true)
    expect(result.state?.schemaVersion).toBe(STORAGE_SCHEMA_VERSION)
  })

  it('does not permit writes when the stored record is malformed or from a newer schema', () => {
    const malformed = memoryStorage({ [LEGACY_STORAGE_KEY]: '{' })
    expect(readStoredState(malformed).canPersist).toBe(false)
    expect(malformed.getItem(LEGACY_STORAGE_KEY)).toBe('{')
    const future = JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION + 1, profile: {} })
    const newer = memoryStorage({ [LEGACY_STORAGE_KEY]: future })
    expect(readStoredState(newer).canPersist).toBe(false)
    expect(newer.getItem(LEGACY_STORAGE_KEY)).toBe(future)
  })

  it('validates versioned exports and rejects malformed collection fields', () => {
    const state = { profile: {}, applications: [], topics: [], docs: [], customOpportunities: [] }
    expect(validateBackup(exportEnvelope(state as never)).valid).toBe(true)
    expect(validateBackup({ profile: {}, applications: 'not an array' })).toMatchObject({ valid: false })
  })

  it('creates a copy of the current raw data before import replacement', () => {
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: '{"profile":{}}' })
    expect(preserveCurrentRaw(storage)).toBe(true)
    expect([...Array(storage.length)].some((_, i) => storage.key(i)?.startsWith('doctoral-compass:backup:before-import:'))).toBe(true)
  })
})
