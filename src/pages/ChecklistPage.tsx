import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { backend, idPrefix, useCollection } from '../lib/db';
import { useBusinessDate } from '../lib/useBusinessDate';
import { formatLongDate, formatTime } from '../lib/dates';
import type { Checklist, ChecklistCheck, ChecklistClosure } from '../lib/types';
import { seedChecklists } from '../seed/checklists';
import { t, tl } from '../lib/i18n';

export default function ChecklistPage() {
  const { id = '' } = useParams();
  const { user, isManager, employees } = useAuth();
  const today = useBusinessDate();
  const nameOf = (eid: string) => employees.find((e) => e.id === eid)?.name ?? '?';

  const lists = useCollection<Checklist>('checklists', seedChecklists);
  const checks = useCollection<ChecklistCheck>('checks', undefined, idPrefix(today));
  const closures = useCollection<ChecklistClosure>('closures', undefined, idPrefix(today));

  const list = lists.items.find((l) => l.id === id);
  if (lists.loading) return <p className="muted">{t('טוען…')}</p>;
  if (!list || !user) return <p>{t('הרשימה לא נמצאה.')}{' '}<Link to="/">{t('חזרה')}</Link></p>;

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

  async function markAll() {
    const missing = allItems.filter((i) => !byItem.has(i.id));
    if (missing.length === 0) return;
    if (!confirm(t('בטוחים שתרצו לסמן הכל? יסומנו עוד {length} סעיפים בשמכם.', { length: missing.length }))) return;
    const at = new Date().toISOString();
    const doc = (itemId: string): ChecklistCheck => ({ id: checkId(itemId), date: today, checklistId: list!.id, itemId, by: user!.id, at });
    const last = missing[missing.length - 1];
    await Promise.all(missing.slice(0, -1).map((i) => backend.upsert('checks', doc(i.id))));
    await checks.save(doc(last.id)); // the last one also refreshes the screen
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
      <Link to="/" className="back">{t('← חזרה להיום')}</Link>
      <h1>
        {list.icon} {tl(list.title, list.titleEn)}
      </h1>
      <p className="muted">{formatLongDate(today)}</p>
      <div className="bar big">
        <div style={{ width: `${allItems.length ? (done / allItems.length) * 100 : 0}%` }} />
      </div>
      <p className="muted small-text">
        {done}/{allItems.length}{' '}{t('הושלמו')}
      </p>

      {!closure && !complete && (
        <button type="button" className="small" onClick={() => void markAll()}>
          {t('✓ סמן הכל')}
        </button>
      )}

      {closure && (
        <div className="card success">
          {t('✓ הרשימה נסגרה ע"י {name} ב-{time}', { name: nameOf(closure.by), time: formatTime(closure.at) })}
          {(isManager || closure.by === user.id) && (
            <button type="button" className="small" onClick={() => void closures.remove(closure.id)}>
              {t('פתח מחדש')}
            </button>
          )}
        </div>
      )}

      {list.groups.map((g) => {
        const gDone = g.items.filter((i) => byItem.has(i.id)).length;
        return (
          <section key={g.id}>
            <div className="section-head">
              <h2>{tl(g.title, g.titleEn)}</h2>
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
                      <span className="li-text">{tl(item.text, item.textEn)}</span>
                      {item.detail && <span className="li-detail">{tl(item.detail, item.detailEn)}</span>}
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
          {complete ? t('סיימתי, סגור את הרשימה') : t('נשארו {done} סעיפים', { done: allItems.length - done })}
        </button>
      )}
    </>
  );
}
