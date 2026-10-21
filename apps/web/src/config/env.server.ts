import 'server-only';

import { stripTrailingSlashes } from '../lib/strip-trailing-slashes';
import { requireEnv } from './require-env';

/** Used when WEB_REVALIDATE_SECONDS is unset (SPEC: 60 s in production). */
export const DEFAULT_REVALIDATE_SECONDS = 60;

export interface ServerEnv {
  /** cms-api base URL reachable from the Next server (never sent to the browser). */
  apiInternalUrl: string;
  /** Data cache lifetime for server fetches; 0 disables caching. */
  revalidateSeconds: number;
}

type EnvSource = Record<string, string | undefined>;

/** Pure and testable; throws on any invalid value. */
export function parseServerEnv(source: EnvSource): ServerEnv {
  const apiInternalUrl = stripTrailingSlashes(
    requireEnv('API_INTERNAL_URL', source.API_INTERNAL_URL),
  );
  if (!URL.canParse(apiInternalUrl)) {
    throw new Error('API_INTERNAL_URL must be an absolute URL.');
  }

  const rawRevalidate = source.WEB_REVALIDATE_SECONDS?.trim();
  const revalidateSeconds =
    rawRevalidate === undefined || rawRevalidate === ''
      ? DEFAULT_REVALIDATE_SECONDS
      : Number(rawRevalidate);
  if (!Number.isInteger(revalidateSeconds) || revalidateSeconds < 0) {
    throw new Error('WEB_REVALIDATE_SECONDS must be a non-negative integer.');
  }

  return { apiInternalUrl, revalidateSeconds };
}

let cached: Readonly<ServerEnv> | undefined;

/** Read at runtime on the server; validated once (fails start via instrumentation). */
export function getServerEnv(): Readonly<ServerEnv> {
  cached ??= Object.freeze(parseServerEnv(process.env));
  return cached;
}
