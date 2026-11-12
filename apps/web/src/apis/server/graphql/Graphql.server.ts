import 'server-only';

import {
  GRAPHQL_FAILURE_CODES,
  GraphqlRequestError,
  readGraphqlRootFields,
  unwrapGraphqlResponse,
  type GraphqlDocument,
} from '@/apis/GraphqlResponse.rules';
import { fillFromMocks, type MockFallbackReason } from '@/apis/server/restful/MockFallback.server';
import {
  SERVER_API_FAILURE_CODES,
  serverApi,
  ServerApiError,
  type ServerApiCache,
} from '@/apis/server/restful/ServerApi.client';
import { API_ENDPOINTS } from '@/configs/Api.endpoints';
import { BEARER_PREFIX } from '@/configs/Auth.constants';
import {
  ACCEPT_HEADER,
  AUTHORIZATION_HEADER,
  DEFAULT_REVALIDATE_SECONDS,
  HTTP_STATUS,
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
  /** Data cache lifetime of this query; defaults to `DEFAULT_REVALIDATE_SECONDS`. */
  revalidateSeconds?: number;
  document: GraphqlDocument;
}

export interface ContentQueryDefinition<T> {
  operationName: string;
  rootFields: Readonly<Record<keyof T & string, string>>;
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

interface RootFieldsRead {
  data: Readonly<Record<string, unknown>> | null;
  reason: MockFallbackReason;
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
  headers: Record<string, string>,
  cache: ServerApiCache,
): Promise<RootFieldsRead> {
  try {
    const { status, body } = await postDocument(document, headers, cache);
    const read = readGraphqlRootFields(status, body);
    if (read.data !== null) {
      return { data: read.data, reason: read.errorCode === undefined ? 'empty' : 'graphql-error' };
    }
    if (status !== HTTP_STATUS.OK) return { data: null, reason: 'http' };
    return { data: null, reason: read.errorCode === undefined ? 'empty' : 'graphql-error' };
  } catch (error) {
    const isTimeout =
      error instanceof ServerApiError && error.code === SERVER_API_FAILURE_CODES.TIMEOUT;
    return { data: null, reason: isTimeout ? 'timeout' : 'network' };
  }
}

/** Asks each root field alone so one the API cannot serve yet does not hide the others (dev and smoke only). */
async function readRootFieldsOneByOne(
  query: ContentQuery<never>,
  headers: Record<string, string>,
  cache: ServerApiCache,
): Promise<RootFieldsRead> {
  const names = Object.keys(query.rootFields);
  const reads = await Promise.all(
    names.map((name) =>
      readRootFields(documentOf(query.operationName, query.rootFields, [name]), headers, cache),
    ),
  );
  const data: Record<string, unknown> = {};
  names.forEach((name, index) => {
    data[name] = reads[index]?.data?.[name];
  });
  return { data, reason: reads.find((read) => read.data === null)?.reason ?? 'empty' };
}

/**
 * Runs a page query as the site (the API token when set, else anonymous),
 * cached for every visitor. Never throws for a content failure: a root field
 * the API and the mocks cannot give is `null` and listed in `failedRootFields`.
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

  let read = await readRootFields(query.document, headers, cache);
  if (read.data === null && isMockFallbackOn) {
    read = await readRootFieldsOneByOne(query, headers, cache);
  }
  const filled = fillFromMocks({
    operationName: query.operationName,
    rootFields: Object.keys(query.rootFields),
    data: read.data,
    reason: read.reason,
  });
  return {
    data: filled.data as ContentResult<T>['data'],
    failedRootFields: filled.failedRootFields as ContentResult<T>['failedRootFields'],
  };
}

/**
 * Runs a page query as one signed-in visitor: their Bearer token only, never
 * cached, never mocked. Any failure throws `GraphqlRequestError`.
 */
export async function runVisitorQuery<T>(
  query: Pick<ContentQuery<T>, 'document'>,
  accessToken: string,
): Promise<T> {
  try {
    const { status, body } = await postDocument(
      query.document,
      { ...ACCEPT_JSON, [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${accessToken}` },
      'no-store',
    );
    return unwrapGraphqlResponse<T>(status, body);
  } catch (error) {
    if (error instanceof ServerApiError)
      throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NETWORK);
    throw error;
  }
}
