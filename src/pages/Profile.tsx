import { useState, type ReactNode } from 'react'
import { Button, Callout, Card, Field, Input, PageHeader, Progress, SectionTitle, Select, TextArea, cx } from '../components/ui'
import { CvImport } from '../components/CvImport'
import { completeness, RESEARCH_AREAS, uid } from '../lib/profile'
import { useStore } from '../lib/store'
import type { Achievement, Degree, Employment, Fact, LanguageTest, Profile, Project, Publication, Referee, Training } from '../types'

function Verify({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cx('inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs select-none', checked ? 'border-ok/40 bg-ok-50 text-ok' : 'border-line-strong text-muted')}>
      <input type="checkbox" className="accent-forest" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {checked ? 'Verified' : 'Mark verified'}
    </label>
  )
}

function FactField({ label, fact, onChange, multiline, placeholder }: { label: string; fact: Fact; onChange: (f: Fact) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <Verify checked={fact.verified} onChange={(verified) => onChange({ ...fact, verified })} />
      </div>
      {multiline ? (
        <TextArea rows={4} value={fact.value} placeholder={placeholder} onChange={(e) => onChange({ value: e.target.value, verified: false })} />
      ) : (
        <Input value={fact.value} placeholder={placeholder} onChange={(e) => onChange({ value: e.target.value, verified: false })} />
      )}
    </div>
  )
}

/** Generic repeatable-item editor. Editing any field clears "verified" so the applicant re-confirms. */
function ListEditor<T extends { id: string; verified: boolean }>({
  title, items, onChange, blank, fields, summary, note,
}: {
  title: string
  items: T[]
  onChange: (items: T[]) => void
  blank: () => T
  fields: { key: keyof T; label: string; wide?: boolean; placeholder?: string; multiline?: boolean; options?: { value: string; label: string }[] }[]
  summary: (t: T) => string
  note?: ReactNode
}) {
  const update = (id: string, patch: Partial<T>) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  return (
    <section>
      <SectionTitle aside={<Button size="sm" onClick={() => onChange([...items, blank()])}>+ Add</Button>}>{title}</SectionTitle>
      {note && <p className="-mt-1 mb-3 text-xs text-muted">{note}</p>}
      <div className="space-y-3">
        {items.length === 0 && <div className="rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-muted">None added.</div>}
        {items.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-medium">{summary(item) || 'New entry'}</div>
              <div className="flex items-center gap-2">
                <Verify checked={item.verified} onChange={(verified) => update(item.id, { verified } as Partial<T>)} />
                <button onClick={() => onChange(items.filter((x) => x.id !== item.id))} className="text-xs text-bad hover:underline">Remove</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={String(f.key)} label={f.label} className={f.wide ? 'sm:col-span-2' : ''}>
                  {f.options ? (
                    <Select value={String(item[f.key] ?? '')} onChange={(e) => update(item.id, { [f.key]: e.target.value, verified: false } as Partial<T>)}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : f.multiline ? (
                    <TextArea rows={2} value={String(item[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => update(item.id, { [f.key]: e.target.value, verified: false } as Partial<T>)} />
                  ) : (
                    <Input value={String(item[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => update(item.id, { [f.key]: e.target.value, verified: false } as Partial<T>)} />
                  )}
                </Field>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}

export default function ProfilePage() {
  const { profile, setProfile } = useStore()
  const set = (p: Partial<Profile>) => setProfile({ ...profile, ...p })
  const { percent, items } = completeness(profile)
  const [newInterest, setNewInterest] = useState('')
  return (
    <>
      <PageHeader eyebrow="Verified facts" title="Applicant Profile">
        This is the single source of truth for your applications. Generated documents use <strong>only</strong> entries you have marked <em>Verified</em>. Editing an entry clears its verification so you re-confirm it.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <SectionTitle>Identity & contact</SectionTitle>
            <Card className="grid gap-4 p-4 sm:grid-cols-2">
              <FactField label="Full name (as on passport)" fact={profile.fullName} onChange={(fullName) => set({ fullName })} />
              <FactField label="Email" fact={profile.email} onChange={(email) => set({ email })} />
              <FactField label="Phone" fact={profile.phone} onChange={(phone) => set({ phone })} />
              <FactField label="Nationality" fact={profile.nationality} onChange={(nationality) => set({ nationality })} />
              <FactField label="Country of residence" fact={profile.residence} onChange={(residence) => set({ residence })} />
            </Card>
          </section>

          <section>
            <SectionTitle>Target</SectionTitle>
            <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
              <div><span className="text-muted">Qualification:</span> {profile.targetQualification}</div>
              <div><span className="text-muted">Destination:</span> {profile.destination}</div>
              <div><span className="text-muted">Funding:</span> {profile.fundingRequirement}</div>
              <Field label="Status"><Input value={profile.status} onChange={(e) => set({ status: e.target.value })} /></Field>
            </Card>
          </section>

          <section>
            <SectionTitle>Research interests</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {profile.researchInterests.map((i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-forest/25 bg-forest-50 px-3 py-1 text-sm text-forest">
                  {i}
                  <button aria-label={`Remove ${i}`} onClick={() => set({ researchInterests: profile.researchInterests.filter((x) => x !== i) })} className="text-forest/60 hover:text-bad">✕</button>
                </span>
              ))}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = newInterest.trim(); if (v && !profile.researchInterests.includes(v)) set({ researchInterests: [...profile.researchInterests, v] }); setNewInterest('') }}>
              <Input value={newInterest} onChange={(e) => setNewInterest(e.target.value)} placeholder="Add an interest" list="interest-list" />
              <datalist id="interest-list">{RESEARCH_AREAS.map((r) => <option key={r} value={r} />)}</datalist>
              <Button type="submit">Add</Button>
            </form>
          </section>

          <ListEditor<Degree>
            title="Academic history"
            items={profile.degrees}
            onChange={(degrees) => set({ degrees })}
            note="Enter results exactly as they appear on your transcript (e.g. CGPA 3.6/4.0, “Great Distinction”). Do not convert to UK classes yourself."
            blank={() => ({ id: uid(), level: 'Other', title: '', institution: '', country: 'Ethiopia', graduationYear: '', classification: '', dissertation: '', verified: false })}
            summary={(d) => [d.title, d.institution].filter(Boolean).join(' — ')}
            fields={[
              { key: 'title', label: 'Degree' },
              { key: 'institution', label: 'Exact institution', placeholder: 'e.g. full university name, Addis Ababa' },
              { key: 'country', label: 'Country' },
              { key: 'graduationYear', label: 'Graduation year' },
              { key: 'classification', label: 'Result as on transcript', wide: true },
              { key: 'dissertation', label: 'Dissertation / thesis title', wide: true },
            ]}
          />

          <ListEditor<Employment>
            title="Employment & experience"
            items={profile.employment}
            onChange={(employment) => set({ employment })}
            blank={() => ({ id: uid(), role: '', organisation: '', location: '', start: '', end: '', summary: '', verified: false })}
            summary={(e) => [e.role, e.organisation].filter(Boolean).join(', ')}
            fields={[
              { key: 'role', label: 'Role' },
              { key: 'organisation', label: 'Organisation' },
              { key: 'location', label: 'Location' },
              { key: 'start', label: 'Start (e.g. 2021-03)' },
              { key: 'end', label: 'End (blank = present)' },
              { key: 'summary', label: 'What you did (facts only)', wide: true, multiline: true },
            ]}
          />

          <ListEditor<Project>
            title="Projects"
            items={profile.projects}
            onChange={(projects) => set({ projects })}
            note="Choose the type honestly: coursework is always labelled as coursework and is never presented as published or independent research."
            blank={() => ({ id: uid(), title: '', kind: 'coursework', context: '', role: '', year: '', description: '', verified: false })}
            summary={(x) => [x.title, x.kind].filter(Boolean).join(' — ')}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'kind', label: 'Type', options: [{ value: 'dissertation', label: 'Dissertation / thesis' }, { value: 'research', label: 'Research project (outside coursework)' }, { value: 'professional', label: 'Professional / work project' }, { value: 'coursework', label: 'Coursework project' }] },
              { key: 'context', label: 'Context (module, employer, funder)' },
              { key: 'year', label: 'Year' },
              { key: 'role', label: 'Your role', wide: true },
              { key: 'description', label: 'What you did and found (facts only)', wide: true, multiline: true },
            ]}
          />

          <ListEditor<Training>
            title="Training and certification"
            items={profile.training}
            onChange={(training) => set({ training })}
            blank={() => ({ id: uid(), title: '', provider: '', year: '', description: '', verified: false })}
            summary={(x) => [x.title, x.provider].filter(Boolean).join(', ')}
            fields={[{ key: 'title', label: 'Course or certificate' }, { key: 'provider', label: 'Provider' }, { key: 'year', label: 'Year' }, { key: 'description', label: 'Notes', wide: true }]}
          />

          <ListEditor<Achievement>
            title="Awards and achievements"
            items={profile.achievements}
            onChange={(achievements) => set({ achievements })}
            note="Only awards you actually received. Documents will never mention an award that is not listed and verified here."
            blank={() => ({ id: uid(), title: '', issuer: '', year: '', description: '', verified: false })}
            summary={(x) => [x.title, x.issuer].filter(Boolean).join(', ')}
            fields={[{ key: 'title', label: 'Award' }, { key: 'issuer', label: 'Awarded by' }, { key: 'year', label: 'Year' }, { key: 'description', label: 'What it was for', wide: true }]}
          />

          <section>
            <SectionTitle aside={<Button size="sm" onClick={() => set({ skills: [...profile.skills, { value: '', verified: false }] })}>+ Add</Button>}>Skills</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {profile.skills.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={s.value} placeholder="e.g. Stata, survey design" onChange={(e) => set({ skills: profile.skills.map((x, j) => (j === i ? { value: e.target.value, verified: false } : x)) })} />
                  <Verify checked={s.verified} onChange={(v) => set({ skills: profile.skills.map((x, j) => (j === i ? { ...x, verified: v } : x)) })} />
                  <button aria-label="Remove skill" className="text-xs text-bad" onClick={() => set({ skills: profile.skills.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {profile.skills.length === 0 && <div className="text-sm text-muted">None added.</div>}
            </div>
          </section>

          <ListEditor<Publication>
            title="Publications"
            items={profile.publications}
            onChange={(publications) => set({ publications })}
            note="Only real outputs. Coursework belongs under Projects. The status is always shown on your CV."
            blank={() => ({ id: uid(), citation: '', url: '', status: 'working-paper', verified: false })}
            summary={(p) => [p.citation, p.status].filter(Boolean).join(' — ')}
            fields={[
              { key: 'citation', label: 'Full citation', wide: true },
              { key: 'status', label: 'Status', options: [{ value: 'published', label: 'Published' }, { value: 'accepted', label: 'Accepted for publication' }, { value: 'under-review', label: 'Under review' }, { value: 'working-paper', label: 'Working paper' }, { value: 'conference-presentation', label: 'Conference presentation' }] },
              { key: 'url', label: 'Link / DOI' },
            ]}
          />

          <ListEditor<LanguageTest>
            title="Language qualifications"
            items={profile.languageTests}
            onChange={(languageTests) => set({ languageTests })}
            note="If your degrees were taught in English, some universities accept that as evidence — check each one. Don't enter a score until you have it."
            blank={() => ({ id: uid(), test: 'IELTS Academic', overall: '', components: '', date: '', verified: false })}
            summary={(t) => [t.test, t.overall].filter(Boolean).join(' — ')}
            fields={[
              { key: 'test', label: 'Test' },
              { key: 'overall', label: 'Overall score' },
              { key: 'components', label: 'Component scores' },
              { key: 'date', label: 'Test date' },
            ]}
          />

          <ListEditor<Referee>
            title="Referees"
            items={profile.referees}
            onChange={(referees) => set({ referees })}
            blank={() => ({ id: uid(), name: '', position: '', organisation: '', email: '', relationship: '', verified: false })}
            summary={(r) => [r.name, r.organisation].filter(Boolean).join(', ')}
            fields={[
              { key: 'name', label: 'Name' },
              { key: 'position', label: 'Position' },
              { key: 'organisation', label: 'Organisation' },
              { key: 'email', label: 'Email' },
              { key: 'relationship', label: 'Relationship (e.g. MSc supervisor)', wide: true },
            ]}
          />

          <section>
            <SectionTitle>Research experience & motivation</SectionTitle>
            <Card className="space-y-4 p-4">
              <FactField label="Research experience — dissertation topic, methods, findings" fact={profile.researchExperience} onChange={(researchExperience) => set({ researchExperience })} multiline />
              <FactField label="Motivation — why a PhD, why this field (your own words; used verbatim in letters)" fact={profile.motivation} onChange={(motivation) => set({ motivation })} multiline placeholder="A specific experience or question that led you here — not a general statement of passion." />
              <FactField label="Plans after the PhD (your own words)" fact={profile.careerPlans} onChange={(careerPlans) => set({ careerPlans })} multiline />
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <Card className="p-5 lg:sticky lg:top-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg">Completeness</h2>
              <span className="font-mono text-sm tabular">{percent}%</span>
            </div>
            <div className="mt-2"><Progress value={percent} /></div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {items.map((i) => (
                <li key={i.label} className={i.done ? 'text-ok' : ''}>
                  {i.done ? '✓' : '○'} {i.label}
                  {!i.done && <div className="ml-4 text-xs text-muted">{i.hint}</div>}
                </li>
              ))}
            </ul>
          </Card>

          <CvImport />

          <Callout tone="neutral" title="Why “verified”?">
            Admissions panels check claims against transcripts and references. Marking an entry verified means <em>you</em> have checked it against your documents. The app will not fill gaps with assumptions — missing facts appear as <code className="font-mono text-xs">[ADD: …]</code> in drafts.
          </Callout>
        </aside>
      </div>
    </>
  )
}
