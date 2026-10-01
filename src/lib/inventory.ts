import type { InventoryItem, InventoryReport, StockLevel } from './types';
import { LEVEL_LABEL } from './types';
import { t } from './i18n';
import { daysBetween } from './dates';

/** Is the item asked about on this weekday? (no days = every day) */
export function isDueOn(item: InventoryItem, weekday: number): boolean {
  return item.active && (item.days.length === 0 || item.days.includes(weekday));
}

/** The stock level an answer means (undefined for photo-only answers or no answer). */
export function levelOf(item: InventoryItem, report: InventoryReport | undefined): StockLevel | undefined {
  if (!report) return undefined;
  if (report.restocked) return 'ok';
  if (item.mode === 'count' && report.count !== undefined) {
    if (report.count <= 0) return 'out';
    if (item.min !== undefined && item.min > 0 && report.count <= item.min) return 'low';
    return 'ok';
  }
  return report.level;
}

/** The newest answer of every item (newest date, then newest time). */
export function latestReports(reports: InventoryReport[]): Map<string, InventoryReport> {
  const latest = new Map<string, InventoryReport>();
  for (const r of reports) {
    const cur = latest.get(r.itemId);
    if (!cur || r.date > cur.date || (r.date === cur.date && r.at > cur.at)) latest.set(r.itemId, r);
  }
  return latest;
}

export interface RestockLine {
  item: InventoryItem;
  report: InventoryReport;
  level: 'low' | 'out';
  /** days since that answer */
  ageDays: number;
}

/** Items whose newest answer says low or out. Out first, then by category and list order. */
export function restockList(items: InventoryItem[], latest: Map<string, InventoryReport>, today: string): RestockLine[] {
  const lines: RestockLine[] = [];
  for (const item of items) {
    if (!item.active) continue;
    const report = latest.get(item.id);
    const level = levelOf(item, report);
    if (report && (level === 'low' || level === 'out')) {
      lines.push({ item, report, level, ageDays: Math.max(0, daysBetween(report.date, today)) });
    }
  }
  return lines.sort(
    (a, b) =>
      Number(b.level === 'out') - Number(a.level === 'out') ||
      a.item.category.localeCompare(b.item.category, 'he') ||
      a.item.order - b.item.order,
  );
}

/** Plain text for WhatsApp / notes. */
export function formatRestockList(lines: RestockLine[], dateLabel: string): string {
  if (lines.length === 0) return t('אין חוסרים ({date})', { date: dateLabel });
  const byCategory = new Map<string, RestockLine[]>();
  for (const l of lines) byCategory.set(l.item.category, [...(byCategory.get(l.item.category) ?? []), l]);
  const out = [t('🛒 רשימת קניות - {date}', { date: dateLabel })];
  for (const [cat, list] of byCategory) {
    out.push('', `${t(cat)}:`);
    for (const l of list) {
      const extra = l.item.mode === 'count' && l.report.count !== undefined ? `${l.report.count}${l.item.unit ? ` ${t(l.item.unit)}` : ''}` : t(LEVEL_LABEL[l.level]);
      out.push(`• ${t(l.item.name)} (${extra})`);
    }
  }
  return out.join('\n');
}

/** Categories in the order of their first item. */
export function categoriesOf(items: InventoryItem[]): string[] {
  const first = new Map<string, number>();
  for (const i of items) first.set(i.category, Math.min(first.get(i.category) ?? Infinity, i.order));
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
}

export function itemsOfCategory(items: InventoryItem[], category: string): InventoryItem[] {
  return items.filter((i) => i.category === category).sort((a, b) => a.order - b.order);
}

/** Swap an item with its neighbour in the same category. Returns the (up to two) items to save. */
export function moveItem(items: InventoryItem[], id: string, dir: -1 | 1): InventoryItem[] {
  const item = items.find((i) => i.id === id);
  if (!item) return [];
  const list = itemsOfCategory(items, item.category);
  const at = list.findIndex((i) => i.id === id);
  const other = list[at + dir];
  if (!other) return [];
  return [
    { ...item, order: other.order },
    { ...other, order: item.order },
  ];
}

/** "One item per line" -> new items (skips blanks and names that already exist). */
export function parseBulk(
  text: string,
  base: Pick<InventoryItem, 'category' | 'mode' | 'days'>,
  existing: InventoryItem[],
  newId: () => string,
): InventoryItem[] {
  const known = new Set(existing.map((i) => `${i.category}|${i.name.trim()}`));
  let order = existing.reduce((m, i) => Math.max(m, i.order), 0);
  const out: InventoryItem[] = [];
  for (const raw of text.split('\n')) {
    const name = raw.replace(/^[\s\-•*·]+/, '').trim();
    const key = `${base.category}|${name}`;
    if (!name || known.has(key)) continue;
    known.add(key);
    out.push({ id: newId(), name, category: base.category, mode: base.mode, days: [...base.days], active: true, order: ++order });
  }
  return out;
}
