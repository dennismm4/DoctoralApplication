import { useState } from 'react'
import { extractText, parseCv, type Suggestion } from '../lib/cv'
import { uid } from '../lib/profile'
import { useStore } from '../lib/store'
import { Badge, Button, Card, TextArea } from './ui'

/**
 * Upload the original CV. The extracted text is stored once, read-only, and never modified.
 * Extracted items are suggestions: nothing enters the profile until she accepts it, and accepted
 * items still need verifying before any document can use them.
 */
export function CvImport({ compact }: { compact?: boolean }) {
  const { profile, setProfile, cv, setCv } = useStore()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)

  const ingest = (fileName: string, text: string) => {
    if (cv && !confirm(`Replace the stored original “${cv.fileName}” with “${fileName}”? Your approved master CV is not affected.`)) return
    setCv({ fileName, uploadedAt: new Date().toISOString(), originalText: text })
    setSuggestions(parseCv(text))
  }
  const onFile = async (file: File | undefined) => {
    setError('')
    if (!file) return
    try {
      ingest(file.name, await extractText(file))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const accept = (s: Suggestion) => {
    const set = (p: Partial<typeof profile>) => setProfile({ ...profile, ...p })
    const v = { verified: false }
    if (s.field === 'email') set({ email: { value: s.value, ...v } })
    else if (s.field === 'phone') set({ phone: { value: s.value, ...v } })
    else if (s.field === 'name') set({ fullName: { value: s.value, ...v } })
    else if (s.field === 'skill') set({ skills: [...profile.skills, { value: s.value, ...v }] })
    else if (s.field === 'publication') set({ publications: [...profile.publications, { id: uid(), citation: s.value, url: '', status: 'working-paper', ...v }] })
    else if (s.field === 'employment') set({ employment: [...profile.employment, { id: uid(), role: s.value, organisation: '', location: '', start: '', end: '', summary: '', ...v }] })
    else if (s.field === 'degree') set({ degrees: [...profile.degrees, { id: uid(), level: 'Other', title: s.value, institution: '', country: '', graduationYear: '', classification: '', dissertation: '', ...v }] })
    else if (s.field === 'languageTest') set({ languageTests: [...profile.languageTests, { id: uid(), test: s.value, overall: '', components: '', date: '', ...v }] })
    setSuggestions((x) => x.filter((y) => y.id !== s.id))
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg">{compact ? 'Upload your CV' : 'Import from CV'}</h2>
      <p className="mt-1 text-xs text-muted">
        Upload a .docx or .txt CV, or paste the text of a PDF. The original is kept unchanged in this browser. Extracted items are suggestions: review each one, then verify it in your profile.
      </p>
      <input type="file" accept=".docx,.txt,.md" onChange={(e) => onFile(e.target.files?.[0])} className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm" aria-label="Upload CV file" />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-forest">Paste CV text instead</summary>
        <TextArea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} className="mt-2" aria-label="Pasted CV text" />
        <Button size="sm" className="mt-2" onClick={() => pasted.trim() && ingest('Pasted text', pasted)}>Extract</Button>
      </details>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {cv && (
        <div className="mt-3 text-xs text-muted">
          Original (read-only): <strong className="text-ink">{cv.fileName}</strong>, {new Date(cv.uploadedAt).toLocaleString('en-GB')}{' '}
          <button className="text-forest underline" onClick={() => setShowOriginal((s) => !s)}>{showOriginal ? 'hide' : 'view'}</button>{' · '}
          <button className="text-forest underline" onClick={() => setSuggestions(parseCv(cv.originalText))}>re-extract</button>{' · '}
          <button className="text-bad underline" onClick={() => confirm('Delete the stored CV text from this browser?') && setCv(null)}>delete</button>
          {showOriginal && <pre className="mt-2 max-h-64 overflow-auto rounded border border-line bg-paper p-2 font-mono text-[11px] whitespace-pre-wrap text-ink">{cv.originalText}</pre>}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            Review {suggestions.length} suggestions <button className="text-xs text-muted underline" onClick={() => setSuggestions([])}>dismiss all</button>
          </div>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded border border-line p-2 text-sm">
                <Badge>{s.label}</Badge>
                <div className="mt-1 break-words">{s.value}</div>
                <div className="mt-1.5 flex gap-2">
                  <Button size="sm" onClick={() => accept(s)}>Add to profile (unverified)</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSuggestions((x) => x.filter((y) => y.id !== s.id))}>Ignore</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
