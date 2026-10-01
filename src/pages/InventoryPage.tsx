import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { backend, useCollection } from '../lib/db';
import { useBusinessDate } from '../lib/useBusinessDate';
import { WEEKDAY_NAMES, addDays, formatLongDate, weekdayOf } from '../lib/dates';
import { categoriesOf, formatRestockList, isDueOn, itemsOfCategory, latestReports, levelOf, restockList } from '../lib/inventory';
import { shrinkImage } from '../lib/image';
import { LEVEL_LABEL } from '../lib/types';
import type { InventoryItem, InventoryPhoto, InventoryReport, StockLevel } from '../lib/types';
import { seedInventory } from '../seed/inventory';
import { t } from '../lib/i18n';

const LEVELS: StockLevel[] = ['ok', 'low', 'out'];

export default function InventoryPage() {
  const { user, canEditInventory } = useAuth();
  const today = useBusinessDate();
  const items = useCollection<InventoryItem>('inventoryItems', seedInventory);
  const reports = useCollection<InventoryReport>('inventoryReports', undefined, { from: addDays(today, -7), to: `${today}~` });
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const active = useMemo(() => items.items.filter((i) => i.active), [items.items]);
  const latest = useMemo(() => latestReports(reports.items), [reports.items]);
  const todays = useMemo(() => new Map(reports.items.filter((r) => r.date === today).map((r) => [r.itemId, r])), [reports.items, today]);
  const lines = useMemo(() => restockList(active, latest, today), [active, latest, today]);
  const weekday = weekdayOf(today);
  const due = useMemo(() => active.filter((i) => isDueOn(i, weekday)), [active, weekday]);
  const shown = showAll ? active : due;
  const doneCount = due.filter((i) => todays.has(i.id)).length;

  async function write(item: InventoryItem, patch: Partial<InventoryReport>) {
    if (!user) return;
    const id = `${today}|${item.id}`;
    const base = todays.get(item.id) ?? ({ id, date: today, itemId: item.id } as InventoryReport);
    const next: InventoryReport = { ...base, ...patch, id, date: today, itemId: item.id, by: user.id, at: new Date().toISOString() };
    try {
      await reports.save(next);
      setError('');
    } catch {
      setError(t('השמירה נכשלה - בדקו חיבור ונסו שוב'));
    }
  }

  async function copyList() {
    const text = formatRestockList(lines, formatLongDate(today));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('העתיקו את הרשימה:'), text);
    }
  }

  const categories = categoriesOf(shown);

  return (
    <>
      <h1>{t('📦 מלאי')}</h1>
      {error && <p className="banner-warn" role="alert">{error}</p>}

      {items.loading ? (
        <p className="muted">{t('טוען…')}</p>
      ) : items.items.length === 0 ? (
        <div className="card">
          <p>{t('עדיין אין פריטי מלאי.')}</p>
          <p className="muted small-text">
            {canEditInventory ? (
              <>{t('אפשר להוסיף פריטים ב')}<Link to="/admin/inventory">{t('ניהול מלאי')}</Link>{t('. (הרשימה ההתחלתית נטענת כשמנהל נכנס למערכת.)')}</>
            ) : (
              t('מנהל צריך להיכנס למערכת פעם אחת כדי לטעון את הרשימה ההתחלתית.')
            )}
          </p>
        </div>
      ) : (
        <>
          <section className="card" aria-label={t('רשימת קניות')}>
            <div className="section-head">
              <h2>{t('🛒 חסר (')}{lines.length})</h2>
              {lines.length > 0 && (
                <button type="button" className="small" onClick={() => void copyList()}>
                  {copied ? t('הועתק ✓') : t('העתק לוואטסאפ')}
                </button>
              )}
            </div>
            {lines.length === 0 && <p className="muted">{t('אין חוסרים כרגע 🎉')}</p>}
            {lines.map((l) => (
              <div key={l.item.id} className="li emp">
                <span className="li-body">
                  <strong>{t(l.item.name)}</strong>
                  <span className="muted small-text block">
                    {t(l.item.category)} · {l.item.mode === 'count' && l.report.count !== undefined ? `${l.report.count}${l.item.unit ? ` ${t(l.item.unit)}` : ''}` : t(LEVEL_LABEL[l.level])}
                    {l.ageDays > 0 ? t(' · לפני {ageDays} ימים', { ageDays: l.ageDays }) : t(' · היום')}
                  </span>
                </span>
                <span className={`chip ${l.level === 'out' ? 'red' : ''}`}>{t(LEVEL_LABEL[l.level])}</span>
                {canEditInventory && (
                  <button type="button" className="small" onClick={() => void write(l.item, { restocked: true, level: 'ok', count: undefined })}>
                    {t('נקנה ✓')}
                  </button>
                )}
              </div>
            ))}
          </section>

          <div className="section-head">
            <h2>
              {showAll ? t('כל הפריטים') : t('לבדיקה היום (יום {p1})', { p1: t(WEEKDAY_NAMES[weekday]) })}
              {!showAll && due.length > 0 && <span className="muted small-text"> · {doneCount}/{due.length}</span>}
            </h2>
            <button type="button" className="small" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('רק של היום') : t('הצג הכול')}
            </button>
          </div>
          {shown.length === 0 && <p className="muted">{t('אין פריטים לבדיקה היום.')}</p>}
          {categories.map((cat) => (
            <section key={cat}>
              <h3 className="cat">{t(cat)}</h3>
              <div className="card list">
                {itemsOfCategory(shown, cat).map((item) => (
                  <ItemRow key={item.id} item={item} report={todays.get(item.id)} today={today} write={write} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function ItemRow({
  item,
  report,
  today,
  write,
}: {
  item: InventoryItem;
  report: InventoryReport | undefined;
  today: string;
  write(item: InventoryItem, patch: Partial<InventoryReport>): Promise<void>;
}) {
  const { user } = useAuth();
  const level = levelOf(item, report);
  const [count, setCount] = useState<number | undefined>(report?.count);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(report?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const [showPic, setShowPic] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // somebody else's (or an earlier) answer arrives
  useEffect(() => {
    setCount(report?.count);
  }, [report?.count]);
  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const setCountSoon = (n: number) => {
    const v = Math.max(0, n);
    setCount(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void write(item, { count: v, level: undefined, restocked: false }), 600);
  };

  async function onPhoto(file: File | undefined) {
    if (!file || !user) return;
    setBusy(true);
    try {
      const dataUrl = await shrinkImage(file);
      const id = `${today}|${item.id}`;
      const photo: InventoryPhoto = { id, date: today, itemId: item.id, dataUrl, by: user.id, at: new Date().toISOString() };
      await backend.upsert('inventoryPhotos', photo);
      setPicture(dataUrl);
      setShowPic(true);
      await write(item, { photo: true });
    } catch {
      alert(t('לא הצלחנו לשמור את התמונה. נסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  async function togglePic() {
    if (showPic) return setShowPic(false);
    setShowPic(true);
    if (picture) return;
    const id = `${today}|${item.id}`;
    const rows = (await backend.list('inventoryPhotos', { from: id, to: id })) as InventoryPhoto[];
    setPicture(rows[0]?.dataUrl ?? null);
  }

  return (
    <div className="li inv">
      <span className="li-body">
        <span className="inv-name">
          <strong>{t(item.name)}</strong>
          {level && level !== 'ok' && <span className={`chip ${level === 'out' ? 'red' : ''}`}>{t(LEVEL_LABEL[level])}</span>}
        </span>
        {item.hint && <span className="muted small-text">{t(item.hint)}</span>}

        {item.mode === 'status' && (
          <span className="seg inv-seg" role="group" aria-label={t('מצב {name}', { name: t(item.name) })}>
            {LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                className={report && !report.restocked && report.level === lv ? 'on' : report?.restocked && lv === 'ok' ? 'on' : ''}
                onClick={() => void write(item, { level: lv, restocked: false })}
              >
                {t(LEVEL_LABEL[lv])}
              </button>
            ))}
          </span>
        )}

        {item.mode === 'count' && (
          <span className="stepper">
            <button type="button" aria-label={t('פחות')} onClick={() => setCountSoon((count ?? 0) - 1)}>−</button>
            <output>{count ?? '–'}</output>
            <button type="button" aria-label={t('יותר')} onClick={() => setCountSoon((count ?? 0) + 1)}>+</button>
            {item.unit && <span className="muted">{t(item.unit)}</span>}
            {item.min !== undefined && item.min > 0 && <span className="muted small-text">{t('(מעט: עד')}{' '}{item.min})</span>}
          </span>
        )}

        <span className="row inv-extra">
          {(item.mode === 'photo' || item.photo) && (
            <>
              <button type="button" className="small" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? t('שומר…') : report?.photo ? t('📷 צלם שוב') : t('📷 צלם')}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              {report?.photo && (
                <button type="button" className="small" onClick={() => void togglePic()}>
                  {showPic ? t('הסתר תמונה') : t('הצג תמונה')}
                </button>
              )}
            </>
          )}
          <button type="button" className="small" onClick={() => setNoteOpen(!noteOpen)}>
            {report?.note ? t('📝 הערה') : t('+ הערה')}
          </button>
        </span>
        {noteOpen && (
          <input
            className="inv-note"
            value={note}
            placeholder={t('למשל: נשארו שני בקבוקים פתוחים')}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (report?.note ?? '') && void write(item, { note: note.trim() || undefined })}
          />
        )}
        {!noteOpen && report?.note && <span className="muted small-text">📝 {report.note}</span>}
        {showPic && (picture ? <img className="inv-pic" src={picture} alt={item.name} /> : <span className="muted small-text">{t('טוען תמונה…')}</span>)}
      </span>
    </div>
  );
}
