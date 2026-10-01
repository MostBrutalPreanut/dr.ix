import type { HandbookSection } from './types';

const files = import.meta.glob('../content/handbook/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const CATEGORY_ORDER = ['היכרות', 'פרונט ושירות', 'מטבח ועמדות', 'חירום וצוות'];

const CATEGORY_BY_SLUG: Record<string, string> = {
  experience: 'היכרות',
  faq: 'היכרות',
  register: 'פרונט ושירות',
  pitch: 'פרונט ושירות',
  'front-rotation': 'פרונט ושירות',
  teaching: 'פרונט ושירות',
  phone: 'פרונט ושירות',
  customers: 'פרונט ושירות',
  kitchen: 'מטבח ועמדות',
  pizza: 'מטבח ועמדות',
  dough: 'מטבח ועמדות',
  salads: 'מטבח ועמדות',
  bar: 'מטבח ועמדות',
  emergencies: 'חירום וצוות',
  staff: 'חירום וצוות',
};

const HEADING = /^#\s+((?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?)\s+)?(.*)$/u;

/** Starting content of the handbook - the markdown files in src/content/handbook. */
export function seedHandbook(): HandbookSection[] {
  return Object.entries(files)
    .map(([path, raw]) => {
      const name = path.split('/').pop()!.replace(/\.md$/, '');
      const [, num, slug] = /^(\d+)-(.*)$/.exec(name) ?? [];
      const [first, ...rest] = raw.trim().split('\n');
      const m = HEADING.exec(first);
      return {
        id: slug ?? name,
        title: m?.[2] ?? name,
        icon: (m?.[1] ?? '📄').trim(),
        category: CATEGORY_BY_SLUG[slug ?? ''] ?? 'היכרות',
        order: Number(num ?? 99),
        body: rest.join('\n').trim(),
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** Plain-text excerpt around the first match of `query` (for search results). */
export function excerpt(body: string, query: string, radius = 60): string {
  const plain = body.replace(/[#>*|_`-]/g, ' ').replace(/\s+/g, ' ');
  const i = plain.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return plain.slice(0, radius * 2);
  const start = Math.max(0, i - radius);
  return `${start > 0 ? '…' : ''}${plain.slice(start, i + query.length + radius)}…`;
}
