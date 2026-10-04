/**
 * The semantic colour tokens, mirrored from `theme.css` (`:root` and `.dark`).
 * `tokens.test.ts` checks that both stay in sync and that every pair meets WCAG AA (AC-1, AC-2).
 * Strapi admin palette: cool lavender-grey neutrals, `#32324d` text on a `#f6f6f9` page with white
 * cards, and an indigo `#4945ff` primary. `primary-ink` is primary used as text (4.5:1) or as a
 * boundary (3:1): links, the focus ring, checked borders and the border every primary fill carries.
 * In dark the `#4945ff` fill is only 2.99:1 on the page, so its `#9a98ff` ink border is what reaches
 * 3:1. The highlight shares `primary-ink`.
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
    destructive: '#b72b1a',
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
    destructive: '#f38b83',
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
  ['primary-ink', 'sidebar-accent'],
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
  ['success', 'card'],
  ['warning-foreground', 'warning'],
  ['warning', 'background'],
  ['warning', 'card'],
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
  ['highlight', 'sidebar-accent'],
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
