import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { backend, useCollection } from '../lib/db';
import { useBusinessDate } from '../lib/useBusinessDate';
import { addDays, formatLongDate, formatTime, weekdayOf } from '../lib/dates';
import { KEEP_DAYS, answersOn, catLabel, categoriesOf, levelOf, unansweredOn } from '../lib/inventory';
import type { DayAnswer } from '../lib/inventory';
import { purgeOldInventory } from '../lib/inventoryPurge';
import { LEVEL_LABEL } from '../lib/types';
import type { InventoryItem, InventoryPhoto, InventoryReport } from '../lib/types';
import { t, tl } from '../lib/i18n';

/** Everything the staff filled in, one day at a time, up to KEEP_DAYS back (managers and stock editors). */
export default function InventoryReportsPage() {
  const today = useBusinessDate();
  const oldest = addDays(today, -KEEP_DAYS);
  const items = useCollection<InventoryItem>('inventoryItems');
  const reports = useCollection<InventoryReport>('inventoryReports', undefined, { from: oldest, to: `${today}~` });
  const [picked, setPicked] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    purgeOldInventory(today).catch(() => undefined);
  }, [today]);

  // opens on the newest day somebody filled in
  const latest = useMemo(() => reports.items.reduce<string | null>((m, r) => (r.date >= oldest && (!m || r.date > m) ? r.date : m), null), [reports.items, oldest]);
  const date = picked && picked >= oldest && picked <= today ? picked : (latest ?? today);
  const answers = useMemo(() => answersOn(items.items, reports.items, date), [items.items, reports.items, date]);
  const missing = useMemo(() => unansweredOn(items.items, reports.items, date, weekdayOf(date)), [items.items, reports.items, date]);
  const go = (d: string) => {
    setPicked(d);
    setShowMissing(false);
  };

  return (
    <>
      <Link to="/inventory" className="back">{t('→ חזרה למלאי')}</Link>
      <h1>{t('📋 דוחות מלאי')}</h1>
      <p className="muted small-text">{t('כל מה שמולא בכל יום. הנתונים נשמרים שבוע ואז נמחקים.')}</p>

      <div className="row between">
        <button type="button" className="small" disabled={date <= oldest} onClick={() => go(addDays(date, -1))} aria-label={t('היום הקודם')}>{t('→')}</button>
        <strong>{formatLongDate(date)}</strong>
        <button type="button" className="small" disabled={date >= today} onClick={() => go(addDays(date, 1))} aria-label={t('היום הבא')}>{t('←')}</button>
      </div>

      {reports.loading || items.loading ? (
        <p className="muted">{t('טוען…')}</p>
      ) : (
        <>
          <p className="muted small-text">
            {t('מולאו {n} פריטים', { n: answers.length })}
            {missing.length > 0 && (
              <>
                {' · '}
                <button type="button" className="linklike" onClick={() => setShowMissing(!showMissing)}>
                  {t('{n} לא מולאו', { n: missing.length })}
                </button>
              </>
            )}
          </p>
          {showMissing && (
            <div className="card">
              <p className="small-text">{missing.map((i) => tl(i.name, i.nameEn)).join(' · ')}</p>
            </div>
          )}
          {answers.length === 0 && <p className="muted">{t('לא מולא כלום ביום הזה.')}</p>}
          {categoriesOf(answers.map((a) => a.item)).map((cat) => (
            <section key={cat}>
              <h3 className="cat">{catLabel(items.items, cat)}</h3>
              <div className="card list">
                {answers
                  .filter((a) => a.item.category === cat)
                  .map((a) => (
                    <AnswerRow key={a.report.id} answer={a} />
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function AnswerRow({ answer: { item, report } }: { answer: DayAnswer }) {
  const { employees } = useAuth();
  const [picture, setPicture] = useState<string | null>(null);
  const [showPic, setShowPic] = useState(false);
  const level = levelOf(item, report);
  const counted = item.mode === 'count' && report.count !== undefined && !report.restocked;
  const who = employees.find((e) => e.id === report.by)?.name ?? '?';

  async function togglePic() {
    if (showPic) return setShowPic(false);
    setShowPic(true);
    if (picture) return;
    const rows = (await backend.list('inventoryPhotos', { from: report.id, to: report.id })) as InventoryPhoto[];
    setPicture(rows[0]?.dataUrl ?? '');
  }

  return (
    <div className="li inv">
      <span className="li-body">
        <span className="inv-name">
          <strong>{tl(item.name, item.nameEn)}</strong>
          {counted && <span>{report.count}{item.unit ? ` ${tl(item.unit, item.unitEn)}` : ''}</span>}
          {report.restocked ? (
            <span className="chip soft">{t('נקנה ✓')}</span>
          ) : (
            level && <span className={`chip ${level === 'out' ? 'red' : level === 'ok' ? 'soft' : ''}`}>{t(LEVEL_LABEL[level])}</span>
          )}
        </span>
        {report.note && <span className="small-text">📝 {report.note}</span>}
        <span className="muted small-text">
          {who} · {formatTime(report.at)}
        </span>
        {report.photo && (
          <span className="row inv-extra">
            <button type="button" className="small" onClick={() => void togglePic()}>
              {showPic ? t('הסתר תמונה') : t('📷 הצג תמונה')}
            </button>
          </span>
        )}
        {showPic &&
          (picture === null ? (
            <span className="muted small-text">{t('טוען תמונה…')}</span>
          ) : picture ? (
            <img className="inv-pic" src={picture} alt={item.name} />
          ) : (
            <span className="muted small-text">{t('התמונה לא נמצאה.')}</span>
          ))}
      </span>
    </div>
  );
}
