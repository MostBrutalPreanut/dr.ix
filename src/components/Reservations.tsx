import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useReservations } from '../lib/wix';
import type { Reservation } from '../lib/wix';

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'ממתינה לאישור',
  SEATED: 'ישבו',
  FINISHED: 'הסתיימה',
};

function ReservationCard({ r }: { r: Reservation }) {
  const hasNote = r.notes.length > 0 || r.teamMessage !== '';
  const quiet = r.status === 'SEATED' || r.status === 'FINISHED';
  return (
    <article className={`card reservation${hasNote ? ' has-note' : ''}${quiet ? ' quiet' : ''}`}>
      <div className="res-head">
        <strong className="res-time">{r.time}</strong>
        <span className="res-name">{r.firstName || 'ללא שם'}</span>
        <span className="chip">👥 {r.partySize}</span>
        {STATUS_LABEL[r.status] && <span className={`chip${r.status === 'REQUESTED' ? ' red' : ' soft'}`}>{STATUS_LABEL[r.status]}</span>}
      </div>
      {r.notes.map((n, i) => (
        <p key={i} className="res-note">
          📝 {n}
        </p>
      ))}
      {r.teamMessage && <p className="res-note team">💬 {r.teamMessage}</p>}
    </article>
  );
}

/** "Today's reservations" - guests' requests are easy to miss in the Wix dashboard, so they live here. */
export function Reservations({ date }: { date: string }) {
  const { isManager } = useAuth();
  const wix = useReservations(date);

  if (wix.state === 'off') return null;
  // employees are not shown a setup problem - the section simply is not there until it works
  if (!isManager && (wix.state === 'not_configured' || (wix.state === 'error' && wix.reason === 'unreachable'))) return null;

  const setupHint = (text: string) =>
    isManager ? (
      <p className="muted small-text">
        {text} <Link to="/admin/wix">בדיקת חיבור Wix</Link>
      </p>
    ) : null;

  return (
    <section>
      <div className="section-head">
        <h2>📅 הזמנות להיום{wix.state === 'ok' ? ` (${wix.reservations.length})` : ''}</h2>
        {wix.state === 'ok' && wix.reservations.some((r) => r.notes.length || r.teamMessage) && (
          <span className="chip red">
            📝 {wix.reservations.filter((r) => r.notes.length || r.teamMessage).length} עם הערות
          </span>
        )}
      </div>

      {wix.state === 'loading' && <p className="muted empty">טוען הזמנות…</p>}
      {wix.state === 'not_configured' && setupHint('החיבור ל-Wix עוד לא הוגדר.')}
      {wix.state === 'error' && (wix.reason !== 'unreachable' || isManager) && (
        <>
          <p className="muted small-text">לא הצלחנו לטעון את ההזמנות כרגע. אפשר לבדוק ישירות ב-Wix.</p>
          {wix.reason === 'wix_auth' && setupHint('Wix דחתה את המפתח (חסרה הרשאה או שהמפתח בוטל).')}
          {wix.reason === 'unreachable' && setupHint('אי אפשר להגיע לפונקציה.')}
        </>
      )}
      {wix.state === 'ok' && wix.reservations.length === 0 && <p className="muted empty">אין הזמנות להיום.</p>}
      {wix.state === 'ok' && wix.reservations.map((r) => <ReservationCard key={r.id} r={r} />)}
    </section>
  );
}
