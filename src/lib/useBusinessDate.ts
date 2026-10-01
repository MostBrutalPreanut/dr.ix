import { useEffect, useState } from 'react';
import { businessDate } from './dates';

/** Today's business day; re-evaluated every minute so the screen rolls over by itself. */
export function useBusinessDate(): string {
  const [date, setDate] = useState(() => businessDate());
  useEffect(() => {
    const t = setInterval(() => setDate(businessDate()), 60_000);
    return () => clearInterval(t);
  }, []);
  return date;
}
