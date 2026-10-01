import { Reservations } from '../components/Reservations';
import { formatLongDate } from '../lib/dates';
import { useBusinessDate } from '../lib/useBusinessDate';
import { t } from '../lib/i18n';

/** Today's table reservations (from Wix), with the guests' notes highlighted. */
export default function ReservationsPage() {
  const today = useBusinessDate();
  return (
    <>
      <h1>{t('📅 הזמנות להיום')}</h1>
      <p className="muted">{formatLongDate(today)}</p>
      <Reservations date={today} showTitle={false} />
    </>
  );
}
