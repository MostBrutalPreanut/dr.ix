import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCollection } from '../lib/db';
import { useReservations } from '../lib/wix';
import type { Reservation } from '../lib/wix';
import type { WixTable } from '../lib/types';

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'ממתינה לאישור',
  SEATED: 'ישבו',
  FINISHED: 'הסתיימה',
};

/** Guests expected in total, and how many are still to come (not seated / finished yet). */
export function guestTotals(list: Reservation[]) {
  const guests = list.reduce((n, r) => n + r.partySize, 0);
  const waiting = list.filter((r) => r.status !== 'SEATED' && r.status !== 'FINISHED').reduce((n, r) => n + r.partySize, 0);
  return { guests, waiting, bookings: list.length };
}

/** Table numbers of a reservation; ids nobody named yet show "?" to managers only. */
function tableLabels(r: Reservation, names: Map<string, string>, isManager: boolean): string[] {
  const out: string[] = [];
  for (const id of r.tableIds ?? []) {
    const label = names.get(id);
    if (label) out.push(label);
    else if (isManager) out.push('?');
  }
  return out;
}

function ReservationCard({ r, tables }: { r: Reservation; tables: string[] }) {
  const hasNote = r.notes.length > 0 || r.teamMessage !== '';
  const quiet = r.status === 'SEATED' || r.status === 'FINISHED';
  return (
    <article className={`card reservation${hasNote ? ' has-note' : ''}${quiet ? ' quiet' : ''}`}>
      <div className="res-head">
        <strong className="res-time">{r.time}</strong>
        <span className="res-name">{r.firstName || 'ללא שם'}</span>
        <span className="chip">👥 {r.partySize}</span>
        {tables.length > 0 && <span className="chip">🪑 {tables.includes('?') ? <Link to="/admin/wix">?</Link> : `שולחן ${tables.join(', ')}`}</span>}
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

/** Wix table id -> the number written in the cafe (filled in once by a manager). */
export function useWixTableNames(): Map<string, string> {
  const { items } = useCollection<WixTable>('wixTables');
  return new Map(items.map((t) => [t.id, t.label]));
}

/** "Today's reservations" - guests' requests are easy to miss in the Wix dashboard, so they live here. */
export function Reservations({ date, showTitle = true }: { date: string; showTitle?: boolean }) {
  const { isManager } = useAuth();
  const wix = useReservations(date);
  const names = useWixTableNames();

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
        {showTitle ? <h2>📅 הזמנות להיום{wix.state === 'ok' ? ` (${wix.reservations.length})` : ''}</h2> : <span />}
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
      {wix.state === 'ok' && wix.reservations.length > 0 && (() => {
        const t = guestTotals(wix.reservations);
        return (
          <div className="card guest-total">
            <strong>👥 {t.guests} אורחים צפויים</strong>
            <span className="muted small-text">
              ב-{t.bookings} הזמנות{t.waiting !== t.guests && ` · עוד ${t.waiting} לא הגיעו`}
            </span>
          </div>
        );
      })()}
      {wix.state === 'ok' && wix.reservations.map((r) => <ReservationCard key={r.id} r={r} tables={tableLabels(r, names, isManager)} />)}
    </section>
  );
}

/**
 * One quiet line on the Today screen: how many reservations, and a pointer when some carry notes.
 * The full list lives in its own tab so it never pushes the tasks and checklists out of view.
 */
export function ReservationsSummary({ date }: { date: string }) {
  const wix = useReservations(date);
  if (wix.state !== 'ok' || wix.reservations.length === 0) return null;
  const withNotes = wix.reservations.filter((r) => r.notes.length || r.teamMessage).length;
  return (
    <Link to="/reservations" className={`card summary-line${withNotes ? ' has-note' : ''}`}>
      <span>
        📅 <strong>{wix.reservations.length}</strong> הזמנות · 👥 <strong>{guestTotals(wix.reservations).guests}</strong> אורחים
        {withNotes > 0 && (
          <>
            {' '}
            · <strong>{withNotes}</strong> עם הערות
          </>
        )}
      </span>
      <span className="muted">לצפייה ←</span>
    </Link>
  );
}
