/**
 * The semantic colour tokens, mirrored from `theme.css` (`:root` and `.dark`).
 * `tokens.test.ts` checks that both stay in sync and that every pair meets WCAG AA (AC-1, AC-2).
 * Quiet luxury: warm stone neutrals, charcoal text on an off-white canvas with white cards, and a
 * metallic gold primary. `primary-ink` is the deep gold used where gold must read as text (4.5:1)
 * or as a boundary (3:1): links, the focus ring, checked borders and every gold-surface border.
 * The highlight shares that deep gold.
 */
export const COLOR_TOKEN_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'primary-ink',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'highlight',
  'highlight-foreground',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const;

export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];
export type ThemeName = 'light' | 'dark';

export const THEME_TOKENS: Record<ThemeName, Record<ColorTokenName, string>> = {
  light: {
    background: '#fafaf9',
    foreground: '#2b2b2b',
    card: '#ffffff',
    'card-foreground': '#2b2b2b',
    popover: '#ffffff',
    'popover-foreground': '#2b2b2b',
    primary: '#d4af37',
    'primary-foreground': '#2b2b2b',
    'primary-ink': '#7a5c14',
    secondary: '#f5f5f4',
    'secondary-foreground': '#2b2b2b',
    muted: '#f5f5f4',
    'muted-foreground': '#57534e',
    accent: '#f5f0e1',
    'accent-foreground': '#2b2b2b',
    destructive: '#b91c1c',
    'destructive-foreground': '#ffffff',
    success: '#15803d',
    'success-foreground': '#ffffff',
    warning: '#b45309',
    'warning-foreground': '#ffffff',
    highlight: '#7a5c14',
    'highlight-foreground': '#ffffff',
    border: '#e7e5e4',
    input: '#78716c',
    ring: '#7a5c14',
    sidebar: '#f5f5f4',
    'sidebar-foreground': '#2b2b2b',
    'sidebar-primary': '#d4af37',
    'sidebar-primary-foreground': '#2b2b2b',
    'sidebar-accent': '#e7e5e4',
    'sidebar-accent-foreground': '#2b2b2b',
    'sidebar-border': '#e7e5e4',
    'sidebar-ring': '#7a5c14',
  },
  dark: {
    background: '#1c1a17',
    foreground: '#f5f5f4',
    card: '#292524',
    'card-foreground': '#f5f5f4',
    popover: '#292524',
    'popover-foreground': '#f5f5f4',
    primary: '#d4af37',
    'primary-foreground': '#1c1a17',
    'primary-ink': '#e0c068',
    secondary: '#292524',
    'secondary-foreground': '#f5f5f4',
    muted: '#292524',
    'muted-foreground': '#a8a29e',
    accent: '#33302b',
    'accent-foreground': '#f5f5f4',
    destructive: '#f87171',
    'destructive-foreground': '#1c1a17',
    success: '#4ade80',
    'success-foreground': '#1c1a17',
    warning: '#fbbf24',
    'warning-foreground': '#1c1a17',
    highlight: '#e0c068',
    'highlight-foreground': '#1c1a17',
    border: '#33302b',
    input: '#8b847e',
    ring: '#e0c068',
    sidebar: '#1c1a17',
    'sidebar-foreground': '#f5f5f4',
    'sidebar-primary': '#d4af37',
    'sidebar-primary-foreground': '#1c1a17',
    'sidebar-accent': '#33302b',
    'sidebar-accent-foreground': '#f5f5f4',
    'sidebar-border': '#33302b',
    'sidebar-ring': '#e0c068',
  },
};

/** Text on background pairs; each must reach 4.5:1. */
export const TEXT_PAIRS: ReadonlyArray<readonly [ColorTokenName, ColorTokenName]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['foreground', 'card'],
  ['foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary-ink', 'background'],
  ['primary-ink', 'card'],
  ['primary-ink', 'accent'],
  ['primary-ink', 'sidebar'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['success-foreground', 'success'],
  ['success', 'background'],
  ['warning-foreground', 'warning'],
  ['warning', 'background'],
  ['highlight-foreground', 'highlight'],
  ['highlight', 'background'],
  ['highlight', 'card'],
  ['sidebar-foreground', 'sidebar'],
  ['muted-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
];

/** Control boundaries and focus rings against their surfaces; each must reach 3:1. */
export const UI_BOUNDARY_PAIRS: ReadonlyArray<readonly [ColorTokenName, ColorTokenName]> = [
  ['input', 'background'],
  ['input', 'card'],
  ['ring', 'background'],
  ['ring', 'card'],
  ['primary-ink', 'background'],
  ['primary-ink', 'card'],
  ['sidebar-ring', 'sidebar'],
  ['highlight', 'sidebar'],
];

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected a hex colour, got "${hex}"`);
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((d) => d + d)
          .join('')
      : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2.x contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
