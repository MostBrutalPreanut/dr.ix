import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { backend, idPrefix, newId, useCollection } from '../../lib/db';
import { addDays, formatLongDate, weekStart } from '../../lib/dates';
import { useBusinessDate } from '../../lib/useBusinessDate';
import { MAX_STAFF, START_CHOICES, assignmentId, buildWeek, byOrder, effectiveShifts, hasUnpublishedChanges, isTime, requestKey, templateShifts } from '../../lib/rota';
import type { PublishedDay, PublishedWeek, Settings, ShiftAssignment, ShiftDay, ShiftDef, ShiftRequest } from '../../lib/types';
import type { SavedColor } from '../../lib/rotaColors';
import { fillColors, hexOf, personColor } from '../../lib/rotaColors';
import { WeekGrid } from '../../components/WeekGrid';
import { renderWeekImage, shareOrDownload } from '../../lib/rotaImage';
import { Hours, WeekNav, dayTitle, shiftName } from '../../components/ShiftBits';
import { pruneEn, t, tl } from '../../lib/i18n';
import { seedSettings } from '../../seed/tasks';

const FORWARD_WEEKS = 26; // events can be announced months ahead
const BACK_WEEKS = 52; // past weeks stay viewable (as the colour table) for a year

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
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('drix:rotaView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setView = (v: 'grid' | 'list') => {
    setViewState(v);
    try { localStorage.setItem('drix:rotaView', v); } catch { /* not important */ }
  };
  const [cell, setCell] = useState<{ date: string; employeeId: string } | null>(null);

  const lastDay = addDays(week, 6);
  const dayDocs = useCollection<ShiftDay>('shiftDays', undefined, { from: week, to: lastDay });
  const assigns = useCollection<ShiftAssignment>('shiftAssign', undefined, { from: week, to: `${lastDay}~` });
  const requests = useCollection<ShiftRequest>('shiftRequests', undefined, idPrefix(week));
  const published = useCollection<PublishedWeek>('schedulePublished', undefined, { from: week, to: week });
  const upcoming = useCollection<ShiftDay>('shiftDays', undefined, { from: today, to: addDays(today, 7 * FORWARD_WEEKS) });

  const settings = useCollection<Settings>('settings', seedSettings);
  const saved = settings.items[0]?.rotaColors;
  const colorOf = (id: string) => personColor(id, saved);
  const saveColors = (rotaColors: Record<string, SavedColor>) =>
    settings.save({ ...(settings.items[0] ?? { id: 'settings', biweeklyAnchor: today }), rotaColors });
  // everybody gets a fixed colour of their own the first time (so nobody's colour moves when others join or leave)
  useEffect(() => {
    if (settings.loading || employees.length === 0) return;
    const filled = fillColors(employees, saved);
    if (Object.keys(filled).length !== Object.keys(saved ?? {}).length) void saveColors(filled).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.loading, employees, saved]);

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
    guard(() => assigns.save({ id: assignmentId(date, shift.id, employeeId), date, shiftId: shift.id, employeeId, start: shift.defaultStart, order: Date.now() }));
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
  const askedSet = new Set(requests.items.flatMap((r) => r.shifts.map((k) => `${k.split('|')[0]}|${r.employeeId}`)));

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
        {requests.items.flatMap((r) => Object.entries(r.dayNotes ?? {}).filter(([, v]) => v).map(([date, v]) => (
          <p key={`${r.id}|${date}`} className="small-text"><strong>{nameOf(r.employeeId)}</strong> <bdi dir="ltr">{Number(date.slice(8))}/{Number(date.slice(5, 7))}</bdi>: {v}</p>
        )))}
      </section>

      {loading && <p className="muted empty">{t('טוען…')}</p>}

      <div className="view-toggle" role="group" aria-label={t('תצוגה')}>
        <button type="button" className={`chip pick${view === 'grid' ? ' on' : ''}`} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t('🎨 טבלה צבעונית')}</button>
        <button type="button" className={`chip pick${view === 'list' ? ' on' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('📋 רשימה לפי ימים')}</button>
      </div>

      {view === 'grid' && (
        <GridBuilder
          draft={draft}
          today={today}
          people={[...employees].sort((a, b) => a.name.localeCompare(b.name, 'he'))}
          colorOf={colorOf}
          hexOf={(id) => hexOf(id, saved)}
          onColor={(id, hex) => guard(() => saveColors({ ...fillColors(employees, saved), [id]: hex }))}
          asked={askedSet}
          requests={requests.items}
          nameOf={nameOf}
          cell={cell}
          onCell={(date, employeeId) => {
            setCell({ date, employeeId });
            const day = draft.find((x) => x.date === date);
            const mine = assigns.items.some((a) => a.date === date && a.employeeId === employeeId);
            // a day with a single shift: one tap puts the person in it
            if (day && day.shifts.length === 1 && !mine) void assign(date, effectiveShifts(date, dayDoc(date))[0], employeeId);
          }}
          onClose={() => setCell(null)}
          shiftsOf={(date) => effectiveShifts(date, dayDoc(date))}
          docs={assigns.items}
          onAssign={assign}
          onUnassign={unassign}
          onStart={setStart}
          editDay={editDay}
          onEditDay={setEditDay}
          dayEditor={(date) => (
            <DayEditor
              key={date}
              doc={dayDoc(date)}
              onSave={(next, removedShiftIds) => guard(async () => {
                await saveDay(next);
                if (removedShiftIds.length > 0) await dropAssignments(date, next.shifts.map((x) => x.id));
              })}
            />
          )}
        />
      )}

      {view === 'list' && draft.map((d) => {
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
                  colorOf={colorOf}
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

function ShiftEditor({ def, staff, asked, nameOf, candidates, colorOf, onAdd, onRemove, onStart }: {
  def: ShiftDef;
  staff: ShiftAssignment[];
  asked: string[];
  nameOf(id: string): string;
  candidates: string[];
  colorOf(id: string): { background: string };
  onAdd(id: string): void;
  onRemove(a: ShiftAssignment): void;
  onStart(a: ShiftAssignment, start: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const free = candidates.filter((id) => !staff.some((a) => a.employeeId === id));
  // those who asked for this shift first, then everybody else
  const ordered = [...free].sort((a, b) => Number(asked.includes(b)) - Number(asked.includes(a)) || nameOf(a).localeCompare(nameOf(b), 'he'));
  // the order they were added in - the list never reshuffles when a start time changes
  const sorted = [...staff].sort(byOrder);
  return (
    <div className="shift-block">
      <div className="row between">
        <strong>{def.event ? '🎉 ' : ''}{shiftName(def)}</strong>
        <span className="muted small-text"><Hours shift={def} /> · {staff.length}/{def.max}{staff.length > def.max ? ' ✚' : ''}</span>
      </div>
      {asked.length > 0 && (
        <p className="small-text">🙋 {t('ביקשו:')} {asked.map((id) => nameOf(id) + (staff.some((a) => a.employeeId === id) ? ' ✓' : '')).join(', ')}</p>
      )}
      {sorted.map((a) => (
        <div key={a.id} className="staff-line">
          <span><span className="name-dot" style={colorOf(a.employeeId)} aria-hidden="true" />{nameOf(a.employeeId)}</span>
          <span className="row">
            <input type="time" className="time-in" value={a.start} step={900} aria-label={t('שעת התחלה')} onChange={(e) => onStart(a, e.target.value)} />
            <button type="button" className="small" onClick={() => onRemove(a)} aria-label={t('הסר')}>✕</button>
          </span>
        </div>
      ))}
      <button type="button" className="small" onClick={() => setAdding(!adding)}>{adding ? t('סגור') : t('+ הוסף עובד')}</button>
      {adding && (
        <div className="chips" style={{ marginTop: '.4rem' }}>
          {ordered.map((id) => (
            <button key={id} type="button" className={`chip pick${asked.includes(id) ? ' asked' : ''}`} onClick={() => onAdd(id)}>
              <span className="name-dot" style={colorOf(id)} aria-hidden="true" />{asked.includes(id) ? '🙋 ' : ''}{nameOf(id)}
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
            <label>{t('כמה עובדים מתוכננים')}
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
          <label>{t('כמה עובדים מתוכננים')}
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

/** The colour-coded week table with a small editor for the tapped cell (person + day). */
function GridBuilder({ draft, today, people, colorOf, hexOf, onColor, asked, requests, nameOf, cell, onCell, onClose, shiftsOf, docs, onAssign, onUnassign, onStart, editDay, onEditDay, dayEditor }: {
  draft: PublishedDay[];
  today: string;
  people: { id: string; name: string }[];
  colorOf(id: string): { background: string; color: string };
  hexOf(id: string): string;
  onColor(id: string, hex: string): void;
  asked: Set<string>;
  requests: ShiftRequest[];
  nameOf(id: string): string;
  cell: { date: string; employeeId: string } | null;
  onCell(date: string, employeeId: string): void;
  onClose(): void;
  shiftsOf(date: string): ShiftDef[];
  docs: ShiftAssignment[];
  onAssign(date: string, shift: ShiftDef, employeeId: string): void;
  onUnassign(a: ShiftAssignment): void;
  onStart(a: ShiftAssignment, start: string): void;
  editDay: string | null;
  onEditDay(date: string | null): void;
  dayEditor(date: string): React.ReactNode;
}) {
  const [colors, setColors] = useState(false);
  const [preview, setPreview] = useState(false);
  const person = cell ? people.find((p) => p.id === cell.employeeId) : undefined;
  const cellShifts = cell ? shiftsOf(cell.date) : [];
  const total = (date: string) => draft.find((d) => d.date === date)?.shifts.reduce((n, s) => n + s.staff.length, 0) ?? 0;
  const exportImage = () => renderWeekImage(draft, colorOf, nameOf).then((b) => shareOrDownload(b, `rota-${draft[0].date}.png`)).catch(() => undefined);
  const working = people.filter((p) => draft.some((d) => d.shifts.some((sh) => sh.staff.some((w) => w.employeeId === p.id))));
  return (
    <>
      <div className="row">
        <button type="button" className={`chip pick${preview ? ' on' : ''}`} aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {preview ? t('← חזרה לעריכה') : t('👁️ צפייה מוקדמת')}
        </button>
        <button type="button" className="chip pick" onClick={() => void exportImage()}>{t('🖼️ ייצוא כתמונה')}</button>
      </div>
      {preview && (
        <>
          <p className="muted small-text">{t('כך העובדים יראו את השבוע: בלי בקשות ובלי מי שלא שובץ.')}</p>
          <WeekGrid days={draft} people={working} colorOf={colorOf} today={today} />
        </>
      )}
      {!preview && <>
      <section className="card">
        <h3>{t('מי ביקש, יום ויום')}</h3>
        <p className="muted small-text">{t('לוחצים על שם כדי לשבץ אותו במשמרת (✓ = משובץ). לחיצה נוספת מסירה.')}</p>
        {draft.map((d) => {
          const defs = shiftsOf(d.date);
          const notes = requests.filter((r) => r.dayNotes?.[d.date]);
          return (
            <div key={d.date} className="shift-block">
              <strong>{dayTitle(d.date)}</strong>
              {defs.length === 0 && <span className="muted small-text block">{t('סגור')}</span>}
              {defs.map((sh) => {
                const who = requests.filter((r) => r.shifts.includes(requestKey(d.date, sh.id))).map((r) => r.employeeId);
                const inCount = docs.filter((a) => a.date === d.date && a.shiftId === sh.id).length;
                return (
                  <div key={sh.id}>
                    <span className="muted small-text">{sh.event ? '🎉 ' : ''}{shiftName(sh)} · {inCount}/{sh.max}</span>
                    <div className="chips">
                      {who.length === 0 && <span className="muted small-text">{t('אף אחד לא ביקש')}</span>}
                      {who.map((id) => {
                        const a = docs.find((x) => x.id === assignmentId(d.date, sh.id, id));
                        return (
                          <button key={id} type="button" className={`chip pick${a ? ' on' : ''}`} onClick={() => (a ? onUnassign(a) : onAssign(d.date, sh, id))}>
                            <span className="name-dot" style={colorOf(id)} aria-hidden="true" />{a ? '✓ ' : ''}{nameOf(id)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {notes.map((r) => (
                <span key={r.id} className="small-text block">📝 <strong>{nameOf(r.employeeId)}:</strong> {r.dayNotes![d.date]}</span>
              ))}
            </div>
          );
        })}
      </section>
      <WeekGrid days={draft} people={people} colorOf={colorOf} today={today} asked={asked} selected={cell} onCell={onCell} />
      <p className="muted small-text">{t('לוחצים על משבצת כדי לשבץ, לשנות שעה או להסיר. 🙋 = ביקש/ה לעבוד ביום הזה.')}</p>

      {cell && person && (
        <section className="card cell-editor">
          <div className="row between">
            <strong><span className="name-dot" style={colorOf(person.id)} aria-hidden="true" />{person.name} · {dayTitle(cell.date)}</strong>
            <button type="button" className="small" onClick={onClose}>{t('סגור')}</button>
          </div>
          {cellShifts.map((sh) => {
            const a = docs.find((x) => x.id === assignmentId(cell.date, sh.id, person.id));
            return (
              <div key={sh.id} className="staff-line">
                <span>{sh.event ? '🎉 ' : ''}{shiftName(sh)}</span>
                <span className="row">
                  {a && <input type="time" className="time-in" value={a.start} step={900} aria-label={t('שעת התחלה')} onChange={(e) => onStart(a, e.target.value)} />}
                  {a ? (
                    <button type="button" className="small" onClick={() => onUnassign(a)}>{t('הסר')}</button>
                  ) : (
                    <button type="button" className="small primary" onClick={() => onAssign(cell.date, sh, person.id)}>{t('שבץ')}</button>
                  )}
                </span>
              </div>
            );
          })}
          <p className="muted small-text">{t('סה"כ ביום הזה: {n}', { n: total(cell.date) })}</p>
        </section>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="muted small-text">{t('הגדרות יום:')}</span>
        {draft.map((d) => (
          <button key={d.date} type="button" className={`chip pick${editDay === d.date ? ' on' : ''}`} onClick={() => onEditDay(editDay === d.date ? null : d.date)}>
            {formatShort(d.date)}
          </button>
        ))}
        <button type="button" className="small" onClick={() => setColors(!colors)}>{colors ? t('סגור') : t('🎨 צבעי עובדים')}</button>
      </div>
      {editDay && dayEditor(editDay)}
      {colors && (
        <section className="card">
          <p className="muted small-text">{t('לוחצים על הריבוע ליד השם ובוחרים צבע.')}</p>
          {people.map((p) => (
            <div key={p.id} className="staff-line">
              <span>{p.name}</span>
              <ColorPick value={hexOf(p.id)} onPick={(hex) => onColor(p.id, hex)} />
            </div>
          ))}
        </section>
      )}
      </>}
    </>
  );
}

const formatShort = (date: string) => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;

/** Colour input that saves once the person stops dragging (the picker fires continuously on desktop). */
function ColorPick({ value, onPick }: { value: string; onPick(hex: string): void }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <input
      type="color"
      className="color-pick"
      value={local}
      aria-label={t('בחירת צבע')}
      onChange={(e) => {
        const hex = e.target.value;
        setLocal(hex);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onPick(hex), 400);
      }}
    />
  );
}
