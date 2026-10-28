import { isSafeLinkTarget } from '../lib/SafeLinkTarget.rules';
import { stripTrailingSlashes } from '../lib/StripTrailingSlashes.rules';

export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

/** A trimmed optional value, or undefined when unset or blank. */
export function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
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
