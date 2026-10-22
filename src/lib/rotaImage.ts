import type { PublishedDay } from './types';
import { dayHeading, exportDays, hoursOf, textOn } from './rota';

const W = 300; // width of one day
const HEAD = 44;
const SUB = 34;
const ROW = 38;
const SCALE = 2;
const MIN_BLOCK = 56; // a shift with its hours needs two lines
const FONT = "'Heebo', 'Arial Hebrew', Arial, sans-serif";

/**
 * Draws the week like the manager's spreadsheet: one block per day, read right to left (the first day
 * of the week on the right), heading = weekday + date + event name, then "משמרת | עובדים" with the people
 * and their start times. Always Hebrew.
 */
export function renderWeekImage(days: PublishedDay[], nameOf: (id: string) => string, colorOf: (id: string) => string = () => '#fff'): Promise<Blob> {
  const shown = exportDays(days);
  const blockH = (n: number) => Math.max(n * ROW, MIN_BLOCK);
  const bodyH = (d: PublishedDay) => d.shifts.reduce((h, s) => h + blockH(Math.max(1, s.staff.length)), 0) || ROW;
  const tall = Math.max(...shown.map(bodyH), 3 * ROW);
  const width = Math.max(shown.length, 1) * W;
  const height = HEAD + SUB + tall;

  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  const cell = (x: number, y: number, w: number, h: number, fill: string, text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#9aa';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (!text) return;
    ctx.fillStyle = opts.color ?? '#000';
    ctx.font = `${opts.bold ? '700' : '400'} ${opts.size ?? 16}px ${FONT}`;
    ctx.textAlign = 'center';
    // shrink long headings (event names) to fit the cell
    let size = opts.size ?? 16;
    while (ctx.measureText(text).width > w - 12 && size > 10) {
      size -= 1;
      ctx.font = `${opts.bold ? '700' : '400'} ${size}px ${FONT}`;
    }
    ctx.fillText(text, x + w / 2, y + h / 2 + 1, w - 8);
  };

  shown.forEach((d, i) => {
    // the first day sits at the right edge
    const x0 = width - (i + 1) * W;
    cell(x0, 0, W, HEAD, '#b6d7a8', dayHeading(d), { bold: true, size: 19 });
    cell(x0 + W / 2, HEAD, W / 2, SUB, '#34a853', 'משמרת', { bold: true, size: 15, color: '#fff' }); // right half
    cell(x0, HEAD, W / 2, SUB, '#34a853', 'עובדים', { bold: true, size: 15, color: '#fff' }); // left half
    let y = HEAD + SUB;
    for (const s of d.shifts) {
      const n = Math.max(1, s.staff.length);
      const h = blockH(n);
      const rowH = h / n;
      cell(x0 + W / 2, y, W / 2, h, '#fff', '');
      const label = s.label;
      const hours = hoursOf(s);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.font = `400 16px ${FONT}`;
      ctx.fillText(label, x0 + W * 0.75, y + h / 2 - (hours ? 10 : 0), W / 2 - 8);
      if (hours) {
        ctx.direction = 'ltr';
        ctx.font = `400 15px ${FONT}`;
        ctx.fillText(hours, x0 + W * 0.75, y + h / 2 + 11, W / 2 - 8);
        ctx.direction = 'rtl';
      }
      for (let k = 0; k < n; k++) {
        const w = s.staff[k];
        const fill = w ? colorOf(w.employeeId) : '#fff';
        cell(x0, y + k * rowH, W / 2, rowH, fill, w ? `${nameOf(w.employeeId)} ${w.start}` : '', { bold: true, size: 17, color: w ? textOn(fill) : '#000' });
      }
      y += h;
    }
    // empty rows below, so every day has the same height
    for (; y < height; y += ROW) cell(x0, y, W, ROW, '#fff', '');
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

