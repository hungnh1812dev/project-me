import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * AC-5: primary is never used as text. The dark `primary` (`#4945FF`) is only 2.99:1 against the
 * page, below the 4.5:1 text minimum, so links, text and icons use the `primary-ink` token instead
 * (SPEC Design, WCAG 4.5:1 text / 3:1 graphics). Flags `text-primary` / `text-sidebar-primary` (and the `fill-` / `stroke-` /
 * `decoration-` forms, with or without a variant or `/NN`), but not the `-foreground` or `-ink`
 * tokens. Scans `.tsx`, `.ts` and `.css` in `packages/ui/src` and `apps/cms-admin/src`, tests
 * excluded.
 */
const PRIMARY_TEXT = /(?<![\w-])(?:text|fill|stroke|decoration)-(?:sidebar-)?primary(?![\w-])/g;

const primaryTextViolations = (source: string): string[] =>
  [...source.matchAll(PRIMARY_TEXT)].map((m) => m[0]);

const isTest = (name: string): boolean => /\.(test|spec)\.tsx?$/.test(name);

const listSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === '__tests__' || entry.name === 'test' ? [] : listSources(path);
    return /\.(tsx|ts|css)$/.test(entry.name) && !isTest(entry.name) ? [path] : [];
  });

const UI_SRC = import.meta.dirname;
const REPO = resolve(UI_SRC, '../../..');
const ADMIN_SRC = join(REPO, 'apps/cms-admin/src');

describe('primaryTextViolations', () => {
  it('flags primary text, icon and underline classes, with a variant or opacity', () => {
    const source = `'text-primary', "hover:text-sidebar-primary", @apply text-primary/80 fill-primary stroke-primary decoration-primary;`;

    expect(primaryTextViolations(source)).toEqual([
      'text-primary',
      'text-sidebar-primary',
      'text-primary',
      'fill-primary',
      'stroke-primary',
      'decoration-primary',
    ]);
  });

  it('allows the ink and foreground tokens', () => {
    const source = `'text-primary-ink text-primary-foreground text-sidebar-primary-foreground decoration-primary-ink'`;

    expect(primaryTextViolations(source)).toEqual([]);
  });
});

describe('primary is never used as text (AC-5)', () => {
  const files = [...listSources(UI_SRC), ...listSources(ADMIN_SRC)];

  it('scans the admin globals and the documents table', () => {
    expect(files.some((file) => file.endsWith('apps/cms-admin/src/styles/globals.css'))).toBe(true);
    expect(files.some((file) => file.endsWith('pages/content-types/list/DocumentsTable.tsx'))).toBe(
      true,
    );
  });

  it.each(files.map((file) => [relative(REPO, file), file]))('%s', (_name, file) => {
    expect(primaryTextViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
