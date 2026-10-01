import { useState } from 'react';
import { Link } from 'react-router-dom';
import { newId, useCollection } from '../../lib/db';
import { WEEKDAY_NAMES, addDays, weekIndex } from '../../lib/dates';
import { useBusinessDate } from '../../lib/useBusinessDate';
import type { Settings, Task } from '../../lib/types';
import { seedSettings, seedTasks } from '../../seed/tasks';
import { t } from '../../lib/i18n';

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
          if (confirm(t('למחוק את "{title}"?', { title: editing.title }))) {
            await tasks.remove(editing.id);
            setEditing(null);
          }
        }}
      />
    );
  }

  return (
    <>
      <Link to="/admin" className="back">{t('← ניהול')}</Link>
      <h1>{t('🧹 משימות ניקיון')}</h1>
      <p className="muted">{t('לחצו על משימה כדי לערוך אותה ולכתוב הסבר לעובדים.')}</p>

      <div className="card">
        <strong>{t('משימות אחת לשבועיים:')}</strong>{' '}{t('השבוע הוא')}{' '}<strong>{t('שבוע')}{' '}{thisWeekIsA ? t('א׳') : t('ב׳')}</strong>.
        <div className="row" style={{ marginTop: '.5rem' }}>
          <button
            type="button"
            className="small"
            onClick={() => {
              const s: Settings = settings.items[0] ?? { id: 'settings', biweeklyAnchor: today };
              void settings.save({ ...s, biweeklyAnchor: addDays(s.biweeklyAnchor, 7) });
            }}
          >
            {t('החלף ל')}{thisWeekIsA ? t('שבוע ב׳') : t('שבוע א׳')}{' '}{t('(אם הסדר לא מתאים)')}
          </button>
        </div>
      </div>

      {WEEKDAY_NAMES.map((name, wd) => {
        const list = tasks.items.filter((t) => t.weekday === wd).sort((a, b) => a.order - b.order);
        return (
          <section key={wd}>
            <div className="section-head">
              <h2>{t('יום {day}', { day: t(name) })}</h2>
              <button
                type="button"
                className="small"
                onClick={() =>
                  setEditing({ id: newId(), title: '', description: '', weekday: wd, everyNWeeks: 1, weekOffset: 0, active: true, order: tasks.items.length })
                }
              >
                {t('+ משימה')}
              </button>
            </div>
            {list.length === 0 && <p className="muted small-text">{t('אין משימות.')}</p>}
            {list.map((task) => (
              <button key={task.id} type="button" className={`card task-pick${task.active ? '' : ' off'}`} onClick={() => setEditing(task)}>
                <span>{t(task.title)}</span>
                <span className="chips">
                  {task.everyNWeeks === 2 && <span className="chip">{t('שבוע')}{' '}{task.weekOffset === 0 ? t('א׳') : t('ב׳')}{' '}{t('(אחת לשבועיים)')}</span>}
                  {!task.active && <span className="chip">{t('כבויה')}</span>}
                  {!task.description && <span className="chip soft">{t('אין הסבר')}</span>}
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
  const [f, setF] = useState(task);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.title.trim()) void onSave({ ...f, title: f.title.trim() });
      }}
    >
      <h1>{isNew ? t('משימה חדשה') : t('עריכת משימה')}</h1>
      <label>
        {t('שם המשימה')}
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
      </label>
      <label>
        {t('הסבר לעובדים (איך עושים, עם מה, מה חשוב)')}
        <textarea rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="row">
        <label style={{ flex: 1 }}>
          {t('יום')}
          <select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>
            {WEEKDAY_NAMES.map((n, i) => (
              <option key={i} value={i}>
                {t(n)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          {t('תדירות')}
          <select value={f.everyNWeeks} onChange={(e) => setF({ ...f, everyNWeeks: Number(e.target.value) as 1 | 2 })}>
            <option value={1}>{t('כל שבוע')}</option>
            <option value={2}>{t('אחת לשבועיים')}</option>
          </select>
        </label>
        {f.everyNWeeks === 2 && (
          <label style={{ flex: 1 }}>
            {t('באיזה שבוע')}
            <select value={f.weekOffset} onChange={(e) => setF({ ...f, weekOffset: Number(e.target.value) as 0 | 1 })}>
              <option value={0}>{t('שבוע א׳')}</option>
              <option value={1}>{t('שבוע ב׳')}</option>
            </select>
          </label>
        )}
      </div>
      <label className="inline check">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        {t('פעילה (תופיע לעובדים)')}
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!f.title.trim()}>
          {t('שמור')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('ביטול')}
        </button>
        {!isNew && (
          <button type="button" className="danger" onClick={() => void onDelete()}>
            {t('מחק')}
          </button>
        )}
      </div>
    </form>
  );
}
