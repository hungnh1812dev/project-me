import {
  CSP_KEYWORDS,
  CLOUDINARY_IMAGE_ORIGIN,
  NONCE_BYTES,
  TURNSTILE_ORIGIN,
} from '../config/security.constants';

const { SELF, NONE, STRICT_DYNAMIC, UNSAFE_INLINE, UNSAFE_EVAL } = CSP_KEYWORDS;

export interface CspOptions {
  nonce: string;
  /** `NEXT_PUBLIC_API_BASE_URL`: a path (same origin) or an absolute URL. */
  apiBaseUrl: string;
  /** React dev builds need `eval` and the HMR websocket. */
  isDev: boolean;
}

/** A fresh, unpredictable nonce (base64 of random bytes) per request. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

/** The origin of an absolute http(s) URL, or null for a path or junk. */
export function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Web CSP (SPEC D17). Scripts need the nonce; `strict-dynamic` lets
 * those scripts load Turnstile. `style-src` carries the nonce for stylesheets
 * and `style-src-attr 'unsafe-inline'` covers React/Radix style attributes
 * (attributes cannot run script).
 */
export function buildContentSecurityPolicy({
  nonce,
  apiBaseUrl,
  isDev,
}: CspOptions): string {
  const apiOrigin = originOf(apiBaseUrl);
  const nonceSource = `'nonce-${nonce}'`;
  const directives: [string, string[]][] = [
    ['default-src', [SELF]],
    [
      'script-src',
      [
        SELF,
        nonceSource,
        STRICT_DYNAMIC,
        TURNSTILE_ORIGIN,
        ...(isDev ? [UNSAFE_EVAL] : []),
      ],
    ],
    ['style-src', [SELF, nonceSource]],
    ['style-src-attr', [UNSAFE_INLINE]],
    ['img-src', [SELF, 'data:', 'blob:', CLOUDINARY_IMAGE_ORIGIN]],
    ['font-src', [SELF]],
    [
      'connect-src',
      [SELF, ...(apiOrigin ? [apiOrigin] : []), ...(isDev ? ['ws:'] : [])],
    ],
    ['frame-src', [TURNSTILE_ORIGIN]],
    ['object-src', [NONE]],
    ['base-uri', [SELF]],
    ['form-action', [SELF]],
    ['frame-ancestors', [NONE]],
  ];
  return directives
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}
