import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('React effects', () => {
  it('never return a value from a one-line effect (a returned non-function crashes React on the next run)', () => {
    // e.g. useEffect(() => window.scrollTo(0, 0), [x]) crashed the whole app in browsers where scrollTo() returns a value
    const offenders = sources('src')
      .filter((f) => !f.endsWith('effects.test.ts'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /use(Layout)?Effect\(\(\) => [^{]/.test(line)),
      );
    expect(offenders.map((o) => `${o.f}:${o.i}`)).toEqual([]);
  });
});
