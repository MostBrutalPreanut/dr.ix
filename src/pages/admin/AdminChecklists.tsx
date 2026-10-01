import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { newId, useCollection } from '../../lib/db';
import type { Checklist, ChecklistGroup } from '../../lib/types';
import { seedChecklists } from '../../seed/checklists';
import { pruneEn, suggestEn, t, tl } from '../../lib/i18n';

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
  const [showEn, setShowEn] = useState(false);

  const selected = sorted.find((c) => c.id === (selectedId ?? sorted[0]?.id));

  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, loading]);

  if (loading || !draft) return <p className="muted">{t('טוען…')}</p>;

  const patchGroup = (gi: number, fn: (g: ChecklistGroup) => ChecklistGroup) => {
    setSaved(false);
    setDraft({ ...draft, groups: draft.groups.map((g, i) => (i === gi ? fn(g) : g)) });
  };

  return (
    <>
      <Link to="/admin" className="back">{t('← ניהול')}</Link>
      <h1>{t('✅ נהלי פתיחה וסגירה')}</h1>

      <div className="chips">
        {sorted.map((c) => (
          <button key={c.id} type="button" className={`chip pick${c.id === selected?.id ? ' on' : ''}`} onClick={() => setSelectedId(c.id)}>
            {c.icon} {tl(c.title, c.titleEn)}
          </button>
        ))}
        <button
          type="button"
          className="chip pick"
          onClick={async () => {
            const id = newId();
            await save({ id, title: t('רשימה חדשה'), icon: '📝', order: sorted.length + 1, groups: [] });
            setSelectedId(id);
          }}
        >
          {t('+ רשימה חדשה')}
        </button>
      </div>

      <label className="inline check">
        <input type="checkbox" checked={showEn} onChange={(e) => setShowEn(e.target.checked)} />
        {t('הצג שדות לגרסה באנגלית')}
      </label>

      <div className="card form">
        <div className="row">
          <label className="inline" style={{ flex: '0 0 5rem' }}>
            {t('אייקון')}
            <input value={draft.icon} maxLength={4} onChange={(e) => { setSaved(false); setDraft({ ...draft, icon: e.target.value }); }} />
          </label>
          <label style={{ flex: 1 }}>
            {t('שם הרשימה')}
            <input value={draft.title} onChange={(e) => { setSaved(false); setDraft({ ...draft, title: e.target.value }); }} />
            {showEn && <input dir="ltr" aria-label={t('שם הרשימה באנגלית')} placeholder={suggestEn(draft.title) || t('גרסה באנגלית (לא חובה)')} value={draft.titleEn ?? ''} onChange={(e) => { setSaved(false); setDraft({ ...draft, titleEn: e.target.value }); }} />}
          </label>
        </div>
      </div>

      {draft.groups.map((g, gi) => (
        <section key={g.id} className="card form group-edit">
          <div className="row">
            <input
              aria-label={t('שם הקבוצה')}
              style={{ flex: 1, fontWeight: 700 }}
              value={g.title}
              onChange={(e) => patchGroup(gi, (x) => ({ ...x, title: e.target.value }))}
            />
            {showEn && <input dir="ltr" style={{ flex: 1 }} aria-label={t('שם הקבוצה באנגלית')} placeholder={suggestEn(g.title) || t('גרסה באנגלית (לא חובה)')} value={g.titleEn ?? ''} onChange={(e) => patchGroup(gi, (x) => ({ ...x, titleEn: e.target.value }))} />}
            <button type="button" className="small" aria-label={t('הזז קבוצה למעלה')} onClick={() => { setSaved(false); setDraft({ ...draft, groups: move(draft.groups, gi, -1) }); }}>▲</button>
            <button type="button" className="small" aria-label={t('הזז קבוצה למטה')} onClick={() => { setSaved(false); setDraft({ ...draft, groups: move(draft.groups, gi, 1) }); }}>▼</button>
            <button
              type="button"
              className="small danger"
              onClick={() => {
                if (confirm(t('למחוק את הקבוצה "{title}" עם כל הסעיפים שלה?', { title: g.title }))) {
                  setSaved(false);
                  setDraft({ ...draft, groups: draft.groups.filter((_, i) => i !== gi) });
                }
              }}
            >
              {t('מחק')}
            </button>
          </div>
          {g.items.map((it, ii) => (
            <div key={it.id} className="item-edit">
              <div className="row">
                <textarea
                  rows={2}
                  style={{ flex: 1 }}
                  aria-label={t('טקסט הסעיף')}
                  value={it.text}
                  onChange={(e) => patchGroup(gi, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, text: e.target.value } : y)) }))}
                />
                <div className="col">
                  <button type="button" className="small" aria-label={t('הזז למעלה')} onClick={() => patchGroup(gi, (x) => ({ ...x, items: move(x.items, ii, -1) }))}>▲</button>
                  <button type="button" className="small" aria-label={t('הזז למטה')} onClick={() => patchGroup(gi, (x) => ({ ...x, items: move(x.items, ii, 1) }))}>▼</button>
                  <button type="button" className="small danger" aria-label={t('מחק סעיף')} onClick={() => patchGroup(gi, (x) => ({ ...x, items: x.items.filter((_, k) => k !== ii) }))}>✕</button>
                </div>
              </div>
              <input
                placeholder={t('הערה / דגש (אופציונלי)')}
                value={it.detail ?? ''}
                onChange={(e) => patchGroup(gi, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, detail: e.target.value || undefined } : y)) }))}
              />
              {showEn && (
                <>
                  <textarea dir="ltr" rows={2} aria-label={t('טקסט הסעיף באנגלית')} placeholder={suggestEn(it.text) || t('גרסה באנגלית (לא חובה)')} value={it.textEn ?? ''} onChange={(e) => patchGroup(gi, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, textEn: e.target.value } : y)) }))} />
                  {it.detail && <input dir="ltr" aria-label={t('הערה באנגלית')} placeholder={suggestEn(it.detail) || t('גרסה באנגלית (לא חובה)')} value={it.detailEn ?? ''} onChange={(e) => patchGroup(gi, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, detailEn: e.target.value } : y)) }))} />}
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            className="small"
            onClick={() => patchGroup(gi, (x) => ({ ...x, items: [...x.items, { id: `${x.id}-${newId().slice(0, 6)}`, text: '' }] }))}
          >
            {t('+ סעיף')}
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() => { setSaved(false); setDraft({ ...draft, groups: [...draft.groups, { id: `g-${newId().slice(0, 6)}`, title: t('קבוצה חדשה'), items: [] }] }); }}
      >
        {t('+ קבוצה חדשה')}
      </button>

      <div className="sticky-save">
        <button
          type="button"
          className="primary wide"
          onClick={async () => {
            const clean: Checklist = pruneEn(
              {
                ...draft,
                groups: draft.groups.map((g) => ({
                  ...pruneEn(g, ['titleEn']),
                  items: g.items.filter((i) => i.text.trim()).map((i) => pruneEn(i, ['textEn', 'detailEn'])),
                })),
              },
              ['titleEn'],
            );
            await save(clean);
            setDraft(clean);
            setSaved(true);
          }}
        >
          {saved ? t('✓ נשמר') : t('שמור שינויים')}
        </button>
      </div>
    </>
  );
}
