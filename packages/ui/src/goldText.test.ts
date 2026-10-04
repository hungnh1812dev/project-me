import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Gold is never used as text: `#D4AF37` is only about 2:1 against the page, so links, text and
 * icons use the deep-gold `primary-ink` token instead (SPEC Design, WCAG 4.5:1 text / 3:1
 * graphics). Flags `text-primary` / `text-sidebar-primary` (and the `fill-` / `stroke-` /
 * `decoration-` forms, with or without a variant or `/NN`), but not the `-foreground` or `-ink`
 * tokens. Scans `.tsx`, `.ts` and `.css` in `packages/ui/src` and `apps/cms-admin/src`, tests
 * excluded.
 */
const GOLD_TEXT = /(?<![\w-])(?:text|fill|stroke|decoration)-(?:sidebar-)?primary(?![\w-])/g;

const goldTextViolations = (source: string): string[] =>
  [...source.matchAll(GOLD_TEXT)].map((m) => m[0]);

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

describe('goldTextViolations', () => {
  it('flags gold text, icon and underline classes, with a variant or opacity', () => {
    const source = `'text-primary', "hover:text-sidebar-primary", @apply text-primary/80 fill-primary stroke-primary decoration-primary;`;

    expect(goldTextViolations(source)).toEqual([
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

    expect(goldTextViolations(source)).toEqual([]);
  });
});

describe('gold is never used as text', () => {
  const files = [...listSources(UI_SRC), ...listSources(ADMIN_SRC)];

  it('scans the admin globals and the documents table', () => {
    expect(files.some((file) => file.endsWith('apps/cms-admin/src/styles/globals.css'))).toBe(true);
    expect(files.some((file) => file.endsWith('pages/content-types/list/DocumentsTable.tsx'))).toBe(
      true,
    );
  });

  it.each(files.map((file) => [relative(REPO, file), file]))('%s', (_name, file) => {
    expect(goldTextViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
