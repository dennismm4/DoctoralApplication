import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useEffect } from 'react'
import type { Assessment, GateState, Opportunity, Tri, Verdict } from '../types'
import { VERDICT_LABEL } from '../lib/eligibility'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-forest text-white hover:bg-forest-700 border-forest',
    accent: 'bg-ochre text-white hover:brightness-110 border-ochre',
    secondary: 'bg-surface text-ink border-line-strong hover:border-forest hover:text-forest',
    ghost: 'bg-transparent text-forest border-transparent hover:bg-forest-50',
    danger: 'bg-surface text-bad border-bad/40 hover:bg-bad-50',
  }
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        styles[variant],
        className,
      )}
    />
  )
}

export function LinkOut({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  if (!href) return <span className="text-sm text-muted italic">No official link</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx('text-forest underline decoration-line-strong underline-offset-2 hover:decoration-forest', className)}>
      {children}
      <span aria-hidden> ↗</span>
    </a>
  )
}

type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'forest' | 'ochre'
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t: Record<Tone, string> = {
    ok: 'bg-ok-50 text-ok border-ok/25',
    warn: 'bg-warn-50 text-warn border-warn/25',
    bad: 'bg-bad-50 text-bad border-bad/25',
    neutral: 'bg-paper text-muted border-line',
    forest: 'bg-forest-50 text-forest border-forest/20',
    ochre: 'bg-ochre-50 text-ochre border-ochre/25',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', t[tone], className)}>{children}</span>
}

const VERDICT_TONE: Record<Verdict, Tone> = { verified: 'ok', potential: 'warn', insufficient: 'neutral', shortfall: 'bad', 'not-eligible': 'bad', expired: 'neutral' }
const VERDICT_ICON: Record<Verdict, string> = { verified: '●', potential: '◐', insufficient: '?', shortfall: '£', 'not-eligible': '✕', expired: '○' }
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <Badge tone={VERDICT_TONE[verdict]}>
      <span aria-hidden>{VERDICT_ICON[verdict]}</span> {VERDICT_LABEL[verdict]}
    </Badge>
  )
}

export function TriText({ value, yes = 'Yes', no = 'No', unknown = 'Not verified' }: { value: Tri; yes?: string; no?: string; unknown?: string }) {
  if (value === 'yes') return <span className="font-medium text-ok">✓ {yes}</span>
  if (value === 'no') return <span className="font-medium text-bad">✕ {no}</span>
  return <span className="font-medium text-warn">? {unknown}</span>
}

export function GateText({ state, confirmed = 'Confirmed', failed = 'Fails', unconfirmed = 'Not confirmed' }: { state: GateState; confirmed?: string; failed?: string; unconfirmed?: string }) {
  if (state === 'confirmed') return <span className="font-medium text-ok">✓ {confirmed}</span>
  if (state === 'failed') return <span className="font-medium text-bad">✕ {failed}</span>
  return <span className="font-medium text-warn">? {unconfirmed}</span>
}

/** Three-segment funding indicator driven by the evidence gate: international tuition · stipend · duration. */
export function FundingMeter({ op, a, compact }: { op: Opportunity; a: Assessment; compact?: boolean }) {
  const segs: { label: string; state: GateState; detail: string }[] = [
    { label: 'Intl tuition', state: a.gate.tuition, detail: a.gate.tuition === 'confirmed' ? 'Covered in full' : a.gate.tuition === 'failed' ? 'Shortfall' : 'Not confirmed' },
    {
      label: 'Stipend',
      state: a.gate.stipend,
      detail: a.gate.stipend === 'failed' ? 'None' : op.stipend.amount != null ? `£${op.stipend.amount.toLocaleString('en-GB')}/${op.stipend.frequency === 'per month' ? 'mo' : 'yr'}` : 'Amount unconfirmed',
    },
    { label: 'Duration', state: a.gate.duration, detail: op.durationYears != null ? `${op.durationYears} yrs` : 'Not confirmed' },
  ]
  const color = { confirmed: 'bg-ok', unconfirmed: 'bg-warn/50', failed: 'bg-bad' }
  return (
    <div className="w-full" aria-label="Funding coverage">
      <div className="flex gap-1">
        {segs.map((s) => (
          <div key={s.label} className={cx('h-1.5 flex-1 rounded-full', color[s.state])} />
        ))}
      </div>
      {!compact && (
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] leading-tight">
          {segs.map((s) => (
            <div key={s.label}>
              <div className="text-muted uppercase tracking-wide">{s.label}</div>
              <div className={cx('font-medium tabular', s.state === 'confirmed' ? 'text-ok' : s.state === 'failed' ? 'text-bad' : 'text-warn')}>{s.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ScoreRing({ score, muted }: { score: number; muted?: boolean }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-10 w-10 shrink-0" title={`Match score ${score}/100`} aria-label={`Match score ${score} out of 100`}>
      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={muted ? 'var(--color-line-strong)' : 'var(--color-forest)'} strokeWidth="3" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium tabular">{score}</span>
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border border-line bg-surface', className)}>{children}</div>
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 font-mono text-[11px] tracking-[0.14em] text-ochre uppercase">{eyebrow}</div>}
        <h1 className="text-3xl leading-tight font-medium text-ink sm:text-[2.1rem]">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-sm text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-medium">{children}</h2>
      {aside}
    </div>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-muted/70 focus:border-forest focus:outline-none'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'leading-relaxed', p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, 'pr-7', p.className)} />

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <div className="font-serif text-lg">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-xl">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Callout({ tone = 'neutral', title, children }: { tone?: 'neutral' | 'warn' | 'ok' | 'bad'; title?: string; children: ReactNode }) {
  const t = { neutral: 'border-line bg-surface', warn: 'border-warn/30 bg-warn-50', ok: 'border-ok/30 bg-ok-50', bad: 'border-bad/30 bg-bad-50' }
  return (
    <div className={cx('rounded-md border px-4 py-3 text-sm', t[tone])}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      <div className="text-ink/85">{children}</div>
    </div>
  )
}

export function DeadlineText({ a }: { a: Assessment }) {
  if (!a.deadline) return <span className="text-warn">Deadline not verified</span>
  const date = a.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
  if (a.daysToDeadline == null || a.daysToDeadline < 0) return <span className="text-muted tabular">Closed {date}</span>
  const tone = a.daysToDeadline <= 14 ? 'text-bad' : a.daysToDeadline <= 45 ? 'text-warn' : 'text-ink'
  return (
    <span className={cx('tabular', tone)}>
      {date} <span className="text-muted">· {a.daysToDeadline}d</span>
    </span>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${value}%` }} />
    </div>
  )
}
