import { useState } from 'react';
import { Link } from 'react-router-dom';
import { newId, useCollection } from '../../lib/db';
import { WEEKDAY_NAMES, addDays, weekIndex } from '../../lib/dates';
import { useBusinessDate } from '../../lib/useBusinessDate';
import type { Settings, Task } from '../../lib/types';
import { seedSettings, seedTasks } from '../../seed/tasks';

export default function AdminTasks() {
  const today = useBusinessDate();
  const tasks = useCollection<Task>('tasks', seedTasks);
  const settings = useCollection<Settings>('settings', seedSettings);
  const [editing, setEditing] = useState<Task | null>(null);

  const anchor = settings.items[0]?.biweeklyAnchor ?? today;
  const thisWeekIsA = (((weekIndex(today, anchor) % 2) + 2) % 2) === 0;

  if (editing) {
    return (
      <TaskEditor
        task={editing}
        isNew={!tasks.items.some((t) => t.id === editing.id)}
        onCancel={() => setEditing(null)}
        onSave={async (t) => {
          await tasks.save(t);
          setEditing(null);
        }}
        onDelete={async () => {
          if (confirm(`למחוק את "${editing.title}"?`)) {
            await tasks.remove(editing.id);
            setEditing(null);
          }
        }}
      />
    );
  }

  return (
    <>
      <Link to="/admin" className="back">← ניהול</Link>
      <h1>🧹 משימות ניקיון</h1>
      <p className="muted">לחצו על משימה כדי לערוך אותה ולכתוב הסבר לעובדים.</p>

      <div className="card">
        <strong>משימות אחת לשבועיים:</strong> השבוע הוא <strong>שבוע {thisWeekIsA ? 'א׳' : 'ב׳'}</strong>.
        <div className="row" style={{ marginTop: '.5rem' }}>
          <button
            type="button"
            className="small"
            onClick={() => {
              const s: Settings = settings.items[0] ?? { id: 'settings', biweeklyAnchor: today };
              void settings.save({ ...s, biweeklyAnchor: addDays(s.biweeklyAnchor, 7) });
            }}
          >
            החלף ל{thisWeekIsA ? 'שבוע ב׳' : 'שבוע א׳'} (אם הסדר לא מתאים)
          </button>
        </div>
      </div>

      {WEEKDAY_NAMES.map((name, wd) => {
        const list = tasks.items.filter((t) => t.weekday === wd).sort((a, b) => a.order - b.order);
        return (
          <section key={wd}>
            <div className="section-head">
              <h2>יום {name}</h2>
              <button
                type="button"
                className="small"
                onClick={() =>
                  setEditing({ id: newId(), title: '', description: '', weekday: wd, everyNWeeks: 1, weekOffset: 0, active: true, order: tasks.items.length })
                }
              >
                + משימה
              </button>
            </div>
            {list.length === 0 && <p className="muted small-text">אין משימות.</p>}
            {list.map((t) => (
              <button key={t.id} type="button" className={`card task-pick${t.active ? '' : ' off'}`} onClick={() => setEditing(t)}>
                <span>{t.title}</span>
                <span className="chips">
                  {t.everyNWeeks === 2 && <span className="chip">שבוע {t.weekOffset === 0 ? 'א׳' : 'ב׳'} (אחת לשבועיים)</span>}
                  {!t.active && <span className="chip">כבויה</span>}
                  {!t.description && <span className="chip soft">אין הסבר</span>}
                </span>
              </button>
            ))}
          </section>
        );
      })}
    </>
  );
}

function TaskEditor({
  task,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  task: Task;
  isNew: boolean;
  onSave(t: Task): Promise<void>;
  onCancel(): void;
  onDelete(): Promise<void>;
}) {
  const [t, setT] = useState(task);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.title.trim()) void onSave({ ...t, title: t.title.trim() });
      }}
    >
      <h1>{isNew ? 'משימה חדשה' : 'עריכת משימה'}</h1>
      <label>
        שם המשימה
        <input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} required />
      </label>
      <label>
        הסבר לעובדים (איך עושים, עם מה, מה חשוב)
        <textarea rows={6} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />
      </label>
      <div className="row">
        <label style={{ flex: 1 }}>
          יום
          <select value={t.weekday} onChange={(e) => setT({ ...t, weekday: Number(e.target.value) })}>
            {WEEKDAY_NAMES.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          תדירות
          <select value={t.everyNWeeks} onChange={(e) => setT({ ...t, everyNWeeks: Number(e.target.value) as 1 | 2 })}>
            <option value={1}>כל שבוע</option>
            <option value={2}>אחת לשבועיים</option>
          </select>
        </label>
        {t.everyNWeeks === 2 && (
          <label style={{ flex: 1 }}>
            באיזה שבוע
            <select value={t.weekOffset} onChange={(e) => setT({ ...t, weekOffset: Number(e.target.value) as 0 | 1 })}>
              <option value={0}>שבוע א׳</option>
              <option value={1}>שבוע ב׳</option>
            </select>
          </label>
        )}
      </div>
      <label className="inline check">
        <input type="checkbox" checked={t.active} onChange={(e) => setT({ ...t, active: e.target.checked })} />
        פעילה (תופיע לעובדים)
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!t.title.trim()}>
          שמור
        </button>
        <button type="button" onClick={onCancel}>
          ביטול
        </button>
        {!isNew && (
          <button type="button" className="danger" onClick={() => void onDelete()}>
            מחק
          </button>
        )}
      </div>
    </form>
  );
}
