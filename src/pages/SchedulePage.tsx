import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCollection } from '../lib/db';
import { addDays, formatLongDate, weekStart } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { orderedDays, weekText } from '../lib/rota';
import type { PublishedWeek, Settings } from '../lib/types';
import { personColor } from '../lib/rotaColors';
import { WeekGrid } from '../components/WeekGrid';
import { renderWeekImage, shareOrDownload } from '../lib/rotaImage';
import { Hours, WeekNav, dayTitle, shiftName, weekLabel } from '../components/ShiftBits';
import { t, tl } from '../lib/i18n';

const BACK_WEEKS = 12;
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
  const settings = useCollection<Settings>('settings');
  const colorOf = (id: string) => personColor(id, settings.items[0]?.rotaColors);
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('drix:rotaView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setView = (v: 'grid' | 'list') => {
    setViewState(v);
    try { localStorage.setItem('drix:rotaView', v); } catch { /* not important */ }
  };

  const current = published.items.find((w) => w.id === week);
  const nextPublished = published.items.some((w) => w.id === nextWeek);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';
  const days = useMemo(() => orderedDays(current?.days ?? []), [current]);
  const next = published.items.find((w) => w.id === nextWeek);
  if (!user) return null;

  const gridOf = (w: PublishedWeek) => (
    <WeekGrid
      days={orderedDays(w.days)}
      people={employees
        .filter((e) => w.days.some((d) => d.shifts.some((s) => s.staff.some((x) => x.employeeId === e.id))))
        .sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id) || a.name.localeCompare(b.name, 'he'))}
      colorOf={colorOf}
      meId={user.id}
      today={today}
    />
  );

  async function copy() {
    const text = weekText(days, nameOf);
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

      {isManager && current && (
        <button type="button" className="primary wide" onClick={() => void renderWeekImage(days, colorOf, nameOf).then((b) => shareOrDownload(b, `rota-${week}.png`)).catch(() => undefined)}>
          {t('🖼️ ייצוא כתמונה')}
        </button>
      )}

      <Link to="/schedule/request" className="card summary-line">
        <span>🙋 <strong>{t('בקשת סידור')}</strong>{' '}{t('- לסמן באילו משמרות אפשר לעבוד')}</span>
        <span className="muted">{t('←')}</span>
      </Link>

      {week === thisWeek && nextPublished && view === 'list' && (
        <button type="button" className="card summary-line has-note wide" onClick={() => setWeek(nextWeek)}>
          <span>{t('הסידור לשבוע הבא פורסם')}</span>
          <span className="muted">{t('←')}</span>
        </button>
      )}

      <WeekNav week={week} min={min} max={max} onChange={setWeek} current={thisWeek} />

      {!current && !published.loading && <p className="muted empty">{t('הסידור לשבוע הזה עדיין לא פורסם.')}</p>}

      {current && (
        <div className="view-toggle" role="group" aria-label={t('תצוגה')}>
          <button type="button" className={`chip pick${view === 'grid' ? ' on' : ''}`} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t('🎨 טבלה צבעונית')}</button>
          <button type="button" className={`chip pick${view === 'list' ? ' on' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('📋 רשימה לפי ימים')}</button>
        </div>
      )}

      {current && view === 'grid' && gridOf(current)}

      {view === 'grid' && week === thisWeek && (
        <>
          <h2 className="week-sub">{t('שבוע הבא')} <bdi dir="ltr">{weekLabel(nextWeek)}</bdi></h2>
          {next ? gridOf(next) : <p className="muted small-text">{t('הסידור לשבוע הבא עדיין לא פורסם.')}</p>}
        </>
      )}

      {current && view === 'list' &&
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
                      <span><span className="name-dot" style={colorOf(w.employeeId)} aria-hidden="true" />{nameOf(w.employeeId)}</span>
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
