import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { downloadIcs, slug } from '../lib/exporter'
import { useStore } from '../lib/store'
import { useAssessed, useDeadlineAlerts, type DeadlineAlert } from '../lib/useAssessed'
import { Badge, Button, Card, cx } from './ui'

const LEVEL = {
  urgent: { cls: 'border-l-bad', badge: 'bad' as const, text: '≤ 7 days' },
  soon: { cls: 'border-l-warn', badge: 'warn' as const, text: '≤ 21 days' },
  upcoming: { cls: 'border-l-forest', badge: 'forest' as const, text: '≤ 45 days' },
}

export function DeadlineAlerts({ limit = 8 }: { limit?: number }) {
  const items = useAssessed()
  const alerts = useDeadlineAlerts(items)
  const { dismissAlert, settings, setSettings } = useStore()
  const canNotify = typeof window !== 'undefined' && 'Notification' in window

  const enable = async () => {
    if (!canNotify) return
    const perm = await Notification.requestPermission()
    setSettings({ browserAlerts: perm === 'granted' })
  }

  return (
    <Card>
      {alerts.length === 0 ? (
        <p className="p-5 text-sm text-muted">No scholarship, admissions or internal deadlines in the next 45 days.</p>
      ) : (
        <ul className="divide-y divide-line">
          {alerts.slice(0, limit).map((al) => (
            <AlertRow key={al.id} al={al} onDismiss={() => dismissAlert(al.id)} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
        <span>Covers verified and review-queue opportunities. Use .ics files for phone/calendar reminders.</span>
        {canNotify &&
          (settings.browserAlerts ? (
            <button className="text-forest underline" onClick={() => setSettings({ browserAlerts: false })}>Browser alerts on — turn off</button>
          ) : (
            <button className="text-forest underline" onClick={enable}>Alert me when I open the app</button>
          ))}
      </div>
    </Card>
  )
}

function AlertRow({ al, onDismiss }: { al: DeadlineAlert; onDismiss: () => void }) {
  const l = LEVEL[al.level]
  return (
    <li className={cx('flex flex-col gap-2 border-l-4 px-4 py-3 sm:flex-row sm:items-center', l.cls)}>
      <div className="w-24 shrink-0">
        <div className="font-serif text-2xl leading-none tabular">{al.days}<span className="ml-0.5 text-sm text-muted">d</span></div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">{al.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}</div>
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/opportunity/${al.op.id}`} className="block truncate text-sm font-medium hover:underline">{al.op.university.split('(')[0]} — {al.op.scholarshipName}</Link>
        <div className="truncate text-xs text-muted">{al.label}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge tone={l.badge}>{l.text}</Badge>
          {al.saved && <Badge tone="forest">Saved</Badge>}
          {al.prep === 'tight' && <Badge tone="warn">Prep tight</Badge>}
          {al.prep === 'too-late' && <Badge tone="bad">Prep very tight</Badge>}
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => downloadIcs(`${slug(al.op.university)}-${al.date.toISOString().slice(0, 10)}.ics`, `${al.label}: ${al.op.scholarshipName}`, al.date, al.op.title)}>.ics</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss alert">Dismiss</Button>
      </div>
    </li>
  )
}

/** Shows one browser notification per session for deadlines within 7 days, if the applicant enabled it. */
export function AlertNotifier() {
  const items = useAssessed()
  const alerts = useDeadlineAlerts(items)
  const { settings } = useStore()
  useEffect(() => {
    if (!settings.browserAlerts || !('Notification' in window) || Notification.permission !== 'granted') return
    const urgent = alerts.filter((a) => a.level === 'urgent')
    if (!urgent.length) return
    try {
      if (sessionStorage.getItem('dc-notified')) return
      sessionStorage.setItem('dc-notified', '1')
    } catch {
      /* storage unavailable — still notify once per render cycle */
    }
    new Notification('Doctoral Compass — deadlines this week', {
      body: urgent.slice(0, 3).map((a) => `${a.days}d: ${a.op.scholarshipName} (${a.label})`).join('\n'),
    })
  }, [alerts, settings.browserAlerts])
  return null
}
