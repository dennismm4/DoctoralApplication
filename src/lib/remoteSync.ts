import type { AppState } from './store'
import { validateBackup } from './storageMigration'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const SESSION_KEY = 'doctoral-compass:remote-session:v1'

export interface RemoteSession { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } }
export const remoteSyncConfigured = Boolean(url && anonKey)

function authHeaders(token?: string) {
  return { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof body.msg === 'string' ? body.msg : typeof body.message === 'string' ? body.message : typeof body.error_description === 'string' ? body.error_description : 'Remote service request failed.')
  return body as T
}

export function getRemoteSession(): RemoteSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY)
    return value ? JSON.parse(value) as RemoteSession : null
  } catch { return null }
}

function setRemoteSession(value: RemoteSession | null) {
  try { if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); else sessionStorage.removeItem(SESSION_KEY) } catch { /* session remains usable in memory only */ }
}

export async function signInRemote(email: string, password: string, createAccount = false): Promise<RemoteSession> {
  if (!remoteSyncConfigured) throw new Error('Remote sync is not configured. Add the Supabase URL and anon key to the frontend deployment settings.')
  const endpoint = createAccount ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password'
  const session = await responseJson<RemoteSession & { expires_in?: number }>(await fetch(`${url}${endpoint}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, password }) }))
  if (!session.access_token || !session.user?.id) throw new Error('Account created. Confirm your email, then sign in to continue.')
  const normalized = { ...session, expires_at: session.expires_at ?? (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : undefined) }
  setRemoteSession(normalized)
  return normalized
}

export function signOutRemote() { setRemoteSession(null) }

async function validSession(): Promise<RemoteSession> {
  const current = getRemoteSession()
  if (!current) throw new Error('Sign in to your remote account first.')
  if (current.expires_at && current.expires_at * 1000 < Date.now() + 60_000) {
    const next = await responseJson<RemoteSession & { expires_in?: number }>(await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: current.refresh_token }) }))
    const normalized = { ...next, expires_at: next.expires_at ?? (next.expires_in ? Math.floor(Date.now() / 1000) + next.expires_in : undefined) }
    setRemoteSession(normalized)
    return normalized
  }
  return current
}

export async function readRemoteState(): Promise<{ state: AppState; updatedAt: string } | null> {
  const session = await validSession()
  const query = new URLSearchParams({ select: 'data,updated_at', user_id: `eq.${session.user.id}`, limit: '1' })
  const rows = await responseJson<Array<{ data: AppState; updated_at: string }>>(await fetch(`${url}/rest/v1/applicant_data?${query}`, { headers: authHeaders(session.access_token) }))
  if (!rows[0]) return null
  const validated = validateBackup(rows[0].data)
  if (!validated.valid) throw new Error(`The cloud record is invalid and was not loaded: ${validated.error}`)
  return { state: validated.state as AppState, updatedAt: rows[0].updated_at }
}

export async function writeRemoteState(state: AppState): Promise<string> {
  const session = await validSession()
  const validated = validateBackup(state)
  if (!validated.valid) throw new Error(`Local data did not pass validation and was not uploaded: ${validated.error}`)
  const response = await fetch(`${url}/rest/v1/applicant_data?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...authHeaders(session.access_token), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ user_id: session.user.id, data: state, updated_at: new Date().toISOString() }),
  })
  const rows = await responseJson<Array<{ updated_at: string }>>(response)
  return rows[0]?.updated_at ?? new Date().toISOString()
}

export async function deleteRemoteState(): Promise<void> {
  const session = await validSession()
  const query = new URLSearchParams({ user_id: `eq.${session.user.id}` })
  const response = await fetch(`${url}/rest/v1/applicant_data?${query}`, { method: 'DELETE', headers: authHeaders(session.access_token) })
  if (!response.ok) await responseJson(response)
}
