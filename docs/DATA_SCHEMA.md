# Opportunity data schema (v2)

| File | Contents | Loaded by the app |
|---|---|---|
| `src/data/opportunities.json` | Active, researched records for the current cycle | Always |
| `src/data/archive.json` | Records moved out by `npm run archive` (deadline passed), with `archivedAt` and `archiveReason` | Always (shown in Archive) |
| `src/data/fixtures/illustrative.json` | **Fictional** records for testing the interface | Only when "Include illustrative fixtures" is on |

CI (`npm run validate-data`) validates all three on every push. The live files may contain **only** `recordType: "researched"` records.

## Principles

1. **Official sources only.** Gate facts are confirmed only by `evidence` items with `sourceType` `official` or `official-pdf` and an https URL. Aggregator sites (`third-party`) and search snippets (`search-snippet`) may be recorded but never confirm anything.
2. **Unknown is not yes.** A `"yes"` without official evidence for that field is treated as `"unknown"` by the rules engine — and the validator rejects researched records that state a value without evidence.
3. **"Fully funded" labels are ignored.** Only structured fields decide funding status.
4. **Conflicts are flagged, not resolved silently.** Record contradictory official statements in `discrepancies`; an unresolved one blocks "verified".
5. **Scholarship ≠ admissions deadline.** `deadline.type` says which one `deadline.date` is; every step has a `type`.

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | kebab-case | Unique across all three files. |
| `recordType` | `researched \| demo` | `demo` = illustrative fixture; can never be verified. |
| `archivedAt`, `archiveReason` | string? | Set by the archive script. |
| `title`, `university`, `scholarshipName`, `fundingProvider` | string | |
| `department`, `programme`, `researchGroup` | string \| null | |
| `selectionCriteria` | `{ text, url }[]` | Published selection criteria, each with its official source. Documents address these first. Empty when none are published. |
| `subjects`, `themes` | string[] | `themes` drive relevance — use the applicant's vocabulary (`"food security"`). |
| `supervisors` | `{ name, url \| null, themes? }[]` | `themes` improve the supervisor-fit score. |
| `programmeUrl`, `fundingUrl` | https \| null | |
| `country` | string | Must be `"United Kingdom"`. |
| `fundingModel` | `studentship \| scholarship \| dtp \| cdt \| combination \| self-funded \| unknown` | `unknown` is used for intake drafts until the funding route is checked. |
| `eligibility.international`, `eligibility.ethiopian` | Tri | Evidence fields `eligibility.international`, `eligibility.ethiopian`. Use `ethiopian: "yes"` only when the award is open to all non-UK nationalities or names Ethiopia — and say which in the evidence claim. |
| `eligibility.restrictedTo` | string \| null | Any restriction → not eligible. |
| `tuition.coverage` | `full-international \| home-plus-waiver \| home-only \| partial \| none \| unknown` | `home-only`/`partial`/`none` → shortfall. |
| `tuition.internationalFeeCoveredInFull` | Tri | Must be `yes` **with `tuition` evidence** for verified. |
| `stipend.provided`, `amount`, `frequency`, `rateYear` | | `amount` null → potential. |
| `durationYears` | number \| null | Needs `duration` evidence. |
| `extraCosts.*` | Tri | Visa, IHS, travel, relocation, dependants — shown separately, never assumed. |
| `deadline.date` | ISO \| null | Earliest deadline she must meet for the route described. Date-only = 23:59 UK time. |
| `deadline.type` | `scholarship \| admissions \| internal \| null` | Required when `date` is set. An `admissions` deadline with no known `scholarship` step is flagged. |
| `deadline.steps[]` | `{ label, date, type }` | `type`: scholarship, admissions, internal, final-form, interview, outcome, other. |
| `separateScholarshipApplication` | Tri | Evidence field `separateApplication`. |
| `proposalRequired`, `supervisorContactRequired` | Tri | Evidence field `supervisorContact`. |
| `entryRequirements`, `minimumDegree`, `english` | | |
| `requiredDocuments`, `selectionStages` | string[] | |
| `competitionNote` | string \| null | e.g. 30% international cap. |
| `lastVerified` | ISO timestamp | Older than 120 days → potential ("stale"). |
| `firstListed` | ISO date | Drives the "New" badge. |
| `sources` | `{ label, url }[]` | Page list for humans. |
| `evidence` | `Evidence[]` | See below. |
| `discrepancies` | `{ id, description, urls[], resolved, resolution? }[]` | |
| `verificationNotes`, `confidence`, `outstanding[]` | | |

### Evidence

```json
{
  "field": "tuition",
  "claim": "Full payment of academic fees (UK or international).",
  "url": "https://warwick.ac.uk/services/dc/schols_fund/scholarships_and_funding/chancellors_international/",
  "sourceType": "official",
  "retrieved": "2026-10-14T20:30:00+03:00",
  "quote": "Full payment of your academic fees (UK or international)",
  "addedBy": "researcher"
}
```

`field` ∈ `eligibility.international, eligibility.ethiopian, tuition, stipend, duration, deadline, entry, english, separateApplication, supervisorContact, documents`.

## The six verdicts

Evaluated in this order — the first that applies wins:

| Verdict | Rule | Shown in |
|---|---|---|
| `not-eligible` | Non-UK; `restrictedTo` set; international or Ethiopian = `no`; applicant recorded she does not meet entry requirements | Archive |
| `shortfall` | Self-funded; coverage none/partial/home-only without full international; international fee = `no`; no stipend | Archive |
| `expired` | Deadline passed (or no deadline and start date passed) | Archive |
| `insufficient` | No official evidence at all, or ≥ 2 of 4 core facts (international, Ethiopian, international tuition, stipend provided) unconfirmed | Review queue |
| `potential` | Any remaining gap: one core fact, stipend amount, duration, deadline evidence, admissions-only deadline, unresolved discrepancy, stale verification, fixture | Review queue |
| `verified` | Everything confirmed by official evidence | **Primary results** |

## Example: adding a record

1. Read the official funding page and the programme page.
2. Fill every field you can confirm; leave the rest `"unknown"` / `null`.
3. Add one `evidence` item per confirmed gate fact, with the exact URL and, ideally, a short quote.
4. Add a `discrepancies` entry for anything two official pages disagree on.
5. Run `npm run validate-data && npm test`, then open a pull request.
