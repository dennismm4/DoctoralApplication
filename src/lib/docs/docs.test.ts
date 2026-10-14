import { describe, expect, it } from 'vitest'
import active from '../../data/opportunities.json'
import type { DocKind, Opportunity } from '../../types'
import { assess, isActionable } from '../eligibility'
import { defaultProfile } from '../profile'
import { audit, canApprove } from './audit'
import { addVersion, approve, contextFor, currentVersion, generate, migrateDocs, newDocument, reject, saveEdit, version } from './documents'
import { docxBuffer, pdfBytes, toBlocks } from './exportDoc'
import { relevantKinds, wordCount } from './requirements'
import { testMaster, testProfile, testTopic } from './testProfile'

const ops = active as Opportunity[]
const op = (id: string) => ops.find((o) => o.id === id)!
const NOW = new Date('2026-10-14T18:00:00Z')
const build = (kind: DocKind, o: Opportunity, extra: Partial<Parameters<typeof contextFor>[0]> = {}) => {
  const master = testMaster()
  const args = { kind, op: o, master, target: 'programme' as const, wordLimit: null, topic: testTopic, entryConfirmed: false, today: NOW, ...extra }
  return { args, master, result: generate(contextFor(args)) }
}
const QUESTION = 'Describe your experience relevant to supply chains (300 words).'
const errors = (text: string, o: Opportunity, wordLimit: number | null = null) =>
  audit({ text, profile: testProfile(), op: o, wordLimit, extraAllowedText: `${JSON.stringify(testTopic)}\n${QUESTION}`, today: NOW }).filter((i) => i.level === 'error')

describe('CV tailoring', () => {
  const york = op('york-esrc-wrdtp-2027')
  const { result, master } = build('cv', york)

  it('uses only verified entries', () => {
    expect(result.content).not.toMatch(/Hidden Ltd|Should never appear|Unverified Consultant/)
    expect(result.content).not.toMatch(/Stata/)
    expect(result.changes.join(' ')).toMatch(/Left out \d+ unverified/)
  })
  it('lists the MSc before the BSc', () => {
    expect(result.content.indexOf('MSc in Project Management')).toBeLessThan(result.content.indexOf('BSc in Economics'))
  })
  it('puts research experience before professional experience for a DTP, and explains why', () => {
    expect(result.content.indexOf('RESEARCH EXPERIENCE')).toBeLessThan(result.content.indexOf('PROFESSIONAL EXPERIENCE'))
    expect(result.changes.join(' ')).toMatch(/Placed Research experience before Professional experience because/)
  })
  it('keeps her wording verbatim (sentences reordered, never reworded)', () => {
    for (const s of ['Coordinated monitoring visits to grain storage sites.', 'Prepared monthly progress reports for donors.', 'Liaised with farmer cooperatives on post-harvest handling.'])
      expect(result.content).toContain(s)
  })
  it('labels coursework and never lists it as a publication', () => {
    expect(result.content).toMatch(/Supply chain mapping of teff markets \(coursework project/)
    expect(result.content).not.toMatch(/PUBLICATIONS/)
  })
  it('recommends missing information instead of inventing it', () => {
    expect(result.missing.join(' ')).toMatch(/research methods or analysis software/)
    expect(result.missing.join(' ')).toMatch(/measurable results/)
  })
  it('passes the factual audit with no errors', () => {
    expect(errors(result.content, york)).toEqual([])
  })
  it('never alters the approved master CV', () => {
    const before = JSON.stringify(master.snapshot)
    const ctx = contextFor({ kind: 'cv', op: york, master, target: 'programme', wordLimit: null, topic: null, entryConfirmed: false })
    ctx.profile.degrees[0].title = 'MUTATED'
    generate(ctx)
    expect(JSON.stringify(master.snapshot)).toBe(before)
  })
  it('an academic CV puts research and publications before professional experience', () => {
    const a = build('academic-cv', op('warwick-chancellors-2027')).result.content
    expect(a.indexOf('RESEARCH EXPERIENCE')).toBeLessThan(a.indexOf('PROFESSIONAL EXPERIENCE'))
  })
})

describe('cover letters match the chosen opportunity', () => {
  it('addresses the correct university, department and route', () => {
    const york = op('york-esrc-wrdtp-2027')
    const t = build('cover-letter', york).result.content
    expect(t).toContain('University of York')
    expect(t).toContain('School for Business and Society')
    expect(t).toMatch(/separate application required for the ESRC White Rose/)
  })
  it('explains the Economics and Project Management background', () => {
    const t = build('cover-letter', op('gates-cambridge-2027')).result.content
    expect(t).toMatch(/Economics and Project Management/)
    expect(t).toMatch(/BSc in Economics from Example University/)
  })
  it('a scholarship letter differs from the admission letter when the processes are separate', () => {
    const w = op('warwick-chancellors-2027')
    const prog = build('cover-letter', w, { target: 'programme' }).result.content
    const sch = build('cover-letter', w, { target: 'scholarship' }).result.content
    expect(prog).toMatch(/Admissions Selection Committee/)
    expect(sch).toMatch(/Chancellors' Scholarship.*Selection Panel/)
    expect(sch).toMatch(/applying separately for admission/)
    expect(prog).not.toBe(sch)
  })
  it('states automatic consideration when there is no separate scholarship application', () => {
    expect(build('cover-letter', op('clarendon-2027')).result.content).toMatch(/considered for the Clarendon Scholarship through this application/)
  })
  it('uses her motivation verbatim and no stock phrases', () => {
    const t = build('cover-letter', op('gates-cambridge-2027')).result.content
    expect(t).toContain('Seeing grain lost in storage')
    expect(t).not.toMatch(/always been passionate|since childhood|my dream/i)
  })
  it('addresses Gates selection criteria with evidence or a prompt', () => {
    const r = build('scholarship-essay', op('gates-cambridge-2027'), { target: 'scholarship' }).result
    expect(r.requirements.filter((x) => x.id.startsWith('crit')).map((x) => x.text)).toEqual(['Outstanding intellectual ability', 'Reasons for choice of course', 'A commitment to improving the lives of others', 'Leadership potential'])
    expect(r.content).toMatch(/Regarding outstanding intellectual ability: I hold/)
  })
  it('does not claim she meets entry requirements unless she confirmed it', () => {
    expect(build('cover-letter', op('leeds-esrc-wrdtp-2027')).result.content).not.toMatch(/I meet the stated academic entry requirements/)
    expect(build('cover-letter', op('leeds-esrc-wrdtp-2027'), { entryConfirmed: true }).result.content).toMatch(/I meet the stated academic entry requirements/)
  })
})

describe('every relevant document for every actionable opportunity is factually safe', () => {
  const actionable = ops.filter((o) => isActionable(assess(o, NOW)))
  for (const o of actionable) {
    for (const k of relevantKinds(o, true).filter((r) => r.relevant)) {
      for (const target of k.targets) {
        it(`${o.id} · ${k.kind} · ${target}`, () => {
          const r = build(k.kind, o, { target, question: k.kind === 'application-answer' ? QUESTION : undefined }).result
          const errs = errors(r.content, o).filter((e) => e.code !== 'placeholder')
          expect(errs).toEqual([])
          expect(r.content).not.toMatch(/Hidden Ltd|Stata/)
        })
      }
    }
  }
})

describe('word limits', () => {
  const g = op('gates-cambridge-2027')
  for (const kind of ['cover-letter', 'personal-statement', 'statement-of-purpose', 'research-experience', 'scholarship-essay'] as DocKind[]) {
    for (const limit of [350, 500, 800]) {
      it(`${kind} ≤ ${limit} words`, () => {
        const r = build(kind, g, { wordLimit: limit, target: kind === 'scholarship-essay' ? 'scholarship' : 'programme' }).result
        if (!r.over) expect(wordCount(r.content).total).toBeLessThanOrEqual(limit)
        else expect(r.missing.join(' ')).toMatch(/longer than/)
      })
    }
  }
  it('drops lower-priority paragraphs first and reports it', () => {
    const r = build('cover-letter', g, { wordLimit: 350 }).result
    expect(wordCount(r.content).total).toBeLessThanOrEqual(350)
    expect(r.changes.join(' ')).toMatch(/lower-priority paragraph/)
    expect(r.content).toContain('Seeing grain lost in storage') // essential motivation kept
  })
  it('the audit flags a draft over its limit', () => {
    expect(errors('word '.repeat(120), g, 100).some((e) => e.code === 'word-limit')).toBe(true)
  })
})

describe('the audit catches invented or misplaced claims', () => {
  const g = op('gates-cambridge-2027')
  const codes = (t: string) => errors(t, g).map((e) => e.code)
  it('invented figures', () => expect(codes('I managed a budget of £50,000 and trained 340 farmers.')).toContain('number'))
  it('software not in her verified skills', () => expect(codes('I analysed the data in Stata.')).toContain('software'))
  it('publication claims without a publication', () => expect(codes('My coursework was published in a peer-reviewed journal.')).toContain('publication'))
  it('awards without achievements', () => expect(codes('I was awarded the Dean’s Prize for excellence.')).toContain('award'))
  it('grades that differ from her transcript', () => expect(codes('I graduated with first-class honours.')).toContain('grade'))
  it('text written for another university', () => expect(codes('I am excited to join the University of York.')).toContain('other-university'))
  it('her real figures pass', () => expect(codes('My MSc result was CGPA 3.71/4.00 and my IELTS result is 7.0.')).toEqual([]))
  it('warns on clichés and American spelling', () => {
    const w = audit({ text: 'I have always been passionate about organizational behavior.', profile: testProfile(), op: g, wordLimit: null }).map((i) => i.code)
    expect(w).toEqual(expect.arrayContaining(['cliche', 'spelling']))
  })
  it('a fresh profile produces placeholders that block approval', () => {
    const master = testMaster(defaultProfile())
    const r = generate(contextFor({ kind: 'cover-letter', op: g, master, target: 'programme', wordLimit: null, topic: null, entryConfirmed: false }))
    const issues = audit({ text: r.content, profile: master.snapshot, op: g, wordLimit: null })
    expect(issues.some((i) => i.code === 'placeholder')).toBe(true)
    expect(canApprove(issues)).toBe(false)
  })
})

describe('only relevant documents are offered', () => {
  it('no supervisor email when contact is not required', () => {
    expect(relevantKinds({ ...op('york-esrc-wrdtp-2027'), supervisorContactRequired: 'no' }, false).find((k) => k.kind === 'supervisor-email')?.relevant).toBe(false)
  })
  it('no selection-criteria response without published criteria', () => {
    expect(relevantKinds(op('york-esrc-wrdtp-2027'), false).find((k) => k.kind === 'selection-criteria')?.relevant).toBe(false)
  })
  it('scholarship essay only with a separate application or scholarship award', () => {
    expect(relevantKinds(op('lse-phd-studentship-2027'), false).find((k) => k.kind === 'scholarship-essay')?.relevant).toBe(false)
    expect(relevantKinds(op('warwick-chancellors-2027'), false).find((k) => k.kind === 'scholarship-essay')?.relevant).toBe(true)
  })
  it('research summary needs an approved topic', () => {
    expect(relevantKinds(op('mgs-esrc-dtp-2027'), false).find((k) => k.kind === 'research-summary')?.relevant).toBe(false)
    expect(relevantKinds(op('mgs-esrc-dtp-2027'), true).find((k) => k.kind === 'research-summary')?.relevant).toBe(true)
  })
  it('two cover-letter targets only when the scholarship application is separate', () => {
    expect(relevantKinds(op('warwick-chancellors-2027'), false).find((k) => k.kind === 'cover-letter')?.targets).toEqual(['programme', 'scholarship'])
    expect(relevantKinds(op('clarendon-2027'), false).find((k) => k.kind === 'cover-letter')?.targets).toEqual(['programme'])
  })
})

describe('versions and approval', () => {
  const g = op('gates-cambridge-2027')
  const { args, result } = build('cover-letter', g)
  const doc = newDocument(args, result, 'template', '2026-10-14T18:00:00Z')

  it('binds the document to one opportunity and university', () => {
    expect(doc.opportunityId).toBe('gates-cambridge-2027')
    expect(doc.university).toBe('University of Cambridge')
    expect(doc.wordLimitSource).toBe('default')
  })
  it('regeneration and edits add versions; approval is per version', () => {
    const d2 = addVersion(doc, version(0, result, 'template', null, 'Regenerated'))
    expect(d2.versions.map((v) => v.n)).toEqual([1, 2])
    const d3 = approve(d2, d2.currentVersionId)
    expect(d3.status).toBe('approved')
    const d4 = saveEdit(d3, currentVersion(d3).content + '\nExtra line.')
    expect(d4.status).toBe('draft')
    expect(d4.approvedVersionId).toBe(d3.approvedVersionId)
    expect(d4.versions).toHaveLength(3)
    expect(reject(d4).status).toBe('rejected')
  })
  it('migrates drafts from the earlier app version', () => {
    const [m] = migrateDocs([{ id: 'x', kind: 'cv', opportunityId: g.id, title: 'Old', content: 'Hello', generator: 'template', createdAt: '2026-10-01', updatedAt: '2026-10-01', approved: true, approvedAt: '2026-10-02' }], ops)
    expect(m.versions[0].content).toBe('Hello')
    expect(m.status).toBe('approved')
    expect(m.university).toBe('University of Cambridge')
  })
})

describe('export', () => {
  const { args, result } = build('cv', op('york-esrc-wrdtp-2027'))
  const doc = newDocument(args, result, 'template')
  it('parses headings and bullets', () => {
    const b = toBlocks(result.content, 'cv')
    expect(b[0].type).toBe('title')
    expect(b.some((x) => x.type === 'heading' && x.text === 'EDUCATION')).toBe(true)
    expect(b.some((x) => x.type === 'bullet')).toBe(true)
  })
  it('produces a real .docx (zip) file', async () => {
    const buf = await docxBuffer(doc, result.content)
    expect(String.fromCharCode(buf[0], buf[1])).toBe('PK')
    expect(buf.length).toBeGreaterThan(3000)
  })
  it('produces a real PDF file', async () => {
    const bytes = new Uint8Array(await pdfBytes(doc, result.content))
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })
})
