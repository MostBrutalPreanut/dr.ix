import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { backend, idPrefix, newId, useCollection } from '../../lib/db';
import { addDays, formatLongDate, weekStart } from '../../lib/dates';
import { useBusinessDate } from '../../lib/useBusinessDate';
import { MAX_STAFF, START_CHOICES, assignmentId, buildWeek, effectiveShifts, hasUnpublishedChanges, isTime, requestKey, templateShifts } from '../../lib/rota';
import type { PublishedWeek, ShiftAssignment, ShiftDay, ShiftDef, ShiftRequest } from '../../lib/types';
import { Hours, WeekNav, dayTitle, shiftName } from '../../components/ShiftBits';
import { pruneEn, t, tl } from '../../lib/i18n';

const FORWARD_WEEKS = 26; // events can be announced months ahead
const BACK_WEEKS = 4;

/** Managers: build the week (who works when), add events, see the requests, and publish to the team. */
export default function AdminSchedule() {
  const { user, employees } = useAuth();
  const today = useBusinessDate();
  const thisWeek = weekStart(today);
  const min = addDays(thisWeek, -7 * BACK_WEEKS);
  const max = addDays(thisWeek, 7 * FORWARD_WEEKS);
  const [week, setWeek] = useState(addDays(thisWeek, 7)); // the week that is usually being planned
  const [editDay, setEditDay] = useState<string | null>(null);
  const [error, setError] = useState('');

  const lastDay = addDays(week, 6);
  const dayDocs = useCollection<ShiftDay>('shiftDays', undefined, { from: week, to: lastDay });
  const assigns = useCollection<ShiftAssignment>('shiftAssign', undefined, { from: week, to: `${lastDay}~` });
  const requests = useCollection<ShiftRequest>('shiftRequests', undefined, idPrefix(week));
  const published = useCollection<PublishedWeek>('schedulePublished', undefined, { from: week, to: week });
  const upcoming = useCollection<ShiftDay>('shiftDays', undefined, { from: today, to: addDays(today, 7 * FORWARD_WEEKS) });

  const isEmployee = (id: string) => employees.some((e) => e.id === id);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';
  const draft = useMemo(() => buildWeek(week, dayDocs.items, assigns.items, (id) => employees.some((e) => e.id === id)), [week, dayDocs.items, assigns.items, employees]);
  const pub = published.items[0];
  const changed = hasUnpublishedChanges(pub?.days, draft);
  const loading = dayDocs.loading || assigns.loading;

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setError('');
    } catch {
      setError(t('השמירה נכשלה - בדקו חיבור ונסו שוב'));
    }
  }

  const dayDoc = (date: string): ShiftDay => dayDocs.items.find((d) => d.date === date) ?? upcoming.items.find((d) => d.date === date) ?? { id: date, date, shifts: templateShifts(new Date(`${date}T12:00:00Z`).getUTCDay()) };
  const saveDay = (next: ShiftDay) => {
    const doc = pruneEn({ ...next }, ['note', 'noteEn']);
    return dayDocs.save(doc).then(() => upcoming.save(doc).catch(() => undefined));
  };

  /** Removes the draft assignments of a day whose shift no longer exists. */
  async function dropAssignments(date: string, keepShiftIds: string[]) {
    const rows = (await backend.list('shiftAssign', { from: date, to: `${date}~` })) as ShiftAssignment[];
    await Promise.all(rows.filter((a) => !keepShiftIds.includes(a.shiftId)).map((a) => backend.remove('shiftAssign', a.id)));
  }

  const assign = (date: string, shift: ShiftDef, employeeId: string) =>
    guard(() => assigns.save({ id: assignmentId(date, shift.id, employeeId), date, shiftId: shift.id, employeeId, start: shift.defaultStart }));
  const unassign = (a: ShiftAssignment) => guard(() => assigns.remove(a.id));
  const setStart = (a: ShiftAssignment, start: string) => (isTime(start) ? guard(() => assigns.save({ ...a, start })) : Promise.resolve());

  async function publish() {
    await guard(async () => {
      await published.save({ id: week, weekStart: week, days: draft, publishedAt: new Date().toISOString(), by: user!.id });
    });
  }

  const submitted = new Set(requests.items.map((r) => r.employeeId));
  const unavailable = requests.items.filter((r) => r.shifts.length === 0).map((r) => r.employeeId);
  const notes = requests.items.filter((r) => r.note);

  return (
    <>
      <Link to="/admin" className="back">{t('← ניהול')}</Link>
      <h1>{t('🗓️ עריכת סידור עבודה')}</h1>

      <WeekNav week={week} min={min} max={max} onChange={(w) => { setWeek(w); setEditDay(null); }} current={thisWeek} />
      {error && <p className="banner-warn" role="alert">{error}</p>}

      <section className={`card${pub && !changed ? ' success' : ''}`}>
        <div className="row between">
          <span>
            {!pub && <strong>{t('הסידור לשבוע הזה עדיין לא פורסם לצוות')}</strong>}
            {pub && !changed && <strong>{t('✓ פורסם והעובדים רואים את הגרסה העדכנית')}</strong>}
            {pub && changed && <strong>{t('יש שינויים שעדיין לא פורסמו')}</strong>}
          </span>
          <span className="row">
            {pub && (
              <button type="button" className="small" onClick={() => { if (confirm(t('להסיר את הסידור מהצוות? (הטיוטה נשמרת)'))) void guard(() => published.remove(week)); }}>
                {t('בטל פרסום')}
              </button>
            )}
            <button type="button" className="primary" disabled={!changed || loading} onClick={() => void publish()}>
              {pub ? t('פרסם עדכון') : t('פרסם לצוות')}
            </button>
          </span>
        </div>
      </section>

      <section className="card">
        <h3>{t('בקשות העובדים לשבוע הזה')}</h3>
        <p className="small-text">
          {t('הגישו בקשה: {n} מתוך {total}', { n: employees.filter((e) => submitted.has(e.id)).length, total: employees.length })}
        </p>
        {employees.some((e) => !submitted.has(e.id)) && (
          <p className="muted small-text">{t('טרם הגישו: {names}', { names: employees.filter((e) => !submitted.has(e.id)).map((e) => e.name).join(', ') })}</p>
        )}
        {unavailable.length > 0 && <p className="muted small-text">{t('לא זמינים השבוע: {names}', { names: unavailable.map(nameOf).join(', ') })}</p>}
        {notes.map((r) => (
          <p key={r.id} className="small-text"><strong>{nameOf(r.employeeId)}:</strong> {r.note}</p>
        ))}
      </section>

      {loading && <p className="muted empty">{t('טוען…')}</p>}

      {draft.map((d) => {
        const doc = dayDoc(d.date);
        const editing = editDay === d.date;
        return (
          <article key={d.date} className={`card day-card${d.date === today ? ' today' : ''}`}>
            <div className="day-head">
              <strong>{dayTitle(d.date)}</strong>
              <button type="button" className="small" onClick={() => setEditDay(editing ? null : d.date)}>
                {editing ? t('סגור') : t('✏️ הגדרות יום')}
              </button>
            </div>
            {d.note && !editing && <p className="day-note">🎉 {tl(d.note, d.noteEn)}</p>}
            {d.shifts.length === 0 && !editing && <p className="muted small-text">{t('סגור')}</p>}

            {editing && (
              <DayEditor
                doc={doc}
                onSave={(next, removedShiftIds) => guard(async () => {
                  await saveDay(next);
                  if (removedShiftIds.length > 0) await dropAssignments(d.date, next.shifts.map((s) => s.id));
                })}
              />
            )}

            {d.shifts.map((s) => {
              const def = effectiveShifts(d.date, doc).find((x) => x.id === s.id)!;
              const staffDocs = assigns.items.filter((a) => a.date === d.date && a.shiftId === s.id && isEmployee(a.employeeId));
              const asked = requests.items.filter((r) => r.shifts.includes(requestKey(d.date, s.id))).map((r) => r.employeeId);
              return (
                <ShiftEditor
                  key={s.id}
                  def={def}
                  staff={staffDocs}
                  asked={asked}
                  nameOf={nameOf}
                  candidates={employees.map((e) => e.id)}
                  onAdd={(id) => assign(d.date, def, id)}
                  onRemove={unassign}
                  onStart={setStart}
                />
              );
            })}
          </article>
        );
      })}

      <EventsSection
        today={today}
        events={upcoming.items}
        onAdd={(date, shift, note) => guard(async () => {
          const base = dayDoc(date);
          await saveDay({ ...base, shifts: [...base.shifts, shift], ...(note ? { note } : {}) });
          setWeek(weekStart(date));
        })}
        onRemove={(date, shiftId) => guard(async () => {
          const base = dayDoc(date);
          const shifts = base.shifts.filter((s) => s.id !== shiftId);
          await saveDay({ ...base, shifts });
          await dropAssignments(date, shifts.map((x) => x.id));
        })}
        onGo={(date) => { setWeek(weekStart(date)); setEditDay(date); }}
      />
    </>
  );
}

function ShiftEditor({ def, staff, asked, nameOf, candidates, onAdd, onRemove, onStart }: {
  def: ShiftDef;
  staff: ShiftAssignment[];
  asked: string[];
  nameOf(id: string): string;
  candidates: string[];
  onAdd(id: string): void;
  onRemove(a: ShiftAssignment): void;
  onStart(a: ShiftAssignment, start: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const full = staff.length >= def.max;
  const free = candidates.filter((id) => !staff.some((a) => a.employeeId === id));
  // those who asked for this shift first, then everybody else
  const ordered = [...free].sort((a, b) => Number(asked.includes(b)) - Number(asked.includes(a)) || nameOf(a).localeCompare(nameOf(b), 'he'));
  const sorted = [...staff].sort((a, b) => a.start.localeCompare(b.start) || nameOf(a.employeeId).localeCompare(nameOf(b.employeeId), 'he'));
  return (
    <div className="shift-block">
      <div className="row between">
        <strong>{def.event ? '🎉 ' : ''}{shiftName(def)}</strong>
        <span className="muted small-text"><Hours shift={def} /> · {staff.length}/{def.max}</span>
      </div>
      {asked.length > 0 && (
        <p className="small-text">🙋 {t('ביקשו:')} {asked.map((id) => nameOf(id) + (staff.some((a) => a.employeeId === id) ? ' ✓' : '')).join(', ')}</p>
      )}
      {sorted.map((a) => (
        <div key={a.id} className="staff-line">
          <span>{nameOf(a.employeeId)}</span>
          <span className="row">
            <input type="time" className="time-in" value={a.start} step={900} aria-label={t('שעת התחלה')} onChange={(e) => onStart(a, e.target.value)} />
            <button type="button" className="small" onClick={() => onRemove(a)} aria-label={t('הסר')}>✕</button>
          </span>
        </div>
      ))}
      {full ? <p className="muted small-text">{t('המשמרת מלאה')}</p> : (
        <button type="button" className="small" onClick={() => setAdding(!adding)}>{adding ? t('סגור') : t('+ הוסף עובד')}</button>
      )}
      {adding && !full && (
        <div className="chips" style={{ marginTop: '.4rem' }}>
          {ordered.map((id) => (
            <button key={id} type="button" className={`chip pick${asked.includes(id) ? ' asked' : ''}`} onClick={() => onAdd(id)}>
              {asked.includes(id) ? '🙋 ' : ''}{nameOf(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Note, closed / open and the hours of a day's shifts. */
function DayEditor({ doc, onSave }: { doc: ShiftDay; onSave(next: ShiftDay, removed: string[]): Promise<void> }) {
  const [note, setNote] = useState(doc.note ?? '');
  const [noteEn, setNoteEn] = useState(doc.noteEn ?? '');
  const [shifts, setShifts] = useState<ShiftDef[]>(doc.shifts);
  const [busy, setBusy] = useState(false);
  const patch = (id: string, p: Partial<ShiftDef>) => setShifts(shifts.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const badTime = shifts.some((s) => (s.from && !isTime(s.from)) || (s.to && !isTime(s.to)) || !isTime(s.defaultStart));
  const weekday = new Date(`${doc.date}T12:00:00Z`).getUTCDay();
  const closed = shifts.length === 0;

  return (
    <div className="form day-editor">
      <label className="check">
        <input type="checkbox" checked={closed} onChange={(e) => setShifts(e.target.checked ? [] : templateShifts(weekday).length > 0 ? templateShifts(weekday) : templateShifts(1))} />
        <span>{t('היום סגור')}</span>
      </label>
      <label>
        {t('הערה ליום (למשל: טריוויה, קוויר גיים נייט)')}
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label>
        {t('גרסה באנגלית (לא חובה)')}
        <input value={noteEn} dir="ltr" onChange={(e) => setNoteEn(e.target.value)} />
      </label>
      {shifts.map((s) => (
        <fieldset key={s.id} className="shift-fields">
          <legend>{s.event ? '🎉 ' : ''}{shiftName(s)}</legend>
          {s.event && (
            <label>
              {t('שם האירוע')}
              <input value={s.label} onChange={(e) => patch(s.id, { label: e.target.value })} />
            </label>
          )}
          <div className="row">
            <label>{t('פתיחה')}<input type="time" value={s.from ?? ''} onChange={(e) => patch(s.id, { from: e.target.value || undefined })} /></label>
            <label>{t('סגירה')}<input type="time" value={s.to ?? ''} onChange={(e) => patch(s.id, { to: e.target.value || undefined })} /></label>
            <label>{t('התחלת עובד')}<input type="time" value={s.defaultStart} onChange={(e) => patch(s.id, { defaultStart: e.target.value })} /></label>
            <label>{t('עד כמה עובדים')}
              <select value={s.max} onChange={(e) => patch(s.id, { max: Number(e.target.value) })}>
                {Array.from({ length: MAX_STAFF }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="chips">
            {START_CHOICES.map((c) => (
              <button key={c} type="button" className={`chip pick${s.defaultStart === c ? ' on' : ''}`} onClick={() => patch(s.id, { defaultStart: c })}><bdi dir="ltr">{c}</bdi></button>
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="primary"
        disabled={busy || badTime}
        onClick={() => {
          setBusy(true);
          const removed = doc.shifts.filter((o) => !shifts.some((s) => s.id === o.id)).map((s) => s.id);
          void onSave({ ...doc, shifts, note: note.trim() || undefined, noteEn: noteEn.trim() || undefined }, removed).finally(() => setBusy(false));
        }}
      >
        {t('שמור יום')}
      </button>
    </div>
  );
}

/** Special events (usually other opening hours), announced up to a few months ahead. */
function EventsSection({ today, events, onAdd, onRemove, onGo }: {
  today: string;
  events: ShiftDay[];
  onAdd(date: string, shift: ShiftDef, note: string): Promise<void>;
  onRemove(date: string, shiftId: string): Promise<void>;
  onGo(date: string): void;
}) {
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState('19:00');
  const [to, setTo] = useState('23:00');
  const [start, setStart] = useState('18:30');
  const [max, setMax] = useState(MAX_STAFF);
  const [busy, setBusy] = useState(false);
  const list = events
    .flatMap((d) => d.shifts.filter((s) => s.event).map((s) => ({ date: d.date, shift: s })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ok = date >= today && title.trim() !== '' && isTime(from) && isTime(start) && (!to || isTime(to));

  return (
    <section>
      <h2>{t('🎉 אירועים מיוחדים')}</h2>
      <p className="muted small-text">{t('אירוע מופיע לעובדים כמשמרת נוספת שאפשר לבקש, ומשם משבצים אליו.')}</p>
      {list.length === 0 && <p className="muted empty">{t('אין אירועים עתידיים.')}</p>}
      {list.map(({ date: d, shift }) => (
        <div key={`${d}|${shift.id}`} className="card row between">
          <span>
            <strong>{shiftName(shift)}</strong>
            <span className="muted small-text block">{formatLongDate(d)} · <Hours shift={shift} /></span>
          </span>
          <span className="row">
            <button type="button" className="small" onClick={() => onGo(d)}>{t('לשיבוץ')}</button>
            <button type="button" className="small danger" onClick={() => { if (confirm(t('למחוק את האירוע "{title}"?', { title: shift.label }))) void onRemove(d, shift.id); }}>{t('מחק')}</button>
          </span>
        </div>
      ))}
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok || busy) return;
          setBusy(true);
          const shift: ShiftDef = { id: `ev-${newId().slice(0, 8)}`, label: title.trim(), from, defaultStart: start, max, event: true };
          if (to) shift.to = to;
          void onAdd(date, shift, '').then(() => { setTitle(''); setDate(''); }).finally(() => setBusy(false));
        }}
      >
        <h3>{t('אירוע חדש')}</h3>
        <label>{t('תאריך')}<input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{t('שם האירוע')}<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="row">
          <label>{t('פתיחה')}<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t('סגירה')}<input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>{t('התחלת עובד')}<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>{t('עד כמה עובדים')}
            <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
              {Array.from({ length: MAX_STAFF }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <button type="submit" className="primary" disabled={!ok || busy}>{t('הוסף אירוע')}</button>
      </form>
    </section>
  );
}
