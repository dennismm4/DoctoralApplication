import { useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { cx } from './components/ui'
import Dashboard from './pages/Dashboard'
import Find from './pages/Find'
import Details from './pages/Details'
import Applications from './pages/Applications'
import ProfilePage from './pages/Profile'
import Topics from './pages/Topics'
import Documents from './pages/Documents'
import DocumentReview from './pages/DocumentReview'
import Archive from './pages/Archive'
import Review from './pages/Review'
import { AlertNotifier } from './components/DeadlineAlerts'
import DataPage from './pages/DataPage'

const NAV = [
  { to: '/', label: 'Dashboard', n: '01' },
  { to: '/find', label: 'Verified PhDs', n: '02' },
  { to: '/review', label: 'Review Queue', n: '03' },
  { to: '/applications', label: 'My Applications', n: '04' },
  { to: '/profile', label: 'Applicant Profile', n: '05' },
  { to: '/topics', label: 'Topic Workshop', n: '06' },
  { to: '/documents', label: 'Documents Studio', n: '07' },
  { to: '/archive', label: 'Archive', n: '08' },
  { to: '/data', label: 'Data & Sources', n: '09' },
]

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--color-forest)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#f4efe4" strokeWidth="1.6" />
      <path d="M16 8.5 L18.4 16 L16 23.5 L13.6 16 Z" fill="#c9a24a" />
    </svg>
  )
}

function Shell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const { settings, storageOk } = useStore()
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) =>
            cx(
              'flex items-baseline gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <span className="font-mono text-[10px] text-[#c9a24a]">{n.n}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-forest px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Mark />
          <div>
            <div className="font-serif text-lg leading-none text-white">Doctoral Compass</div>
            <div className="mt-1 font-mono text-[10px] tracking-widest text-white/50 uppercase">UK · Fully funded</div>
          </div>
        </div>
        {nav}
        <div className="mt-auto space-y-2 px-2 text-[11px] leading-relaxed text-white/50">
          <p>{settings.apiBase ? 'Backend connected for drafting.' : 'Demo mode: drafts use local templates, not AI.'}</p>
          <p>Your data stays in this browser.</p>
        </div>
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-forest-700 bg-forest px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="font-serif text-lg text-white">Doctoral Compass</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white" aria-expanded={open} aria-controls="mobile-nav">
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="sticky top-[57px] z-30 bg-forest px-3 pb-4 lg:hidden">
          {nav}
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">
          {!storageOk && (
            <div className="mb-4 rounded-md border border-bad/30 bg-bad-50 px-4 py-2 text-sm text-bad">
              Browser storage is unavailable (private mode or blocked). Changes will be lost when you close this tab — export a backup from Data & Privacy.
            </div>
          )}
          <AlertNotifier />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/find" element={<Find />} />
            <Route path="/review" element={<Review />} />
            <Route path="/opportunity/:id" element={<Details />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/:id" element={<DocumentReview />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  )
}
