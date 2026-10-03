// Vitest blanks CSS imports (even `?raw`), so the stylesheet is read from disk.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SYNTAX_TOKENS } from '../lib/jsonEditor';
import {
  type ColorTokenName,
  COLOR_TOKEN_NAMES,
  contrastRatio,
  TEXT_PAIRS,
  THEME_TOKENS,
  UI_BOUNDARY_PAIRS,
  type ThemeName,
} from './tokens';

const THEMES: ThemeName[] = ['light', 'dark'];
const themeCss = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

/** Reads `--name: value;` declarations from the first block that starts with `selector {`. */
function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in theme.css`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim().toLowerCase();
  }
  return vars;
}

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('returns 1 for identical colours', () => {
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#64748b', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#64748b'),
      10,
    );
  });

  it('accepts short hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });

  it('rejects a non-hex colour', () => {
    expect(() => contrastRatio('red', '#fff')).toThrow(/hex/);
  });
});

describe.each(THEMES)('%s theme tokens', (theme) => {
  const tokens = THEME_TOKENS[theme];

  it('defines every colour token', () => {
    expect(Object.keys(tokens).sort()).toEqual([...COLOR_TOKEN_NAMES].sort());
  });

  it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_BOUNDARY_PAIRS)('%s against %s reaches 3:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });

  it('matches the values declared in theme.css', () => {
    const declared = readBlock(themeCss, theme === 'light' ? ':root' : '.dark');
    for (const name of COLOR_TOKEN_NAMES) {
      expect(declared[name], `--${name}`).toBe(tokens[name]);
    }
  });
});

describe('palette (AC-1, AC-3)', () => {
  it('uses charcoal text on an off-white canvas with white cards in light', () => {
    const light = THEME_TOKENS.light;
    expect(light.foreground).toBe('#2b2b2b');
    expect(light.background).toBe('#fafaf9');
    expect(light.card).toBe('#ffffff');
    expect(light.popover).toBe('#ffffff');
  });

  it.each(THEMES)('makes primary and the sidebar primary metallic gold (%s)', (theme) => {
    expect(THEME_TOKENS[theme].primary).toBe('#d4af37');
    expect(THEME_TOKENS[theme]['sidebar-primary']).toBe('#d4af37');
  });

  it.each([
    ['light', '#7a5c14'],
    ['dark', '#e0c068'],
  ] as const)('uses the deep gold primary-ink for ring, sidebar ring and highlight (%s)', (theme, ink) => {
    const tokens = THEME_TOKENS[theme];
    for (const name of ['primary-ink', 'ring', 'sidebar-ring', 'highlight'] as const) {
      expect(tokens[name], name).toBe(ink);
    }
  });

  it('moves the neutrals to stone', () => {
    expect(THEME_TOKENS.light.border).toBe('#e7e5e4');
    expect(THEME_TOKENS.light.input).toBe('#78716c');
    expect(THEME_TOKENS.dark.background).toBe('#1c1a17');
    expect(THEME_TOKENS.dark.card).toBe('#292524');
  });

  it('checks the AC-2 text pairs for 4.5:1', () => {
    const own = COLOR_TOKEN_NAMES.filter((name) =>
      COLOR_TOKEN_NAMES.includes(`${name}-foreground` as ColorTokenName),
    ).map((name) => [`${name}-foreground`, name]);
    expect(own.length).toBeGreaterThan(10);
    expect(TEXT_PAIRS).toEqual(
      expect.arrayContaining([
        ...own,
        ['foreground', 'background'],
        ['foreground', 'card'],
        ['foreground', 'muted'],
        ['muted-foreground', 'background'],
        ['muted-foreground', 'card'],
        ['muted-foreground', 'muted'],
        ['primary-ink', 'background'],
        ['primary-ink', 'card'],
        ['primary-ink', 'accent'],
        ['primary-ink', 'sidebar'],
      ]),
    );
  });

  it('never treats the gold fill as text on the page', () => {
    expect(TEXT_PAIRS).not.toContainEqual(['primary', 'background']);
    expect(TEXT_PAIRS).not.toContainEqual(['primary', 'card']);
  });

  it('checks the AC-2 boundary pairs for 3:1', () => {
    expect(UI_BOUNDARY_PAIRS).toEqual(
      expect.arrayContaining(
        (['input', 'ring', 'primary-ink'] as const).flatMap((fg) => [
          [fg, 'background'],
          [fg, 'card'],
        ]),
      ),
    );
  });
});

describe.each(THEMES)('JSON editor syntax colours (AC-24, %s)', (theme) => {
  const tokens = THEME_TOKENS[theme];

  it.each(Object.entries(SYNTAX_TOKENS))('%s (%s) reaches 4.5:1 on background', (_, name) => {
    expect(COLOR_TOKEN_NAMES).toContain(name);
    expect(contrastRatio(tokens[name as ColorTokenName], tokens.background)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe('theme.css', () => {
  const rootVars = readBlock(themeCss, ':root');

  it('defines the radius and motion durations', () => {
    expect(rootVars.radius).toBeDefined();
    expect(rootVars['motion-duration-fast']).toMatch(/ms$/);
    expect(rootVars['motion-duration-normal']).toMatch(/ms$/);
    expect(rootVars['motion-duration-slow']).toMatch(/ms$/);
  });

  it('declares the class-based dark variant', () => {
    expect(themeCss).toContain('@custom-variant dark (&:where(.dark, .dark *));');
  });

  it('maps every colour token in @theme inline', () => {
    const mapped = readBlock(themeCss, '@theme inline');
    for (const name of COLOR_TOKEN_NAMES) {
      expect(mapped[`color-${name}`], `--color-${name}`).toBe(`var(--${name})`);
    }
  });

  it('leaves fonts and tailwindcss itself to each app', () => {
    expect(themeCss).not.toMatch(/^@import/m);
    expect(themeCss).not.toMatch(/font-family|--font-/);
  });

  it('turns off transitions and animations under prefers-reduced-motion', () => {
    expect(themeCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('draws a focus-visible ring with the ring token', () => {
    expect(themeCss).toMatch(/:focus-visible\s*{[^}]*var\(--ring\)/);
  });
});
