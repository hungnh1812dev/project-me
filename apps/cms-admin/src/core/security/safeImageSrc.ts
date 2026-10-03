/**
 * The thumbnail URL allowlist (P4-SEC-2). Server-supplied image URLs only reach an `<img src>`
 * when they are safe to fetch: any absolute `https:` URL, or an `http:` URL on the API or page
 * origin, so the dev backend on `http://localhost:8080` keeps working (D3). Pure, so it can be
 * tested without a DOM.
 */

export interface ImageOrigins {
  /** The API's origin, for example `http://localhost:8080`; `''` adds nothing. */
  apiOrigin: string;
  /** The admin's own origin (`window.location.origin`); `''` adds nothing. */
  pageOrigin: string;
}

/**
 * Returns `url` when it may be used as an image source, otherwise `null`. Relative,
 * protocol-relative and unparsable URLs, and `javascript:`, `data:` and `blob:` URLs, are refused.
 */
export function safeImageSrc(
  url: string | null | undefined,
  { apiOrigin, pageOrigin }: ImageOrigins,
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    // No base: only absolute URLs parse.
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') return url;
  if (parsed.protocol !== 'http:') return null;
  const allowed = [apiOrigin, pageOrigin].filter((origin) => origin !== '');
  return allowed.includes(parsed.origin) ? url : null;
}
