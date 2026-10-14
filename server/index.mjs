// Doctoral Compass — optional drafting backend.
//
// A dependency-free Node (>=18) server that keeps the AI provider key server-side.
// Deploy it anywhere that runs Node (Render, Fly.io, Railway, a VPS…) — NOT on GitHub Pages.
//
// Environment variables (see ../.env.example):
//   ANTHROPIC_API_KEY  required — server-side only, never commit it
//   ALLOWED_ORIGIN     required — your GitHub Pages origin, e.g. https://username.github.io
//   ANTHROPIC_MODEL    optional — defaults to claude-sonnet-5-5
//   PORT               optional — defaults to 8787
//   RATE_LIMIT_PER_HOUR optional — defaults to 30 requests per IP

import { createServer } from 'node:http'

const KEY = process.env.ANTHROPIC_API_KEY
const ORIGIN = process.env.ALLOWED_ORIGIN
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
const PORT = Number(process.env.PORT || 8787)
const LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 30)

if (!KEY || !ORIGIN) {
  console.error('Set ANTHROPIC_API_KEY and ALLOWED_ORIGIN before starting the server.')
  process.exit(1)
}

const KINDS = {
  cv: 'a tailored CV (plain text, ALL-CAPS section headings, "• " bullets)',
  'academic-cv': 'an academic CV (plain text, ALL-CAPS section headings, "• " bullets)',
  'cover-letter': 'a cover letter',
  'personal-statement': 'a personal statement',
  'research-experience': 'a research experience statement',
  'scholarship-essay': 'a scholarship essay',
  'statement-of-purpose': 'a statement of purpose',
  'selection-criteria': 'responses to the published selection criteria, one section per criterion',
  'supervisor-email': 'a short supervisor enquiry email with a subject line',
  'application-answer': 'an answer to the application-form question provided',
  'research-summary': 'a research summary / abstract',
  'concept-note': 'a research concept note scaffold for the approved topic',
}

const SYSTEM = `You improve the wording of PhD application documents for a real applicant.
You receive: verified facts, the opportunity's public details, drafting rules and a TEMPLATE DRAFT that already uses only verified facts.
Absolute rules:
- Use ONLY the verified facts. Never add or embellish grades, dates, figures, employers, responsibilities, software, publications, awards, research experience or achievements.
- Keep every [ADD: ...] placeholder exactly where information is missing. Do not invent content for it.
- Never describe coursework as published or independent research.
- Mention only the university and scholarship in OPPORTUNITY. Never mention any other university.
- Respect the word limit. Write in professional British English. No stock phrases ("always been passionate", "since childhood", "my dream").
- Keep the applicant's own quoted sentences (motivation, research experience) in her words; you may trim them, not reword their meaning.
The client re-checks your output against the facts and rejects invented claims.
Return only the document text.`

const hits = new Map()
function limited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3_600_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > LIMIT
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req, max = 200_000) {
  let size = 0
  const chunks = []
  for await (const c of req) {
    size += c.length
    if (size > max) throw new Error('Request too large')
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function buildPrompt(r) {
  const op = r.opportunity || {}
  return [
    `Rewrite the TEMPLATE DRAFT as ${KINDS[r.kind]}${r.wordLimit ? ` of at most ${r.wordLimit} words` : ''}.`,
    `Target: ${r.target}${op.separateScholarshipApplication === 'yes' ? ' (the scholarship and the PhD admission are separate applications)' : ''}.`,
    '',
    'VERIFIED FACTS:',
    ...(r.facts?.length ? r.facts.map((f) => `- ${f.text}`) : ['- (none)']),
    '',
    'OPPORTUNITY:',
    `- ${op.scholarshipName} — ${op.programme ?? op.title}, ${op.university}${op.department ? ` (${op.department})` : ''}`,
    `- Themes: ${(op.themes || []).join(', ')}`,
    `- Selection criteria: ${(op.selectionCriteria || []).join('; ') || 'none published'}`,
    `- Entry requirements: ${op.entryRequirements || 'not stated'}`,
    r.topic ? `\nAPPROVED TOPIC: ${r.topic.title}\nQuestions: ${r.topic.questions.join(' | ')}` : '',
    r.question ? `\nAPPLICATION QUESTION: ${r.question}` : '',
    '',
    'RULES:',
    ...(r.rules || []).map((x) => `- ${x}`),
    '',
    'TEMPLATE DRAFT:',
    r.templateDraft || '',
  ].join('\n')
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true })
  if (req.method !== 'POST' || req.url !== '/generate') return send(res, 404, { error: 'Not found' })
  if (req.headers.origin && req.headers.origin !== ORIGIN) return send(res, 403, { error: 'Origin not allowed' })
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress
  if (limited(ip)) return send(res, 429, { error: 'Rate limit exceeded' })

  try {
    const body = await readJson(req)
    if (!KINDS[body.kind]) return send(res, 400, { error: 'Unknown document kind' })
    if (!body.templateDraft) return send(res, 400, { error: 'templateDraft is required' })
    if (body.kind === 'concept-note' && !body.topic) return send(res, 400, { error: 'Concept notes require an approved topic' })
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: buildPrompt(body) }] }),
    })
    if (!upstream.ok) return send(res, 502, { error: `Provider error ${upstream.status}` })
    const data = await upstream.json()
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    return send(res, 200, { text })
  } catch (e) {
    return send(res, 400, { error: e.message })
  }
}).listen(PORT, () => console.log(`Doctoral Compass backend on :${PORT} (origin ${ORIGIN}, model ${MODEL})`))
