import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { newId, useCollection } from '../../lib/db';
import type { Checklist, ChecklistGroup } from '../../lib/types';
import { seedChecklists } from '../../seed/checklists';

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export default function AdminChecklists() {
  const { items, loading, save } = useCollection<Checklist>('checklists', seedChecklists);
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Checklist | null>(null);
  const [saved, setSaved] = useState(false);

  const selected = sorted.find((c) => c.id === (selectedId ?? sorted[0]?.id));

  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, loading]);

  if (loading || !draft) return <p className="muted">טוען…</p>;

  const patchGroup = (gi: number, fn: (g: ChecklistGroup) => ChecklistGroup) => {
    setSaved(false);
    setDraft({ ...draft, groups: draft.groups.map((g, i) => (i === gi ? fn(g) : g)) });
  };

  return (
    <>
      <Link to="/admin" className="back">← ניהול</Link>
      <h1>✅ נהלי פתיחה וסגירה</h1>

      <div className="chips">
        {sorted.map((c) => (
          <button key={c.id} type="button" className={`chip pick${c.id === selected?.id ? ' on' : ''}`} onClick={() => setSelectedId(c.id)}>
            {c.icon} {c.title}
          </button>
        ))}
        <button
          type="button"
          className="chip pick"
          onClick={async () => {
            const id = newId();
            await save({ id, title: 'רשימה חדשה', icon: '📝', order: sorted.length + 1, groups: [] });
            setSelectedId(id);
          }}
        >
          + רשימה חדשה
        </button>
      </div>

      <div className="card form">
        <div className="row">
          <label className="inline" style={{ flex: '0 0 5rem' }}>
            אייקון
            <input value={draft.icon} maxLength={4} onChange={(e) => { setSaved(false); setDraft({ ...draft, icon: e.target.value }); }} />
          </label>
          <label style={{ flex: 1 }}>
            שם הרשימה
            <input value={draft.title} onChange={(e) => { setSaved(false); setDraft({ ...draft, title: e.target.value }); }} />
          </label>
        </div>
      </div>

      {draft.groups.map((g, gi) => (
        <section key={g.id} className="card form group-edit">
          <div className="row">
            <input
              aria-label="שם הקבוצה"
              style={{ flex: 1, fontWeight: 700 }}
              value={g.title}
              onChange={(e) => patchGroup(gi, (x) => ({ ...x, title: e.target.value }))}
            />
            <button type="button" className="small" aria-label="הזז קבוצה למעלה" onClick={() => { setSaved(false); setDraft({ ...draft, groups: move(draft.groups, gi, -1) }); }}>▲</button>
            <button type="button" className="small" aria-label="הזז קבוצה למטה" onClick={() => { setSaved(false); setDraft({ ...draft, groups: move(draft.groups, gi, 1) }); }}>▼</button>
            <button
              type="button"
              className="small danger"
              onClick={() => {
                if (confirm(`למחוק את הקבוצה "${g.title}" עם כל הסעיפים שלה?`)) {
                  setSaved(false);
                  setDraft({ ...draft, groups: draft.groups.filter((_, i) => i !== gi) });
                }
              }}
            >
              מחק
            </button>
          </div>
          {g.items.map((it, ii) => (
            <div key={it.id} className="item-edit">
              <div className="row">
                <textarea
                  rows={2}
                  style={{ flex: 1 }}
                  aria-label="טקסט הסעיף"
                  value={it.text}
                  onChange={(e) => patchGroup(gi, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, text: e.target.value } : y)) }))}
                />
                <div className="col">
                  <button type="button" className="small" aria-label="הזז למעלה" onClick={() => patchGroup(gi, (x) => ({ ...x, items: move(x.items, ii, -1) }))}>▲</button>
                  <button type="button" className="small" aria-label="הזז למטה" onClick={() => patchGroup(gi, (x) => ({ ...x, items: move(x.items, ii, 1) }))}>▼</button>
                  <button type="button" className="small danger" aria-label="מחק סעיף" onClick={() => patchGroup(gi, (x) => ({ ...x, items: x.items.filter((_, k) => k !== ii) }))}>✕</button>
                </div>
              </div>
              <input
                placeholder="הערה / דגש (אופציונלי)"
                value={it.detail ?? ''}
                onChange={(e) => patchGroup(gi, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, detail: e.target.value || undefined } : y)) }))}
              />
            </div>
          ))}
          <button
            type="button"
            className="small"
            onClick={() => patchGroup(gi, (x) => ({ ...x, items: [...x.items, { id: `${x.id}-${newId().slice(0, 6)}`, text: '' }] }))}
          >
            + סעיף
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() => { setSaved(false); setDraft({ ...draft, groups: [...draft.groups, { id: `g-${newId().slice(0, 6)}`, title: 'קבוצה חדשה', items: [] }] }); }}
      >
        + קבוצה חדשה
      </button>

      <div className="sticky-save">
        <button
          type="button"
          className="primary wide"
          onClick={async () => {
            const clean: Checklist = {
              ...draft,
              groups: draft.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.text.trim()) })),
            };
            await save(clean);
            setDraft(clean);
            setSaved(true);
          }}
        >
          {saved ? '✓ נשמר' : 'שמור שינויים'}
        </button>
      </div>
    </>
  );
}
