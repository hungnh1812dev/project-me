import 'server-only';

import { operationNameOf, unwrapGraphqlResponse } from '@/apis/GraphqlResponse.rules';
import { readMock } from '@/apis/server/graphql/MockFallback.server';
import type { MockKey } from '@/apis/server/graphql/mocks/MockView';
import { serverApi, type ServerApiNextOptions } from '@/apis/server/restful/ServerApi.client';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';
import { API_ENDPOINTS } from '@/configs/Api.endpoints';
import { BEARER_PREFIX } from '@/configs/Auth.constants';
import { ACCEPT_HEADER, AUTHORIZATION_HEADER, JSON_MEDIA_TYPE } from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

export interface ExecuteGraphqlOptions<T> {
  /** The key of this query's answer in `MOCK_VIEW`, used where the mocks are on when the read fails. */
  mock?: MockKey;
  /** Turns the answer's `data` into `T`; a throw is a failed read. Without it `data` is returned as is. */
  resolveData?: (data: unknown) => T;
  next?: ServerApiNextOptions;
  /** A signed-in visitor's token: the call is sent with it, never cached and never mocked. */
  accessToken?: string;
}

const NO_CACHE: ServerApiNextOptions = { revalidate: 0 };

function bearerHeaderOf(token: string | undefined): Record<string, string> {
  return token === undefined ? {} : { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}` };
}

async function postQuery(
  query: string,
  operation: string,
  { accessToken, next }: ExecuteGraphqlOptions<unknown>,
): Promise<unknown> {
  const { appApiToken } = getServerEnv();
  let answer: { status: number; body: unknown };
  try {
    answer = await serverApi.post(API_ENDPOINTS.GRAPHQL, {
      headers: {
        [ACCEPT_HEADER]: JSON_MEDIA_TYPE,
        ...bearerHeaderOf(accessToken ?? appApiToken),
      },
      body: { query },
      resolveData: ({ status, body }) => ({ status, body }),
      next: accessToken === undefined ? (next ?? {}) : NO_CACHE,
    });
  } catch (error) {
    // `serverApi` logged the transport failure; this one carries the GraphQL network code.
    if (!(error instanceof WebApiError)) throw error;
    throw new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NETWORK,
      operation,
      retryable: error.retryable,
    });
  }
  try {
    return unwrapGraphqlResponse<unknown>(answer.status, answer.body, operation);
  } catch (error) {
    if (error instanceof WebApiError) logApiError(error);
    throw error;
  }
}

function resolveOrFail<T>(
  data: unknown,
  operation: string,
  resolveData: ExecuteGraphqlOptions<T>['resolveData'],
): T {
  if (resolveData === undefined) return data as T;
  try {
    return resolveData(data);
  } catch (error) {
    const failure = new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: error instanceof WebApiError ? error.errorCode : API_ERROR_CODES.GRAPHQL.UNKNOWN,
      operation,
    });
    logApiError(failure);
    throw failure;
  }
}

/**
 * Runs one GraphQL query on the content API: the API token when set (or the visitor's
 * `accessToken`), cached per `next`. A failed read (transport, non-2xx, any `errors` entry,
 * no `data`, a throwing `resolveData`) is logged once; where the mocks are on and the query
 * has a `mock` key and no `accessToken`, its mock answers instead, otherwise `WebApiError`
 * is thrown. An empty collection is an answer, not a failure.
 */
export async function executeGraphql<T = unknown>(
  query: string,
  options: ExecuteGraphqlOptions<T> = {},
): Promise<T> {
  const operation = operationNameOf(query);
  try {
    const data = await postQuery(query, operation, options);
    return resolveOrFail(data, operation, options.resolveData);
  } catch (error) {
    if (!(error instanceof WebApiError)) throw error;
    const { mock, accessToken, resolveData } = options;
    const mocked =
      mock === undefined || accessToken !== undefined
        ? undefined
        : await readMock(mock, operation, error.errorCode);
    if (mocked === undefined) throw error;
    return resolveData === undefined ? (mocked as T) : resolveData(mocked);
  }
}

/** A `resolveData` that returns `data` and fails with `NO_DATA` when `data[rootField]` is null or missing. */
export function requireRootField<T>(rootField: string): (data: unknown) => T {
  return (data) => {
    const value =
      typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>)[rootField]
        : null;
    if (value === null || value === undefined) {
      throw new WebApiError({
        source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
        errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      });
    }
    return data as T;
  };
}
