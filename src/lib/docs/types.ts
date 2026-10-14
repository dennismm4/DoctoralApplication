import type { DocKind, DocTarget, Opportunity, Profile, RequirementCoverage, TopicProposal } from '../../types'
import type { SourceFact } from './facts'

/** Everything a generator may use. Generators must not read anything else. */
export interface GenContext {
  kind: DocKind
  /** The approved master CV snapshot — never the live profile, never mutated. */
  profile: Profile
  facts: SourceFact[]
  op: Opportunity
  target: DocTarget
  wordLimit: number | null
  question?: string
  /** An approved research topic for this opportunity (or a general one), if any. */
  topic: TopicProposal | null
  /** She confirmed in the checklist that she meets the entry requirements. */
  entryConfirmed: boolean
  today: Date
}

export interface GenResult {
  content: string
  /** Change summary: what was prioritised and why. */
  changes: string[]
  /** Information she should add herself. */
  missing: string[]
  usedFactIds: string[]
  requirements: RequirementCoverage[]
  /** True when essential content alone exceeds the word limit. */
  over: boolean
}

export const ph = (what: string) => `[ADD: ${what}]`
