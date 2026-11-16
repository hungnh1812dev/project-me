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
  /** The root fields that are a single type: one that answers null without failing is mocked too. */
  singleTypeRootFields: readonly string[];
}

/** The warn-line code of a single type that answered null without failing. */
const NULL_SINGLE_TYPE = 'NULL_SINGLE_TYPE';

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
 * Fills each failed root field, and each single type that answered null, with its mock where
 * the fallback is on; any other root field keeps what the API answered (`null` when it gave
 * nothing, so a collection that answers empty is never mocked). A failed field it cannot fill
 * stays null and is listed as failed; a null single type with no mock stays null and is not
 * listed. A render that used a mock opts out of caching. The warn line (one per mocked field)
 * carries no data and no token.
 */
export async function fillFromMocks({
  operationName,
  rootFields,
  mockKeys,
  data,
  failures,
  singleTypeRootFields,
}: FillFromMocksInput): Promise<FillFromMocksResult> {
  const isNullSingleType = (rootField: string) =>
    singleTypeRootFields.includes(rootField) && (data?.[rootField] ?? null) === null;
  const needsMock = failures.size > 0 || rootFields.some(isNullSingleType);
  const mockView = needsMock ? await loadMockView() : undefined;
  const filled: Record<string, unknown> = {};
  const failedRootFields: string[] = [];
  let isMockUsed = false;

  for (const rootField of rootFields) {
    const errorCode = failures.get(rootField);
    const isFailed = errorCode !== undefined;
    if (!isFailed && !isNullSingleType(rootField)) {
      filled[rootField] = data?.[rootField] ?? null;
      continue;
    }
    const mockKey = mockKeys[rootField] ?? rootField;
    if (mockView !== undefined && mockKey in mockView) {
      filled[rootField] = mockView[mockKey];
      isMockUsed = true;
      console.warn(
        `[mock] ${operationName} ${rootField} ${mockKey} ${errorCode ?? NULL_SINGLE_TYPE}`,
      );
    } else {
      filled[rootField] = null;
      if (isFailed) failedRootFields.push(rootField);
    }
  }
  if (isMockUsed) await connection();
  return { data: filled, failedRootFields };
}
