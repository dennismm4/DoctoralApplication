import type { Profile, ProjectKind, PublicationStatus } from '../../types'
import { keywords, relevanceScore, sentencesOf, unverifiedCount, type SourceFact } from './facts'
import { coverage, requirementsFor, supportFor } from './requirements'
import { ph, type GenContext, type GenResult } from './types'

/**
 * CV tailoring.
 *
 * Selects and REORDERS the applicant's verified entries to put the strongest evidence for this
 * opportunity first. Her own wording is kept verbatim: sentences may be reordered or left out, never
 * reworded into new claims. Nothing is added that is not in the approved master CV.
 */

export const PUB_STATUS_LABEL: Record<PublicationStatus, string> = {
  published: 'published',
  accepted: 'accepted for publication',
  'under-review': 'under review',
  'working-paper': 'working paper',
  'conference-presentation': 'conference presentation',
}
export const PROJECT_LABEL: Record<ProjectKind, string> = {
  dissertation: 'dissertation',
  research: 'research project',
  professional: 'professional project',
  coursework: 'coursework project',
}

const METHOD_WORDS = /stata|spss|\br\b|python|nvivo|excel|eviews|matlab|sql|power bi|tableau|regression|econometric|survey|qualitative|quantitative|interview|statistic|gis|ms project|primavera/i

interface Item {
  factId: string
  score: number
  year: number
  lines: string[]
}
interface Section {
  key: string
  heading: string
  items: Item[]
}

export function targetKeywords(ctx: Pick<GenContext, 'op'>): string[] {
  const { op } = ctx
  return [...new Set([...op.themes.flatMap(keywords), ...op.subjects.flatMap(keywords), ...keywords(op.title), ...op.selectionCriteria.flatMap((c) => keywords(c.text)), ...keywords(op.department ?? '')])]
}

export function tailorCv(ctx: GenContext): GenResult {
  const { profile: p, facts, op, kind } = ctx
  const academic = kind === 'academic-cv'
  const target = targetKeywords(ctx)
  const byId = new Map(facts.map((f) => [f.id, f]))
  const score = (id: string) => {
    const f = byId.get(id)
    return f ? relevanceScore(f, target) : 0
  }
  const changes: string[] = []
  const missing: string[] = []
  const used = new Set<string>()

  /* ----- Header ----- */
  const name = byId.get('id:name')?.text
  const contact = ['id:email', 'id:phone', 'id:residence'].map((id) => byId.get(id)?.text).filter(Boolean)
  ;['id:name', 'id:email', 'id:phone', 'id:residence'].forEach((id) => byId.has(id) && used.add(id))
  const header = [name ? name.toUpperCase() : ph('full name — verify it in your profile'), contact.length ? contact.join(' · ') : ph('email address')]

  /* ----- Sections ----- */
  const sections: Section[] = []

  // Research interests: her own stated interests, those matching the opportunity first.
  const interests = facts.filter((f) => f.kind === 'interest')
  const rankedInterests = [...interests].sort((a, b) => relevanceScore(b, target) - relevanceScore(a, target))
  const matchedInterests = rankedInterests.filter((f) => relevanceScore(f, target) > 0)
  if (!academic && rankedInterests.length) {
    sections.push({ key: 'interests', heading: 'RESEARCH INTERESTS', items: [{ factId: 'interests', score: 99, year: 0, lines: [rankedInterests.slice(0, 6).map((f) => f.text).join(' · ')] }] })
    rankedInterests.slice(0, 6).forEach((f) => used.add(f.id))
    if (matchedInterests.length) changes.push(`Listed the research interests that match this opportunity first: ${matchedInterests.slice(0, 3).map((f) => f.text).join(', ')}.`)
  }

  // Education
  const degrees = p.degrees.filter((d) => d.verified && d.title.trim())
  const levelRank = { Master: 2, Other: 1, Bachelor: 0 } as const
  const eduItems: Item[] = degrees
    .map((d) => ({
      factId: `deg:${d.id}`,
      score: score(`deg:${d.id}`),
      year: Number(d.graduationYear) || 0,
      rank: levelRank[d.level],
      lines: [
        `• ${d.title} — ${[d.institution || ph('institution'), d.country, d.graduationYear || ph('graduation year')].filter(Boolean).join(', ')}`,
        d.classification ? `  Result: ${d.classification}` : '',
        d.dissertation ? `  Dissertation: “${d.dissertation}”` : '',
      ].filter(Boolean),
    }))
    .sort((a, b) => b.rank - a.rank || b.year - a.year)
  if (eduItems.length) {
    sections.push({ key: 'education', heading: 'EDUCATION', items: eduItems })
    if (eduItems.length > 1) changes.push('Listed your Master’s degree first: it is your highest and most recent qualification.')
  } else {
    sections.push({ key: 'education', heading: 'EDUCATION', items: [{ factId: '', score: 0, year: 0, lines: [ph('verify your BSc in Economics and MSc in Project Management in the profile (institution, year, result)')] }] })
  }
  for (const d of p.degrees.filter((x) => !x.verified)) missing.push(`Verify “${d.title || 'degree'}” in your profile so it can appear on the CV.`)
  for (const d of degrees) {
    if (!d.classification) missing.push(`Add your ${d.title} result exactly as it appears on your transcript.`)
    if (d.level === 'Master' && !d.dissertation) missing.push(`Add your ${d.title} dissertation title — it is often the strongest evidence of research potential.`)
  }

  // Research experience: free-text research account + dissertation/research projects
  const researchFact = byId.get('research')
  const researchItems: Item[] = []
  if (researchFact) {
    const sents = sentencesOf(researchFact.text)
    const ordered = [...sents].sort((a, b) => sentenceScore(b, target) - sentenceScore(a, target))
    researchItems.push({ factId: 'research', score: score('research') + 2, year: 9999, lines: ordered.map((s) => `• ${s}`) })
    if (sents.length > 1 && ordered[0] !== sents[0]) changes.push(`Opened your research experience with “${clip(ordered[0])}” because it relates most closely to ${op.themes.slice(0, 2).join(' and ')}.`)
  }
  const projects = p.projects.filter((x) => x.verified && x.title.trim())
  for (const x of projects.filter((y) => y.kind === 'dissertation' || y.kind === 'research'))
    researchItems.push({
      factId: `proj:${x.id}`,
      score: score(`proj:${x.id}`),
      year: Number(x.year) || 0,
      lines: [`• ${x.title} (${PROJECT_LABEL[x.kind]}${x.year ? `, ${x.year}` : ''})${x.context ? ` — ${x.context}` : ''}`, ...(x.role ? [`  Role: ${x.role}`] : []), ...sentencesOf(x.description).map((s) => `  ${s}`)],
    })
  researchItems.sort((a, b) => b.score - a.score || b.year - a.year)
  if (!researchFact) missing.push('Describe your research experience in your profile (dissertation topic, data, methods, findings) — in your own words.')

  // Professional experience
  const jobs = p.employment.filter((e) => e.verified && e.role.trim())
  const jobItems: Item[] = jobs
    .map((e) => {
      const sents = sentencesOf(e.summary)
      const ordered = [...sents].sort((a, b) => sentenceScore(b, target) - sentenceScore(a, target))
      if (sents.length > 1 && ordered[0] !== sents[0]) changes.push(`For ${e.role} at ${e.organisation}, moved “${clip(ordered[0])}” to the top because it is most relevant to this opportunity.`)
      if (!e.summary.trim()) missing.push(`Add what you did as ${e.role} at ${e.organisation} (facts only — the app will not invent responsibilities).`)
      return {
        factId: `emp:${e.id}`,
        score: score(`emp:${e.id}`),
        year: Number(e.end.slice(0, 4)) || 9999,
        lines: [`• ${e.role}, ${e.organisation}${e.location ? `, ${e.location}` : ''} (${e.start || ph('start')}–${e.end || 'present'})`, ...ordered.map((s) => `  – ${s}`)],
      }
    })
    .sort((a, b) => b.score - a.score || b.year - a.year)
  if (jobItems.length > 1 && jobItems[0].year !== Math.max(...jobItems.map((j) => j.year)))
    changes.push(`Put ${byId.get(jobItems[0].factId)?.label} first (instead of strict date order) because it is most relevant; dates are still shown.`)

  // Other projects (professional + coursework — coursework is labelled and never presented as research output)
  const otherProjects: Item[] = projects
    .filter((x) => x.kind === 'professional' || x.kind === 'coursework')
    .map((x) => ({
      factId: `proj:${x.id}`,
      score: score(`proj:${x.id}`),
      year: Number(x.year) || 0,
      lines: [`• ${x.title} (${PROJECT_LABEL[x.kind]}${x.year ? `, ${x.year}` : ''})${x.context ? ` — ${x.context}` : ''}`, ...sentencesOf(x.description).map((s) => `  ${s}`)],
    }))
    .sort((a, b) => b.score - a.score || b.year - a.year)
  if (projects.some((x) => x.kind === 'coursework')) changes.push('Coursework projects are labelled “coursework project” and kept out of research outputs and publications.')

  // Publications — status always shown
  const pubs = p.publications.filter((x) => x.verified && x.citation.trim())
  const pubItems: Item[] = pubs.map((x) => ({ factId: `pub:${x.id}`, score: score(`pub:${x.id}`), year: Number(x.citation.match(/(19|20)\d{2}/)?.[0]) || 0, lines: [`• ${x.citation} [${PUB_STATUS_LABEL[x.status]}]${x.url ? ` ${x.url}` : ''}`] }))

  // Training and achievements
  const trainItems: Item[] = p.training
    .filter((x) => x.verified && x.title.trim())
    .map((x) => ({ factId: `train:${x.id}`, score: score(`train:${x.id}`), year: Number(x.year) || 0, lines: [`• ${x.title}${x.provider ? ` — ${x.provider}` : ''}${x.year ? `, ${x.year}` : ''}`, ...(x.description ? [`  ${x.description}`] : [])] }))
    .sort((a, b) => b.score - a.score || b.year - a.year)
  const achItems: Item[] = p.achievements
    .filter((x) => x.verified && x.title.trim())
    .map((x) => ({ factId: `ach:${x.id}`, score: score(`ach:${x.id}`), year: Number(x.year) || 0, lines: [`• ${x.title}${x.issuer ? ` — ${x.issuer}` : ''}${x.year ? `, ${x.year}` : ''}`, ...(x.description ? [`  ${x.description}`] : [])] }))
    .sort((a, b) => b.score - a.score || b.year - a.year)

  // Skills
  const skillFacts = facts.filter((f) => f.kind === 'skill')
  const rankedSkills = [...skillFacts].sort((a, b) => relevanceScore(b, [...target, 'research', 'analysis', 'data']) - relevanceScore(a, [...target, 'research', 'analysis', 'data']))
  if (!skillFacts.some((f) => METHOD_WORDS.test(f.text)))
    missing.push('No research methods or analysis software are listed. If you have genuinely used any (e.g. Stata, SPSS, survey design), add them to your profile yourself.')

  // Languages
  const langItems: Item[] = p.languageTests.filter((t) => t.verified).map((t) => ({ factId: `lang:${t.id}`, score: 0, year: 0, lines: [`• ${t.test}: overall ${t.overall}${t.components ? ` (${t.components})` : ''}${t.date ? `, ${t.date}` : ''}`] }))
  if (!langItems.length && op.english.requirement) missing.push(`Add your English test result or exemption — this opportunity requires: ${op.english.requirement}.`)

  // Referees
  const refItems: Item[] = p.referees.filter((r) => r.verified).map((r) => ({ factId: `ref:${r.id}`, score: 0, year: 0, lines: [`• ${[r.name, r.position, r.organisation, r.email].filter(Boolean).join(', ')}`] }))
  if (refItems.length < 2) missing.push('Add two academic referees (e.g. your MSc supervisor) and mark them verified.')

  /* ----- Section order ----- */
  const researchFirst =
    academic ||
    op.proposalRequired === 'yes' ||
    op.fundingModel === 'dtp' ||
    op.selectionCriteria.some((c) => /research|intellectual|academic/i.test(c.text)) ||
    sum(researchItems) >= sum(jobItems)
  const research: Section = { key: 'research', heading: 'RESEARCH EXPERIENCE', items: researchItems }
  const work: Section = { key: 'work', heading: 'PROFESSIONAL EXPERIENCE', items: jobItems }
  const middle = researchFirst ? [research, work] : [work, research]
  if (researchItems.length && jobItems.length)
    changes.push(
      researchFirst
        ? `Placed Research experience before Professional experience because ${academic ? 'this is an academic CV' : op.selectionCriteria.some((c) => /research|intellectual|academic/i.test(c.text)) ? `the selection criteria stress ${op.selectionCriteria.filter((c) => /research|intellectual|academic/i.test(c.text)).map((c) => c.text.toLowerCase()).join(' and ')}` : op.fundingModel === 'dtp' ? 'doctoral training partnerships assess research preparation' : 'it is more relevant to this opportunity'}.`
        : 'Placed Professional experience before Research experience because your work experience is more closely related to this opportunity’s themes.',
    )
  const pubSection: Section = { key: 'pubs', heading: academic ? 'PUBLICATIONS AND PRESENTATIONS' : 'PUBLICATIONS', items: pubItems }
  const ordered: Section[] = [
    ...sections,
    ...(academic ? [research, pubSection, work] : middle),
    { key: 'projects', heading: 'PROJECTS', items: otherProjects },
    ...(academic ? [] : [pubSection]),
    { key: 'training', heading: 'TRAINING AND CERTIFICATION', items: trainItems },
    { key: 'achievements', heading: 'AWARDS AND ACHIEVEMENTS', items: achItems },
    { key: 'skills', heading: 'SKILLS', items: rankedSkills.length ? [{ factId: 'skills', score: 0, year: 0, lines: [rankedSkills.map((f) => f.text).join(' · ')] }] : [] },
    { key: 'languages', heading: 'ENGLISH LANGUAGE', items: langItems },
    { key: 'referees', heading: 'REFEREES', items: refItems.length ? refItems : [{ factId: '', score: 0, year: 0, lines: [ph('two referees (name, position, institution, email)')] }] },
  ].filter((s) => s.items.length)
  if (rankedSkills.length > 1 && relevanceScore(rankedSkills[0], target) > 0) changes.push(`Listed the skills most relevant to this opportunity first (${rankedSkills.slice(0, 3).map((f) => f.text).join(', ')}).`)

  for (const s of ordered) for (const i of s.items) if (i.factId && byId.has(i.factId)) used.add(i.factId)
  if (rankedSkills.length) rankedSkills.forEach((f) => used.add(f.id))

  /* ----- Requirements coverage ----- */
  const usedFacts = facts.filter((f) => used.has(f.id))
  const reqs = requirementsFor(op, kind, ctx.target).map((r) => {
    const sup = supportFor(r, usedFacts)
    if (!sup.length && r.source === 'official' && r.id.startsWith('crit')) missing.push(`Nothing in your verified profile clearly evidences “${r.text}”. If you have a genuine example, add it to your profile.`)
    return coverage(r, sup.map((f) => f.id), false)
  })

  const excluded = unverifiedCount(p)
  if (excluded) changes.push(`Left out ${excluded} unverified profile entr${excluded === 1 ? 'y' : 'ies'} — only verified facts are used.`)
  changes.push('Your wording is kept as written: items and sentences were selected and reordered, not reworded.')
  missing.push('If you have measurable results (budgets, beneficiaries, timelines, sample sizes), add the exact figures to your profile yourself — the app never estimates them.')

  const content = [header.join('\n'), ...ordered.map((s) => [s.heading, ...s.items.flatMap((i) => i.lines)].join('\n'))].join('\n\n')
  return { content, changes, missing: [...new Set(missing)], usedFactIds: [...used], requirements: reqs, over: false }
}

function sentenceScore(s: string, target: string[]): number {
  const fake: SourceFact = { id: '', kind: 'research', label: '', text: s, keywords: [], year: 0 }
  return relevanceScore(fake, target)
}
const sum = (items: Item[]) => items.reduce((a, i) => a + i.score, 0)
const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s)

/** Exposed for tests: the original master CV must never be changed by tailoring. */
export function snapshotOf(p: Profile): string {
  return JSON.stringify(p)
}
