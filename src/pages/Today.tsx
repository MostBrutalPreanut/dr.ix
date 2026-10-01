import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { idPrefix, useCollection } from '../lib/db';
import { useBusinessDate } from '../lib/useBusinessDate';
import { CARRY_OVER_DAYS, completionId, dueTasks } from '../lib/schedule';
import { WEEKDAY_NAMES, addDays, formatLongDate, formatTime, weekdayOf } from '../lib/dates';
import { AREA_LABEL } from '../lib/types';
import type { Checklist, ChecklistCheck, ChecklistClosure, Note, NoteAck, Settings, Task, TaskCompletion } from '../lib/types';
import { seedChecklists } from '../seed/checklists';
import { seedSettings, seedTasks } from '../seed/tasks';
import { NoteComposer } from '../components/NoteComposer';

export default function Today() {
  const { user, isManager, employees } = useAuth();
  const today = useBusinessDate();
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';

  const notes = useCollection<Note>('notes', undefined, idPrefix(today));
  const acks = useCollection<NoteAck>('noteAcks', undefined, idPrefix(today));
  const checklists = useCollection<Checklist>('checklists', seedChecklists);
  const checks = useCollection<ChecklistCheck>('checks', undefined, idPrefix(today));
  const closures = useCollection<ChecklistClosure>('closures', undefined, idPrefix(today));
  const tasks = useCollection<Task>('tasks', seedTasks);
  const settings = useCollection<Settings>('settings', seedSettings);
  const completions = useCollection<TaskCompletion>('taskCompletions', undefined, {
    from: addDays(today, -CARRY_OVER_DAYS),
    to: `${today}~`,
  });

  const [composing, setComposing] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const anchor = settings.items[0]?.biweeklyAnchor ?? today;
  const startDate = settings.items[0]?.startDate ?? today;
  const due = useMemo(
    () => dueTasks(tasks.items, completions.items, today, anchor, startDate),
    [tasks.items, completions.items, today, anchor, startDate],
  );

  const sortedNotes = useMemo(() => {
    const mine = new Set(acks.items.filter((a) => a.employeeId === user?.id).map((a) => a.noteId));
    return [...notes.items].sort((a, b) => {
      const ua = Number(!mine.has(a.id)) , ub = Number(!mine.has(b.id));
      return ub - ua || Number(b.urgent) - Number(a.urgent) || a.createdAt.localeCompare(b.createdAt);
    });
  }, [notes.items, acks.items, user?.id]);

  if (!user) return null;

  async function ackNote(n: Note) {
    await acks.save({
      id: `${today}|${n.id}|${user!.id}`,
      date: today,
      noteId: n.id,
      employeeId: user!.id,
      at: new Date().toISOString(),
    });
  }

  async function toggleTask(taskId: string, dueDate: string, done: boolean) {
    const id = completionId(taskId, dueDate);
    if (done) await completions.remove(id);
    else await completions.save({ id, taskId, dueDate, by: user!.id, at: new Date().toISOString() });
  }

  const doneCount = due.filter((d) => d.done).length;

  return (
    <>
      <section className="hello">
        <h1>שלום {user.name} 👋</h1>
        <p className="muted">{formatLongDate(today)}</p>
      </section>

      <section>
        <div className="section-head">
          <h2>📣 הערות למשמרת</h2>
          {isManager && (
            <button type="button" className="small" onClick={() => setComposing((c) => !c)}>
              {composing ? 'סגור' : '+ הערה'}
            </button>
          )}
        </div>
        {composing && <NoteComposer date={today} onDone={() => setComposing(false)} />}
        {sortedNotes.length === 0 && !composing && <p className="muted empty">אין הערות להיום.</p>}
        {sortedNotes.map((n) => {
          const seenBy = acks.items.filter((a) => a.noteId === n.id);
          const iSaw = seenBy.some((a) => a.employeeId === user.id);
          const missing = employees.filter((e) => !seenBy.some((a) => a.employeeId === e.id));
          return (
            <article key={n.id} className={`card note${n.urgent ? ' urgent' : ''}${iSaw ? ' seen' : ''}`}>
              <div className="note-meta">
                {n.urgent && <span className="chip red">דחוף</span>}
                <span className="chip">{AREA_LABEL[n.area]}</span>
                <span className="muted small-text">
                  {nameOf(n.createdBy)} · {formatTime(n.createdAt)}
                </span>
              </div>
              <p className="note-text">{n.text}</p>
              <div className="note-foot">
                {iSaw ? (
                  <span className="ok">✓ ראיתי</span>
                ) : (
                  <button type="button" className="primary small" onClick={() => void ackNote(n)}>
                    ראיתי ✓
                  </button>
                )}
                {isManager && (
                  <span className="muted small-text" title={missing.map((m) => m.name).join(', ')}>
                    ראו {seenBy.length}/{employees.length}
                    {missing.length > 0 && missing.length <= 4 && ` · טרם: ${missing.map((m) => m.name).join(', ')}`}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section>
        <h2>✅ נהלי פתיחה וסגירה</h2>
        <div className="grid2">
          {[...checklists.items]
            .sort((a, b) => a.order - b.order)
            .map((c) => {
              const itemIds = new Set(c.groups.flatMap((g) => g.items.map((i) => i.id)));
              const done = checks.items.filter((k) => k.checklistId === c.id && itemIds.has(k.itemId)).length;
              const closed = closures.items.find((x) => x.checklistId === c.id);
              const pct = itemIds.size ? Math.round((done / itemIds.size) * 100) : 0;
              return (
                <Link key={c.id} to={`/checklist/${c.id}`} className={`card tile${closed ? ' closed' : ''}`}>
                  <div className="tile-title">
                    <span className="big-ico">{c.icon}</span> {c.title}
                  </div>
                  <div className="bar">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <div className="muted small-text">
                    {closed ? `✓ נסגר ע"י ${nameOf(closed.by)} · ${formatTime(closed.at)}` : `${done}/${itemIds.size} הושלמו`}
                  </div>
                </Link>
              );
            })}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>🧹 משימות יום {WEEKDAY_NAMES[weekdayOf(today)]}</h2>
          <span className="muted small-text">
            {doneCount}/{due.length}
          </span>
        </div>
        {due.length === 0 && <p className="muted empty">אין משימות מיוחדות להיום 🎉</p>}
        {due.map(({ task, dueDate, done, late }) => {
          const comp = completions.items.find((c) => c.id === completionId(task.id, dueDate));
          const key = `${dueDate}|${task.id}`;
          const open = openTask === key;
          return (
            <div key={key} className={`card task${done ? ' done' : ''}${late ? ' late' : ''}`}>
              <div className="task-row">
                <button
                  type="button"
                  className={`check${done ? ' on' : ''}`}
                  aria-label={done ? 'בטל סימון' : 'סמן כבוצע'}
                  aria-pressed={done}
                  onClick={() => void toggleTask(task.id, dueDate, done)}
                >
                  {done ? '✓' : ''}
                </button>
                <button type="button" className="task-title" onClick={() => setOpenTask(open ? null : key)}>
                  <span>{task.title}</span>
                  {late && <span className="chip red">מיום {WEEKDAY_NAMES[weekdayOf(dueDate)]}</span>}
                  {task.everyNWeeks === 2 && <span className="chip">אחת לשבועיים</span>}
                  {comp && (
                    <span className="muted small-text">
                      {nameOf(comp.by)} · {formatTime(comp.at)}
                    </span>
                  )}
                </button>
                <span className="chev" aria-hidden>{open ? '▴' : '▾'}</span>
              </div>
              {open && (
                <div className="task-detail">
                  {task.description ? (
                    <p>{task.description}</p>
                  ) : (
                    <p className="muted">עדיין אין הסבר למשימה הזו.{isManager && ' אפשר להוסיף אחד בניהול ← משימות ניקיון.'}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
