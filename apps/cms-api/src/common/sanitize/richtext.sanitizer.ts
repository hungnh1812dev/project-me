/**
 * Cleans richtext HTML before it is stored (SPEC D14, storage part).
 * STUB until T24: returns the input unchanged. Every richtext write already
 * goes through this function, so T24 only has to replace the body (a
 * `sanitize-html` allowlist) without touching the callers.
 */
export function sanitizeRichtext(html: string): string {
  return html;
}
