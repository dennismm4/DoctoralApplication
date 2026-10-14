/**
 * CV text extraction and a cautious, review-first parser.
 * Supported: .txt, .md, .docx (via mammoth). PDFs: paste text instead (keeps the bundle small and
 * avoids silently mis-reading layout-heavy PDFs).
 */

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.md')) return file.text()
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return value
  }
  throw new Error('Unsupported file type. Upload .docx or .txt, or paste the text of a PDF CV.')
}

export interface Suggestion {
  id: string
  field: 'email' | 'phone' | 'name' | 'degree' | 'employment' | 'skill' | 'publication' | 'languageTest'
  label: string
  value: string
}

const HEADINGS: Record<string, Suggestion['field']> = {
  education: 'degree',
  'academic qualifications': 'degree',
  qualifications: 'degree',
  experience: 'employment',
  'work experience': 'employment',
  employment: 'employment',
  'professional experience': 'employment',
  skills: 'skill',
  'technical skills': 'skill',
  publications: 'publication',
}

/** Produce suggestions only. Nothing is written to the profile until the applicant accepts each one. */
export function parseCv(text: string): Suggestion[] {
  const out: Suggestion[] = []
  let n = 0
  const push = (field: Suggestion['field'], label: string, value: string) => {
    const clean = value.trim().replace(/\s+/g, ' ')
    if (clean && !out.some((s) => s.field === field && s.value === clean)) out.push({ id: `s${n++}`, field, label, value: clean })
  }
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  if (email) push('email', 'Email', email[0])
  const phone = text.match(/(\+?251[\s-]?\d[\d\s-]{7,12}|\b0?9\d{8}\b)/)
  if (phone) push('phone', 'Phone', phone[0])
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  if (firstLine && firstLine.split(' ').length <= 5 && !/@|\d/.test(firstLine)) push('name', 'Name (first line)', firstLine)
  const ielts = text.match(/IELTS[^\n]{0,40}?(\d(\.\d)?)/i)
  if (ielts) push('languageTest', 'IELTS mention', ielts[0])
  const toefl = text.match(/TOEFL[^\n]{0,40}?(\d{2,3})/i)
  if (toefl) push('languageTest', 'TOEFL mention', toefl[0])

  let section: Suggestion['field'] | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const key = line.toLowerCase().replace(/[:#*]/g, '').trim()
    if (HEADINGS[key]) {
      section = HEADINGS[key]
      continue
    }
    if (/^[A-Z][A-Z &]{3,}$/.test(line)) {
      section = null
      continue
    }
    if (!section) continue
    if (section === 'skill') line.split(/[,;•·|]/).forEach((s) => s.trim().length > 1 && push('skill', 'Skill', s))
    else if (line.length > 6) push(section, section === 'degree' ? 'Education line' : section === 'employment' ? 'Experience line' : 'Publication', line.replace(/^[-•*]\s*/, ''))
  }
  return out
}
