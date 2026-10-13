import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // @repo/form-commons ships TypeScript source, so Next compiles it like app code.
  transpilePackages: ['@repo/form-commons'],
  // Trace from the monorepo root so files hoisted outside apps/frontend are included
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
};

export default nextConfig;
