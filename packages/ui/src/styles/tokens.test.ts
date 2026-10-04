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

/** The SPEC Design colour table (AC-1): every value, lowercase. */
const STRAPI_TABLE: Record<ThemeName, Record<ColorTokenName, string>> = {
  light: {
    background: '#f6f6f9',
    foreground: '#32324d',
    card: '#ffffff',
    'card-foreground': '#32324d',
    popover: '#ffffff',
    'popover-foreground': '#32324d',
    primary: '#4945ff',
    'primary-foreground': '#ffffff',
    'primary-ink': '#4945ff',
    secondary: '#f0f0ff',
    'secondary-foreground': '#271fe0',
    muted: '#eaeaef',
    'muted-foreground': '#666687',
    accent: '#f0f0ff',
    'accent-foreground': '#32324d',
    destructive: '#d02b20',
    'destructive-foreground': '#ffffff',
    success: '#2f6846',
    'success-foreground': '#ffffff',
    warning: '#a14f00',
    'warning-foreground': '#ffffff',
    highlight: '#4945ff',
    'highlight-foreground': '#ffffff',
    border: '#dcdce4',
    input: '#80809c',
    ring: '#4945ff',
    sidebar: '#ffffff',
    'sidebar-foreground': '#32324d',
    'sidebar-primary': '#4945ff',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#f0f0ff',
    'sidebar-accent-foreground': '#271fe0',
    'sidebar-border': '#eaeaef',
    'sidebar-ring': '#4945ff',
  },
  dark: {
    background: '#181826',
    foreground: '#ffffff',
    card: '#212134',
    'card-foreground': '#ffffff',
    popover: '#212134',
    'popover-foreground': '#ffffff',
    primary: '#4945ff',
    'primary-foreground': '#ffffff',
    'primary-ink': '#9a98ff',
    secondary: '#32324d',
    'secondary-foreground': '#9a98ff',
    muted: '#32324d',
    'muted-foreground': '#a5a5ba',
    accent: '#32324d',
    'accent-foreground': '#ffffff',
    destructive: '#ee5e52',
    'destructive-foreground': '#181826',
    success: '#5cb176',
    'success-foreground': '#181826',
    warning: '#f29d41',
    'warning-foreground': '#181826',
    highlight: '#9a98ff',
    'highlight-foreground': '#181826',
    border: '#32324d',
    input: '#8e8ea9',
    ring: '#9a98ff',
    sidebar: '#212134',
    'sidebar-foreground': '#ffffff',
    'sidebar-primary': '#4945ff',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#181826',
    'sidebar-accent-foreground': '#9a98ff',
    'sidebar-border': '#32324d',
    'sidebar-ring': '#9a98ff',
  },
};

describe('palette (AC-1, AC-3)', () => {
  it.each(THEMES)('holds exactly the SPEC Strapi colour table (%s)', (theme) => {
    expect(THEME_TOKENS[theme]).toEqual(STRAPI_TABLE[theme]);
  });

  it('uses the Strapi neutrals: neutral800 text on a neutral100 page with white cards in light', () => {
    const light = THEME_TOKENS.light;
    expect(light.background).toBe('#f6f6f9');
    expect(light.foreground).toBe('#32324d');
    expect(light.card).toBe('#ffffff');
    expect(light.popover).toBe('#ffffff');
  });

  it('uses the Strapi dark page and surfaces', () => {
    expect(THEME_TOKENS.dark.background).toBe('#181826');
    expect(THEME_TOKENS.dark.card).toBe('#212134');
    expect(THEME_TOKENS.dark.popover).toBe('#212134');
  });

  it.each(THEMES)('makes primary and the sidebar primary indigo #4945ff (%s)', (theme) => {
    expect(THEME_TOKENS[theme].primary).toBe('#4945ff');
    expect(THEME_TOKENS[theme]['sidebar-primary']).toBe('#4945ff');
  });

  it.each([
    ['light', '#4945ff'],
    ['dark', '#9a98ff'],
  ] as const)('shares primary-ink with ring, sidebar ring and highlight (%s)', (theme, ink) => {
    const tokens = THEME_TOKENS[theme];
    for (const name of ['primary-ink', 'ring', 'sidebar-ring', 'highlight'] as const) {
      expect(tokens[name], name).toBe(ink);
    }
  });

  it('uses the five AA-derived values (Decision 3)', () => {
    expect(THEME_TOKENS.light.input).toBe('#80809c');
    expect(THEME_TOKENS.light.warning).toBe('#a14f00');
    expect(THEME_TOKENS.light.success).toBe('#2f6846');
    expect(THEME_TOKENS.dark['primary-ink']).toBe('#9a98ff');
    expect(THEME_TOKENS.dark.input).toBe('#8e8ea9');
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
        ['primary-ink', 'sidebar-accent'],
        ['success', 'card'],
        ['warning', 'card'],
      ]),
    );
  });

  it('never treats the primary fill as text on the page', () => {
    expect(TEXT_PAIRS).not.toContainEqual(['primary', 'background']);
    expect(TEXT_PAIRS).not.toContainEqual(['primary', 'card']);
  });

  it('keeps the dark primary fill below 4.5:1 on the page, so it needs the primary-ink border', () => {
    const dark = THEME_TOKENS.dark;
    expect(contrastRatio(dark.primary, dark.background)).toBeLessThan(4.5);
    expect(contrastRatio(dark['primary-ink'], dark.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(dark['primary-ink'], dark.card)).toBeGreaterThanOrEqual(3);
  });

  it('checks the AC-3 boundary pairs for 3:1', () => {
    expect(UI_BOUNDARY_PAIRS).toEqual(
      expect.arrayContaining([
        ...(['input', 'ring', 'primary-ink'] as const).flatMap((fg) => [
          [fg, 'background'],
          [fg, 'card'],
        ]),
        ['highlight', 'sidebar-accent'],
      ]),
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
