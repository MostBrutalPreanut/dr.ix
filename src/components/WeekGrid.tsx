import type { PublishedDay } from '../lib/types';
import type { PersonColor } from '../lib/rotaColors';
import { WEEKDAY_NAMES, weekdayOf } from '../lib/dates';
import { t } from '../lib/i18n';

export interface GridPerson {
  id: string;
  name: string;
}

/**
 * The week like the colour-coded sheet: a row per person, a column per day, a coloured cell with the
 * start time(s) where the person works. Read-only for the team, tappable for the manager who builds it.
 */
export function WeekGrid({ days, people, colorOf, meId, today, asked, selected, onCell }: {
  days: PublishedDay[];
  people: GridPerson[];
  colorOf(id: string): PersonColor;
  meId?: string;
  today?: string;
  /** `${date}|${employeeId}` of people who asked to work that day (builder only) */
  asked?: Set<string>;
  selected?: { date: string; employeeId: string } | null;
  onCell?(date: string, employeeId: string): void;
}) {
  const worksOn = (d: PublishedDay, id: string) => d.shifts.flatMap((s) => s.staff.filter((w) => w.employeeId === id).map((w) => ({ shift: s, start: w.start })));
  return (
    <div className="week-grid-wrap">
      <table className="week-grid">
        <thead>
          <tr>
            <th scope="col" className="wg-who" />
            {days.map((d) => (
              <th key={d.date} scope="col" className={`${d.date === today ? 'today' : ''}${d.shifts.length === 0 ? ' closed' : ''}`}>
                <span className="block">{t(WEEKDAY_NAMES[weekdayOf(d.date)])}</span>
                <bdi dir="ltr" className="muted">{Number(d.date.slice(8))}/{Number(d.date.slice(5, 7))}</bdi>
                {d.note && <span className="block" title={d.note}>🎉</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className={p.id === meId ? 'wg-me' : ''}>
              <th scope="row" className="wg-who">
                <span className="dot" style={{ background: colorOf(p.id).background }} aria-hidden="true" />
                {p.name}
              </th>
              {days.map((d) => {
                const work = worksOn(d, p.id);
                const wantsIt = asked?.has(`${d.date}|${p.id}`);
                const isSel = selected?.date === d.date && selected.employeeId === p.id;
                const content = work.length > 0 ? (
                  <span className="cell on" style={colorOf(p.id)}>
                    {work.map((w, i) => (
                      <bdi key={i} dir="ltr" className="block">{w.shift.event ? '🎉' : ''}{w.start}</bdi>
                    ))}
                  </span>
                ) : (
                  <span className={`cell off${wantsIt ? ' asked' : ''}`}>{wantsIt ? '🙋' : d.shifts.length > 0 && onCell ? '+' : ''}</span>
                );
                return (
                  <td key={d.date} className={isSel ? 'sel' : ''}>
                    {onCell && d.shifts.length > 0 ? (
                      <button type="button" className="cell-btn" aria-label={`${p.name} ${t(WEEKDAY_NAMES[weekdayOf(d.date)])}`} onClick={() => onCell(d.date, p.id)}>{content}</button>
                    ) : content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
