import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { newId, useCollection } from '../lib/db';
import { CATEGORY_ORDER, excerpt, seedHandbook } from '../lib/handbook';
import type { HandbookSection } from '../lib/types';
import { Markdown } from '../components/Markdown';
import { t } from '../lib/i18n';

function useHandbook() {
  return useCollection<HandbookSection>('handbook', seedHandbook);
}

export function HandbookList() {
  const { items, loading } = useHandbook();
  const { isManager } = useAuth();
  const [q, setQ] = useState('');
  const query = q.trim();

  const results = useMemo(() => {
    if (!query) return [];
    const lc = query.toLowerCase();
    return items.filter((s) => s.title.toLowerCase().includes(lc) || s.body.toLowerCase().includes(lc));
  }, [items, query]);

  const categories = useMemo(() => {
    const names = Array.from(new Set([...CATEGORY_ORDER, ...items.map((s) => s.category)]));
    return names
      .map((name) => ({ name, sections: items.filter((s) => s.category === name).sort((a, b) => a.order - b.order) }))
      .filter((c) => c.sections.length > 0);
  }, [items]);

  return (
    <>
      <h1>{t('📖 ספר הנהלים')}</h1>
      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('חיפוש: בצק, קוקטייל, חשמל, טיפ…')}
        aria-label={t('חיפוש בנהלים')}
      />
      {loading && <p className="muted">{t('טוען…')}</p>}

      {query ? (
        <section>
          <p className="muted small-text">{results.length}{' '}{t('תוצאות')}</p>
          {results.map((s) => (
            <Link key={s.id} to={`/handbook/${s.id}`} className="card result">
              <strong>
                {s.icon} {t(s.title)}
              </strong>
              <span className="muted small-text">{excerpt(s.body, query)}</span>
            </Link>
          ))}
          {results.length === 0 && <p className="muted empty">{t('לא נמצא כלום. נסו מילה אחרת.')}</p>}
        </section>
      ) : (
        categories.map((c) => (
          <section key={c.name}>
            <h2>{t(c.name)}</h2>
            <div className="grid2">
              {c.sections.map((s) => (
                <Link key={s.id} to={`/handbook/${s.id}`} className="card tile">
                  <div className="tile-title">
                    <span className="big-ico">{s.icon}</span> {t(s.title)}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {isManager && !query && (
        <Link to="/handbook/new" className="primary wide as-link">
          {t('+ פרק חדש')}
        </Link>
      )}
    </>
  );
}

export function HandbookSectionPage() {
  const { id = '' } = useParams();
  const { items, loading, save, remove } = useHandbook();
  const { isManager } = useAuth();
  const nav = useNavigate();
  const isNew = id === 'new';
  const section = items.find((s) => s.id === id);
  const [editing, setEditing] = useState(isNew);

  if (loading) return <p className="muted">{t('טוען…')}</p>;
  if (!isNew && !section) return <p>{t('הפרק לא נמצא.')}{' '}<Link to="/handbook">{t('חזרה')}</Link></p>;

  if (editing && isManager) {
    return (
      <SectionEditor
        initial={section ?? { id: newId(), title: '', icon: '📄', category: CATEGORY_ORDER[0], order: items.length + 1, body: '' }}
        categories={CATEGORY_ORDER}
        isNew={isNew}
        onCancel={() => (isNew ? nav('/handbook') : setEditing(false))}
        onSave={async (s) => {
          await save(s);
          setEditing(false);
          nav(`/handbook/${s.id}`, { replace: true });
        }}
        onDelete={
          isNew
            ? undefined
            : async () => {
                if (confirm(t('למחוק את הפרק הזה?'))) {
                  await remove(section!.id);
                  nav('/handbook');
                }
              }
        }
      />
    );
  }

  return (
    <>
      <Link to="/handbook" className="back">{t('← לכל הנהלים')}</Link>
      <div className="section-head">
        <h1>
          {section!.icon} {t(section!.title)}
        </h1>
        {isManager && (
          <button type="button" className="small" onClick={() => setEditing(true)}>
            {t('✏️ עריכה')}
          </button>
        )}
      </div>
      <article className="card prose">
        <Markdown>{section!.body}</Markdown>
      </article>
    </>
  );
}

function SectionEditor({
  initial,
  categories,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: HandbookSection;
  categories: string[];
  isNew: boolean;
  onSave(s: HandbookSection): Promise<void>;
  onCancel(): void;
  onDelete?: () => Promise<void>;
}) {
  const [s, setS] = useState(initial);
  const [preview, setPreview] = useState(false);
  const valid = s.title.trim() && s.body.trim();
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void onSave({ ...s, title: s.title.trim(), body: s.body.trim() });
      }}
    >
      <h1>{isNew ? t('פרק חדש') : t('עריכת פרק')}</h1>
      <div className="row">
        <label className="inline" style={{ flex: '0 0 5rem' }}>
          {t('אייקון')}
          <input value={s.icon} onChange={(e) => setS({ ...s, icon: e.target.value })} maxLength={4} />
        </label>
        <label style={{ flex: 1 }}>
          {t('כותרת')}
          <input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} required />
        </label>
      </div>
      <label>
        {t('קטגוריה')}
        <input list="cats" value={s.category} onChange={(e) => setS({ ...s, category: e.target.value })} />
        <datalist id="cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="row between">
        <span>{t('תוכן (Markdown: ## כותרת, - רשימה, **מודגש**)')}</span>
        <button type="button" className="small" onClick={() => setPreview((p) => !p)}>
          {preview ? t('חזרה לעריכה') : t('תצוגה מקדימה')}
        </button>
      </div>
      {preview ? (
        <div className="card prose">
          <Markdown>{s.body}</Markdown>
        </div>
      ) : (
        <textarea className="mono" rows={18} value={s.body} onChange={(e) => setS({ ...s, body: e.target.value })} />
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          {t('שמור')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('ביטול')}
        </button>
        {onDelete && (
          <button type="button" className="danger" onClick={() => void onDelete()}>
            {t('מחק פרק')}
          </button>
        )}
      </div>
    </form>
  );
}
