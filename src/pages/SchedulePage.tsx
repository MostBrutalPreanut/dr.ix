import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCollection } from '../lib/db';
import { addDays, formatLongDate, weekStart } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { weekText } from '../lib/rota';
import type { PublishedWeek } from '../lib/types';
import { Hours, WeekNav, dayTitle, shiftName } from '../components/ShiftBits';
import { t, tl } from '../lib/i18n';

const BACK_WEEKS = 4;
const FORWARD_WEEKS = 12;

/** The published work schedule: everybody sees it, the signed-in person's own shifts are highlighted. */
export default function SchedulePage() {
  const { user, isManager, employees } = useAuth();
  const today = useBusinessDate();
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const min = addDays(thisWeek, -7 * BACK_WEEKS);
  const max = addDays(thisWeek, 7 * FORWARD_WEEKS);
  const [week, setWeek] = useState(thisWeek);
  const published = useCollection<PublishedWeek>('schedulePublished', undefined, { from: min, to: max });
  const [copied, setCopied] = useState(false);

  const current = published.items.find((w) => w.id === week);
  const nextPublished = published.items.some((w) => w.id === nextWeek);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';
  const days = useMemo(() => current?.days ?? [], [current]);
  if (!user) return null;

  async function copy() {
    const text = weekText(days, nameOf, (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`, t('סגור'));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('העתיקו את הסידור:'), text);
    }
  }

  return (
    <>
      <div className="section-head">
        <h1>{t('🗓️ סידור עבודה')}</h1>
        {isManager && (
          <Link to="/admin/schedule" className="small-link">{t('✏️ עריכת הסידור')}</Link>
        )}
      </div>

      <Link to="/schedule/request" className="card summary-line">
        <span>🙋 <strong>{t('בקשת סידור')}</strong>{' '}{t('- לסמן באילו משמרות אפשר לעבוד')}</span>
        <span className="muted">{t('←')}</span>
      </Link>

      {week === thisWeek && nextPublished && (
        <button type="button" className="card summary-line has-note wide" onClick={() => setWeek(nextWeek)}>
          <span>{t('הסידור לשבוע הבא פורסם')}</span>
          <span className="muted">{t('←')}</span>
        </button>
      )}

      <WeekNav week={week} min={min} max={max} onChange={setWeek} current={thisWeek} />

      {!current && !published.loading && <p className="muted empty">{t('הסידור לשבוע הזה עדיין לא פורסם.')}</p>}

      {current &&
        days.map((d) => {
          const mine = d.shifts.some((s) => s.staff.some((w) => w.employeeId === user.id));
          return (
            <article key={d.date} className={`card day-card${mine ? ' mine' : ''}${d.date === today ? ' today' : ''}`}>
              <div className="day-head">
                <strong>{dayTitle(d.date)}</strong>
                {d.date === today && <span className="chip">{t('היום')}</span>}
              </div>
              {d.note && <p className="day-note">🎉 {tl(d.note, d.noteEn)}</p>}
              {d.shifts.length === 0 && <p className="muted small-text">{t('סגור')}</p>}
              {d.shifts.map((s) => (
                <div key={s.id} className="shift-block">
                  <div className="row between">
                    <span>
                      <strong>{s.event ? '🎉 ' : ''}{shiftName(s)}</strong>
                    </span>
                    <span className="muted small-text"><Hours shift={s} /></span>
                  </div>
                  {s.staff.length === 0 && <p className="muted small-text">{t('עדיין לא שובצו עובדים')}</p>}
                  {s.staff.map((w) => (
                    <div key={w.employeeId} className={`staff-line${w.employeeId === user.id ? ' me' : ''}`}>
                      <span>{nameOf(w.employeeId)}</span>
                      <bdi dir="ltr" className="start-time">{w.start}</bdi>
                    </div>
                  ))}
                </div>
              ))}
            </article>
          );
        })}

      {current && (
        <div className="row" style={{ marginTop: '.6rem' }}>
          <span className="muted small-text">{t('פורסם ב-{date}', { date: formatLongDate(current.publishedAt.slice(0, 10)) })}</span>
          {isManager && (
            <button type="button" className="small" onClick={() => void copy()}>
              {copied ? t('✓ הועתק') : t('העתק לוואטסאפ')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
