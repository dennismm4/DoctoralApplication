# Doctoral Compass

A research-career web app that helps an Ethiopian applicant find **genuinely eligible, fully funded PhD opportunities in the United Kingdom** and prepare accurate, personalised applications — without inventing academic facts.

Built with React, TypeScript, Vite and Tailwind CSS. Deploys as a static site to GitHub Pages. A scheduled GitHub Action runs the discovery pipeline.

---

## How the eligibility engine works

Funding eligibility is a **gate, not a score**. Every record is put into exactly one of six states, checked in this order:

| State | Meaning | Where it appears |
|---|---|---|
| **Not eligible** | Nationality/country-list/residence rules exclude Ethiopian applicants, the institution is outside the UK, or she recorded that she does not meet entry requirements | Archive |
| **Funding shortfall / partial** | Self-funded, tuition-only, Home-fee-only, partial fee, or no stipend | Archive |
| **Deadline passed** | The deadline (or, if none, the start date) has passed | Archive |
| **Insufficient evidence** | No official source, or 2+ of the 4 core facts unconfirmed (international eligibility, Ethiopian eligibility, international tuition, stipend) | Review queue |
| **Potential match** | One gap left: e.g. waiver of the international fee difference, stipend amount, duration, deadline, an unresolved conflict between official pages, or a verification older than 120 days | Review queue |
| **Verified fully funded & eligible** | Every gate fact confirmed by official evidence | **Primary results** |

Key rules:
- A fact counts only with **official evidence** (university, funder, research council, government page) for that specific claim. A "yes" without evidence is treated as unknown. Aggregator sites and search-engine snippets never count.
- "Fully funded" in a title is ignored.
- UKRI states it "only contributes up to the value of home fee rates", so a UKRI DTP/CDT place is verified only when the **university's own waiver** of the international difference is evidenced.
- The **scholarship deadline** is kept separate from the **PhD admissions deadline** and departmental **internal** deadlines.
- Visa fees, the Immigration Health Surcharge, travel, relocation and dependants' costs are shown separately and never assumed covered.

### Match score (ranking only)

After the gate, a 100-point score ranks opportunities. It covers academic eligibility (15), research relevance (20), Ethiopian/international eligibility (10), international tuition (15), stipend and duration (10), deadline status (10), preparation time (10) and supervisor/department fit (10). Preparation time is estimated from the required documents, whether a proposal is needed, supervisor contact, a separate scholarship application and whether she already has an English test result. **A high score never moves a record out of the archive or review queue.**

### Manual verification checklist

Every review-queue record has a checklist of the facts still missing. She opens the official page, records the answer and pastes the exact https URL. Search URLs and aggregator sites are rejected. Confirmations are applied as evidence (marked "confirmed by you"), re-run through the same rules, and can be exported as a **verification patch** for a maintainer to merge into the dataset. Answering "No" (e.g. "international fee not covered") moves the record to the archive.

### Deadline alerts

The dashboard lists every scholarship, admissions, internal and final-form deadline in the next 45 days for verified and review-queue records, colour-coded at 7/21/45 days and flagged when preparation time is tight. Each alert can be exported as an `.ics` file (with a 7-day alarm). Optionally, a browser notification appears when the app opens if a deadline is within 7 days.

---

## How opportunities are researched, verified, refreshed and archived

### 1. Research (human, official sources)
For each funding source in `scripts/discovery/sources.json`:
1. Read the official funding page and the programme page.
2. Record each fact with its source URL, the time it was read and, ideally, a short quote (`evidence[]`).
3. Distinguish the scholarship deadline from the admissions deadline.
4. Check Ethiopian eligibility explicitly (country lists, residence and fee-status rules).
5. Check whether the international tuition fee is covered in full or only the Home fee.
6. Record the stipend, duration, academic and English requirements, documents, separate scholarship application and supervisor contact.
7. Record conflicts between official pages in `discrepancies[]`.
8. Leave anything unconfirmed as `"unknown"` and list it in `outstanding[]`.

The validator rejects a researched record that states a gate fact without official evidence.

### 2. Discovery and refresh (automatic, weekly)
`.github/workflows/discovery.yml` runs every Monday (and on demand):
- **Discover:** fetches every enabled source page politely (honours robots.txt, 2 s between requests to a host, identifies itself). It extracts signals (international eligibility statements, Home-fee-only wording, waivers, full international fees, restrictions, eligible-country lists without Ethiopia, stipends, dates, research-interest matches) and classifies each page as a lead: *promising, unclear, home-fee-only, restricted, not-ethiopia, self-funded* or *stale-cycle*.
- **Diff:** compares each page with last week's snapshot (cached between runs) and reports changed content, new dates and changed stipend figures.
- **Refresh:** for each active record, flags expired deadlines, stale verifications, evidence pages that changed since the last snapshot, and **conflicts** (e.g. a verified record whose page now mentions Home-fee-only funding).
- **Report:** writes `report.md`, `review-queue.json` and `refresh.json`, uploads them as an artifact, adds them to the job summary and comments on a "Scholarship review queue" issue.

The pipeline **never edits the dataset**. Every lead is verified by a person, who then opens a pull request.

```bash
npm run discover              # live run (needs internet; normally runs in GitHub Actions)
npm run discover:fixtures     # offline run against illustrative fixture pages
npx tsx scripts/discover.ts --update-snapshots   # also save snapshots for the next diff
```

### 3. Archive
```bash
npm run archive               # dry run — lists records whose deadline has passed
npm run archive -- --write    # moves them to src/data/archive.json with archivedAt + reason
```
The app also archives expired records on the fly, so they never appear as actionable even before the script runs.

### Funding sources monitored
UKRI rules; ESRC White Rose DTP; Midlands Graduate School DTP; SGSSS; FoodBioSystems BBSRC DTP; UK Food Systems CDT; NERC GW4+; Commonwealth PhD Scholarships (Ethiopia not eligible, monitored in case that changes); Gates Cambridge; Cambridge Trust; Clarendon (Oxford); Edinburgh; Manchester President's Doctoral Scholar Awards; Warwick Chancellors'; LSE PhD Studentships; Leeds funding search; an aggregator slot (disabled; leads only). Listing a source does not mean it is open or available to Ethiopian applicants.

---

## Current dataset (verified 14 October 2026)

| Record | State | Deciding facts |
|---|---|---|
| ESRC White Rose DTP — University of York | ✅ Verified | Full fee waiver for international applicants; £21,805; Management internal deadline **4 Dec 2026** |
| Gates Cambridge (International round) | ✅ Verified | Fees at applicable rate, £23,152, visa + IHS + flights; course funding deadline **8 Dec 2026 / 6 Jan 2027** |
| Warwick Chancellors' Scholarship | ✅ Verified | "Full payment of your academic fees (UK or international)", any nationality, UKRI-rate stipend, 3.5 yrs; course application **7 Dec**, scholarship **10 Dec 2026** |
| ESRC White Rose DTP — Leeds | ◐ Potential | Fees "at standard UKRI rates" — Leeds waiver not confirmed |
| Cambridge Trust International Scholarship | ◐ Potential | International fees + maintenance confirmed; amount and duration not stated; internal contradiction on financial need |
| Clarendon (Oxford) | ◐ Potential | Fees + living grant, no nationality restriction; grant amount and exact course deadline not stated |
| LSE PhD Studentships | ◐ Potential | "Full fees" — overseas rate not explicit |
| Manchester PDS (Humanities, 2027) | ◐ Potential | Fee level not stated; page shows conflicting entry years |
| Midlands Graduate School DTP | ? Insufficient | Eligibility, stipend and international fees on unreviewed pages |
| SGSSS via Edinburgh | ? Insufficient | Deadlines **19/24 Nov 2026** confirmed; no funding facts |
| Commonwealth PhD Scholarships | ✕ Not eligible | Ethiopia not on the CSC country list |
| SGSSS via Stirling (2026) | £ Shortfall | Home fees only; international awardees pay the difference |
| Edinburgh Economics award, UKFS-CDT, GW4+ project | ○ Deadline passed | Archived for next-cycle planning |

`src/data/fixtures/illustrative.json` holds two clearly labelled **fictional** records for testing; they are hidden by default and can never reach verified status.

---

## Application Documents Studio

### Master CV
She uploads her CV (.docx/.txt, or pasted PDF text). The original is stored read-only and never modified. Extracted items are suggestions she accepts into her profile and verifies. Then she **approves a master CV**: a frozen snapshot of every verified entry (degrees, employment, projects, publications with status, training, awards, skills, languages, referees, research experience, motivation, career plans). All documents are generated only from that snapshot, on a deep copy, so tailoring can never change it. If the profile changes, the app warns that the master CV is out of date until she re-approves.

### Tailor my CV
The button appears on every verified and review-queue opportunity. It does the following:
1. Reads the opportunity's selection criteria, themes, entry and English requirements.
2. Scores every verified entry against them.
3. Reorders sections (e.g. research before employment when the criteria stress research or it is a DTP), entries and her own bullet sentences, putting the strongest evidence first.
4. Keeps her wording verbatim. Sentences are selected and reordered, never reworded into new claims.
5. Lists missing information she should add herself (dissertation title, results, English score, methods, referees, measurable results).
6. Shows a change summary explaining each prioritisation.

Coursework is always labelled "coursework project" and never appears as research output or a publication.

### Cover letters and other documents
Supported documents: tailored CV, academic CV, cover letter, personal statement, research experience statement, scholarship essay, statement of purpose, responses to selection criteria, supervisor enquiry email, application form answers, and research summary/abstract (concept notes come from the Topic Workshop).

- **Only relevant documents are offered.** No supervisor email when contact isn't required, no criteria response without published criteria, no scholarship essay without a separate scholarship application, no research summary without an approved topic. Each card shows whether it is required, recommended or optional, and why.
- **Admission vs scholarship.** When the scholarship needs its own application (Warwick, York/Leeds WRDTP), the cover letter can be written for either, with a different addressee, purpose and content. Where it does not (Clarendon, Cambridge Trust, LSE), the letter says she is considered through the admission application.
- **Letters address the right place.** They name the correct university, department, programme and scholarship. They explain the Economics + Project Management background as a description of the disciplines, not invented experience, and connect her stated interests to the opportunity's themes. They address the published selection criteria with evidence from verified facts, or an `[ADD: …]` prompt where she has none. Her motivation is used in her own words.
- **Word limits** come from the form (or a clearly labelled default). Lower-priority paragraphs are dropped first, and essential ones are never cut mid-sentence. If the essentials are too long, she is told to shorten them.

### Review interface (`/documents/:id`)
The page shows:
- the opportunity and university, document type and target
- the editable draft, with a live word count against the limit
- the requirements addressed and the evidence for each
- missing-information warnings
- the change summary
- the source facts used, and the master CV date

Controls: **save edit** (new version), **regenerate** (new version, same opportunity only), **approve** (explicit confirmation of a specific version), **reject**, **restore** an earlier version, and **export** the approved version to **.docx** (docx library), **PDF** (jsPDF, A4, selectable text) or .txt. Each document is bound to one opportunity, and the history stays with it.

### Factual check (blocks approval)
Every draft is audited before approval, including AI output and her own edits. The check flags:
- figures not found in her verified facts or the opportunity record
- grades that differ from her transcript
- software not in her verified skills
- claims of published work without a verified published or accepted publication
- awards without verified achievements
- **any other university's name**, so a letter can't be reused elsewhere
- word-limit breaches and unfinished `[ADD: …]` prompts

It also warns about stock phrases and American spellings.

### Demo mode and the AI backend
On GitHub Pages the studio runs in labelled demo mode: template drafting only. With the optional backend (`server/index.mjs`), the local engine still chooses the facts, requirements and structure. Only verified facts, public opportunity details and the template draft are sent, the backend improves wording under strict rules, and the result goes through the same audit. API keys live only in the server's environment variables.

## Other features

## Getting started

Requirements: Node.js 20+ (22 recommended).

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 261 tests
npm run typecheck
npm run validate-data
npm run build
```

## Deploying to GitHub Pages

1. Push to the `main` branch of a GitHub repository.
2. **Settings → Pages → Source: GitHub Actions.**
3. `ci.yml` type-checks, validates the data, runs the offline pipeline and the tests, builds and deploys to `https://<user>.github.io/<repo>/` (relative paths + hash routing, no extra config).
4. `discovery.yml` needs **Settings → Actions → General → Workflow permissions: Read and write** so it can open the review issue.

> Never commit a CV, a data backup, a verification patch containing personal notes, or any `.env` file to a public repository.

## Optional AI drafting backend

GitHub Pages cannot hold secrets, so AI drafting goes through `server/index.mjs` (dependency-free Node 18+), deployed separately. It accepts requests only from `ALLOWED_ORIGIN`, rate-limits by IP, forbids invented facts in its system prompt, and refuses concept notes without an approved topic. The frontend sends only verified profile facts. Without it, the app runs in clearly labelled template mode.

| Variable | Where | Secret? | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Frontend build (repo *variable*) | No — public | Backend URL; empty = demo mode |
| `ANTHROPIC_API_KEY` | Server only | **Yes** | Provider key |
| `ALLOWED_ORIGIN` | Server | No | Pages origin allowed by CORS |
| `ANTHROPIC_MODEL`, `PORT`, `RATE_LIMIT_PER_HOUR` | Server | No | Optional |

## Privacy

The profile, CV text, drafts, tracker and checklist confirmations live in this browser's localStorage only. They are lost if site data is cleared and readable by anyone using the browser profile. Export backups regularly and keep them private.

## Project structure

```
src/data/opportunities.json        active researched records
src/data/archive.json              archived records
src/data/fixtures/illustrative.json fictional test records (hidden by default)
src/lib/eligibility.ts             six-state, evidence-gated rules engine
src/lib/matching.ts                gated match score + preparation-time estimate
src/lib/verification.ts            manual checklist, URL rules, applying confirmations
src/lib/validate.ts                schema + evidence validator (CI)
src/lib/discovery/extract.ts       page → signals → lead classification, snapshot diff
scripts/discovery/sources.json     funding sources to monitor
scripts/discover.ts                discovery + refresh pipeline
scripts/archive.ts                 move expired records to the archive
scripts/discovery/fixtures/        ILLUSTRATIVE fixture pages for offline tests
.github/workflows/ci.yml           validate, test, build, deploy
.github/workflows/discovery.yml    weekly discovery report
docs/DATA_SCHEMA.md                schema, evidence rules, verdict order
```

## Tests

`npm test` covers document generation (CV tailoring uses verified entries only and keeps wording verbatim; coursework is never presented as publication; the master CV is never altered; letters name the correct university, department and route; admission vs scholarship letters differ; every relevant document for every actionable opportunity passes the factual audit; word limits at 350/500/800; the audit catches invented figures, software, publications, awards, grades and other universities' names; relevance rules; versions and approval; real .docx and PDF output), Ethiopian eligibility (country lists, restrictions, missing/aggregator/snippet evidence); international tuition (Home-only, partial, unconfirmed vs evidenced waiver, title ignored); incomplete funding evidence (insufficient vs potential, discrepancies, stale, fixtures); expired deadlines (UK end-of-day in GMT/BST, start-date fallback, precedence); the gate-vs-score rule; the checklist (URL rules, promotion, demotion, no mutation); the discovery parser on fixtures (all lead types, date/stipend parsing, diffing); dataset validation and the expected verdict of every real record; no-invented-facts drafting; and rendering of every page.

## Known limitations

- The discovery pipeline produces **leads**: a human still reads each page. The extractor is keyword-based and will miss unusual wording.
- It could not be run live from the build environment (no outbound access to university sites); it runs live in GitHub Actions and was tested here against labelled fixtures.
- Some university pages block automated fetching; those appear under "Could not fetch".
- Degree equivalence (Ethiopian CGPA → UK classification) is not calculated. She confirms it in the checklist against each university's country page.
