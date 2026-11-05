import path from 'node:path';

import type { NextConfig } from 'next';

import {
  BFF_RESPONSE_HEADERS,
  SECURITY_RESPONSE_HEADERS,
} from './src/configs/SecurityHeaders.constants';

/** The standalone trace must include workspace packages (form-commons). */
const MONOREPO_ROOT = path.join(import.meta.dirname, '../..');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
  poweredByHeader: false,
  // Next 16.4 would write an AGENTS.md into the app on `next dev`.
  agentRules: false,
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: [...SECURITY_RESPONSE_HEADERS] },
      { source: '/bff/:path*', headers: [...BFF_RESPONSE_HEADERS] },
    ]),
};

export default nextConfig;
