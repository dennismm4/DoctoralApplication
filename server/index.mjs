// Optional Gemini drafting and official-page extraction API for the static Pages app.
// Personal profile data is never stored or logged by this service.
import { createServer } from 'node:http'
import { GoogleGenAI } from '@google/genai'
import { lookup } from 'node:dns/promises'

const KEY = process.env.GEMINI_API_KEY
const ORIGIN = process.env.ALLOWED_ORIGIN
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const PORT = Number(process.env.PORT || 8787)
const LIMIT = Math.max(1, Math.min(Number(process.env.RATE_LIMIT_PER_HOUR || 30), 300))
const MAX_BODY = 200_000
const MAX_PAGE = 1_000_000
const ai = KEY ? new GoogleGenAI({ apiKey: KEY }) : null
const AI_AVAILABLE = Boolean(ai && ORIGIN)
const hits = new Map()

const KINDS = new Set(['cv','academic-cv','cover-letter','personal-statement','research-experience','scholarship-essay','statement-of-purpose','selection-criteria','supervisor-email','application-answer','research-summary','concept-note'])
const SYSTEM = `Improve the supplied PhD application document using only its verified facts, opportunity details and template draft. Never invent or embellish grades, dates, figures, employers, duties, skills, publications, awards, research experience, citations or achievements. Keep every [ADD: ...] prompt exactly. Never mention another university. Use professional British English. Stay within the word limit. Return only document text.`
const opportunitySchema = {
  type: 'object',
  properties: {
    university: { type: 'string' }, department: { type: 'string' }, programme: { type: 'string' },
    title: { type: 'string' }, description: { type: 'string' }, supervisor: { type: 'string' },
    researchArea: { type: 'string' }, entryRequirements: { type: 'string' }, englishRequirement: { type: 'string' },
    fundingDescription: { type: 'string' }, stipendDescription: { type: 'string' }, deadline: { type: 'string' },
    startDate: { type: 'string' }, requiredDocuments: { type: 'array', items: { type: 'string' } },
  },
  required: ['university','department','programme','title','description','supervisor','researchArea','entryRequirements','englishRequirement','fundingDescription','stipendDescription','deadline','startDate','requiredDocuments'],
}
function validOpportunityExtraction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const fields = ['university','department','programme','title','description','supervisor','researchArea','entryRequirements','englishRequirement','fundingDescription','stipendDescription','deadline','startDate']
  return fields.every((key) => typeof value[key] === 'string') && Array.isArray(value.requiredDocuments) && value.requiredDocuments.length <= 100 && value.requiredDocuments.every((item) => typeof item === 'string' && item.length <= 500)
}

function isPrivateAddress(address) {
  const a = address.toLowerCase().split('%')[0]
  if (a === '::' || a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true
  const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mapped) return isPrivateAddress(mapped)
  const nums = a.split('.').map(Number)
  if (nums.length !== 4 || nums.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false
  return nums[0] === 0 || nums[0] === 10 || nums[0] === 127 || nums[0] >= 224 || (nums[0] === 169 && nums[1] === 254) || (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) || (nums[0] === 192 && nums[1] === 168) || (nums[0] === 100 && nums[1] >= 64 && nums[1] <= 127)
}

function response(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': ORIGIN || 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' })
  res.end(JSON.stringify(body))
}
function limited(ip) {
  const now = Date.now()
  if (hits.size > 10_000) for (const [key, timestamps] of hits) if (!timestamps.some((t) => now - t < 3_600_000)) hits.delete(key)
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3_600_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > LIMIT
}
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw Object.assign(new Error('Request too large'), { status: 413 })
    chunks.push(c)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }) }
}
function buildPrompt(r) {
  const o = r.opportunity || {}
  const researchRule = r.kind === 'concept-note' ? '\nResearch-sample rules: You may develop clearly labelled proposed aims, hypotheses, design and methods from the approved topic, but do not present proposed outcomes as findings. Do not invent or cite literature. Keep bibliography placeholders for sources the applicant must retrieve and verify.' : ''
  return `${SYSTEM}${researchRule}\n\nDocument kind: ${r.kind}\nTarget: ${String(r.target || '').slice(0, 100)}\nWord limit: ${r.wordLimit || 'none'}\nVerified facts:\n${(r.facts || []).map((x) => `- ${String(x.text).slice(0, 1000)}`).join('\n')}\nOpportunity (public details): ${JSON.stringify(o).slice(0, 8000)}\nApproved topic: ${JSON.stringify(r.topic || null).slice(0, 3000)}\nQuestion: ${String(r.question || '').slice(0, 2000)}\nRules: ${(r.rules || []).map((x) => String(x).slice(0, 300)).join('; ')}\nTemplate draft:\n${String(r.templateDraft).slice(0, 30_000)}`
}

async function extractPage(input) {
  let url
  try { url = new URL(input.url) } catch { throw Object.assign(new Error('Enter a valid official page URL.'), { status: 400 }) }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Object.assign(new Error('Only public HTTPS URLs without embedded credentials or custom ports are accepted.'), { status: 400 })
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || /^\d/.test(url.hostname)) throw Object.assign(new Error('That host is not allowed.'), { status: 400 })
  let addresses
  try { addresses = await lookup(url.hostname, { all: true }) } catch { throw Object.assign(new Error('The page host could not be resolved.'), { status: 422 }) }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw Object.assign(new Error('The page host is not a public internet address.'), { status: 400 })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  let page
  try { page = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { 'User-Agent': 'DoctoralCompassOpportunityResearch/1.0 (public page extraction)' } }) }
  catch { throw Object.assign(new Error('The page could not be retrieved. You can enter the opportunity manually.'), { status: 422 }) }
  finally { clearTimeout(timer) }
  if (!page.ok) throw Object.assign(new Error(`The page returned HTTP ${page.status}. You can enter the opportunity manually.`), { status: 422 })
  if (!/text\/html|text\/plain/i.test(page.headers.get('content-type') || '')) throw Object.assign(new Error('The URL did not return an HTML or text page.'), { status: 422 })
  const reader = page.body?.getReader()
  if (!reader) throw Object.assign(new Error('The page had no readable content.'), { status: 422 })
  const parts = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PAGE) { await reader.cancel(); throw Object.assign(new Error('The page is too large to process.'), { status: 413 }) }
    parts.push(value)
  }
  const html = Buffer.concat(parts).toString('utf8')
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim()
  if (text.length < 80) throw Object.assign(new Error('The page did not contain enough readable text. You can enter the opportunity manually.'), { status: 422 })
  return { url: url.href, text: text.slice(0, 40_000), retrievedAt: new Date().toISOString() }
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return response(res, 204, {})
  if (req.method === 'GET' && req.url === '/health') return response(res, 200, { ok: true, provider: 'gemini', aiAvailable: AI_AVAILABLE, model: AI_AVAILABLE ? MODEL : null })
  if (req.method !== 'POST' || !['/generate', '/extract-opportunity'].includes(req.url)) return response(res, 404, { error: 'Not found' })
  if (!ORIGIN || (req.headers.origin && req.headers.origin !== ORIGIN)) return response(res, 403, { error: 'Origin not allowed' })
  const forwarded = req.headers['x-forwarded-for']?.toString().split(',').map((x) => x.trim()).filter(Boolean) || []
  const ip = forwarded.at(-1) || req.socket.remoteAddress || 'unknown'
  if (limited(ip)) return response(res, 429, { error: 'Usage limit reached. Try again later or use the local demo templates.' })
  try {
    const body = await readJson(req)
    if (req.url === '/generate') {
      if (!KINDS.has(body.kind) || typeof body.templateDraft !== 'string' || !body.templateDraft.trim()) return response(res, 400, { error: 'A supported document kind and template draft are required.' })
      if (body.templateDraft.length > 30_000 || JSON.stringify(body.facts || []).length > 30_000) return response(res, 413, { error: 'Draft request exceeds the allowed size.' })
      if (body.kind === 'concept-note' && !body.topic) return response(res, 400, { error: 'Concept notes require an approved topic.' })
      if (!ai) return response(res, 503, { error: 'Gemini is not configured. Using local demo templates.' })
      const interaction = await ai.interactions.create({ model: MODEL, input: buildPrompt(body), generation_config: { thinking_level: 'low' } })
      if (!interaction.output_text) return response(res, 502, { error: 'Gemini returned an empty response.' })
      return response(res, 200, { text: interaction.output_text, provider: 'gemini', model: MODEL })
    }
    if (typeof body.url !== 'string' || body.url.length > 2048) return response(res, 400, { error: 'A public opportunity URL is required.' })
    if (!ai) return response(res, 503, { error: 'Gemini is not configured. Manual opportunity entry remains available.' })
    const source = await extractPage(body)
    const context = `Extract only information stated in this retrieved official page. Leave absent or ambiguous fields as empty strings or empty lists. Do not infer eligibility or funding coverage. Applicant supplied university: ${String(body.university || '').slice(0, 300)}. Programme: ${String(body.programme || '').slice(0, 300)}. URL: ${source.url}. Retrieved: ${source.retrievedAt}. Page text:\n${source.text}`
    const interaction = await ai.interactions.create({ model: MODEL, input: context, response_format: { type: 'text', mime_type: 'application/json', schema: opportunitySchema }, generation_config: { thinking_level: 'low' } })
    let extracted
    try { extracted = JSON.parse(interaction.output_text || '') } catch { return response(res, 502, { error: 'Gemini returned invalid structured opportunity data.' }) }
    if (!validOpportunityExtraction(extracted)) return response(res, 502, { error: 'Gemini response did not match the opportunity schema.' })
    return response(res, 200, { sourceUrl: source.url, retrievedAt: source.retrievedAt, pageTextLength: source.text.length, extracted, note: 'AI extraction is an unverified draft. Confirm every field against the official source before saving.' })
  } catch (e) {
    const status = e.status || (e.status === 429 ? 429 : 502)
    const message = status === 429 ? 'Gemini quota or rate limit reached. Use local demo templates and try again later.' : status === 413 ? e.message : status >= 400 && status < 500 ? e.message : 'The service is temporarily unavailable. Use local demo templates and try again later.'
    return response(res, status, { error: message })
  }
}).listen(PORT, () => console.log(`Doctoral Compass Gemini backend listening on port ${PORT}; AI configured: ${AI_AVAILABLE}; model: ${AI_AVAILABLE ? MODEL : 'none'}`))
