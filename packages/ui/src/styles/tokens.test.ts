// Vitest blanks CSS imports (even `?raw`), so the stylesheet is read from disk.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
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

describe('palette (D9, AC-13)', () => {
  const VIOLET = { light: '#7c3aed', dark: '#a78bfa' } as const;
  const ON_ACCENT = { light: '#ffffff', dark: '#020617' } as const;

  it.each(THEMES)('makes primary, ring and the sidebar primary and ring violet (%s)', (theme) => {
    const tokens = THEME_TOKENS[theme];
    for (const name of ['primary', 'ring', 'sidebar-primary', 'sidebar-ring'] as const) {
      expect(tokens[name], name).toBe(VIOLET[theme]);
    }
    expect(tokens['primary-foreground']).toBe(ON_ACCENT[theme]);
    expect(tokens['sidebar-primary-foreground']).toBe(ON_ACCENT[theme]);
  });

  it('uses orange-700 with white text for the light highlight', () => {
    expect(THEME_TOKENS.light.highlight).toBe('#c2410c');
    expect(THEME_TOKENS.light['highlight-foreground']).toBe('#ffffff');
  });

  it('uses orange-400 with slate-950 text for the dark highlight', () => {
    expect(THEME_TOKENS.dark.highlight).toBe('#fb923c');
    expect(THEME_TOKENS.dark['highlight-foreground']).toBe('#020617');
  });

  it('keeps the neutrals on slate', () => {
    expect(THEME_TOKENS.light.foreground).toBe('#020617');
    expect(THEME_TOKENS.light.border).toBe('#e2e8f0');
    expect(THEME_TOKENS.dark.background).toBe('#020617');
    expect(THEME_TOKENS.dark.card).toBe('#0f172a');
  });

  it('checks the highlight text pairs for contrast (AC-15)', () => {
    expect(TEXT_PAIRS).toEqual(
      expect.arrayContaining([
        ['highlight-foreground', 'highlight'],
        ['highlight', 'background'],
        ['highlight', 'card'],
      ]),
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
