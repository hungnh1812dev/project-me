import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * AC-17: components colour things through the semantic token classes only. This scans every
 * `.tsx` file in `packages/ui/src` and `apps/cms-admin/src` for raw hex colours and Tailwind
 * palette classes (such as `bg-slate-100` or `text-violet-600`).
 */
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY =
  'bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow|inset-shadow';
const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITY})-(?:(?:${PALETTE})-(?:50|[1-9]00|950)|black|white)(?:\\/\\d+)?(?![\\w-])`,
  'g',
);
const HEX_COLOUR = /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;

const paletteViolations = (source: string): string[] => [
  ...[...source.matchAll(HEX_COLOUR)].map((m) => m[0]),
  ...[...source.matchAll(PALETTE_CLASS)].map((m) => m[0]),
];

const listTsx = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });

const UI_SRC = import.meta.dirname;
const REPO = resolve(UI_SRC, '../../..');
const ADMIN_SRC = join(REPO, 'apps/cms-admin/src');

describe('paletteViolations', () => {
  it('flags Tailwind palette classes, with or without an opacity or variant', () => {
    const source =
      'cn("bg-slate-100 text-violet-600", "hover:border-orange-700/50 dark:ring-indigo-400 bg-white")';

    expect(paletteViolations(source)).toEqual([
      'bg-slate-100',
      'text-violet-600',
      'border-orange-700/50',
      'ring-indigo-400',
      'bg-white',
    ]);
  });

  it('flags raw hex colours', () => {
    expect(paletteViolations('style={{ color: "#7c3aed", background: "#fff" }}')).toEqual([
      '#7c3aed',
      '#fff',
    ]);
  });

  it('allows token classes, anchors and character references', () => {
    const source = [
      'cn("bg-primary text-highlight-foreground border-sidebar-border text-sm bg-card/80")',
      '<a href="#main-content">Skip</a>',
      '<span>&#123;</span>',
      'to-the-top text-muted-foreground',
    ].join('\n');

    expect(paletteViolations(source)).toEqual([]);
  });
});

describe.each([
  ['packages/ui/src', UI_SRC],
  ['apps/cms-admin/src', ADMIN_SRC],
])('%s', (_label, root) => {
  const files = listTsx(root);

  it('has .tsx files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('uses no raw hex colour or Tailwind palette class (AC-17)', () => {
    const offenders = files
      .map((file) => ({
        file: relative(REPO, file),
        found: paletteViolations(readFileSync(file, 'utf8')),
      }))
      .filter(({ found }) => found.length > 0);

    expect(offenders).toEqual([]);
  });
});
