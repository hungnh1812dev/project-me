import 'server-only';

import {
  graphqlFailureOf,
  readGraphqlRootFields,
  unwrapGraphqlResponse,
  type GraphqlDocument,
} from '@/apis/GraphqlResponse.rules';
import { fillFromMocks } from '@/apis/server/graphql/MockFallback.server';
import type { MockKey } from '@/apis/server/graphql/mocks/MockView';
import { serverApi, type ServerApiCache } from '@/apis/server/restful/ServerApi.client';
import {
  API_ERROR_CODES,
  API_ERROR_SOURCES,
  logApiError,
  WebApiError,
  type ApiErrorCode,
} from '@/apis/WebApi.errors';
import { API_ENDPOINTS } from '@/configs/Api.endpoints';
import { BEARER_PREFIX } from '@/configs/Auth.constants';
import {
  ACCEPT_HEADER,
  AUTHORIZATION_HEADER,
  DEFAULT_REVALIDATE_SECONDS,
  JSON_MEDIA_TYPE,
} from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

const ACCEPT_JSON = { [ACCEPT_HEADER]: JSON_MEDIA_TYPE };

/**
 * A page query declared once: `rootFields` maps each root field to the text
 * after its name (arguments and selection), so the document, the single-field
 * retries and the mock keys all come from the same list.
 */
export interface ContentQuery<T> {
  operationName: string;
  rootFields: Readonly<Record<keyof T & string, string>>;
  /** Mock key of a root field whose mock is not stored under the root field's own name. */
  mockKeys?: Partial<Record<keyof T & string, MockKey>>;
  /** Data cache lifetime of this query; defaults to `DEFAULT_REVALIDATE_SECONDS`. */
  revalidateSeconds?: number;
  document: GraphqlDocument;
}

export interface ContentQueryDefinition<T> {
  operationName: string;
  rootFields: Readonly<Record<keyof T & string, string>>;
  mockKeys?: Partial<Record<keyof T & string, MockKey>>;
  revalidateSeconds?: number;
}

/** Each root field as the API answered it, or `null` when no source could give it. */
export interface ContentResult<T> {
  data: { [K in keyof T]: T[K] | null };
  failedRootFields: Array<keyof T & string>;
}

function documentOf(
  operationName: string,
  rootFields: Readonly<Record<string, string>>,
  names: readonly string[],
): GraphqlDocument {
  const fields = names.map((name) => `${name}${rootFields[name]}`).join('\n');
  return { operationName, query: `query ${operationName} {\n${fields}\n}` };
}

export function defineContentQuery<T>(definition: ContentQueryDefinition<T>): ContentQuery<T> {
  return {
    ...definition,
    document: documentOf(
      definition.operationName,
      definition.rootFields,
      Object.keys(definition.rootFields),
    ),
  };
}

/** What one call gave: its `data` and, for each root field it failed, the code of the failure. */
interface RootFieldsRead {
  data: Readonly<Record<string, unknown>> | null;
  failures: Map<string, ApiErrorCode>;
}

function failureOfEach(
  names: readonly string[],
  errorCode: ApiErrorCode,
): Map<string, ApiErrorCode> {
  return new Map(names.map((name) => [name, errorCode]));
}

async function postDocument(
  document: GraphqlDocument,
  headers: Record<string, string>,
  cache: ServerApiCache,
): Promise<{ status: number; body: unknown }> {
  const { status, body } = await serverApi.post(API_ENDPOINTS.GRAPHQL, {
    headers,
    body: document,
    cache,
  });
  return { status, body };
}

async function readRootFields(
  document: GraphqlDocument,
  names: readonly string[],
  headers: Record<string, string>,
  cache: ServerApiCache,
): Promise<RootFieldsRead> {
  try {
    const { status, body } = await postDocument(document, headers, cache);
    const read = readGraphqlRootFields(status, body);
    const failure = graphqlFailureOf(
      status,
      read.errorCode,
      read.data !== null,
      document.operationName,
    );
    if (failure === undefined) return { data: read.data, failures: new Map() };
    logApiError(failure);
    const failedNames =
      read.failedRootFields === 'all'
        ? names
        : names.filter((name) => (read.failedRootFields as ReadonlySet<string>).has(name));
    return { data: read.data, failures: failureOfEach(failedNames, failure.errorCode) };
  } catch (error) {
    const errorCode =
      error instanceof WebApiError ? error.errorCode : API_ERROR_CODES.SERVER_API.NETWORK;
    return { data: null, failures: failureOfEach(names, errorCode) };
  }
}

/** Asks each root field alone so one the API cannot serve yet does not hide the others (dev and smoke only). */
async function readRootFieldsOneByOne(
  query: ContentQuery<never>,
  names: readonly string[],
  headers: Record<string, string>,
  cache: ServerApiCache,
): Promise<RootFieldsRead> {
  const reads = await Promise.all(
    names.map((name) =>
      readRootFields(
        documentOf(query.operationName, query.rootFields, [name]),
        [name],
        headers,
        cache,
      ),
    ),
  );
  const data: Record<string, unknown> = {};
  const failures = new Map<string, ApiErrorCode>();
  names.forEach((name, index) => {
    data[name] = reads[index]?.data?.[name];
    const errorCode = reads[index]?.failures.get(name);
    if (errorCode !== undefined) failures.set(name, errorCode);
  });
  return { data, failures };
}

/**
 * Runs a page query as the site (the API token when set, else anonymous),
 * cached for every visitor. Never throws for a content failure: a root field
 * that failed and has no mock is `null` and listed in `failedRootFields`; a root field
 * the API answered with null or empty, without an error, is returned as answered.
 */
export async function runContentQuery<T>(query: ContentQuery<T>): Promise<ContentResult<T>> {
  const { appApiToken, isMockFallbackOn } = getServerEnv();
  const headers: Record<string, string> =
    appApiToken === undefined
      ? ACCEPT_JSON
      : { ...ACCEPT_JSON, [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${appApiToken}` };
  const cache: ServerApiCache = {
    revalidateSeconds: query.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS,
  };

  const names = Object.keys(query.rootFields);
  let read = await readRootFields(query.document, names, headers, cache);
  if (read.failures.size === names.length && isMockFallbackOn) {
    read = await readRootFieldsOneByOne(query, names, headers, cache);
  }
  const filled = await fillFromMocks({
    operationName: query.operationName,
    rootFields: names,
    mockKeys: query.mockKeys ?? {},
    data: read.data,
    failures: read.failures,
  });
  return {
    data: filled.data as ContentResult<T>['data'],
    failedRootFields: filled.failedRootFields as ContentResult<T>['failedRootFields'],
  };
}

/**
 * Runs a page query as one signed-in visitor: their Bearer token only, never
 * cached, never mocked. Any failure throws `WebApiError`.
 */
export async function runVisitorQuery<T>(
  query: Pick<ContentQuery<T>, 'document'>,
  accessToken: string,
): Promise<T> {
  const operation = query.document.operationName;
  let answer: { status: number; body: unknown };
  try {
    answer = await postDocument(
      query.document,
      { ...ACCEPT_JSON, [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${accessToken}` },
      'no-store',
    );
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
    return unwrapGraphqlResponse<T>(answer.status, answer.body, operation);
  } catch (error) {
    if (error instanceof WebApiError) logApiError(error);
    throw error;
  }
}
