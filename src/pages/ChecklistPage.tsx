import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { idPrefix, useCollection } from '../lib/db';
import { useBusinessDate } from '../lib/useBusinessDate';
import { formatLongDate, formatTime } from '../lib/dates';
import type { Checklist, ChecklistCheck, ChecklistClosure } from '../lib/types';
import { seedChecklists } from '../seed/checklists';

export default function ChecklistPage() {
  const { id = '' } = useParams();
  const { user, isManager, employees } = useAuth();
  const today = useBusinessDate();
  const nameOf = (eid: string) => employees.find((e) => e.id === eid)?.name ?? '?';

  const lists = useCollection<Checklist>('checklists', seedChecklists);
  const checks = useCollection<ChecklistCheck>('checks', undefined, idPrefix(today));
  const closures = useCollection<ChecklistClosure>('closures', undefined, idPrefix(today));

  const list = lists.items.find((l) => l.id === id);
  if (lists.loading) return <p className="muted">טוען…</p>;
  if (!list || !user) return <p>הרשימה לא נמצאה. <Link to="/">חזרה</Link></p>;

  const checkId = (itemId: string) => `${today}|${list.id}|${itemId}`;
  const mine = checks.items.filter((c) => c.checklistId === list.id);
  const byItem = new Map(mine.map((c) => [c.itemId, c]));
  const allItems = list.groups.flatMap((g) => g.items);
  const done = allItems.filter((i) => byItem.has(i.id)).length;
  const closure = closures.items.find((c) => c.checklistId === list.id);
  const complete = done === allItems.length && allItems.length > 0;

  async function toggle(itemId: string) {
    if (closure) return;
    const existing = byItem.get(itemId);
    if (existing) await checks.remove(existing.id);
    else
      await checks.save({
        id: checkId(itemId),
        date: today,
        checklistId: list!.id,
        itemId,
        by: user!.id,
        at: new Date().toISOString(),
      });
  }

  async function close() {
    await closures.save({
      id: `${today}|${list!.id}`,
      date: today,
      checklistId: list!.id,
      by: user!.id,
      at: new Date().toISOString(),
    });
  }

  return (
    <>
      <Link to="/" className="back">← חזרה להיום</Link>
      <h1>
        {list.icon} {list.title}
      </h1>
      <p className="muted">{formatLongDate(today)}</p>
      <div className="bar big">
        <div style={{ width: `${allItems.length ? (done / allItems.length) * 100 : 0}%` }} />
      </div>
      <p className="muted small-text">
        {done}/{allItems.length} הושלמו
      </p>

      {closure && (
        <div className="card success">
          ✓ הרשימה נסגרה ע"י {nameOf(closure.by)} ב-{formatTime(closure.at)}
          {(isManager || closure.by === user.id) && (
            <button type="button" className="small" onClick={() => void closures.remove(closure.id)}>
              פתח מחדש
            </button>
          )}
        </div>
      )}

      {list.groups.map((g) => {
        const gDone = g.items.filter((i) => byItem.has(i.id)).length;
        return (
          <section key={g.id}>
            <div className="section-head">
              <h2>{g.title}</h2>
              <span className="muted small-text">
                {gDone}/{g.items.length}
              </span>
            </div>
            <div className="card list">
              {g.items.map((item) => {
                const c = byItem.get(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`li${c ? ' done' : ''}`}
                    aria-pressed={Boolean(c)}
                    disabled={Boolean(closure)}
                    onClick={() => void toggle(item.id)}
                  >
                    <span className={`check${c ? ' on' : ''}`}>{c ? '✓' : ''}</span>
                    <span className="li-body">
                      <span className="li-text">{item.text}</span>
                      {item.detail && <span className="li-detail">{item.detail}</span>}
                      {c && (
                        <span className="muted small-text">
                          {nameOf(c.by)} · {formatTime(c.at)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {!closure && (
        <button type="button" className="primary wide" disabled={!complete} onClick={() => void close()}>
          {complete ? 'סיימתי, סגור את הרשימה' : `נשארו ${allItems.length - done} סעיפים`}
        </button>
      )}
    </>
  );
}
