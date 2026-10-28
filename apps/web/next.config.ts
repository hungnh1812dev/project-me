import path from 'node:path';

import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

import { SECURITY_RESPONSE_HEADERS } from './src/config/SecurityHeaders.constants';

/** The standalone trace must include workspace packages (form-commons). */
const MONOREPO_ROOT = path.join(import.meta.dirname, '../..');

/** Mirrors production: /api on the web origin goes to cms-api unchanged. */
const API_PROXY_SOURCE = '/api/:path*';

export default function nextConfig(phase: string): NextConfig {
  const config: NextConfig = {
    output: 'standalone',
    outputFileTracingRoot: MONOREPO_ROOT,
    poweredByHeader: false,
    // Next 16.4 would write an AGENTS.md into the app on `next dev`.
    agentRules: false,
    headers: () =>
      Promise.resolve([
        { source: '/:path*', headers: [...SECURITY_RESPONSE_HEADERS] },
      ]),
  };

  // Dev only (never in a production build): Traefik does this in production.
  const apiProxyTarget = process.env.DEV_API_PROXY_TARGET;
  if (phase === PHASE_DEVELOPMENT_SERVER && apiProxyTarget) {
    config.rewrites = () =>
      Promise.resolve([
        {
          source: API_PROXY_SOURCE,
          destination: `${apiProxyTarget}/api/:path*`,
        },
      ]);
  }

  return config;
}
