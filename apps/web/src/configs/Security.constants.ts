/** Header names the proxy and Next.js agree on for the per-request nonce. */
export const CSP_HEADER = 'Content-Security-Policy';
export const NONCE_HEADER = 'x-nonce';

/** Bytes of randomness in a nonce (128 bits, base64 encoded). */
export const NONCE_BYTES = 16;

/** Cloudinary delivery origin for images (SPEC D17: `img-src`). */
export const CLOUDINARY_IMAGE_ORIGIN = 'https://res.cloudinary.com';

/** Palette hexes a richtext `span` may carry as `color` (SPEC D13); mirrors cms-api `richtextTextColors`. */
export const RICHTEXT_TEXT_COLOR_HEXES = [
  '#475569',
  '#b91c1c',
  '#c2410c',
  '#b45309',
  '#15803d',
  '#0f766e',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
] as const;

/** `text-align` values kept on richtext paragraphs and headings; mirrors cms-api `richtextTextAlignments`. */
export const RICHTEXT_TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

/** Cloudflare Turnstile (explicit rendering). The only third-party origin. */
export const TURNSTILE = {
  SCRIPT_ORIGIN: 'https://challenges.cloudflare.com',
  SCRIPT_URL: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
} as const;

/** Third-party origin Turnstile loads its script and challenge frame from. */
export const TURNSTILE_ORIGIN = TURNSTILE.SCRIPT_ORIGIN;

const SELF = "'self'";
const NONE = "'none'";

export const CSP_KEYWORDS = {
  SELF,
  NONE,
  STRICT_DYNAMIC: "'strict-dynamic'",
  UNSAFE_INLINE: "'unsafe-inline'",
  UNSAFE_EVAL: "'unsafe-eval'",
} as const;
