import 'server-only';

import { connection } from 'next/server';

import type { ApiErrorCode } from '@/apis/WebApi.errors';
import { getServerEnv } from '@/configs/Server.env';

import type { MockKey } from './mocks/MockView';

/**
 * The mock module is loaded only here, only where neither the build nor the runtime
 * `APP_ENV` is `production` (WEB-5). The literal `process.env.APP_ENV_BUILD` is inlined at
 * build, so a production build drops the import and the mock files from the bundle.
 */
async function loadMockView(): Promise<Readonly<Record<string, unknown>> | undefined> {
  if (process.env.APP_ENV_BUILD === 'production') return undefined;
  if (!getServerEnv().isMockFallbackOn) return undefined;
  return (await import('./mocks/MockView')).MOCK_VIEW;
}

/**
 * The mock answer of a failed query (the GraphQL `data`), or `undefined` where the mocks are off
 * or the key has none. A mock found logs one warn line (no data, no token) and opts the render
 * out of caching.
 */
export async function readMock(
  mockKey: MockKey,
  operation: string,
  errorCode: ApiErrorCode,
): Promise<unknown> {
  const mockView = await loadMockView();
  if (mockView === undefined || !(mockKey in mockView)) return undefined;
  console.warn(`[mock] ${operation} ${mockKey} ${errorCode}`);
  await connection();
  return mockView[mockKey];
}
