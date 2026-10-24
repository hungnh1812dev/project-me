const QUERY_OR_HASH = /[?#]/;
const TRAILING_SLASHES = /\/+$/;

/**
 * Removes trailing slashes from the path part of a URL, keeping any query or
 * hash: `/health/live/?x=1` -> `/health/live?x=1`. SPEC §6: clients never send
 * a trailing slash, so no proxy or framework can answer with a 30x redirect.
 */
export function stripTrailingSlashes(url: string): string {
  const suffixStart = url.search(QUERY_OR_HASH);
  const path = suffixStart === -1 ? url : url.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : url.slice(suffixStart);
  return path.replace(TRAILING_SLASHES, '') + suffix;
}
