import { formatLongDate, weekStart, addDays } from '../lib/dates';
import { useCollection } from '../lib/db';
import { defaultColor, hoursOf, isHexColor, textOn } from '../lib/rota';
import type { ShiftDef, StaffColors } from '../lib/types';
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
  return (
    <div className="row between week-nav">
      <button type="button" className="small" disabled={week <= min} onClick={() => onChange(addDays(week, -7))} aria-label={t('השבוע הקודם')}>
        {t('→')}
      </button>
      <span className="week-title">
        <strong>{t('שבוע')} <bdi dir="ltr">{weekLabel(week)}</bdi></strong>
        {week === thisWeek && <span className="chip soft">{t('השבוע')}</span>}
      </span>
      <button type="button" className="small" disabled={week >= max} onClick={() => onChange(addDays(week, 7))} aria-label={t('השבוע הבא')}>
        {t('←')}
      </button>
    </div>
  );
}

export const dayTitle = (date: string) => formatLongDate(date);

const COLORS_ID = 'colors';

/** The color of each worker: the one a manager picked, else a stable default. */
export function useStaffColors() {
  const doc = useCollection<StaffColors>('shiftDays', undefined, { from: COLORS_ID, to: COLORS_ID });
  const map = doc.items[0]?.colors ?? {};
  const colorOf = (id: string) => (isHexColor(map[id]) ? map[id] : defaultColor(id));
  const write = (colors: Record<string, string>) => doc.save({ id: COLORS_ID, colors });
  return {
    colorOf,
    picked: (id: string) => isHexColor(map[id]),
    setColor: (id: string, color: string) => write({ ...map, [id]: color }),
    resetColor: (id: string) => {
      const next = { ...map };
      delete next[id];
      return write(next);
    },
  };
}

/** Inline style of a worker's tag: their color as background, readable text on top. */
export const tagStyle = (color: string) => ({ background: color, color: textOn(color) });
