import 'server-only';

import { connection } from 'next/server';

import type { ApiErrorCode } from '@/apis/WebApi.errors';
import { getServerEnv } from '@/configs/Server.env';

import type { MockKey } from './mocks/MockView';

export interface FillFromMocksInput {
  operationName: string;
  rootFields: readonly string[];
  /** Mock key of a root field; a root field not listed uses its own name. */
  mockKeys: Readonly<Record<string, MockKey | undefined>>;
  data: Readonly<Record<string, unknown>> | null;
  /** The root fields that failed, each with the `WebApiError` code of its failure. */
  failures: ReadonlyMap<string, ApiErrorCode>;
}

export interface FillFromMocksResult {
  data: Record<string, unknown>;
  failedRootFields: string[];
}

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
 * Fills each failed root field with its mock where the fallback is on; a root field that did not
 * fail keeps what the API answered (`null` when it gave nothing). The fields it cannot fill stay
 * null and are listed as failed. A render that used a mock opts out of caching. The warn line
 * carries no data and no token.
 */
export async function fillFromMocks({
  operationName,
  rootFields,
  mockKeys,
  data,
  failures,
}: FillFromMocksInput): Promise<FillFromMocksResult> {
  const mockView = failures.size > 0 ? await loadMockView() : undefined;
  const filled: Record<string, unknown> = {};
  const failedRootFields: string[] = [];
  let isMockUsed = false;

  for (const rootField of rootFields) {
    const errorCode = failures.get(rootField);
    if (errorCode === undefined) {
      filled[rootField] = data?.[rootField] ?? null;
      continue;
    }
    const mockKey = mockKeys[rootField] ?? rootField;
    if (mockView !== undefined && mockKey in mockView) {
      filled[rootField] = mockView[mockKey];
      isMockUsed = true;
      console.warn(`[mock] ${operationName} ${rootField} ${mockKey} ${errorCode}`);
    } else {
      filled[rootField] = null;
      failedRootFields.push(rootField);
    }
  }
  if (isMockUsed) await connection();
  return { data: filled, failedRootFields };
}
