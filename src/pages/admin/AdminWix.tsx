import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { diagnoseFunction, fetchReservations } from '../../lib/wix';
import type { FunctionDiagnosis, WixState } from '../../lib/wix';
import { useBusinessDate } from '../../lib/useBusinessDate';
import { useCollection } from '../../lib/db';
import { addDays } from '../../lib/dates';
import type { WixTable } from '../../lib/types';
import type { Reservation } from '../../lib/wix';

const UNREACHABLE: Record<FunctionDiagnosis, string> = {
  missing:
    'ב-Supabase אין פונקציה בשם wix. פתח Edge Functions ובדוק שהשם הוא בדיוק wix (אותיות קטנות, בלי רווחים או תוספות) ושהיא מופיעה כ-Active. אם היא נקראת אחרת, צור פונקציה חדשה בשם wix.',
  jwt_on:
    'הפונקציה קיימת, אבל Supabase עדיין בודק JWT. פתח את הפונקציה wix בהגדרות, כבה את Verify JWT ושמור (ייתכן שצריך לפרוס אותה שוב).',
  reachable:
    'הפונקציה קיימת וענתה, אבל הבקשה מהאפליקציה נכשלה. פתח ב-Supabase את Edge Functions ← wix ← Logs ושלח צילום של השגיאה האחרונה.',
  network: 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.',
};

/** Manager-only connection check: shows whether Wix answers and where the guests' notes live. */
export default function AdminWix() {
  const today = useBusinessDate();
  const [result, setResult] = useState<WixState | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<FunctionDiagnosis | null>(null);

  async function check() {
    setBusy(true);
    setWhy(null);
    const r = await fetchReservations(today, true);
    if (r.state === 'error' && r.reason === 'unreachable') setWhy(await diagnoseFunction());
    setResult(r);
    setBusy(false);
  }

  return (
    <>
      <Link to="/admin" className="back">← ניהול</Link>
      <h1>🔌 חיבור Wix</h1>
      <p className="muted">בודק שהשרת מצליח לקרוא את ההזמנות מ-Wix, ומראה איפה נשמרות ההערות של הלקוחות.</p>
      <button type="button" className="primary" disabled={busy} onClick={() => void check()}>
        {busy ? 'בודק…' : 'בדוק חיבור'}
      </button>

      {result?.state === 'not_configured' && (
        <div className="card">
          <strong>🟡 עוד לא הוגדר</strong>
          <p>
            או שהפונקציה <code>wix</code> עוד לא הועלתה ל-Supabase, או שחסר הסוד <code>WIX_API_KEY</code>. ההוראות ב-
            <a href="https://github.com/MostBrutalPreanut/dr.ix/blob/claude/gallant-heisenberg-7j9btf/docs/wix-api-setup.md">מדריך Wix</a>.
          </p>
        </div>
      )}
      {result?.state === 'error' && (
        <div className="card">
          <strong>🔴 שגיאה: {{ wix_auth: 'Wix דחתה את המפתח', wix_error: 'Wix החזירה שגיאה', unreachable: 'אי אפשר להגיע לפונקציה' }[result.reason]}</strong>
          {result.reason === 'unreachable' && why && <p>{UNREACHABLE[why]}</p>}
          {result.detail && <pre className="mono-box">{result.detail}</pre>}
        </div>
      )}
      {result?.state === 'ok' && (
        <div className="card success" style={{ display: 'block' }}>
          <strong>🟢 מחובר</strong>
          <p>
            היום: {result.reservations.length} הזמנות פעילות
            {result.debug && ` (${result.debug.reservationsFromWix} שהוחזרו מ-Wix בטווח התאריכים)`}.
          </p>
          {result.debug && (
            <>
              <p className="muted small-text">
                שדות מותאמים שנמצאו בטופס ההזמנה, כל שדה עם עד 3 דוגמאות (כך מזהים איפה ההערה של הלקוח):
              </p>
              <pre className="mono-box">{JSON.stringify(result.debug.customFields, null, 2) || '{}'}</pre>
              <p className="muted small-text">
                סטטוסים: {Object.entries(result.debug.statuses).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'אין'} · הערות צוות (Team notes): {result.debug.withTeamMessage}
              </p>
            </>
          )}
        </div>
      )}
      <TableNames today={today} />
    </>
  );
}

/**
 * Wix gives each table only an id (no number). A manager names each table once, using the
 * reservations that sit at it (time + name) to recognise it.
 */
function TableNames({ today }: { today: string }) {
  const tables = useCollection<WixTable>('wixTables');
  const [seen, setSeen] = useState<Reservation[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const days = [today, addDays(today, 1), addDays(today, 2)];
      const all: Reservation[] = [];
      for (const d of days) {
        const r = await fetchReservations(d);
        if (r.state === 'ok') all.push(...r.reservations.map((x) => ({ ...x, time: `${d.slice(8)}/${d.slice(5, 7)} ${x.time}` })));
      }
      if (alive) {
        setSeen(all);
        setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [today]);

  const ids = [...new Set(seen.flatMap((r) => r.tableIds ?? []))];
  const label = (id: string) => tables.items.find((t) => t.id === id)?.label ?? '';
  const save = (id: string, value: string) => {
    const v = value.trim();
    if (v === label(id)) return;
    if (v) void tables.save({ id, label: v });
    else void tables.remove(id);
  };

  return (
    <section>
      <h2>🪑 מספרי שולחנות</h2>
      <p className="muted small-text">
        Wix לא מעבירה שמות או מספרים של שולחנות, רק מזהה. כתבו כאן פעם אחת את המספר של כל שולחן. כדי לזהות אותו מופיעות ההזמנות שיושבות בו.
      </p>
      {!ready && <p className="muted">בודק הזמנות קרובות…</p>}
      {ready && ids.length === 0 && (
        <p className="muted small-text">אין כרגע הזמנות עם שולחן משויך (היום ובימים הקרובים). ברגע ש-Wix משייכת שולחן להזמנה הוא יופיע כאן.</p>
      )}
      <div className="stack">
        {ids.map((id) => (
          <div key={id} className="card form">
            <span className="muted small-text">
              {seen
                .filter((r) => r.tableIds?.includes(id))
                .slice(0, 3)
                .map((r) => `${r.time} ${r.firstName || '?'} (${r.partySize})`)
                .join(' · ')}
            </span>
            <label>
              מספר שולחן
              <input key={`${id}-${label(id)}`} defaultValue={label(id)} placeholder="למשל: 7" onBlur={(e) => save(id, e.target.value)} />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
