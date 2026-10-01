import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { newId, useCollection } from '../../lib/db';
import { WEEKDAY_NAMES } from '../../lib/dates';
import { categoriesOf, itemsOfCategory, moveItem, parseBulk } from '../../lib/inventory';
import type { InventoryItem, InventoryMode } from '../../lib/types';
import { seedInventory } from '../../seed/inventory';

const MODE_LABEL: Record<InventoryMode, string> = {
  status: 'מספיק / מעט / נגמר',
  count: 'ספירה (מספר)',
  photo: 'צילום בלבד',
};

export default function AdminInventory() {
  const inv = useCollection<InventoryItem>('inventoryItems', seedInventory);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [bulk, setBulk] = useState(false);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');

  const categories = useMemo(() => categoriesOf(inv.items), [inv.items]);
  const q = query.trim();
  const visible = q ? inv.items.filter((i) => i.name.includes(q) || i.category.includes(q)) : inv.items;
  const newOrder = () => inv.items.reduce((m, i) => Math.max(m, i.order), 0) + 10;

  async function guard(action: () => Promise<void>) {
    try {
      await action();
      setMsg('');
    } catch {
      setMsg('השמירה נכשלה - בדקו חיבור והרשאה ונסו שוב');
    }
  }

  async function move(id: string, dir: -1 | 1) {
    await guard(async () => {
      for (const i of moveItem(inv.items, id, dir)) await inv.save(i);
    });
  }

  async function renameCategory(cat: string) {
    const name = prompt('שם חדש לקטגוריה:', cat)?.trim();
    if (!name || name === cat) return;
    await guard(async () => {
      for (const i of inv.items.filter((x) => x.category === cat)) await inv.save({ ...i, category: name });
    });
  }

  if (editing) {
    return (
      <ItemEditor
        item={editing}
        isNew={!inv.items.some((i) => i.id === editing.id)}
        categories={categories}
        onCancel={() => setEditing(null)}
        onSave={async (i) => {
          await guard(async () => {
            await inv.save(i);
            setEditing(null);
          });
        }}
        onDelete={async () => {
          if (confirm(`למחוק את "${editing.name}"? אפשר גם לכבות אותו במקום למחוק.`)) {
            await guard(async () => {
              await inv.remove(editing.id);
              setEditing(null);
            });
          }
        }}
      />
    );
  }

  if (bulk) {
    return (
      <BulkAdd
        categories={categories}
        onCancel={() => setBulk(false)}
        onSave={async (text, base) => {
          const fresh = parseBulk(text, base, inv.items, newId);
          await guard(async () => {
            for (const i of fresh) await inv.save(i);
            setBulk(false);
            setMsg(fresh.length ? `נוספו ${fresh.length} פריטים` : 'לא נוספו פריטים חדשים');
          });
        }}
      />
    );
  }

  return (
    <>
      <Link to="/admin" className="back">← ניהול</Link>
      <h1>📦 ניהול מלאי</h1>
      <p className="muted">לחצו על פריט כדי לערוך אותו. החיצים משנים את הסדר ברשימה.</p>

      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() =>
            setEditing({ id: newId(), name: '', category: categories[0] ?? '', mode: 'status', days: [], active: true, order: newOrder() })
          }
        >
          + פריט
        </button>
        <button type="button" onClick={() => setBulk(true)}>
          + הרבה פריטים
        </button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}
      <input className="search" type="search" placeholder="חיפוש פריט…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {inv.loading && <p className="muted">טוען…</p>}
      {!inv.loading && inv.items.length === 0 && (
        <p className="muted">אין פריטים עדיין. הוסיפו פריט, או בקשו ממנהל להיכנס פעם אחת כדי לטעון את הרשימה ההתחלתית.</p>
      )}

      {categories.map((cat) => {
        const list = itemsOfCategory(visible, cat);
        if (list.length === 0) return null;
        return (
          <section key={cat}>
            <div className="section-head">
              <h2>{cat}</h2>
              <button type="button" className="small" onClick={() => void renameCategory(cat)}>
                שנה שם קטגוריה
              </button>
            </div>
            <div className="card list">
              {list.map((i) => (
                <div key={i.id} className={`li inv-admin-row${i.active ? '' : ' off'}`}>
                  <button type="button" className="li-body linklike" onClick={() => setEditing(i)}>
                    <strong>{i.name}</strong>
                    <span className="chips">
                      <span className="chip">{i.mode === 'status' ? 'סטטוס' : i.mode === 'count' ? `ספירה${i.unit ? ` · ${i.unit}` : ''}` : 'צילום'}</span>
                      <span className="chip soft">{i.days.length === 0 ? 'כל יום' : i.days.map((d) => WEEKDAY_NAMES[d]).join(', ')}</span>
                      {!i.active && <span className="chip">כבוי</span>}
                    </span>
                  </button>
                  {!q && (
                    <span className="row actions">
                      <button type="button" className="small" aria-label={`הזז למעלה: ${i.name}`} onClick={() => void move(i.id, -1)}>▲</button>
                      <button type="button" className="small" aria-label={`הזז למטה: ${i.name}`} onClick={() => void move(i.id, 1)}>▼</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function CategoryField({ value, categories, onChange }: { value: string; categories: string[]; onChange(v: string): void }) {
  return (
    <label>
      קטגוריה
      <input list="inv-cats" value={value} onChange={(e) => onChange(e.target.value)} placeholder="למשל: מקרר" required />
      <datalist id="inv-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </label>
  );
}

function DaysField({ days, onChange }: { days: number[]; onChange(d: number[]): void }) {
  return (
    <div>
      <span className="muted small-text block">באילו ימים בודקים (בלי בחירה = כל יום)</span>
      <div className="days">
        {WEEKDAY_NAMES.map((n, d) => (
          <button
            key={d}
            type="button"
            className={`chip pick${days.includes(d) ? ' on' : ''}`}
            aria-pressed={days.includes(d)}
            onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  isNew,
  categories,
  onSave,
  onCancel,
  onDelete,
}: {
  item: InventoryItem;
  isNew: boolean;
  categories: string[];
  onSave(i: InventoryItem): Promise<void>;
  onCancel(): void;
  onDelete(): Promise<void>;
}) {
  const [t, setT] = useState(item);
  const valid = t.name.trim() !== '' && t.category.trim() !== '';
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const clean: InventoryItem = { ...t, name: t.name.trim(), category: t.category.trim(), hint: t.hint?.trim() || undefined, unit: t.unit?.trim() || undefined };
        if (clean.mode !== 'count') {
          delete clean.unit;
          delete clean.min;
        }
        void onSave(clean);
      }}
    >
      <h1>{isNew ? 'פריט חדש' : 'עריכת פריט'}</h1>
      <label>
        שם הפריט
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} required />
      </label>
      <CategoryField value={t.category} categories={categories} onChange={(category) => setT({ ...t, category })} />
      <label>
        איך מדווחים
        <select value={t.mode} onChange={(e) => setT({ ...t, mode: e.target.value as InventoryMode })}>
          {(Object.keys(MODE_LABEL) as InventoryMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {t.mode === 'count' && (
        <div className="row">
          <label style={{ flex: 1 }}>
            יחידה (ארגזים, שקיות…)
            <input value={t.unit ?? ''} onChange={(e) => setT({ ...t, unit: e.target.value })} />
          </label>
          <label style={{ flex: 1 }}>
            "מעט" עד כמות
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={t.min ?? ''}
              onChange={(e) => setT({ ...t, min: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            />
          </label>
        </div>
      )}
      <label>
        הסבר קצר מתחת לשם (לא חובה)
        <input value={t.hint ?? ''} onChange={(e) => setT({ ...t, hint: e.target.value })} placeholder="למשל: יש יותר מ-5 שרוולים" />
      </label>
      <DaysField days={t.days} onChange={(days) => setT({ ...t, days })} />
      {t.mode !== 'photo' && (
        <label className="inline check">
          <input type="checkbox" checked={!!t.photo} onChange={(e) => setT({ ...t, photo: e.target.checked })} />
          לבקש גם תמונה
        </label>
      )}
      <label className="inline check">
        <input type="checkbox" checked={t.active} onChange={(e) => setT({ ...t, active: e.target.checked })} />
        פעיל (יופיע לעובדים)
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
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

function BulkAdd({
  categories,
  onSave,
  onCancel,
}: {
  categories: string[];
  onSave(text: string, base: Pick<InventoryItem, 'category' | 'mode' | 'days'>): Promise<void>;
  onCancel(): void;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(categories[0] ?? '');
  const [mode, setMode] = useState<InventoryMode>('status');
  const [days, setDays] = useState<number[]>([]);
  const valid = text.trim() !== '' && category.trim() !== '';
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void onSave(text, { category: category.trim(), mode, days });
      }}
    >
      <h1>הוספת כמה פריטים</h1>
      <p className="muted">כתבו פריט בכל שורה. כולם ייכנסו לאותה קטגוריה ויום בדיקה, ואפשר לשנות כל אחד אחר כך.</p>
      <CategoryField value={category} categories={categories} onChange={setCategory} />
      <label>
        איך מדווחים
        <select value={mode} onChange={(e) => setMode(e.target.value as InventoryMode)}>
          {(Object.keys(MODE_LABEL) as InventoryMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <DaysField days={days} onChange={setDays} />
      <label>
        הפריטים (שורה לכל פריט)
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          הוסף
        </button>
        <button type="button" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  );
}
