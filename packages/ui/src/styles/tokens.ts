/**
 * The semantic colour tokens, mirrored from `theme.css` (`:root` and `.dark`).
 * `tokens.test.ts` checks that both stay in sync and that every pair meets WCAG AA (AC-3).
 * Neutrals are Tailwind slate; the primary is violet-600 (light) and violet-400 (dark), and the
 * highlight is orange-700 (light) and orange-400 (dark) (D9).
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
    background: '#ffffff',
    foreground: '#020617',
    card: '#ffffff',
    'card-foreground': '#020617',
    popover: '#ffffff',
    'popover-foreground': '#020617',
    primary: '#7c3aed',
    'primary-foreground': '#ffffff',
    secondary: '#f1f5f9',
    'secondary-foreground': '#0f172a',
    muted: '#f1f5f9',
    'muted-foreground': '#475569',
    accent: '#f1f5f9',
    'accent-foreground': '#0f172a',
    destructive: '#dc2626',
    'destructive-foreground': '#ffffff',
    success: '#15803d',
    'success-foreground': '#ffffff',
    warning: '#b45309',
    'warning-foreground': '#ffffff',
    highlight: '#c2410c',
    'highlight-foreground': '#ffffff',
    border: '#e2e8f0',
    input: '#64748b',
    ring: '#7c3aed',
    sidebar: '#f8fafc',
    'sidebar-foreground': '#0f172a',
    'sidebar-primary': '#7c3aed',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#e2e8f0',
    'sidebar-accent-foreground': '#0f172a',
    'sidebar-border': '#e2e8f0',
    'sidebar-ring': '#7c3aed',
  },
  dark: {
    background: '#020617',
    foreground: '#f8fafc',
    card: '#0f172a',
    'card-foreground': '#f8fafc',
    popover: '#0f172a',
    'popover-foreground': '#f8fafc',
    primary: '#a78bfa',
    'primary-foreground': '#020617',
    secondary: '#1e293b',
    'secondary-foreground': '#f8fafc',
    muted: '#1e293b',
    'muted-foreground': '#94a3b8',
    accent: '#1e293b',
    'accent-foreground': '#f8fafc',
    destructive: '#f87171',
    'destructive-foreground': '#020617',
    success: '#4ade80',
    'success-foreground': '#020617',
    warning: '#fbbf24',
    'warning-foreground': '#020617',
    highlight: '#fb923c',
    'highlight-foreground': '#020617',
    border: '#1e293b',
    input: '#64748b',
    ring: '#a78bfa',
    sidebar: '#0f172a',
    'sidebar-foreground': '#f8fafc',
    'sidebar-primary': '#a78bfa',
    'sidebar-primary-foreground': '#020617',
    'sidebar-accent': '#1e293b',
    'sidebar-accent-foreground': '#f8fafc',
    'sidebar-border': '#1e293b',
    'sidebar-ring': '#a78bfa',
  },
};

/** Text on background pairs; each must reach 4.5:1. */
export const TEXT_PAIRS: ReadonlyArray<readonly [ColorTokenName, ColorTokenName]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
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
  ['sidebar-ring', 'sidebar'],
  ['sidebar-primary', 'sidebar'],
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
