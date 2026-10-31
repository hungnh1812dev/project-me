const BACKSLASH = '\\';
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;
const PROBE_ORIGIN = 'http://probe.invalid';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

function hasUnsafeChar(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return (
      char === BACKSLASH || code <= LAST_CONTROL_CODE || code === DELETE_CODE
    );
  });
}

/**
 * True when the value is an http(s) URL or an absolute same-origin path, so
 * it is safe to use as an `href`. A `javascript:` URL, `//host`, `/\host` and
 * control characters fail.
 */
export function isSafeLinkTarget(value: string): boolean {
  // Backslashes and control characters are rewritten by browsers
  // (`/\host` -> `//host`, tabs dropped), so they never pass.
  if (hasUnsafeChar(value)) return false;
  try {
    if (value.startsWith('/')) {
      return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
    }
    return WEB_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
