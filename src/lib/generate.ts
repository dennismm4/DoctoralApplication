import type { Opportunity, Profile, TopicProposal } from '../types'
import { uid } from './profile'

/**
 * Template ("demo mode") generators.
 *
 * Rule: a generated document may only state facts the applicant has marked as verified.
 * Anything missing or unverified becomes a visible placeholder like [ADD: …] so it can never
 * slip into a submitted application as an invented claim.
 */

export const ph = (what: string) => `[ADD: ${what}]`
const v = (f: { value: string; verified: boolean }, label: string) => (f.verified && f.value.trim() ? f.value.trim() : ph(label))

export function verifiedFacts(p: Profile): string[] {
  const out: string[] = []
  if (p.fullName.verified && p.fullName.value) out.push(`Name: ${p.fullName.value}`)
  if (p.nationality.verified) out.push(`Nationality: ${p.nationality.value}`)
  if (p.residence.verified) out.push(`Residence: ${p.residence.value}`)
  for (const d of p.degrees.filter((d) => d.verified))
    out.push(`${d.title}${d.institution ? `, ${d.institution}` : ''}${d.graduationYear ? ` (${d.graduationYear})` : ''}${d.classification ? ` — ${d.classification}` : ''}`)
  for (const e of p.employment.filter((e) => e.verified)) out.push(`${e.role}, ${e.organisation} (${e.start}–${e.end || 'present'})`)
  for (const t of p.languageTests.filter((t) => t.verified)) out.push(`${t.test}: ${t.overall}`)
  for (const pub of p.publications.filter((x) => x.verified)) out.push(`Publication: ${pub.citation}`)
  for (const s of p.skills.filter((s) => s.verified)) out.push(`Skill: ${s.value}`)
  return out
}

/* ---------- Research topics ---------- */

interface Seed {
  tags: string[]
  title: string
  questions: string[]
  rationale: string
  contribution: string
}

const SEEDS: Seed[] = [
  {
    tags: ['food waste reduction', 'supply chain management', 'agri-food systems'],
    title: 'Post-harvest loss and food waste across smallholder-to-market supply chains in Ethiopia',
    questions: ['Where along selected value chains are losses concentrated, and why?', 'Which coordination mechanisms between producers, aggregators and retailers reduce loss?', 'What is the cost-effectiveness of feasible loss-reduction interventions?'],
    rationale: 'Food loss between farm and market undermines both food security and farmer incomes; the organisational causes are less studied than the technical ones.',
    contribution: 'Evidence on organisational (not only technological) levers for loss reduction in low-income agri-food chains.',
  },
  {
    tags: ['sustainable procurement', 'food security', 'food policy', 'management'],
    title: 'Sustainable public food procurement as a lever for food security: institutional design and outcomes',
    questions: ['How do procurement rules shape which suppliers access public food markets?', 'Do sustainability criteria in procurement change smallholder participation?', 'What trade-offs arise between cost, sustainability and food-security goals?'],
    rationale: 'Public procurement is a large, policy-controllable demand source, yet its food-security effects in East Africa are poorly evidenced.',
    contribution: 'A framework linking procurement design choices to food-security and sustainability outcomes.',
  },
  {
    tags: ['circular economy', 'food waste reduction', 'food sustainability'],
    title: 'Business models for circular food systems: valorising food and agricultural by-products',
    questions: ['Which circular business models are viable for agri-food by-products in emerging economies?', 'What institutional and market barriers constrain them?', 'How do they affect firm performance and environmental outcomes?'],
    rationale: 'Circular economy research is concentrated in high-income contexts; viability conditions differ markedly elsewhere.',
    contribution: 'Context-specific evidence on circular business model viability in agri-food sectors.',
  },
  {
    tags: ['organisational sustainability in agri-food systems', 'management', 'food sustainability'],
    title: 'How agri-food organisations embed sustainability: practices, capabilities and performance',
    questions: ['Which sustainability practices do agri-food firms and cooperatives adopt, and why?', 'What organisational capabilities enable adoption?', 'How does adoption relate to economic and social performance?'],
    rationale: 'Firm-level sustainability is increasingly demanded by buyers and regulators, but adoption drivers in agri-food organisations remain unclear.',
    contribution: 'An organisational-capability account of sustainability adoption in agri-food systems.',
  },
  {
    tags: ['climate resilience', 'agricultural economics', 'food security'],
    title: 'Climate shocks, household coping strategies and food security: the role of market access',
    questions: ['How do climate shocks affect household food security?', 'Does market access moderate these effects?', 'Which policy instruments best support resilience?'],
    rationale: 'Climate variability is a major driver of food insecurity; market access may buffer or amplify shocks.',
    contribution: 'Quantitative evidence on the market-access channel of climate resilience.',
  },
  {
    tags: ['supply chain management', 'climate resilience', 'food security'],
    title: 'Resilience of food supply chains to climate and market disruptions',
    questions: ['How do disruptions propagate through domestic food supply chains?', 'Which supply chain configurations recover fastest?', 'What resilience strategies are affordable for small and medium enterprises?'],
    rationale: 'Recent disruptions exposed fragility in food supply chains; resilience strategies designed for large firms rarely fit SMEs.',
    contribution: 'Resilience strategies matched to the constraints of SME-dominated food supply chains.',
  },
  {
    tags: ['agricultural economics', 'food policy', 'management'],
    title: 'Project management of agricultural development programmes: delivery, governance and outcomes',
    questions: ['Which project governance practices are associated with better programme outcomes?', 'How do implementation delays affect food-security results?', 'How can monitoring and evaluation be designed to improve delivery?'],
    rationale: 'Large sums flow through agricultural development projects; delivery quality strongly shapes impact but is under-researched.',
    contribution: 'Connects project-management practice to development outcomes — building directly on an MSc in Project Management.',
  },
  {
    tags: ['food policy', 'food sustainability', 'circular economy'],
    title: 'Policy instruments for sustainable food systems: design and evaluation',
    questions: ['Which policy instruments target food sustainability, and how are they designed?', 'What evidence exists on their effects?', 'How transferable are these instruments across contexts?'],
    rationale: 'Policy-makers face a crowded menu of instruments with uneven evidence.',
    contribution: 'Comparative evaluation to guide instrument choice.',
  },
]

export function suggestTopics(p: Profile, op: Opportunity | null): TopicProposal[] {
  const interests = new Set(p.researchInterests.map((i) => i.toLowerCase()))
  const opThemes = new Set((op?.themes ?? []).map((t) => t.toLowerCase()))
  return SEEDS.map((s) => {
    const iScore = s.tags.filter((t) => interests.has(t)).length
    const oScore = op ? s.tags.filter((t) => opThemes.has(t)).length : 0
    return { s, score: iScore + oScore * 2 }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ s }) => ({
      id: uid(),
      opportunityId: op?.id ?? null,
      title: s.title,
      questions: s.questions,
      rationale: s.rationale,
      contribution: s.contribution,
      themes: s.tags,
      status: 'proposed' as const,
      approvedAt: null,
      conceptNote: null,
    }))
}

/** Only callable for an approved topic — enforced here as well as in the UI. */
export function generateConceptNote(topic: TopicProposal, p: Profile, op: Opportunity | null): string {
  if (topic.status !== 'approved') throw new Error('Topic must be approved before a concept note is developed.')
  return [
    `CONCEPT NOTE — ${topic.title}`,
    op ? `Prepared for: ${op.scholarshipName}, ${op.university}` : '',
    `Applicant: ${v(p.fullName, 'full name')}`,
    '',
    '1. Background and problem statement',
    topic.rationale,
    ph('Add 3–5 key references you have read (author, year). Do not cite sources you have not checked.'),
    '',
    '2. Aim',
    ph('one-sentence aim'),
    '',
    '3. Research questions',
    ...topic.questions.map((q, i) => `   RQ${i + 1}. ${q}`),
    '',
    '4. Conceptual framework',
    ph(`theory or framework linking ${topic.themes.join(', ')}`),
    '',
    '5. Methodology',
    `   Design: ${ph('e.g. mixed methods / panel econometrics / case study')}`,
    `   Data: ${ph('data sources — confirm they exist and are accessible')}`,
    `   Analysis: ${ph('methods you can justify with your training')}`,
    '',
    '6. Expected contribution',
    topic.contribution,
    '',
    '7. Indicative timeline',
    '   Year 1: literature review, framework, ethics approval, pilot',
    '   Year 2: data collection and analysis',
    '   Year 3: analysis, writing, dissemination',
    '',
    '8. Fit with supervisor / programme',
    op ? ph(`name supervisors or groups at ${op.university} whose work you have read`) : ph('target programme fit'),
  ]
    .filter((l) => l !== '')
    .join('\n')
}

export function countPlaceholders(text: string): number {
  return (text.match(/\[ADD:/g) ?? []).length
}
