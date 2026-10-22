import type { PublishedDay } from './types';
import type { PersonColor } from './rotaColors';
import { dayHeading, exportDays, hoursOf } from './rota';

const ROW = 38;
const HEAD = 34;
const SHIFT_W = 118;
const STAFF_W = 150;
const DAY_W = SHIFT_W + STAFF_W;
const LINE = '#8a8a8a';
const HEAD_BG = '#b6d7a8';
const SUB_BG = '#00c853';
const FONT = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

/**
 * Draws the week like the colour-coded sheet the team knows: a pair of columns (shift | workers) per day,
 * each worker in a cell of their own colour. Closed days are left out.
 */
export function renderWeekImage(days: PublishedDay[], colorOf: (id: string) => PersonColor, nameOf: (id: string) => string): Promise<Blob> {
  // the export is for the team's WhatsApp: always Hebrew and read right to left, whatever the app language is
  const open = exportDays(days);
  const rtl = true;
  const rowsOf = (d: PublishedDay) => d.shifts.reduce((n, s) => n + Math.max(1, s.staff.length), 0);
  const bodyRows = Math.max(1, ...open.map(rowsOf));
  const width = Math.max(1, open.length) * DAY_W;
  const height = HEAD * 2 + bodyRows * ROW;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no canvas'));
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  const cell = (x: number, y: number, w: number, h: number, fill: string, lines: { text: string; color?: string; bold?: boolean; size?: number }[] = []) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const lh = 16;
    lines.forEach((l, i) => {
      ctx.fillStyle = l.color ?? '#111';
      ctx.font = `${l.bold ? 'bold ' : ''}${l.size ?? 15}px ${FONT}`;
      ctx.fillText(l.text, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh, w - 8);
    });
  };

  open.forEach((d, i) => {
    const x = rtl ? width - (i + 1) * DAY_W : i * DAY_W;
    const shiftX = rtl ? x + STAFF_W : x;
    const staffX = rtl ? x : x + SHIFT_W;
    cell(x, 0, DAY_W, HEAD, HEAD_BG, [{ text: dayHeading(d), bold: true, size: 16 }]);
    cell(shiftX, HEAD, SHIFT_W, HEAD, SUB_BG, [{ text: 'משמרת', bold: true }]);
    cell(staffX, HEAD, STAFF_W, HEAD, SUB_BG, [{ text: 'עובדים', bold: true }]);

    let row = 0;
    for (const s of d.shifts) {
      const n = Math.max(1, s.staff.length);
      const y = HEAD * 2 + row * ROW;
      const hours = hoursOf(s);
      cell(shiftX, y, SHIFT_W, n * ROW, '#fff', [{ text: s.label }, ...(hours ? [{ text: `\u202A${hours}\u202C`, size: 13 }] : [])]);
      if (s.staff.length === 0) cell(staffX, y, STAFF_W, ROW, '#fff');
      s.staff.forEach((w, j) => {
        const c = colorOf(w.employeeId);
        cell(staffX, y + j * ROW, STAFF_W, ROW, c.background, [{ text: `${nameOf(w.employeeId)} ${w.start}`, color: c.color, bold: true }]);
      });
      row += n;
    }
    for (; row < bodyRows; row++) {
      cell(shiftX, HEAD * 2 + row * ROW, SHIFT_W, ROW, '#fff');
      cell(staffX, HEAD * 2 + row * ROW, STAFF_W, ROW, '#fff');
    }
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

/** Opens the phone's share sheet (WhatsApp etc.) when possible, otherwise downloads the picture. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // the person closed the share sheet
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
