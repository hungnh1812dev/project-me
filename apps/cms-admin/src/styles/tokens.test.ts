/// <reference types="node" />
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
const globalsCss = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

/** Reads `--name: value;` declarations from the first block that starts with `selector {`. */
function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in globals.css`);
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

  it('matches the values declared in globals.css', () => {
    const declared = readBlock(globalsCss, theme === 'light' ? ':root' : '.dark');
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

describe('globals.css', () => {
  const rootVars = readBlock(globalsCss, ':root');

  it('defines the radius, font families and motion durations', () => {
    expect(rootVars.radius).toBeDefined();
    expect(rootVars['font-sans-family']).toContain('fira sans');
    expect(rootVars['font-mono-family']).toContain('fira code variable');
    expect(rootVars['motion-duration-fast']).toMatch(/ms$/);
    expect(rootVars['motion-duration-normal']).toMatch(/ms$/);
  });

  it('self-hosts the fonts through @fontsource and loads no font CDN', () => {
    expect(globalsCss).toContain("@import '@fontsource/fira-sans/400.css'");
    expect(globalsCss).toContain("@import '@fontsource-variable/fira-code'");
    expect(globalsCss).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('turns off transitions and animations under prefers-reduced-motion', () => {
    expect(globalsCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('draws a focus-visible ring with the ring token', () => {
    expect(globalsCss).toMatch(/:focus-visible\s*{[^}]*var\(--ring\)/);
  });
});
