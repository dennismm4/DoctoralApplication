import type { AppDocument, DocFormat } from '../../types'

/**
 * DOCX (via the `docx` library) and PDF (via `jsPDF`) export, entirely in the browser.
 * Text conventions used by the generators:
 *   ALL-CAPS line            → heading
 *   "• " / "– " line          → bullet (level 0 / 1)
 *   two-space indented line   → indented detail
 *   blank line                → paragraph break
 */

export interface Block {
  type: 'heading' | 'bullet' | 'sub' | 'para' | 'title'
  text: string
}

export function toBlocks(text: string, format: DocFormat): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'para', text: para.join(format === 'letter' || format === 'email' ? '\n' : ' ') })
    para = []
  }
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) return flush()
    if (format === 'cv' && i === 0) return out.push({ type: 'title', text: line.trim() })
    if (/^[A-Z][A-Z0-9 ,&/()’'—-]{3,}$/.test(line.trim()) && line.trim().length < 80) {
      flush()
      return out.push({ type: 'heading', text: line.trim() })
    }
    if (/^\s*[•]\s/.test(line)) {
      flush()
      return out.push({ type: 'bullet', text: line.replace(/^\s*•\s/, '') })
    }
    if (/^\s+[–-]\s/.test(line)) {
      flush()
      return out.push({ type: 'sub', text: line.replace(/^\s+[–-]\s/, '– ') })
    }
    if (/^\s{2,}\S/.test(line) && format === 'cv') {
      flush()
      return out.push({ type: 'sub', text: line.trim() })
    }
    para.push(line.trim())
  })
  flush()
  return out
}

export const fileBase = (d: AppDocument) =>
  d.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70)

export async function docxBlob(d: AppDocument, text: string): Promise<Blob> {
  const buf = await docxBuffer(d, text)
  return new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

/** Build the .docx bytes (works in the browser and in Node, which the tests use). */
export async function docxBuffer(d: AppDocument, text: string): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')
  const blocks = toBlocks(text, d.format)
  const children = blocks.map((b) => {
    const runs = b.text.split('\n').map((t, i) => new TextRun({ text: t, break: i > 0 ? 1 : 0 }))
    switch (b.type) {
      case 'title':
        return new Paragraph({ children: [new TextRun({ text: b.text, bold: true, size: 32 })], alignment: AlignmentType.LEFT, spacing: { after: 120 } })
      case 'heading':
        return new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } })
      case 'bullet':
        return new Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 40 } })
      case 'sub':
        return new Paragraph({ children: runs, indent: { left: 720 }, spacing: { after: 40 } })
      default:
        return new Paragraph({ children: runs, spacing: { after: 160 } })
    }
  })
  const doc = new Document({
    creator: 'Doctoral Compass',
    title: d.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  })
  if (typeof window === 'undefined') return new Uint8Array(await Packer.toBuffer(doc))
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer())
}

/** Build a text-based, selectable PDF (A4, 20 mm margins). */
export async function pdfBytes(d: AppDocument, text: string): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const width = 210 - margin * 2
  let y = margin
  const ensure = (h: number) => {
    if (y + h > 297 - margin) {
      pdf.addPage()
      y = margin
    }
  }
  const write = (t: string, size: number, style: 'normal' | 'bold', indent = 0, after = 2) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    const lines = pdf.splitTextToSize(latin(t), width - indent) as string[]
    const lh = size * 0.42
    for (const l of lines) {
      ensure(lh)
      pdf.text(l, margin + indent, y)
      y += lh
    }
    y += after
  }
  for (const b of toBlocks(text, d.format)) {
    if (b.type === 'title') write(b.text, 16, 'bold', 0, 2)
    else if (b.type === 'heading') {
      y += 2
      write(b.text, 11.5, 'bold', 0, 1.5)
    } else if (b.type === 'bullet') write(`• ${b.text}`, 10.5, 'normal', 2, 1)
    else if (b.type === 'sub') write(b.text, 10, 'normal', 7, 1)
    else write(b.text, 10.5, 'normal', 0, 3)
  }
  return pdf.output('arraybuffer')
}

/** jsPDF's built-in fonts cover Latin-1; map common typographic characters to safe equivalents. */
function latin(s: string) {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/—/g, ' - ').replace(/–/g, '-').replace(/…/g, '...').replace(/·/g, '|').replace(/[^\x00-\xFF•]/g, '?')
}

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportDocx(d: AppDocument, text: string) {
  saveBlob(`${fileBase(d)}.docx`, await docxBlob(d, text))
}
export async function exportPdf(d: AppDocument, text: string) {
  saveBlob(`${fileBase(d)}.pdf`, new Blob([await pdfBytes(d, text)], { type: 'application/pdf' }))
}
