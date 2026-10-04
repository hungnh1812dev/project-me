import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * AC-4: in dark the primary fill is only 2.99:1 against the page, so every class string that paints
 * `bg-primary` or `bg-sidebar-primary` must also carry `border-primary-ink`. The `/NN` hover and
 * opacity forms are ignored. Scans `.tsx` in `packages/ui/src` and `apps/cms-admin/src` (tests
 * excluded, they assert classes rather than render them) plus `components/variants.ts`.
 */
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const PRIMARY_FILL = /(?<![\w-])bg-(?:sidebar-)?primary(?![\w/-])/;
const INK_BORDER = /(?<![\w-])border-primary-ink(?![\w/-])/;

const primaryBorderViolations = (source: string): string[] =>
  [...source.matchAll(STRING_LITERAL)]
    .map((m) => m[0].slice(1, -1))
    .filter((value) => PRIMARY_FILL.test(value) && !INK_BORDER.test(value));

const isTest = (name: string): boolean => /\.(test|spec)\.tsx$/.test(name);

const listTsx = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listTsx(path);
    return entry.name.endsWith('.tsx') && !isTest(entry.name) ? [path] : [];
  });

const UI_SRC = import.meta.dirname;
const REPO = resolve(UI_SRC, '../../..');
const ADMIN_SRC = join(REPO, 'apps/cms-admin/src');

describe('primaryBorderViolations', () => {
  it('flags a primary fill without the primary-ink border, with or without a variant prefix', () => {
    const source = `cn('bg-primary text-primary-foreground', "data-checked:bg-primary", \`dark:bg-sidebar-primary\`)`;

    expect(primaryBorderViolations(source)).toEqual([
      'bg-primary text-primary-foreground',
      'data-checked:bg-primary',
      'dark:bg-sidebar-primary',
    ]);
  });

  it('accepts a primary fill paired with the primary-ink border in the same string', () => {
    const source = `cn('border-primary-ink bg-primary', 'data-checked:border-primary-ink data-checked:bg-primary')`;

    expect(primaryBorderViolations(source)).toEqual([]);
  });

  it('ignores the /NN forms, other primary tokens and a border in another string', () => {
    const source = `cn('hover:bg-primary/90 bg-primary/10', 'bg-primary-foreground text-primary', 'bg-sidebar-primary-foreground')`;

    expect(primaryBorderViolations(source)).toEqual([]);
    expect(primaryBorderViolations(`cn('bg-primary', 'border-primary-ink')`)).toEqual([
      'bg-primary',
    ]);
  });

  it('does not take a lookalike border token as the ink border', () => {
    expect(primaryBorderViolations(`'bg-primary border-primary-ink-soft border-primary'`)).toEqual([
      'bg-primary border-primary-ink-soft border-primary',
    ]);
  });
});

describe('primary fills carry the primary-ink border (AC-4)', () => {
  const files = [...listTsx(UI_SRC), ...listTsx(ADMIN_SRC), join(UI_SRC, 'components/variants.ts')];

  it('scans a non-trivial set of files, including the button variants', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => file.endsWith('apps/cms-admin/src/layouts/AuthLayout.tsx'))).toBe(
      true,
    );
  });

  it.each(files.map((file) => [relative(REPO, file), file]))('%s', (_name, file) => {
    expect(primaryBorderViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
