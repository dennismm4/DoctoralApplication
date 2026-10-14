import type { MasterCv, Profile, TopicProposal } from '../../types'
import { defaultProfile } from '../profile'
import { fingerprint } from './facts'

/**
 * TEST FIXTURE — a fictional applicant used only by the automated tests.
 * Every value here is invented for testing and is not about any real person.
 */
export function testProfile(): Profile {
  const p = defaultProfile()
  p.fullName = { value: 'Test Applicant', verified: true }
  p.email = { value: 'applicant@example.org', verified: true }
  p.degrees = [
    { id: 'b', level: 'Bachelor', title: 'BSc in Economics', institution: 'Example University, Addis Ababa', country: 'Ethiopia', graduationYear: '2017', classification: 'CGPA 3.45/4.00', dissertation: '', verified: true },
    { id: 'm', level: 'Master', title: 'MSc in Project Management', institution: 'Sample Institute, Addis Ababa', country: 'Ethiopia', graduationYear: '2021', classification: 'CGPA 3.71/4.00', dissertation: 'Delays in agricultural development projects: a case study', verified: true },
  ]
  p.employment = [
    { id: 'e1', role: 'Project Officer', organisation: 'Example Food Programme', location: 'Addis Ababa', start: '2021-09', end: '', summary: 'Coordinated monitoring visits to grain storage sites. Prepared monthly progress reports for donors. Liaised with farmer cooperatives on post-harvest handling.', verified: true },
    { id: 'e2', role: 'Bank Teller', organisation: 'Sample Bank', location: 'Addis Ababa', start: '2017-08', end: '2019-06', summary: 'Handled customer transactions.', verified: true },
    { id: 'e3', role: 'Unverified Consultant', organisation: 'Hidden Ltd', location: '', start: '2020', end: '2021', summary: 'Should never appear.', verified: false },
  ]
  p.projects = [
    { id: 'p1', title: 'Supply chain mapping of teff markets', kind: 'coursework', context: 'MSc module on operations', role: '', year: '2020', description: 'Mapped actors in the teff supply chain from farm to retail.', verified: true },
  ]
  p.skills = [
    { value: 'Monitoring and evaluation', verified: true },
    { value: 'Supply chain analysis', verified: true },
    { value: 'Report writing', verified: true },
    { value: 'Stata', verified: false },
  ]
  p.languageTests = [{ id: 'l1', test: 'IELTS Academic', overall: '7.0', components: 'no band below 6.5', date: '2026-03', verified: true }]
  p.referees = [
    { id: 'r1', name: 'Dr Example One', position: 'Senior Lecturer', organisation: 'Sample Institute', email: 'one@example.org', relationship: 'MSc supervisor', verified: true },
    { id: 'r2', name: 'Ms Example Two', position: 'Programme Manager', organisation: 'Example Food Programme', email: 'two@example.org', relationship: 'Line manager', verified: true },
  ]
  p.researchExperience = { value: 'My MSc dissertation used interviews with project managers to examine causes of delay in agricultural projects. I coded the interview transcripts thematically.', verified: true }
  p.motivation = { value: 'Seeing grain lost in storage while nearby households faced shortages made me want to understand how supply chains in Ethiopia can be organised to reduce food waste.', verified: true }
  p.careerPlans = { value: 'After the PhD I intend to work on food-system policy research in Ethiopia.', verified: true }
  return p
}

export function testMaster(p: Profile = testProfile()): MasterCv {
  return { approvedAt: '2026-10-14T18:00:00Z', snapshot: structuredClone(p), fingerprint: fingerprint(p), sourceFileName: null }
}

export const testTopic: TopicProposal = {
  id: 't1',
  opportunityId: null,
  title: 'Post-harvest loss and food waste across smallholder-to-market supply chains in Ethiopia',
  questions: ['Where along selected value chains are losses concentrated, and why?', 'Which coordination mechanisms reduce loss?'],
  rationale: 'Food loss between farm and market undermines both food security and farmer incomes.',
  contribution: 'Evidence on organisational levers for loss reduction.',
  themes: ['food waste reduction'],
  status: 'approved',
  approvedAt: '2026-10-14T18:00:00Z',
  conceptNote: null,
}
