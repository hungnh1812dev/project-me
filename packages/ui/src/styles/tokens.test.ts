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

describe('palette', () => {
  it('uses indigo-600 for light primary and indigo-400 for dark primary', () => {
    expect(THEME_TOKENS.light.primary).toBe('#4f46e5');
    expect(THEME_TOKENS.dark.primary).toBe('#818cf8');
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
