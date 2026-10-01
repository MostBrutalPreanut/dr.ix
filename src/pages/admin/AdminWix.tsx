import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchReservations } from '../../lib/wix';
import type { WixState } from '../../lib/wix';
import { useBusinessDate } from '../../lib/useBusinessDate';

/** Manager-only connection check: shows whether Wix answers and where the guests' notes live. */
export default function AdminWix() {
  const today = useBusinessDate();
  const [result, setResult] = useState<WixState | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setResult(await fetchReservations(today, true));
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
    </>
  );
}
