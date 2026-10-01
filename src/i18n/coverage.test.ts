import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN } from './en';
import { WEEKDAY_NAMES } from '../lib/dates';
import { AREA_LABEL, DIFFICULTY_LABEL, LEVEL_LABEL, STYLE_LABEL } from '../lib/types';
import { seedChecklists } from '../seed/checklists';
import { seedInventory } from '../seed/inventory';
import { seedTasks } from '../seed/tasks';

const HEB = /[\u0590-\u05FF]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.test\.|i18n\/en/.test(p) ? [p] : [];
  });
}

describe('English translation', () => {
  it('every Hebrew text passed to t() / tn() has an English text', () => {
    const missing: string[] = [];
    const re = /\bt[n]?\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
    for (const file of sources('src')) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(re)) {
        const text = (m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1');
        if (HEB.test(text) && !(text in EN)) missing.push(`${file}: ${text}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every text of the starting content and every label has an English text', () => {
    const texts = new Set<string>();
    for (const t of seedTasks()) texts.add(t.title);
    for (const c of seedChecklists()) {
      texts.add(c.title);
      for (const g of c.groups) {
        texts.add(g.title);
        for (const i of g.items) {
          texts.add(i.text);
          if (i.detail) texts.add(i.detail);
        }
      }
    }
    for (const i of seedInventory()) {
      texts.add(i.name);
      texts.add(i.category);
      if (i.unit) texts.add(i.unit);
      if (i.hint) texts.add(i.hint);
    }
    for (const l of [WEEKDAY_NAMES, Object.values(AREA_LABEL), Object.values(STYLE_LABEL), Object.values(DIFFICULTY_LABEL), Object.values(LEVEL_LABEL)]) {
      for (const x of l) texts.add(x);
    }
    expect([...texts].filter((x) => HEB.test(x) && !(x in EN))).toEqual([]);
  });

  it('keeps placeholders in the English texts', () => {
    const bad = Object.entries(EN).filter(([he, en]) => {
      const a = (he.match(/\{\w+\}/g) ?? []).sort().join();
      const b = (en.match(/\{\w+\}/g) ?? []).sort().join();
      return a !== b;
    });
    expect(bad.map(([he]) => he)).toEqual([]);
  });
});
