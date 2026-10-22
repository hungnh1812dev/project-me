import { TURNSTILE } from './reviewer.constants';

/** Header names the proxy and Next.js agree on for the per-request nonce. */
export const CSP_HEADER = 'Content-Security-Policy';
export const NONCE_HEADER = 'x-nonce';

/** Bytes of randomness in a nonce (128 bits, base64 encoded). */
export const NONCE_BYTES = 16;

/** Cloudinary delivery origin for images (SPEC D17: `img-src`). */
export const CLOUDINARY_IMAGE_ORIGIN = 'https://res.cloudinary.com';

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
