import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { idPrefix, newId, useCollection } from '../lib/db';
import { WEEKDAY_NAMES, addDays, formatLongDate, formatTime, weekdayOf } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { dayTips, fullShiftHours, monthDays, totalsByPerson } from '../lib/tips';
import type { TipEntry, TipWorkerDoc } from '../lib/types';

const money = (n: number) => `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`));

export default function TipsPage() {
  const { user, isManager, employees } = useAuth();
  const today = useBusinessDate();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [error, setError] = useState('');
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';

  const dayEntries = useCollection<TipEntry>('tipEntries', undefined, idPrefix(date));
  const dayWorkers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(date));
  const monthEntries = useCollection<TipEntry>('tipEntries', undefined, idPrefix(month));
  const monthWorkers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(month));

  const day = useMemo(
    () => dayTips(date, dayEntries.items, dayWorkers.items, weekdayOf(date)),
    [date, dayEntries.items, dayWorkers.items],
  );
  const days = useMemo(
    () => monthDays(monthEntries.items, monthWorkers.items, weekdayOf),
    [monthEntries.items, monthWorkers.items],
  );
  const totals = useMemo(() => totalsByPerson(days), [days]);

  if (!user) return null;
  const fullShift = fullShiftHours(weekdayOf(date));
  const workerDoc = (id: string) => dayWorkers.items.find((w) => w.employeeId === id);

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setError('');
    } catch {
      setError('השמירה נכשלה - בדקו חיבור ונסו שוב');
    }
  }

  async function addAmount(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(amount.replace(',', '.')) * 100) / 100;
    if (!(n > 0)) return;
    await guard(async () => {
      await dayEntries.save({ id: `${date}|${newId()}`, date, amount: n, by: user!.id, at: new Date().toISOString() });
      setAmount('');
    });
  }

  async function toggleWorker(id: string) {
    await guard(async () => {
      const cur = workerDoc(id);
      if (cur) await dayWorkers.remove(cur.id);
      else await dayWorkers.save({ id: `${date}|${id}`, date, employeeId: id, by: user!.id, at: new Date().toISOString() });
    });
  }

  async function patchWorker(w: TipWorkerDoc, patch: Partial<TipWorkerDoc>) {
    const next: TipWorkerDoc = { ...w, ...patch, by: user!.id, at: new Date().toISOString() };
    if (!next.reinforcement) {
      delete next.reinforcement;
      delete next.hours;
    }
    await guard(() => dayWorkers.save(next));
  }

  const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const myDays = days.filter((d) => d.shares[user.id] !== undefined);
  const monthTotal = days.reduce((n, d) => n + d.total, 0);

  return (
    <>
      <h1>💰 טיפים</h1>
      {error && <p className="banner-warn" role="alert">{error}</p>}

      <div className="row between">
        <button type="button" className="small" onClick={() => setDate(addDays(date, -1))} aria-label="היום הקודם">→</button>
        <strong>
          יום {WEEKDAY_NAMES[weekdayOf(date)]} · {formatLongDate(date)}
        </strong>
        <button type="button" className="small" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} aria-label="היום הבא">←</button>
      </div>

      <section className="card form">
        <h2>הטיפים של היום: {money(day.total)}</h2>
        <form className="row" onSubmit={(e) => void addAmount(e)}>
          <input
            style={{ flex: 1 }}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="סכום שנוסף בסוף המשמרת"
            aria-label="סכום טיפים"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!(Number(amount) > 0)}>
            הוסף
          </button>
        </form>
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
              {(isManager || e.by === user.id) && (
                <button
                  type="button"
                  className="small danger"
                  onClick={() => {
                    if (confirm(`למחוק את הסכום ${money(e.amount)}?`)) void guard(() => dayEntries.remove(e.id));
                  }}
                >
                  מחק
                </button>
              )}
            </div>
          ))}
      </section>

      <section className="card form">
        <h2>מי עבד ({day.workers.length})</h2>
        <p className="muted small-text">
          כל מי שמסומן מקבל חלק שווה. מתגבר/ת מקבל/ת לפי שעות מתוך משמרת מלאה ({fullShift} שעות).
        </p>
        <div className="chips">
          {sortedEmployees.map((e) => {
            const on = Boolean(workerDoc(e.id));
            return (
              <button key={e.id} type="button" className={`chip pick${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void toggleWorker(e.id)}>
                {e.name}
              </button>
            );
          })}
        </div>
        {dayWorkers.items.map((w) => (
          <div key={w.id} className="li emp">
            <span className="li-body">
              <strong>{nameOf(w.employeeId)}</strong>
              {day.shares[w.employeeId] !== undefined && day.total > 0 && <span className="muted small-text">מקבל/ת {money(day.shares[w.employeeId])}</span>}
            </span>
            <label className="inline check">
              <input type="checkbox" checked={Boolean(w.reinforcement)} onChange={(e) => void patchWorker(w, { reinforcement: e.target.checked, hours: e.target.checked ? (w.hours ?? 4) : undefined })} />
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
                  onChange={(e) => void patchWorker(w, { hours: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </label>
            )}
          </div>
        ))}
        {day.total > 0 && day.workers.length === 0 && <p className="muted small-text">סמנו מי עבד כדי לחלק את הטיפים.</p>}
      </section>

      <section>
        <div className="row between">
          <button type="button" className="small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="חודש קודם">→</button>
          <h2>{monthLabel(month)}</h2>
          <button type="button" className="small" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="חודש הבא">←</button>
        </div>

        {isManager ? (
          <>
            <div className="card list">
              {Object.entries(totals)
                .sort((a, b) => b[1] - a[1])
                .map(([id, v]) => (
                  <div key={id} className="li emp">
                    <span className="li-body"><strong>{nameOf(id)}</strong></span>
                    <strong>{money(v)}</strong>
                  </div>
                ))}
              {Object.keys(totals).length === 0 && <p className="muted empty">אין נתונים לחודש הזה.</p>}
            </div>
            <p className="muted small-text">סה״כ טיפים בחודש: {money(monthTotal)} · ימים עם טיפים שאין בהם עובדים מסומנים לא מחולקים.</p>
            {days.some((d) => d.total > 0 && d.workers.length === 0) && (
              <p className="banner-warn">
                ימים בלי עובדים מסומנים: {days.filter((d) => d.total > 0 && d.workers.length === 0).map((d) => d.date.slice(8) + '/' + d.date.slice(5, 7)).join(', ')}
              </p>
            )}
            <button
              type="button"
              className="small"
              onClick={() => {
                const text = [`טיפים ${monthLabel(month)}`, ...Object.entries(totals).map(([id, v]) => `${nameOf(id)}: ${v}`)].join('\n');
                void navigator.clipboard?.writeText(text).catch(() => window.prompt('העתיקו:', text));
              }}
            >
              העתק סיכום
            </button>
          </>
        ) : (
          <div className="card">
            <strong>הטיפים שלי: {money(totals[user.id] ?? 0)}</strong>
            <span className="muted small-text block">{myDays.length} ימי עבודה בחודש הזה</span>
            {myDays.map((d) => (
              <div key={d.date} className="li emp">
                <span className="li-body">
                  {d.date.slice(8)}/{d.date.slice(5, 7)} · יום {WEEKDAY_NAMES[weekdayOf(d.date)]}
                </span>
                <span>{money(d.shares[user.id])}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
