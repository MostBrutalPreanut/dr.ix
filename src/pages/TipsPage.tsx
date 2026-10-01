import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { backend, idPrefix, newId, useCollection } from '../lib/db';
import { WEEKDAY_NAMES, addDays, formatLongDate, formatTime, weekdayOf } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { dayTips, fullShiftHours, monthDays, totalsByPerson } from '../lib/tips';
import type { DayTips } from '../lib/tips';
import type { TipEntry, TipWorkerDoc } from '../lib/types';

const money = (n: number) => `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`));

const shortDate = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

/**
 * Employees only ENTER tips (an amount, and who worked). The totals and the split are for managers:
 * the server does not even hand the amounts to a non-manager (collection tipEntries is manager-read).
 */
export default function TipsPage() {
  const { user, isManager } = useAuth();
  if (!user) return null;
  return isManager ? <ManagerTips /> : <StaffTips />;
}

// ---------------------------------------------------------------- shared pieces

function DayNav({ date, today, back, onChange }: { date: string; today: string; back: number; onChange(d: string): void }) {
  return (
    <div className="row between">
      <button type="button" className="small" disabled={date <= addDays(today, -back)} onClick={() => onChange(addDays(date, -1))} aria-label="היום הקודם">→</button>
      <strong>
        יום {WEEKDAY_NAMES[weekdayOf(date)]} · {formatLongDate(date)}
      </strong>
      <button type="button" className="small" disabled={date >= today} onClick={() => onChange(addDays(date, 1))} aria-label="היום הבא">←</button>
    </div>
  );
}

function AmountForm({ onAdd }: { onAdd(amount: number): Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Math.round(Number(amount.replace(',', '.')) * 100) / 100;
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!(n > 0) || busy) return;
        setBusy(true);
        void onAdd(n)
          .then(() => setAmount(''))
          .finally(() => setBusy(false));
      }}
    >
      <input
        style={{ flex: 1 }}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        placeholder="סכום הטיפים"
        aria-label="סכום טיפים"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" className="primary" disabled={!(n > 0) || busy}>
        הוסף
      </button>
    </form>
  );
}

/** Who worked that day (names and hours only - no money here). */
function WorkersPicker({ date, hint }: { date: string; hint: string }) {
  const { user, employees } = useAuth();
  const workers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(date));
  const [error, setError] = useState('');
  const fullShift = fullShiftHours(weekdayOf(date));
  const doc = (id: string) => workers.items.find((w) => w.employeeId === id);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setError('');
    } catch {
      setError('השמירה נכשלה - בדקו חיבור ונסו שוב');
    }
  }
  const toggle = (id: string) =>
    guard(async () => {
      const cur = doc(id);
      if (cur) await workers.remove(cur.id);
      else await workers.save({ id: `${date}|${id}`, date, employeeId: id, by: user!.id, at: new Date().toISOString() });
    });
  const patch = (w: TipWorkerDoc, p: Partial<TipWorkerDoc>) => {
    const next: TipWorkerDoc = { ...w, ...p, by: user!.id, at: new Date().toISOString() };
    if (!next.reinforcement) {
      delete next.reinforcement;
      delete next.hours;
    }
    return guard(() => workers.save(next));
  };

  return (
    <section className="card form">
      <h2>מי עבד ({workers.items.length})</h2>
      <p className="muted small-text">{hint} מתגבר/ת: מסמנים ורושמים כמה שעות עבד/ה (משמרת מלאה היא {fullShift} שעות).</p>
      {error && <p className="banner-warn" role="alert">{error}</p>}
      <div className="chips">
        {[...employees]
          .sort((a, b) => a.name.localeCompare(b.name, 'he'))
          .map((e) => {
            const on = Boolean(doc(e.id));
            return (
              <button key={e.id} type="button" className={`chip pick${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void toggle(e.id)}>
                {e.name}
              </button>
            );
          })}
      </div>
      {workers.items.map((w) => (
        <div key={w.id} className="li emp">
          <span className="li-body">
            <strong>{nameOf(w.employeeId)}</strong>
          </span>
          <label className="inline check">
            <input type="checkbox" checked={Boolean(w.reinforcement)} onChange={(e) => void patch(w, { reinforcement: e.target.checked, hours: e.target.checked ? (w.hours ?? 4) : undefined })} />
            <span>מתגבר/ת</span>
          </label>
          {w.reinforcement && (
            <label className="inline">
              <span>שעות</span>
              <input
                className="age"
                type="number"
                inputMode="decimal"
                min={0.5}
                max={fullShift}
                step="0.5"
                value={w.hours ?? ''}
                onChange={(e) => void patch(w, { hours: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- employees: enter only

function StaffTips() {
  const { user } = useAuth();
  const today = useBusinessDate();
  const [date, setDate] = useState(today);
  // what this person added in this visit, so a typing mistake can be undone (they never see the day's total)
  const [added, setAdded] = useState<{ id: string; amount: number; date: string; at: string }[]>([]);
  const [error, setError] = useState('');

  async function add(amount: number) {
    const id = `${date}|${newId()}`;
    const at = new Date().toISOString();
    try {
      await backend.upsert('tipEntries', { id, date, amount, by: user!.id, at } as TipEntry);
      setAdded((a) => [...a, { id, amount, date, at }]);
      setError('');
    } catch {
      setError('השמירה נכשלה - בדקו חיבור ונסו שוב');
    }
  }
  async function undo(id: string) {
    try {
      await backend.remove('tipEntries', id);
      setAdded((a) => a.filter((x) => x.id !== id));
    } catch {
      setError('הביטול נכשל - פנו למנהל');
    }
  }

  return (
    <>
      <h1>💰 טיפים</h1>
      <p className="muted">בסוף המשמרת מזינים את סכום הטיפים ומסמנים מי עבד. החישוב וההפרשה אצל ההנהלה.</p>
      {error && <p className="banner-warn" role="alert">{error}</p>}
      <DayNav date={date} today={today} back={1} onChange={setDate} />

      <section className="card form">
        <h2>הוספת סכום</h2>
        <AmountForm onAdd={add} />
        {added.map((a) => (
          <div key={a.id} className="li emp">
            <span className="li-body">
              <strong>✓ נוסף {money(a.amount)}</strong>
              <span className="muted small-text">
                {shortDate(a.date)} · {formatTime(a.at)}
              </span>
            </span>
            <button type="button" className="small danger" onClick={() => void undo(a.id)}>
              בטל
            </button>
          </div>
        ))}
      </section>

      <WorkersPicker date={date} hint="מסמנים את כל מי שעבד באותו יום." />
    </>
  );
}

// ---------------------------------------------------------------- managers: everything

function csvOf(days: DayTips[], nameOf: (id: string) => string): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['תאריך', 'יום', 'סה"כ טיפים ליום', 'עובד/ת', 'מתגבר/ת', 'שעות', 'חלק'].map(q).join(',')];
  for (const d of [...days].reverse()) {
    if (d.workers.length === 0) rows.push([d.date, WEEKDAY_NAMES[weekdayOf(d.date)], d.total, '(אין עובדים מסומנים)', '', '', ''].map(q).join(','));
    for (const w of d.workers)
      rows.push([d.date, WEEKDAY_NAMES[weekdayOf(d.date)], d.total, nameOf(w.id), w.reinforcement ? 'כן' : '', w.reinforcement ? (w.hours ?? '') : '', d.shares[w.id] ?? 0].map(q).join(','));
  }
  return rows.join('\r\n');
}

function ManagerTips() {
  const { user, employees } = useAuth();
  const today = useBusinessDate();
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [error, setError] = useState('');
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';

  const dayEntries = useCollection<TipEntry>('tipEntries', undefined, idPrefix(date));
  const dayWorkers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(date));
  const monthEntries = useCollection<TipEntry>('tipEntries', undefined, idPrefix(month));
  const monthWorkers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(month));

  const day = useMemo(() => dayTips(date, dayEntries.items, dayWorkers.items, weekdayOf(date)), [date, dayEntries.items, dayWorkers.items]);
  const days = useMemo(() => monthDays(monthEntries.items, monthWorkers.items, weekdayOf), [monthEntries.items, monthWorkers.items]);
  const totals = useMemo(() => totalsByPerson(days), [days]);
  const monthTotal = days.reduce((n, d) => n + d.total, 0);
  const undivided = days.filter((d) => d.total > 0 && d.workers.length === 0);

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setError('');
    } catch {
      setError('השמירה נכשלה - בדקו חיבור ונסו שוב');
    }
  }

  function download() {
    const blob = new Blob(['﻿' + csvOf(days, nameOf)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tips-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function summaryText(): string {
    const lines = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${nameOf(id)}: ${v}`);
    return [`טיפים ${monthLabel(month)}`, ...lines, `סה"כ: ${monthTotal}`].join('\n');
  }

  return (
    <>
      <h1>💰 טיפים</h1>
      {error && <p className="banner-warn" role="alert">{error}</p>}
      <DayNav date={date} today={today} back={400} onChange={setDate} />

      <section className="card form">
        <h2>
          היום שנבחר: {money(day.total)}
        </h2>
        <AmountForm
          onAdd={(amount) => guard(() => dayEntries.save({ id: `${date}|${newId()}`, date, amount, by: user!.id, at: new Date().toISOString() }))}
        />
        {dayEntries.items
          .slice()
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((e) => (
            <div key={e.id} className="li emp">
              <span className="li-body">
                <strong>{money(e.amount)}</strong>
                <span className="muted small-text">
                  {nameOf(e.by)} · {formatTime(e.at)}
                </span>
              </span>
              <button
                type="button"
                className="small danger"
                onClick={() => {
                  if (confirm(`למחוק את הסכום ${money(e.amount)}?`)) void guard(() => dayEntries.remove(e.id));
                }}
              >
                מחק
              </button>
            </div>
          ))}
        {day.workers.length > 0 && day.total > 0 && (
          <p className="muted small-text">
            חלוקה: {day.workers.map((w) => `${nameOf(w.id)} ${money(day.shares[w.id])}`).join(' · ')}
          </p>
        )}
      </section>

      <WorkersPicker date={date} hint="כל מי שמסומן מקבל חלק שווה." />

      <section>
        <div className="row between">
          <button type="button" className="small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="חודש קודם">→</button>
          <h2>{monthLabel(month)}</h2>
          <button type="button" className="small" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="חודש הבא">←</button>
        </div>

        <h3 className="cat">סיכום לפי עובד</h3>
        <div className="card list">
          {Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .map(([id, v]) => (
              <div key={id} className="li emp">
                <span className="li-body">
                  <strong>{nameOf(id)}</strong>
                  <span className="muted small-text">{days.filter((d) => d.shares[id] !== undefined).length} ימי עבודה</span>
                </span>
                <strong>{money(v)}</strong>
              </div>
            ))}
          {Object.keys(totals).length === 0 && <p className="muted empty">אין נתונים לחודש הזה.</p>}
        </div>
        <p>
          <strong>סה״כ טיפים בחודש: {money(monthTotal)}</strong>
        </p>
        {undivided.length > 0 && (
          <p className="banner-warn">
            ימים עם טיפים אבל בלי עובדים מסומנים (לא חולקו): {undivided.map((d) => shortDate(d.date)).join(', ')}
          </p>
        )}
        <div className="row">
          <button type="button" className="primary" disabled={days.length === 0} onClick={download}>
            הורד פירוט לאקסל
          </button>
          <button type="button" disabled={days.length === 0} onClick={() => void navigator.clipboard?.writeText(summaryText()).catch(() => window.prompt('העתיקו:', summaryText()))}>
            העתק סיכום
          </button>
        </div>

        <h3 className="cat">פירוט לפי יום</h3>
        {days.map((d) => (
          <article key={d.date} className="card">
            <div className="row between">
              <strong>
                {shortDate(d.date)} · יום {WEEKDAY_NAMES[weekdayOf(d.date)]}
              </strong>
              <strong>{money(d.total)}</strong>
            </div>
            {d.workers.length === 0 ? (
              <span className="muted small-text">אין עובדים מסומנים</span>
            ) : (
              <span className="muted small-text block">
                {d.workers
                  .map((w) => `${nameOf(w.id)}${w.reinforcement ? ` (מתגבר ${w.hours ?? '?'} ש׳)` : ''} ${money(d.shares[w.id] ?? 0)}`)
                  .join(' · ')}
              </span>
            )}
            <button type="button" className="small" onClick={() => setDate(d.date)}>
              פתח את היום
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
