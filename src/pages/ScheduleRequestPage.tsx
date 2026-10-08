import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { idPrefix, useCollection } from '../lib/db';
import { addDays, formatTime, weekStart } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { effectiveShifts, requestKey, weekDates } from '../lib/rota';
import type { PublishedWeek, ShiftDay, ShiftRequest } from '../lib/types';
import { Hours, WeekNav, dayTitle, shiftName } from '../components/ShiftBits';
import { t, tl } from '../lib/i18n';

const FORWARD_WEEKS = 12;

/** Employees tick the shifts they can work in a coming week (events included) and send it to the managers. */
export default function ScheduleRequestPage() {
  const { user } = useAuth();
  const today = useBusinessDate();
  const nextWeek = addDays(weekStart(today), 7);
  const max = addDays(nextWeek, 7 * (FORWARD_WEEKS - 1));
  const [week, setWeek] = useState(nextWeek);
  if (!user) return null;
  return (
    <>
      <Link to="/schedule" className="back">{t('← סידור עבודה')}</Link>
      <h1>{t('🙋 בקשת סידור')}</h1>
      <p className="muted">{t('מסמנים באילו משמרות אפשר לעבוד ולוחצים "שלח בקשה". אפשר לשנות ולשלוח שוב עד שהסידור מפורסם.')}</p>
      <WeekNav week={week} min={nextWeek} max={max} onChange={setWeek} current={nextWeek} />
      <WeekRequest key={week} week={week} />
    </>
  );
}

function WeekRequest({ week }: { week: string }) {
  const { user } = useAuth();
  const days = useCollection<ShiftDay>('shiftDays', undefined, { from: week, to: addDays(week, 6) });
  const mine = useCollection<ShiftRequest>('shiftRequests', undefined, idPrefix(week));
  const published = useCollection<PublishedWeek>('schedulePublished', undefined, { from: week, to: week });
  const existing = mine.items.find((r) => r.employeeId === user!.id);

  if (days.loading || mine.loading) return <p className="muted empty">{t('טוען…')}</p>;
  return <RequestForm week={week} days={days.items} existing={existing} published={published.items.length > 0} save={mine.save} />;
}

function RequestForm({ week, days, existing, published, save }: { week: string; days: ShiftDay[]; existing?: ShiftRequest; published: boolean; save(r: ShiftRequest): Promise<void> }) {
  const { user } = useAuth();
  const [picked, setPicked] = useState<string[]>(existing?.shifts ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [saved, setSaved] = useState(Boolean(existing));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const plan = useMemo(
    () => weekDates(week).map((date) => {
      const day = days.find((d) => d.date === date);
      return { date, shifts: effectiveShifts(date, day), note: day?.note, noteEn: day?.noteEn };
    }),
    [week, days],
  );
  // a shift that no longer exists (an event that was deleted) is dropped from what gets sent
  const valid = new Set(plan.flatMap((d) => d.shifts.map((s) => requestKey(d.date, s.id))));
  const effective = picked.filter((k) => valid.has(k));
  const hasShifts = valid.size > 0;

  const toggle = (k: string) => {
    setPicked(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]);
    setSaved(false);
  };

  async function send() {
    setBusy(true);
    try {
      const doc: ShiftRequest = { id: `${week}|${user!.id}`, weekStart: week, employeeId: user!.id, shifts: effective, at: new Date().toISOString() };
      if (note.trim()) doc.note = note.trim();
      await save(doc);
      setSaved(true);
      setError('');
    } catch {
      setError(t('השמירה נכשלה - בדקו חיבור ונסו שוב'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {published && <p className="banner-warn">{t('הסידור לשבוע הזה כבר פורסם. אפשר עדיין לשלוח בקשה, אבל היא עשויה לא להיכנס.')}</p>}
      {plan.map((d) => (
        <article key={d.date} className="card day-card">
          <div className="day-head"><strong>{dayTitle(d.date)}</strong></div>
          {d.note && <p className="day-note">🎉 {tl(d.note, d.noteEn)}</p>}
          {d.shifts.length === 0 && <p className="muted small-text">{t('סגור')}</p>}
          <div className="chips">
            {d.shifts.map((s) => {
              const k = requestKey(d.date, s.id);
              const on = effective.includes(k);
              return (
                <button key={s.id} type="button" className={`chip pick shift-pick${on ? ' on' : ''}${s.event ? ' event' : ''}`} aria-pressed={on} onClick={() => toggle(k)}>
                  {on ? '✓ ' : ''}{s.event ? '🎉 ' : ''}{shiftName(s)} <Hours shift={s} />
                </button>
              );
            })}
          </div>
        </article>
      ))}

      {hasShifts && (
        <section className="card form">
          <label>
            {t('הערות למנהל (למשל: רק עד 22:00, לא יכול/ה בשישי)')}
            <textarea rows={2} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} />
          </label>
          {error && <p className="banner-warn" role="alert">{error}</p>}
          <button type="button" className="primary wide" disabled={busy || saved} onClick={() => void send()}>
            {saved ? t('✓ הבקשה נשלחה') : existing ? t('עדכן בקשה') : t('שלח בקשה')}
          </button>
          {existing && <p className="muted small-text">{t('נשלח לאחרונה: {at}', { at: formatTime(existing.at) })}</p>}
          {effective.length === 0 && !saved && <p className="muted small-text">{t('לא סימנת אף משמרת - הבקשה תישלח כ"לא זמין/ה השבוע".')}</p>}
        </section>
      )}
    </>
  );
}
