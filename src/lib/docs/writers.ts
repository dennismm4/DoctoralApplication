import type { Degree, Opportunity } from '../../types'
import { relevanceScore, sentencesOf, type SourceFact } from './facts'
import { coverage, departmentName, fitToLimit, requirementsFor, supportFor, type Para, type Requirement } from './requirements'
import { PROJECT_LABEL, PUB_STATUS_LABEL, targetKeywords } from './tailorCv'
import { ph, type GenContext, type GenResult } from './types'

/**
 * Template writers for every non-CV document. British English. Rules:
 *  - State only what verified facts say; her own sentences are quoted verbatim.
 *  - Statements about the disciplines (what Economics or Project Management covers) are allowed;
 *    statements about her achievements must come from a fact.
 *  - Anything only she can supply becomes an [ADD: …] prompt.
 *  - No stock phrases ("always been passionate", "since childhood", "dream").
 */

/* ---------------- shared helpers ---------------- */

/** "the University of Warwick", "Durham University". */
export const theUni = (name: string) => (/^(University of|London School|Midlands Graduate School|Royal |Imperial )/.test(name) ? `the ${name}` : name)
/** A real programme name, or null when the record holds generic text. */
export const programmeName = (op: Opportunity) => (op.programme && !/^(any|eligible|phd \(via|phd within|various)/i.test(op.programme) ? op.programme.split(';')[0].trim() : null)
/** Lower-case a Title Case phrase but keep acronyms ("Supply Chain Management" → "supply chain management"). */
const lcPhrase = (s: string) => s.split(' ').map((w) => (/^[A-Z]{2,}/.test(w) ? w : w.toLowerCase())).join(' ')
const CV_VERB = /^(Managed|Led|Prepared|Coordinated|Liaised|Handled|Developed|Conducted|Supported|Analysed|Analyzed|Organised|Organized|Designed|Monitored|Supervised|Delivered|Planned|Collected|Wrote|Drafted|Facilitated|Trained|Implemented|Assisted|Reviewed|Evaluated|Mapped|Produced|Compiled|Oversaw|Worked|Maintained|Processed|Advised|Taught|Presented|Established|Negotiated|Procured)\b/
/** Turn a CV fragment ("Coordinated visits…") into a sentence ("I coordinated visits…") without changing its meaning. */
export const asSentence = (s: string) => (CV_VERB.test(s) ? `I ${s.charAt(0).toLowerCase()}${s.slice(1)}` : s)

const article = (title: string) => (/^(MSc|MA\b|MBA|MPhil|MRes|M\.|[aeiou])/i.test(title) ? 'an' : 'a')
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function degreeOf(ctx: GenContext, level: Degree['level']): { d: Degree; id: string } | null {
  const d = ctx.profile.degrees.find((x) => x.level === level && x.verified && x.title.trim())
  return d ? { d, id: `deg:${d.id}` } : null
}

function degreePhrase(ctx: GenContext, level: Degree['level'], used: Set<string>): string {
  const x = degreeOf(ctx, level)
  if (!x) return ph(`verify your ${level === 'Master' ? 'MSc in Project Management' : 'BSc in Economics'} in your profile`)
  used.add(x.id)
  return `${article(x.d.title)} ${x.d.title}${x.d.institution ? ` from ${x.d.institution}` : ''}`
}

function themesFor(ctx: GenContext): { matched: string[]; themes: string[] } {
  const interests = ctx.facts.filter((f) => f.kind === 'interest')
  const tk = targetKeywords(ctx)
  const matched = interests.filter((f) => relevanceScore(f, tk) > 0).map((f) => f.text)
  return { matched, themes: ctx.op.themes.slice(0, 3) }
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** One sentence of evidence from a fact, quoting her own words. */
export function evidenceSentence(f: SourceFact, ctx: GenContext, focus: string[] = []): string {
  const p = ctx.profile
  const best = (text: string) => [...sentencesOf(text)].sort((a, b) => score(b, focus) - score(a, focus))[0] ?? ''
  switch (f.kind) {
    case 'degree': {
      const d = p.degrees.find((x) => `deg:${x.id}` === f.id)!
      return `I hold ${article(d.title)} ${d.title}${d.institution ? ` from ${d.institution}` : ''}${d.classification ? ` (result: ${d.classification})` : ''}${d.dissertation ? `; my dissertation was titled “${d.dissertation}”` : ''}.`
    }
    case 'employment': {
      const e = p.employment.find((x) => `emp:${x.id}` === f.id)!
      const s = best(e.summary)
      return `I ${e.end ? 'worked' : 'work'} as ${e.role} at ${e.organisation}.${s ? ` ${end(asSentence(s))}` : ''}`
    }
    case 'project': {
      const x = p.projects.find((y) => `proj:${y.id}` === f.id)!
      const s = best(x.description)
      return `My ${PROJECT_LABEL[x.kind]}, “${x.title}”${x.context ? ` (${x.context})` : ''}, is relevant here.${s ? ` ${end(asSentence(s))}` : ''}`
    }
    case 'publication': {
      const x = p.publications.find((y) => `pub:${y.id}` === f.id)!
      const label = PUB_STATUS_LABEL[x.status]
      return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${end(x.citation)}`
    }
    case 'achievement': {
      const x = p.achievements.find((y) => `ach:${y.id}` === f.id)!
      return `I received the ${x.title}${x.issuer ? ` from ${x.issuer}` : ''}${x.year ? ` in ${x.year}` : ''}.${x.description ? ` ${end(x.description)}` : ''}`
    }
    case 'training': {
      const x = p.training.find((y) => `train:${y.id}` === f.id)!
      return `I completed ${x.title}${x.provider ? ` with ${x.provider}` : ''}${x.year ? ` (${x.year})` : ''}.`
    }
    case 'language': {
      const t = p.languageTests.find((y) => `lang:${y.id}` === f.id)!
      return `My ${t.test} result is ${t.overall} overall${t.components ? ` (${t.components})` : ''}.`
    }
    case 'referee': {
      const r = p.referees.find((y) => `ref:${y.id}` === f.id)!
      return `${r.name}${r.position ? ` (${r.position}${r.organisation ? `, ${r.organisation}` : ''})` : ''} has agreed to act as my referee.`
    }
    case 'research':
    case 'motivation':
    case 'career':
      return end(best(f.text))
    default:
      return end(f.text)
  }
}
const end = (s: string) => (/[.!?”"]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)
function score(s: string, focus: string[]) {
  return relevanceScore({ id: '', kind: 'research', label: '', text: s, keywords: [], year: 0 }, focus)
}

interface Built {
  paras: Para[]
  head?: string[]
  tail?: string[]
  used: Set<string>
  changes: string[]
  missing: string[]
  reqs: Requirement[]
  addressed: Map<string, string[]>
  placeheld: Set<string>
}

function start(ctx: GenContext): Built {
  return { paras: [], used: new Set(), changes: [], missing: [], reqs: requirementsFor(ctx.op, ctx.kind, ctx.target), addressed: new Map(), placeheld: new Set() }
}
function mark(b: Built, reqId: string, factIds: string[]) {
  if (!b.reqs.some((r) => r.id === reqId)) return
  b.addressed.set(reqId, [...new Set([...(b.addressed.get(reqId) ?? []), ...factIds])])
  factIds.forEach((id) => b.used.add(id))
}

function finish(ctx: GenContext, b: Built): GenResult {
  const body = fitToLimit(b.paras, ctx.wordLimit ? ctx.wordLimit - countWords([...(b.head ?? []), ...(b.tail ?? [])].join(' ')) : null)
  if (body.dropped) b.changes.push(`Left out ${body.dropped} lower-priority paragraph${body.dropped > 1 ? 's' : ''} to stay within the ${ctx.wordLimit}-word limit.`)
  if (body.over) b.missing.push(`The essential content is longer than ${ctx.wordLimit} words — shorten it in your own words before approval.`)
  const content = [...(b.head ?? []), body.text, ...(b.tail ?? [])].filter((x) => x !== '').join('\n\n')
  for (const r of b.reqs) if (!b.addressed.has(r.id) && content.includes('[ADD:') && r.kinds.length === 0) b.placeheld.add(r.id)
  const requirements = b.reqs.map((r) => coverage(r, b.addressed.get(r.id) ?? [], b.placeheld.has(r.id)))
  for (const r of requirements) if (r.status === 'not-addressed' && r.source === 'official') b.missing.push(`Not yet addressed: ${r.text}.`)
  return { content, changes: b.changes, missing: [...new Set(b.missing)], usedFactIds: [...b.used], requirements, over: body.over }
}
const countWords = (s: string) => (s.match(/[A-Za-z0-9£%'’-]+/g) ?? []).length

/* ---------------- reusable paragraphs ---------------- */

function backgroundPara(ctx: GenContext, b: Built): Para {
  const { matched, themes } = themesFor(ctx)
  const ms = degreeOf(ctx, 'Master')
  const bs = degreeOf(ctx, 'Bachelor')
  if (!ms || !bs) {
    b.placeheld.add('background')
    b.missing.push('Verify both degrees in your profile so the letter can refer to them.')
    return { priority: 1, text: `${ph('verify your BSc in Economics and MSc in Project Management in your profile, then regenerate')}` }
  }
  mark(b, 'background', [ms.id, bs.id])
  const focus = matched.length ? list(matched.slice(0, 2).map(lcPhrase)) : list(themes)
  b.changes.push(`Connected Economics and Project Management to ${focus}, the overlap between your stated interests and this opportunity.`)
  return {
    priority: 1,
    text: `My academic background combines Economics and Project Management. Economics provides the analytical framework for studying markets, incentives and the allocation of resources, which underpins questions of ${focus}; Project Management concerns how organisations plan, coordinate and govern complex work. Together, they lead me to study ${focus} from both an economic and an organisational perspective.`,
  }
}

function researchPara(ctx: GenContext, b: Built, priority: Para['priority'] = 1): Para | null {
  const tk = targetKeywords(ctx)
  const ms = degreeOf(ctx, 'Master')
  const parts: string[] = []
  if (ms?.d.dissertation) {
    parts.push(`My most substantial piece of independent research is my MSc dissertation, “${ms.d.dissertation}”.`)
    b.used.add(ms.id)
  }
  const r = ctx.facts.find((f) => f.kind === 'research')
  if (r) {
    const sents = [...sentencesOf(r.text)].sort((a, b2) => score(b2, tk) - score(a, tk)).slice(0, 2)
    parts.push(sents.map((x) => end(asSentence(x))).join(' '))
    b.used.add(r.id)
  }
  const proj = ctx.facts.filter((f) => f.kind === 'project' && (f.tag === 'research' || f.tag === 'dissertation')).sort((a, c) => relevanceScore(c, tk) - relevanceScore(a, tk))[0]
  if (proj) {
    parts.push(evidenceSentence(proj, ctx, tk))
    b.used.add(proj.id)
  }
  if (!parts.length) {
    b.missing.push('Add your research experience (dissertation, methods, data) to your profile.')
    return { priority, text: ph('one or two sentences on your research experience — dissertation topic, data and methods — in your own words') }
  }
  mark(b, 'fit', [...(r ? [r.id] : []), ...(ms?.d.dissertation ? [ms.id] : [])])
  return { priority, text: parts.join(' ') }
}

function motivationPara(ctx: GenContext, b: Built, priority: Para['priority'] = 1): Para {
  const m = ctx.facts.find((f) => f.kind === 'motivation')
  if (!m) {
    b.placeheld.add('motivation')
    b.missing.push('Write your motivation for doctoral research in your profile (your own account, not a stock phrase).')
    return { priority, text: ph('your motivation for doctoral research, in your own words — a specific experience or question, not a general statement of passion') }
  }
  mark(b, 'motivation', [m.id])
  b.changes.push('Used your own motivation statement verbatim rather than a generic opening.')
  return { priority, text: m.text }
}

function careerPara(ctx: GenContext, b: Built, priority: Para['priority'] = 2): Para {
  const c = ctx.facts.find((f) => f.kind === 'career')
  if (!c) {
    b.placeheld.add('career')
    return { priority, text: ph('your own plans after the PhD and how the research will be used') }
  }
  mark(b, 'career', [c.id])
  return { priority, text: c.text }
}

function experiencePara(ctx: GenContext, b: Built, priority: Para['priority'] = 2): Para | null {
  const tk = targetKeywords(ctx)
  const jobs = ctx.facts.filter((f) => f.kind === 'employment').sort((a, c) => relevanceScore(c, tk) - relevanceScore(a, tk))
  if (!jobs.length) return null
  const relevant = jobs.filter((j) => relevanceScore(j, tk) > 0)
  const top = (relevant.length ? relevant : jobs).slice(0, 2)
  top.forEach((j) => b.used.add(j.id))
  b.changes.push(`Featured ${top.map((j) => j.label).join(' and ')} as the most relevant professional experience.`)
  return { priority, text: top.map((j) => evidenceSentence(j, ctx, tk)).join(' ') }
}

function criteriaParas(ctx: GenContext, b: Built, max: number, priority: Para['priority']): Para[] {
  const out: Para[] = []
  for (const r of b.reqs.filter((x) => x.id.startsWith('crit')).slice(0, max)) {
    const sup = supportFor(r, ctx.facts.filter((f) => f.kind !== 'interest'))
    if (sup.length) {
      mark(b, r.id, sup.map((f) => f.id))
      out.push({ priority, text: `Regarding ${lc(r.text)}: ${sup.map((f) => evidenceSentence(f, ctx, r.keywords)).join(' ')}` })
    } else {
      b.placeheld.add(r.id)
      out.push({ priority, text: `Regarding ${lc(r.text)}: ${ph(`a genuine example from your experience that shows ${lc(r.text)}`)}` })
    }
  }
  return out
}

function fitPara(ctx: GenContext, b: Built, priority: Para['priority'] = 1): Para {
  const { op } = ctx
  const { matched, themes } = themesFor(ctx)
  const dept = departmentName(op)
  const topic = ctx.topic
  const interest = matched.length ? list(matched.slice(0, 3).map(lcPhrase)) : ph('your research interest')
  if (matched.length) mark(b, 'fit', ctx.facts.filter((f) => f.kind === 'interest' && matched.includes(f.text)).map((f) => f.id))
  if (topic) {
    b.used.add(`topic:${topic.id}`)
    b.addressed.set('proposal', [`topic:${topic.id}`])
  } else b.placeheld.add('proposal')
  return {
    priority,
    text: `${programmeName(op) ? `The ${programmeName(op)}` : `Doctoral research`} at ${theUni(op.university)}${dept ? ` (${dept})` : ''} addresses ${list(themes)}. My interest in ${interest} connects directly to these themes. ${topic ? `I propose to examine ${lc(topic.title)}.` : ph('the specific question you want to investigate — approve a topic in the Topic Workshop')} ${ph(`a specific reason for choosing ${theUni(op.university)}: a named research group, supervisor or published work you have read`)}`,
  }
}

function englishSentence(ctx: GenContext, b: Built): string {
  const l = ctx.facts.find((f) => f.kind === 'language')
  if (!l) {
    if (ctx.op.english.requirement) b.missing.push(`Add your English test result or exemption (required: ${ctx.op.english.requirement}).`)
    return ''
  }
  mark(b, 'english', [l.id])
  return evidenceSentence(l, ctx)
}

function entrySentence(ctx: GenContext, b: Built): string {
  if (!ctx.entryConfirmed) return ''
  const ids = ctx.profile.degrees.filter((d) => d.verified).map((d) => `deg:${d.id}`)
  mark(b, 'entry', ids)
  return 'I meet the stated academic entry requirements.'
}

function applicationRoute(op: Opportunity, target: GenContext['target']): string {
  if (target === 'scholarship') return `I am applying separately for admission to ${programmeName(op) ? `the ${programmeName(op)}` : 'the PhD programme'}; ${ph('state whether your admission application has been submitted and give its reference number')}.`
  if (op.separateScholarshipApplication === 'yes') return `I will also submit the separate application required for the ${op.scholarshipName}.`
  if (op.separateScholarshipApplication === 'no') return `I understand that applicants are considered for the ${op.scholarshipName} through this application.`
  return ''
}

/* ---------------- document writers ---------------- */

export function coverLetter(ctx: GenContext): GenResult {
  const { op, target, today } = ctx
  const b = start(ctx)
  const dept = departmentName(op)
  const name = ctx.facts.find((f) => f.id === 'id:name')
  const email = ctx.facts.find((f) => f.id === 'id:email')
  const sup = op.supervisors.find((s) => !/fictional/i.test(s.name))
  const scholarship = target === 'scholarship'
  b.head = [
    today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    [scholarship ? `${op.scholarshipName} Selection Panel` : 'Admissions Selection Committee', dept ?? ph('department or school you are applying to'), op.university].join('\n'),
    scholarship ? `Re: Application for the ${op.scholarshipName}` : `Re: Application for doctoral study — ${programmeName(op) ?? op.title}`,
    `Dear ${scholarship ? 'Members of the Selection Panel' : sup ? sup.name : 'Members of the Selection Committee'},`,
  ]
  if (!dept) b.missing.push('Add the name of the department or school you are applying to.')
  b.changes.push(scholarship ? `Written for the separate ${op.scholarshipName} application, not the PhD admission.` : `Written for the PhD admission application to ${op.university}.`)
  const interests = themesFor(ctx)
  b.paras.push({
    priority: 1,
    text: `${scholarship ? `I am applying for the ${op.scholarshipName} to fund doctoral study at ${theUni(op.university)}.` : `I am writing to apply for doctoral study at ${theUni(op.university)}${dept ? ` in the ${dept}` : ''}.`} I hold ${degreePhrase(ctx, 'Bachelor', b.used)} and ${degreePhrase(ctx, 'Master', b.used)}, and I wish to research ${interests.matched.length ? list(interests.matched.slice(0, 3).map(lcPhrase)) : ph('your research area')}. ${applicationRoute(op, target)}`.trim(),
  })
  if (op.separateScholarshipApplication === 'yes') mark(b, 'separate', ['op:route'])
  b.paras.push(backgroundPara(ctx, b))
  const rp = researchPara(ctx, b, 1)
  if (rp) b.paras.push(rp)
  b.paras.push(fitPara(ctx, b, 1))
  b.paras.push(...criteriaParas(ctx, b, scholarship ? 4 : 2, scholarship ? 1 : 2))
  const xp = experiencePara(ctx, b, 3)
  if (xp) b.paras.push(xp)
  b.paras.push(motivationPara(ctx, b, 1))
  const closing = [entrySentence(ctx, b), englishSentence(ctx, b), 'Thank you for considering my application. I would welcome the opportunity to discuss it.'].filter(Boolean).join(' ')
  b.paras.push({ priority: 1, text: closing })
  b.tail = [`Yours sincerely,\n\n${name ? (b.used.add(name.id), name.text) : ph('full name')}${email ? `\n${(b.used.add(email.id), email.text)}` : ''}`]
  return finish(ctx, b)
}

export function personalStatement(ctx: GenContext): GenResult {
  const b = start(ctx)
  b.paras.push(motivationPara(ctx, b, 1))
  b.paras.push(backgroundPara(ctx, b))
  const rp = researchPara(ctx, b, 2)
  if (rp) b.paras.push(rp)
  const xp = experiencePara(ctx, b, 2)
  if (xp) b.paras.push(xp)
  b.paras.push(fitPara(ctx, b, 1))
  b.paras.push(careerPara(ctx, b, 2))
  return finish(ctx, b)
}

export function researchExperience(ctx: GenContext): GenResult {
  const b = start(ctx)
  const tk = targetKeywords(ctx)
  const rp = researchPara(ctx, b, 1)
  if (rp) b.paras.push(rp)
  for (const f of ctx.facts.filter((x) => x.kind === 'project' && x.tag !== 'dissertation').sort((a, c) => relevanceScore(c, tk) - relevanceScore(a, tk)).slice(0, 3)) {
    b.used.add(f.id)
    b.paras.push({ priority: f.tag === 'coursework' ? 3 : 2, text: evidenceSentence(f, ctx, tk) })
  }
  const pubs = ctx.facts.filter((f) => f.kind === 'publication')
  if (pubs.length) {
    pubs.forEach((p) => b.used.add(p.id))
    b.paras.push({ priority: 2, text: pubs.map((p) => evidenceSentence(p, ctx)).join(' ') })
  }
  const skills = ctx.facts.filter((f) => f.kind === 'skill').sort((a, c) => relevanceScore(c, [...tk, 'research', 'analysis', 'data']) - relevanceScore(a, [...tk, 'research', 'analysis', 'data']))
  if (skills.length) {
    skills.slice(0, 6).forEach((s) => b.used.add(s.id))
    b.paras.push({ priority: 2, text: `The skills I can draw on for doctoral research include ${list(skills.slice(0, 6).map((s) => s.text))}.` })
  }
  const training = ctx.facts.filter((f) => f.kind === 'training')
  if (training.length) {
    training.forEach((t) => b.used.add(t.id))
    b.paras.push({ priority: 3, text: training.map((t) => evidenceSentence(t, ctx)).join(' ') })
  }
  b.paras.push({ priority: 1, text: `This experience prepares me for research on ${list(ctx.op.themes.slice(0, 3))} at ${theUni(ctx.op.university)}. ${ph('what you still need to learn, and how the doctoral training will provide it')}` })
  if (ctx.profile.projects.some((p) => p.verified && p.kind === 'coursework')) b.changes.push('Coursework projects are described as coursework, not as published or independent research.')
  return finish(ctx, b)
}

export function statementOfPurpose(ctx: GenContext): GenResult {
  const b = start(ctx)
  const { op } = ctx
  b.paras.push({ priority: 1, text: `I am applying for doctoral study at ${theUni(op.university)} to research ${ctx.topic ? lc(ctx.topic.title) : ph('your research question')}.${op.separateScholarshipApplication === 'no' ? ` I wish to be considered for the ${op.scholarshipName}.` : ''}` })
  if (ctx.topic) {
    mark(b, 'proposal', [`topic:${ctx.topic.id}`])
    b.paras.push({ priority: 1, text: `My research would address the following questions: ${ctx.topic.questions.map((q, i) => `(${i + 1}) ${q}`).join(' ')} ${ctx.topic.rationale}` })
  } else b.placeheld.add('proposal')
  b.paras.push(backgroundPara(ctx, b))
  const rp = researchPara(ctx, b, 1)
  if (rp) b.paras.push(rp)
  const xp = experiencePara(ctx, b, 2)
  if (xp) b.paras.push(xp)
  b.paras.push(fitPara(ctx, b, 1))
  b.paras.push(motivationPara(ctx, b, 2))
  b.paras.push(careerPara(ctx, b, 1))
  return finish(ctx, b)
}

export function scholarshipEssay(ctx: GenContext): GenResult {
  const b = start(ctx)
  const { op } = ctx
  b.paras.push({ priority: 1, text: `I am applying for the ${op.scholarshipName} to undertake doctoral research at ${theUni(op.university)} on ${themesFor(ctx).matched.length ? list(themesFor(ctx).matched.slice(0, 2).map(lcPhrase)) : ph('your research area')}.` })
  if (op.separateScholarshipApplication === 'yes') mark(b, 'separate', ['op:route'])
  b.paras.push(...criteriaParas(ctx, b, 6, 1))
  b.paras.push(motivationPara(ctx, b, 1))
  b.paras.push(careerPara(ctx, b, 1))
  b.paras.push({ priority: 2, text: ph(`why this scholarship specifically matters for your research — refer to the aims of the ${op.scholarshipName}`) })
  if (op.selectionCriteria.length) b.changes.push(`Structured the essay around the ${op.selectionCriteria.length} published selection criteria.`)
  return finish(ctx, b)
}

export function selectionCriteria(ctx: GenContext): GenResult {
  const b = start(ctx)
  const crit = b.reqs.filter((r) => r.id.startsWith('crit'))
  for (const r of crit) {
    const sup = supportFor(r, ctx.facts.filter((f) => f.kind !== 'interest'), 3)
    if (sup.length) {
      mark(b, r.id, sup.map((f) => f.id))
      b.paras.push({ priority: 1, text: `${r.text.toUpperCase()}\n${sup.map((f) => evidenceSentence(f, ctx, r.keywords)).join(' ')}` })
    } else {
      b.placeheld.add(r.id)
      b.paras.push({ priority: 1, text: `${r.text.toUpperCase()}\n${ph(`a genuine example that shows ${lc(r.text)} — nothing in your verified profile evidences it yet`)}` })
    }
  }
  for (const id of ['entry', 'english']) {
    const r = b.reqs.find((x) => x.id === id)
    if (!r) continue
    const sup = supportFor(r, ctx.facts)
    if (id === 'entry' && ctx.entryConfirmed && sup.length) {
      mark(b, id, sup.map((f) => f.id))
      b.paras.push({ priority: 2, text: `ENTRY REQUIREMENTS\n${sup.map((f) => evidenceSentence(f, ctx)).join(' ')}` })
    } else if (id === 'english' && sup.length) {
      mark(b, id, sup.map((f) => f.id))
      b.paras.push({ priority: 2, text: `ENGLISH LANGUAGE\n${evidenceSentence(sup[0], ctx)}` })
    }
  }
  b.changes.push(`One section per published criterion (${crit.length}), each evidenced only from verified facts.`)
  return finish(ctx, b)
}

export function supervisorEmail(ctx: GenContext): GenResult {
  const b = start(ctx)
  const { op } = ctx
  const sup = op.supervisors.find((s) => !/fictional/i.test(s.name))
  const name = ctx.facts.find((f) => f.id === 'id:name')
  const topic = ctx.topic
  const interest = themesFor(ctx).matched
  b.head = [
    `Subject: Prospective PhD applicant — ${topic ? topic.title : interest.length ? interest.slice(0, 2).map(lcPhrase).join(' and ') : ph('research topic')} (${op.scholarshipName})`,
    `Dear ${sup ? sup.name : ph('Dr or Professor [surname]')},`,
  ]
  b.paras.push({ priority: 1, text: `My name is ${name ? (b.used.add(name.id), name.text) : ph('full name')}. I hold ${degreePhrase(ctx, 'Bachelor', b.used)} and ${degreePhrase(ctx, 'Master', b.used)}, and I am preparing an application for doctoral study at ${theUni(op.university)}.` })
  b.paras.push({ priority: 1, text: `I am interested in ${topic ? lc(topic.title) : interest.length ? list(interest.slice(0, 2).map(lcPhrase)) : ph('your research area')}. ${ph('one sentence on a specific paper or project of theirs that you have read and how it relates to your idea')}` })
  if (topic) mark(b, 'fit', [])
  const rp = researchPara(ctx, b, 2)
  if (rp) b.paras.push(rp)
  b.paras.push({ priority: 1, text: `Would you be willing to discuss whether you could supervise this research${op.scholarshipName ? `, and whether I could apply for the ${op.scholarshipName} with your support` : ''}?${op.separateScholarshipApplication === 'yes' ? ' I understand the award requires a separate application.' : ''} I have attached my CV.` })
  b.tail = [`Kind regards,\n${name ? name.text : ph('full name')}`]
  b.changes.push('Kept the email short and specific; it asks one clear question and is never sent by the app.')
  return finish(ctx, b)
}

export function applicationAnswer(ctx: GenContext): GenResult {
  const b = start(ctx)
  const q = ctx.question?.trim()
  if (!q) b.missing.push('Paste the exact question from the application form.')
  const qk = q ? q.toLowerCase().split(/\W+/).filter((w) => w.length > 3) : []
  const tk = [...qk, ...targetKeywords(ctx)]
  b.head = [`QUESTION: ${q || ph('paste the exact question')}`]
  b.paras.push({ priority: 1, text: ph('answer the question directly in one sentence') })
  const facts = ctx.facts
    .filter((f) => !['identity', 'interest', 'referee'].includes(f.kind))
    .map((f) => ({ f, s: relevanceScore(f, tk) }))
    .filter((x) => x.s > 0)
    .sort((a, c) => c.s - a.s)
    .slice(0, 3)
  for (const { f } of facts) {
    b.used.add(f.id)
    b.paras.push({ priority: 2, text: evidenceSentence(f, ctx, tk) })
  }
  if (!facts.length) b.missing.push('No verified facts relate to this question — add relevant evidence to your profile.')
  b.paras.push({ priority: 2, text: `This relates to the programme's focus on ${list(ctx.op.themes.slice(0, 2))}. ${ph('one sentence linking your evidence back to the question')}` })
  b.changes.push(`Selected the ${facts.length} verified facts most related to the question's wording.`)
  return finish(ctx, b)
}

export function researchSummary(ctx: GenContext): GenResult {
  const b = start(ctx)
  const t = ctx.topic
  if (!t) {
    b.missing.push('Approve a research topic in the Topic Workshop first.')
    b.paras.push({ priority: 1, text: ph('approve a research topic first') })
    return finish(ctx, b)
  }
  mark(b, 'proposal', [`topic:${t.id}`])
  b.head = [t.title.toUpperCase()]
  b.paras.push({ priority: 1, text: `Background. ${t.rationale}` })
  b.paras.push({ priority: 1, text: `Aim. ${ph('one-sentence aim')}` })
  b.paras.push({ priority: 1, text: `Research questions. ${t.questions.map((q, i) => `(${i + 1}) ${q}`).join(' ')}` })
  b.paras.push({ priority: 1, text: `Methods. ${ph('design, data sources you have confirmed exist, and analysis methods you can justify')}` })
  b.paras.push({ priority: 1, text: `Expected contribution. ${t.contribution}` })
  b.paras.push({ priority: 2, text: `Fit. The project relates to ${theUni(ctx.op.university)}'s work on ${list(ctx.op.themes.slice(0, 3))}.` })
  b.changes.push('Built from your approved topic only; methods and data are left for you to specify.')
  return finish(ctx, b)
}
