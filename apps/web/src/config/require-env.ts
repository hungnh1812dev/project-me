import { stripTrailingSlashes } from '../lib/strip-trailing-slashes';

export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

const BACKSLASH = '\\';
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

function hasUnsafeChar(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return (
      char === BACKSLASH || code <= LAST_CONTROL_CODE || code === DELETE_CODE
    );
  });
}
const PROBE_ORIGIN = 'http://probe.invalid';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

function isSafeLinkTarget(value: string): boolean {
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

/**
 * An optional link target: a trimmed http(s) URL or an absolute path without
 * trailing slashes, or undefined when blank. Anything else (a `javascript:`
 * URL, `//host`, `/\host`, control characters) fails, so the value is safe
 * to use as an `href`.
 */
export function optionalLinkTarget(
  name: string,
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return undefined;
  if (!isSafeLinkTarget(trimmed)) {
    throw new Error(
      `${name} must be an http(s) URL or a path. See .env.example.`,
    );
  }
  return stripTrailingSlashes(trimmed);
}
