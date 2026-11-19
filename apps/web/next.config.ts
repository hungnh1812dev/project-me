import path from 'node:path';

import type { NextConfig } from 'next';

import { CRAWLER_FILE_PATHS, CV_PAGE_PATH } from './src/configs/Api.endpoints';
import { APP_ENV_BUILD_KEY, parseAppEnv } from './src/configs/AppEnv.rules';
import { CACHE_CONTROL_HEADER, CRAWLER_FILES_CACHE_CONTROL } from './src/configs/Http.constants';
import {
  BFF_RESPONSE_HEADERS,
  CV_RESPONSE_HEADERS,
  SECURITY_RESPONSE_HEADERS,
} from './src/configs/SecurityHeaders.constants';

/** The standalone trace must include workspace packages (form-commons). */
const MONOREPO_ROOT = path.join(import.meta.dirname, '../..');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Fails the build without a valid APP_ENV (WEB-9); the build value is compared with the runtime one at start.
  env: { [APP_ENV_BUILD_KEY]: parseAppEnv(process.env.APP_ENV) },
  outputFileTracingRoot: MONOREPO_ROOT,
  poweredByHeader: false,
  // Next 16.4 would write an AGENTS.md into the app on `next dev`.
  agentRules: false,
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: [...SECURITY_RESPONSE_HEADERS] },
      // A metadata route sends `max-age=0`; a `headers()` entry is applied after it and wins (PS-4).
      ...Object.values(CRAWLER_FILE_PATHS).map((source) => ({
        source,
        headers: [{ key: CACHE_CONTROL_HEADER, value: CRAWLER_FILES_CACHE_CONTROL }],
      })),
      ...[CV_PAGE_PATH, `${CV_PAGE_PATH}/:path*`].map((source) => ({
        source,
        headers: [...CV_RESPONSE_HEADERS],
      })),
      // BFF_BASE_PATH is a route folder here; keep this literal in step with it.
      { source: '/api/:path*', headers: [...BFF_RESPONSE_HEADERS] },
    ]),
};

export default nextConfig;
