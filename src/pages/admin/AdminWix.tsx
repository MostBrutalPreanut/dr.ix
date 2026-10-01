import { useState } from 'react';
import { Link } from 'react-router-dom';
import { diagnoseFunction, fetchReservations } from '../../lib/wix';
import type { FunctionDiagnosis, WixState } from '../../lib/wix';
import { useBusinessDate } from '../../lib/useBusinessDate';
import { t, tn } from '../../lib/i18n';

const UNREACHABLE: Record<FunctionDiagnosis, string> = {
  missing:
    tn('ב-Supabase אין פונקציה בשם wix. פתח Edge Functions ובדוק שהשם הוא בדיוק wix (אותיות קטנות, בלי רווחים או תוספות) ושהיא מופיעה כ-Active. אם היא נקראת אחרת, צור פונקציה חדשה בשם wix.'),
  jwt_on:
    tn('הפונקציה קיימת, אבל Supabase עדיין בודק JWT. פתח את הפונקציה wix בהגדרות, כבה את Verify JWT ושמור (ייתכן שצריך לפרוס אותה שוב).'),
  reachable:
    tn('הפונקציה קיימת וענתה, אבל הבקשה מהאפליקציה נכשלה. פתח ב-Supabase את Edge Functions ← wix ← Logs ושלח צילום של השגיאה האחרונה.'),
  network: tn('אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.'),
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
      <Link to="/admin" className="back">{t('← ניהול')}</Link>
      <h1>{t('🔌 חיבור Wix')}</h1>
      <p className="muted">{t('בודק שהשרת מצליח לקרוא את ההזמנות מ-Wix, ומראה איפה נשמרות ההערות של הלקוחות.')}</p>
      <button type="button" className="primary" disabled={busy} onClick={() => void check()}>
        {busy ? t('בודק…') : t('בדוק חיבור')}
      </button>

      {result?.state === 'not_configured' && (
        <div className="card">
          <strong>{t('🟡 עוד לא הוגדר')}</strong>
          <p>
            {t('או שהפונקציה')}{' '}<code>wix</code>{' '}{t('עוד לא הועלתה ל-Supabase, או שחסר הסוד')}{' '}<code>WIX_API_KEY</code>{t('. ההוראות ב-')}
            <a href="https://github.com/MostBrutalPreanut/dr.ix/blob/claude/gallant-heisenberg-7j9btf/docs/wix-api-setup.md">{t('מדריך Wix')}</a>.
          </p>
        </div>
      )}
      {result?.state === 'error' && (
        <div className="card">
          <strong>{t('🔴 שגיאה:')}{' '}{{ wix_auth: t('Wix דחתה את המפתח'), wix_error: t('Wix החזירה שגיאה'), unreachable: t('אי אפשר להגיע לפונקציה') }[result.reason]}</strong>
          {result.reason === 'unreachable' && why && <p>{t(UNREACHABLE[why])}</p>}
          {result.detail && <pre className="mono-box">{result.detail}</pre>}
        </div>
      )}
      {result?.state === 'ok' && (
        <div className="card success" style={{ display: 'block' }}>
          <strong>{t('🟢 מחובר')}</strong>
          <p>
            {t('היום:')}{' '}{result.reservations.length}{' '}{t('הזמנות פעילות')}
            {result.debug && t(' ({reservationsFromWix} שהוחזרו מ-Wix בטווח התאריכים)', { reservationsFromWix: result.debug.reservationsFromWix })}.
          </p>
          {result.debug && (
            <>
              <p className="muted small-text">
                {t('שדות מותאמים שנמצאו בטופס ההזמנה, כל שדה עם עד 3 דוגמאות (כך מזהים איפה ההערה של הלקוח):')}
              </p>
              <pre className="mono-box">{JSON.stringify(result.debug.customFields, null, 2) || '{}'}</pre>
              <p className="muted small-text">
                {t('סטטוסים:')}{' '}{Object.entries(result.debug.statuses).map(([k, v]) => `${k}: ${v}`).join(' · ') || t('אין')}{' '}{t('· הערות צוות (Team notes):')}{' '}{result.debug.withTeamMessage}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
