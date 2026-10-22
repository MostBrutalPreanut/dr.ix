import { formatLongDate, weekStart, addDays } from '../lib/dates';
import { hoursOf } from '../lib/rota';
import type { ShiftDef } from '../lib/types';
import { t, tl } from '../lib/i18n';

/** Times and ranges always read left-to-right, also inside Hebrew text. */
export function Hours({ shift }: { shift: Pick<ShiftDef, 'from' | 'to'> }) {
  const h = hoursOf(shift);
  if (!h) return null;
  return <bdi dir="ltr">{shift.from && !shift.to ? t('מ-{from}', { from: shift.from }) : h}</bdi>;
}

export const shiftName = (s: Pick<ShiftDef, 'label' | 'labelEn'>) => tl(s.label, s.labelEn);

/** "28/9 - 4/10" style label of a week. */
export function weekLabel(ws: string): string {
  const short = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  return `${short(ws)} - ${short(addDays(ws, 6))}`;
}

export function WeekNav({ week, min, max, onChange, current }: { week: string; min: string; max: string; onChange(w: string): void; current?: string }) {
  const thisWeek = current ?? weekStart(week);
  // newest first: a few weeks ahead, then back in time (the arrows still reach every other week)
  const top = [addDays(thisWeek, 21), max].sort()[0];
  const options: string[] = [];
  for (let w = top; w >= min; w = addDays(w, -7)) options.push(w);
  if (!options.includes(week)) options.unshift(week);
  options.sort().reverse();
  return (
    <div className="row between week-nav">
      <button type="button" className="small" disabled={week <= min} onClick={() => onChange(addDays(week, -7))} aria-label={t('השבוע הקודם')}>
        {t('→')}
      </button>
      <span className="week-title">
        <select className="week-select" value={week} aria-label={t('בחירת שבוע')} onChange={(e) => onChange(e.target.value)}>
          {options.map((w) => (
            <option key={w} value={w}>
              {t('שבוע')} {weekLabel(w)}{w === thisWeek ? ` · ${t('השבוע')}` : ''}
            </option>
          ))}
        </select>
      </span>
      <button type="button" className="small" disabled={week >= max} onClick={() => onChange(addDays(week, 7))} aria-label={t('השבוע הבא')}>
        {t('←')}
      </button>
    </div>
  );
}

export const dayTitle = (date: string) => formatLongDate(date);
