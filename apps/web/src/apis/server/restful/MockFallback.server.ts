import 'server-only';

import { getServerEnv } from '@/configs/Server.env';

import { MOCK_VIEW } from './mocks/MockView';

export const MOCK_FALLBACK_REASONS = [
  'network',
  'timeout',
  'http',
  'graphql-error',
  'empty',
] as const;

export type MockFallbackReason = (typeof MOCK_FALLBACK_REASONS)[number];

export interface FillFromMocksInput {
  operationName: string;
  rootFields: readonly string[];
  data: Readonly<Record<string, unknown>> | null | undefined;
  reason: MockFallbackReason;
}

export interface FillFromMocksResult {
  data: Record<string, unknown>;
  failedRootFields: string[];
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Replaces each missing, null or empty root field with its mock when the mock
 * fallback is on; the fields it cannot fill stay null and are listed as failed.
 * The warn line carries no data and no token.
 */
export function fillFromMocks({
  operationName,
  rootFields,
  data,
  reason,
}: FillFromMocksInput): FillFromMocksResult {
  const isFallbackOn = getServerEnv().isMockFallbackOn;
  const mocksOfOperation = MOCK_VIEW[operationName];
  const filled: Record<string, unknown> = {};
  const failedRootFields: string[] = [];

  for (const rootField of rootFields) {
    const value = data?.[rootField];
    if (!isEmptyValue(value)) {
      filled[rootField] = value;
      continue;
    }
    const hasMock = isFallbackOn && mocksOfOperation !== undefined && rootField in mocksOfOperation;
    if (hasMock) {
      filled[rootField] = mocksOfOperation[rootField];
      console.warn(`[mock] ${operationName} ${rootField} ${reason}`);
    } else {
      filled[rootField] = null;
      failedRootFields.push(rootField);
    }
  }
  return { data: filled, failedRootFields };
}
