import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { backend, idPrefix, newId, useCollection } from '../lib/db';
import { WEEKDAY_NAMES, addDays, formatLongDate, formatTime, weekdayOf } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { cleanShiftName, dayTips, fullShiftHours, monthDays, shiftsOf, tipWorkerId, totalsByPerson } from '../lib/tips';
import type { DayTips } from '../lib/tips';
import type { TipEntry, TipWorkerDoc } from '../lib/types';
import { getLang, t, tn } from '../lib/i18n';

const money = (n: number) => `₪${n.toLocaleString(getLang() === 'en' ? 'en-GB' : 'he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'he-IL', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`));

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
      <button type="button" className="small" disabled={date <= addDays(today, -back)} onClick={() => onChange(addDays(date, -1))} aria-label={t('היום הקודם')}>{t('→')}</button>
      <strong>{formatLongDate(date)}</strong>
      <button type="button" className="small" disabled={date >= today} onClick={() => onChange(addDays(date, 1))} aria-label={t('היום הבא')}>{t('←')}</button>
    </div>
  );
}

const PRESET_SHIFTS = [tn('צהריים'), tn('ערב'), tn('אירוע')];

/** '' is the day's main shift; extra shifts are shown by their name. */
const shiftLabel = (shift: string) => (shift ? t(shift) : t('משמרת ראשונה'));

/** The day's shifts from its documents, plus shifts just added on this screen (they exist once something is saved in them). */
function useShifts(date: string, docs: { shift?: string; at?: string }[]) {
  const [shift, setShift] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => {
    setShift('');
    setExtra([]);
  }, [date]);
  const known = shiftsOf(docs);
  const shifts = [...known, ...extra.filter((x) => !known.includes(x))];
  const add = (name: string) => {
    setExtra((list) => (list.includes(name) ? list : [...list, name]));
    setShift(name);
  };
  return { shifts, shift: shifts.includes(shift) ? shift : '', setShift, add };
}

/**
 * Picks the tips shift everything below belongs to, and adds one. On Saturday noon and evening share
 * all the tips together, so no shift can be added there.
 */
function ShiftTabs({ date, shifts, value, onChange, onAdd }: { date: string; shifts: string[]; value: string; onChange(s: string): void; onAdd(name: string): void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const saturday = weekdayOf(date) === 6;
  useEffect(() => {
    setAdding(false);
    setName('');
  }, [date]);
  if (saturday && shifts.length === 1) return null;

  function add(raw: string) {
    const clean = cleanShiftName(raw);
    if (!clean) return;
    onAdd(clean);
    setAdding(false);
    setName('');
  }

  return (
    <section className="card form">
      {shifts.length > 1 && (
        <>
          <h2>{t('משמרת')}</h2>
          <div className="chips" role="group" aria-label={t('משמרת')}>
            {shifts.map((s) => (
              <button key={s} type="button" className={`chip pick${s === value ? ' on' : ''}`} aria-pressed={s === value} onClick={() => onChange(s)}>
                {shiftLabel(s)}
              </button>
            ))}
          </div>
          <p className="muted small-text">{t('כל משמרת מתחלקת בנפרד: הסכום שלה רק בין מי שסומן בה.')}</p>
        </>
      )}
      {!saturday &&
        (adding ? (
          <>
            <p className="small-text">{t('שם המשמרת הנוספת:')}</p>
            <div className="chips">
              {PRESET_SHIFTS.filter((p) => !shifts.includes(p)).map((p) => (
                <button key={p} type="button" className="chip pick" onClick={() => add(p)}>
                  {t(p)}
                </button>
              ))}
            </div>
            <div className="row">
              <input style={{ flex: 1 }} value={name} maxLength={30} placeholder={t('או שם אחר')} aria-label={t('שם המשמרת')} onChange={(e) => setName(e.target.value)} />
              <button type="button" className="primary" disabled={!cleanShiftName(name)} onClick={() => add(name)}>
                {t('הוסף')}
              </button>
              <button type="button" onClick={() => setAdding(false)}>
                {t('ביטול')}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="small" onClick={() => setAdding(true)}>
            {t('+ משמרת טיפים נוספת')}
          </button>
        ))}
    </section>
  );
}

function AmountForm({ onAdd }: { onAdd(amount: number, note: string): Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Math.round(Number(amount.replace(',', '.')) * 100) / 100;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!(n > 0) || busy) return;
        setBusy(true);
        void onAdd(n, note.trim())
          .then(() => { setAmount(''); setNote(''); })
          .finally(() => setBusy(false));
      }}
    >
      <div className="row">
      <input
        style={{ flex: 1 }}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        placeholder={t('סכום הטיפים')}
        aria-label={t('סכום טיפים')}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" className="primary" disabled={!(n > 0) || busy}>
        {t('הוסף')}
      </button>
      </div>
      <input value={note} maxLength={300} placeholder={t('הערה (לא חובה), למשל: טיפ מקבוצה גדולה')} aria-label={t('הערה')} onChange={(e) => setNote(e.target.value)} />
    </form>
  );
}

/** Who worked that day (names and hours only - no money here). */
function WorkersPicker({ date, shift, hint }: { date: string; shift: string; hint: string }) {
  const { user, employees } = useAuth();
  const workers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(date));
  const [error, setError] = useState('');
  const fullShift = fullShiftHours(weekdayOf(date));
  const mine = workers.items.filter((w) => (w.shift ?? '') === shift);
  const doc = (id: string) => mine.find((w) => w.employeeId === id);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setError('');
    } catch {
      setError(t('השמירה נכשלה - בדקו חיבור ונסו שוב'));
    }
  }
  const toggle = (id: string) =>
    guard(async () => {
      const cur = doc(id);
      if (cur) await workers.remove(cur.id);
      else await workers.save({ id: tipWorkerId(date, shift, id), date, employeeId: id, ...(shift ? { shift } : {}), by: user!.id, at: new Date().toISOString() });
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
      <h2>
        {t('מי עבד (')}{mine.length})
        {shift && <span className="muted small-text"> · {shiftLabel(shift)}</span>}
      </h2>
      <p className="muted small-text">{hint}{' '}{t('מתגבר/ת: מסמנים ורושמים כמה שעות עבד/ה (משמרת מלאה היא')}{' '}{fullShift}{' '}{t('שעות).')}</p>
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
      {mine.map((w) => (
        <div key={w.id} className="li emp">
          <span className="li-body">
            <strong>{nameOf(w.employeeId)}</strong>
          </span>
          <label className="inline check">
            <input type="checkbox" checked={Boolean(w.reinforcement)} onChange={(e) => void patch(w, { reinforcement: e.target.checked, hours: e.target.checked ? (w.hours ?? 4) : undefined })} />
            <span>{t('מתגבר/ת')}</span>
          </label>
          {w.reinforcement && (
            <label className="inline">
              <span>{t('שעות')}</span>
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
  const [added, setAdded] = useState<{ id: string; amount: number; date: string; at: string; shift?: string }[]>([]);
  const [error, setError] = useState('');
  // staff cannot read the amounts, so the day's shifts come from the "worked" marks and from what they added here
  const workers = useCollection<TipWorkerDoc>('tipWorkers', undefined, idPrefix(date));
  const { shifts, shift, setShift, add: addShift } = useShifts(date, [...workers.items, ...added.filter((a) => a.date === date)]);

  async function add(amount: number, note: string) {
    const id = `${date}|${newId()}`;
    const at = new Date().toISOString();
    try {
      await backend.upsert('tipEntries', { id, date, amount, ...(note ? { note } : {}), ...(shift ? { shift } : {}), by: user!.id, at } as TipEntry);
      setAdded((a) => [...a, { id, amount, date, at, ...(shift ? { shift } : {}) }]);
      setError('');
    } catch {
      setError(t('השמירה נכשלה - בדקו חיבור ונסו שוב'));
    }
  }
  async function undo(id: string) {
    try {
      await backend.remove('tipEntries', id);
      setAdded((a) => a.filter((x) => x.id !== id));
    } catch {
      setError(t('הביטול נכשל - פנו למנהל'));
    }
  }

  return (
    <>
      <h1>{t('💰 טיפים')}</h1>
      <p className="muted">{t('בסוף המשמרת מזינים את סכום הטיפים ומסמנים מי עבד. החישוב וההפרשה אצל ההנהלה.')}</p>
      {error && <p className="banner-warn" role="alert">{error}</p>}
      <DayNav date={date} today={today} back={1} onChange={setDate} />
      <ShiftTabs date={date} shifts={shifts} value={shift} onChange={setShift} onAdd={addShift} />

      <section className="card form">
        <h2>
          {t('הוספת סכום')}
          {shifts.length > 1 && <span className="muted small-text"> · {shiftLabel(shift)}</span>}
        </h2>
        <AmountForm onAdd={add} />
        {added.map((a) => (
          <div key={a.id} className="li emp">
            <span className="li-body">
              <strong>{t('✓ נוסף')}{' '}{money(a.amount)}</strong>
              <span className="muted small-text">
                {shortDate(a.date)}{a.shift ? ` · ${shiftLabel(a.shift)}` : ''} · {formatTime(a.at)}
              </span>
            </span>
            <button type="button" className="small danger" onClick={() => void undo(a.id)}>
              {t('בטל')}
            </button>
          </div>
        ))}
      </section>

      <WorkersPicker date={date} shift={shift} hint={shifts.length > 1 ? t('מסמנים את כל מי שעבד במשמרת הזו.') : t('מסמנים את כל מי שעבד באותו יום.')} />
    </>
  );
}

// ---------------------------------------------------------------- managers: everything

function csvOf(days: DayTips[], nameOf: (id: string) => string): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [[t('תאריך'), t('יום'), t('משמרת'), t('סה"כ טיפים למשמרת'), t('עובד/ת'), t('מתגבר/ת'), t('שעות'), t('חלק')].map(q).join(',')];
  for (const d of [...days].reverse()) {
    const day = t(WEEKDAY_NAMES[weekdayOf(d.date)]);
    for (const s of d.shifts) {
      const label = d.shifts.length > 1 ? shiftLabel(s.shift) : '';
      if (s.workers.length === 0) rows.push([d.date, day, label, s.total, t('(אין עובדים מסומנים)'), '', '', ''].map(q).join(','));
      for (const w of s.workers)
        rows.push([d.date, day, label, s.total, nameOf(w.id), w.reinforcement ? t('כן') : '', w.reinforcement ? (w.hours ?? '') : '', s.shares[w.id] ?? 0].map(q).join(','));
    }
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
  const { shifts, shift, setShift, add: addShift } = useShifts(date, [...dayEntries.items, ...dayWorkers.items]);
  const cur = day.shifts.find((s) => s.shift === shift);
  const days = useMemo(() => monthDays(monthEntries.items, monthWorkers.items, weekdayOf), [monthEntries.items, monthWorkers.items]);
  const totals = useMemo(() => totalsByPerson(days), [days]);
  const monthTotal = days.reduce((n, d) => n + d.total, 0);
  const undivided = days.flatMap((d) =>
    d.shifts.filter((s) => s.total > 0 && s.workers.length === 0).map((s) => `${shortDate(d.date)}${d.shifts.length > 1 ? ` (${shiftLabel(s.shift)})` : ''}`),
  );

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setError('');
    } catch {
      setError(t('השמירה נכשלה - בדקו חיבור ונסו שוב'));
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
    return [t('טיפים {month}', { month: monthLabel(month) }), ...lines, t('סה"כ: {monthTotal}', { monthTotal })].join('\n');
  }

  return (
    <>
      <h1>{t('💰 טיפים')}</h1>
      {error && <p className="banner-warn" role="alert">{error}</p>}
      <DayNav date={date} today={today} back={400} onChange={setDate} />
      <ShiftTabs date={date} shifts={shifts} value={shift} onChange={setShift} onAdd={addShift} />

      <section className="card form">
        <h2>
          {t('היום שנבחר:')}{' '}{money(day.total)}
        </h2>
        {shifts.length > 1 && (
          <p>
            <strong>{shiftLabel(shift)}: {money(cur?.total ?? 0)}</strong>
          </p>
        )}
        <AmountForm
          onAdd={(amount, note) =>
            guard(() => dayEntries.save({ id: `${date}|${newId()}`, date, amount, ...(note ? { note } : {}), ...(shift ? { shift } : {}), by: user!.id, at: new Date().toISOString() }))
          }
        />
        {dayEntries.items
          .filter((e) => (e.shift ?? '') === shift)
          .slice()
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((e) => (
            <div key={e.id} className="li emp">
              <span className="li-body">
                <strong>{money(e.amount)}</strong>
                <span className="muted small-text">
                  {nameOf(e.by)} · {formatTime(e.at)}
                </span>
                {e.note && <span className="small-text block">📝 {e.note}</span>}
              </span>
              <button
                type="button"
                className="small danger"
                onClick={() => {
                  if (confirm(t('למחוק את הסכום {amount}?', { amount: money(e.amount) }))) void guard(() => dayEntries.remove(e.id));
                }}
              >
                {t('מחק')}
              </button>
            </div>
          ))}
        {cur && cur.workers.length > 0 && cur.total > 0 && (
          <p className="muted small-text">
            {t('חלוקה:')}{' '}{cur.workers.map((w) => `${nameOf(w.id)} ${money(cur.shares[w.id])}`).join(' · ')}
          </p>
        )}
      </section>

      <WorkersPicker date={date} shift={shift} hint={shifts.length > 1 ? t('כל מי שמסומן במשמרת הזו מקבל חלק שווה מהסכום שלה.') : t('כל מי שמסומן מקבל חלק שווה.')} />

      <section>
        <div className="row between">
          <button type="button" className="small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('חודש קודם')}>{t('→')}</button>
          <h2>{monthLabel(month)}</h2>
          <button type="button" className="small" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('חודש הבא')}>{t('←')}</button>
        </div>

        <h3 className="cat">{t('סיכום לפי עובד')}</h3>
        <div className="card list">
          {Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .map(([id, v]) => (
              <div key={id} className="li emp">
                <span className="li-body">
                  <strong>{nameOf(id)}</strong>
                  <span className="muted small-text">{days.filter((d) => d.shares[id] !== undefined).length}{' '}{t('ימי עבודה')}</span>
                </span>
                <strong>{money(v)}</strong>
              </div>
            ))}
          {Object.keys(totals).length === 0 && <p className="muted empty">{t('אין נתונים לחודש הזה.')}</p>}
        </div>
        <p>
          <strong>{t('סה״כ טיפים בחודש:')}{' '}{money(monthTotal)}</strong>
        </p>
        {undivided.length > 0 && (
          <p className="banner-warn">
            {t('ימים עם טיפים אבל בלי עובדים מסומנים (לא חולקו):')}{' '}{undivided.join(', ')}
          </p>
        )}
        <div className="row">
          <button type="button" className="primary" disabled={days.length === 0} onClick={download}>
            {t('הורד פירוט לאקסל')}
          </button>
          <button type="button" disabled={days.length === 0} onClick={() => void navigator.clipboard?.writeText(summaryText()).catch(() => window.prompt(t('העתיקו:'), summaryText()))}>
            {t('העתק סיכום')}
          </button>
        </div>

        <h3 className="cat">{t('פירוט לפי יום')}</h3>
        {days.map((d) => (
          <article key={d.date} className="card">
            <div className="row between">
              <strong>
                {shortDate(d.date)} · {t('יום {day}', { day: t(WEEKDAY_NAMES[weekdayOf(d.date)]) })}
              </strong>
              <strong>{money(d.total)}</strong>
            </div>
            {d.shifts.map((s) => (
              <span key={s.shift} className="muted small-text block">
                {d.shifts.length > 1 && <strong>{shiftLabel(s.shift)} {money(s.total)}: </strong>}
                {s.workers.length === 0
                  ? t('אין עובדים מסומנים')
                  : s.workers.map((w) => `${nameOf(w.id)}${w.reinforcement ? t(' (מתגבר {p1} ש׳)', { p1: w.hours ?? '?' }) : ''} ${money(s.shares[w.id] ?? 0)}`).join(' · ')}
              </span>
            ))}
            {monthEntries.items.filter((e) => e.date === d.date && e.note).map((e) => (
              <span key={e.id} className="small-text block">📝 {e.note} <span className="muted">({nameOf(e.by)})</span></span>
            ))}
            <button type="button" className="small" onClick={() => setDate(d.date)}>
              {t('פתח את היום')}
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
