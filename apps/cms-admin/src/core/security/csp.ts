/**
 * The single source of the admin's Content-Security-Policy (SEC-4). `vite.config.ts`
 * imports it for `vite preview`, and `nginxTemplate.test.ts` pins `nginx.conf` to it,
 * so this module must stay free of browser APIs and `import.meta.env`.
 */

export interface CspOrigins {
  /** The API origin, or `''` when the API is same-origin. Allowed in `img-src` and `connect-src`. */
  apiOrigin: string;
  /** Extra image origins (CDN, media host), separated by whitespace, or `''`. Allowed in `img-src`. */
  imgOrigins: string;
}

/** `scheme://host[:port]` with nothing else: no path, query, fragment, credentials, `;`, quote or space. */
const BARE_ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;

/** Splits a whitespace-separated origin list, drops empties and throws on any non-bare origin. */
function parseOrigins(value: string): string[] {
  const origins = value.split(/\s+/).filter((origin) => origin !== '');
  for (const origin of origins) {
    if (!BARE_ORIGIN.test(origin)) {
      throw new Error(`CSP origin must be a bare http(s) origin (got ${JSON.stringify(origin)})`);
    }
  }
  return origins;
}

/**
 * Builds the policy string. Empty origins are left out; any origin that is not a bare
 * `http:`/`https:` origin throws, so a bad value can never inject a directive.
 */
export function buildContentSecurityPolicy({ apiOrigin, imgOrigins }: CspOrigins): string {
  const api = parseOrigins(apiOrigin);
  if (api.length > 1) {
    throw new Error(`CSP apiOrigin must be a single origin (got ${JSON.stringify(apiOrigin)})`);
  }
  const img = parseOrigins(imgOrigins);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    ["img-src 'self' data: blob:", ...api, ...img].join(' '),
    "font-src 'self'",
    ["connect-src 'self'", ...api].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
