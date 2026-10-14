function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export function downloadText(name: string, text: string) {
  download(name, new Blob([text], { type: 'text/plain;charset=utf-8' }))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Word opens HTML saved with a .doc extension, preserving line breaks and headings. */
export function downloadWord(name: string, title: string, text: string) {
  const html = `<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}p{margin:0 0 6pt}</style></head><body>${text
    .split('\n')
    .map((l) => (l.trim() ? `<p>${esc(l)}</p>` : '<p>&nbsp;</p>'))
    .join('')}</body></html>`
  download(name, new Blob([html], { type: 'application/msword' }))
}

export function printDocument(title: string, text: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(
    `<html><head><title>${esc(title)}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.5;white-space:pre-wrap;font-size:12pt}</style></head><body>${esc(text)}</body></html>`,
  )
  w.document.close()
  w.focus()
  w.print()
}

export function downloadJson(name: string, data: unknown) {
  download(name, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
}

/** Calendar file for a deadline reminder. */
export function downloadIcs(name: string, title: string, date: Date, description: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Doctoral Compass//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@doctoral-compass`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(date)}`,
    `DTEND:${fmt(new Date(date.getTime() + 30 * 60000))}`,
    `SUMMARY:${title.replace(/[,;]/g, ' ')}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n').replace(/[,;]/g, ' ')}`,
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Deadline in 7 days',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  download(name, new Blob([ics], { type: 'text/calendar' }))
}
