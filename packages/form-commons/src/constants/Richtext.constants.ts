/** Link schemes the editor accepts; same set as the server allowlist. */
export const RICHTEXT_LINK_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];

/** Text colour palette; same entries as the server's `richtextTextColors`. `default` has no hex and clears the colour. */
export const RICHTEXT_TEXT_COLORS = [
  { name: 'default', hex: null },
  { name: 'gray', hex: '#475569' },
  { name: 'red', hex: '#b91c1c' },
  { name: 'orange', hex: '#c2410c' },
  { name: 'amber', hex: '#b45309' },
  { name: 'green', hex: '#15803d' },
  { name: 'teal', hex: '#0f766e' },
  { name: 'blue', hex: '#1d4ed8' },
  { name: 'violet', hex: '#6d28d9' },
  { name: 'pink', hex: '#be185d' },
] as const;
