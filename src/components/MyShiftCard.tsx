import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { idPrefix, useCollection } from '../lib/db';
import { addDays, weekStart } from '../lib/dates';
import { myShifts } from '../lib/rota';
import type { PublishedWeek, ShiftRequest } from '../lib/types';
import { Hours, shiftName } from './ShiftBits';
import { t } from '../lib/i18n';

/** On the home screen: "you work today at ..." from the published schedule, and the nudge to ask for next week. */
export function MyShiftCard({ today }: { today: string }) {
  const { user } = useAuth();
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const published = useCollection<PublishedWeek>('schedulePublished', undefined, { from: thisWeek, to: thisWeek });
  const requests = useCollection<ShiftRequest>('shiftRequests', undefined, idPrefix(nextWeek));
  if (!user) return null;

  const shifts = myShifts(published.items[0]?.days ?? [], today, user.id);
  const requested = requests.items.some((r) => r.employeeId === user.id);

  return (
    <>
      {shifts.map(({ shift, start }) => (
        <Link key={shift.id} to="/schedule" className="card summary-line has-note">
          <span>
            🗓️ <strong>{t('היום את/ה עובד/ת')}</strong>{' '}
            {shift.event ? '🎉 ' : ''}{shiftName(shift)} · {t('התחלה')} <bdi dir="ltr"><strong>{start}</strong></bdi>
            {shift.from && <span className="muted small-text block">{t('שעות המשמרת')}: <Hours shift={shift} /></span>}
          </span>
          <span className="muted">{t('←')}</span>
        </Link>
      ))}
      {!requested && !requests.loading && (
        <Link to="/schedule/request" className="card summary-line">
          <span>🙋 <strong>{t('בקשת סידור לשבוע הבא')}</strong>{' '}{t('- טרם נשלחה')}</span>
          <span className="muted">{t('←')}</span>
        </Link>
      )}
    </>
  );
}
