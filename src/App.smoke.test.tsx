// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import { testMaster, testProfile } from './lib/docs/testProfile'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}

let root: Root | null = null
let el: HTMLDivElement
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  localStorage.clear()
})

function render(hash: string) {
  window.location.hash = hash
  el = document.createElement('div')
  document.body.appendChild(el)
  act(() => {
    root = createRoot(el)
    root.render(<App />)
  })
  return el.textContent ?? ''
}

describe('every page renders', () => {
  const pages: [string, RegExp][] = [
    ['#/', /Verified fully funded/],
    ['#/find', /Verified fully funded PhDs/],
    ['#/review', /Review queue/],
    ['#/opportunity/york-esrc-wrdtp-2027', /Eligibility & funding gate/],
    ['#/opportunity/commonwealth-phd-2027', /Ethiopian nationals are not eligible/],
    ['#/opportunity/leeds-esrc-wrdtp-2027', /Manual verification checklist/],
    ['#/applications', /My Applications/],
    ['#/profile', /Applicant Profile/],
    ['#/topics', /Research Topic Workshop/],
    ['#/documents', /Master CV/],
    ['#/archive', /Funding shortfall/],
    ['#/data', /Funding sources monitored/],
  ]
  for (const [hash, text] of pages) it(hash, () => expect(render(hash)).toMatch(text))
})

describe('result separation', () => {
  it('primary results contain only verified records', () => {
    const t = render('#/find')
    expect(t).toMatch(/University of York/)
    expect(t).toMatch(/Gates Cambridge/)
    expect(t).not.toMatch(/ESRC White Rose DTP studentships 2027\/28 \(University of Leeds\)/)
    expect(t).not.toMatch(/Commonwealth PhD Scholarships 2027/)
  })
  it('the review queue holds potential and insufficient-evidence records', () => {
    const t = render('#/review')
    expect(t).toMatch(/University of Leeds/)
    expect(t).toMatch(/Midlands Graduate School/)
    expect(t).toMatch(/To confirm:/)
  })
  it('a manual confirmation with an official URL promotes a record', () => {
    localStorage.setItem(
      'doctoral-compass:v1',
      JSON.stringify({
        checks: {
          'leeds-esrc-wrdtp-2027': [{ key: 'tuition', value: 'yes', url: 'https://phd.leeds.ac.uk/example-written-confirmation', note: 'Doctoral College email', checkedAt: '2026-10-14T18:00:00Z' }],
        },
      }),
    )
    expect(render('#/find')).toMatch(/University of Leeds/)
  })
})

describe('documents studio', () => {
  it('asks for an approved master CV before generating anything', () => {
    const t = render('#/documents?op=gates-cambridge-2027&kind=cv&new=1')
    expect(t).toMatch(/Approve your master CV first/)
    expect(t).toMatch(/Demo mode — template drafting, no AI/)
  })

  it('Tailor my CV generates a reviewed draft from the approved master CV', async () => {
    const profile = testProfile()
    localStorage.setItem('doctoral-compass:v1', JSON.stringify({ profile, masterCv: testMaster(profile) }))
    window.location.hash = '#/documents?op=gates-cambridge-2027&kind=cv&new=1'
    el = document.createElement('div')
    document.body.appendChild(el)
    await act(async () => {
      root = createRoot(el)
      root.render(<App />)
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    const t = el.textContent ?? ''
    expect(window.location.hash).toMatch(/#\/documents\/[a-z0-9]+/)
    expect(t).toMatch(/Tailored CV/)
    expect(t).toMatch(/University of Cambridge/)
    expect(t).toMatch(/Factual check/)
    expect(t).toMatch(/Requirements addressed/)
    expect(t).toMatch(/Source facts used/)
    expect(t).toMatch(/What was prioritised and why/)
    expect(el.querySelector('textarea[aria-label="Draft content"]')?.textContent).toMatch(/TEST APPLICANT/)
  })

  it('offers only documents relevant to the opportunity', () => {
    const profile = testProfile()
    localStorage.setItem('doctoral-compass:v1', JSON.stringify({ profile, masterCv: testMaster(profile) }))
    const t = render('#/documents?op=lse-phd-studentship-2027')
    expect(t).toMatch(/No separate scholarship application for this award/)
    expect(t).toMatch(/No published selection criteria recorded/)
  })
})
