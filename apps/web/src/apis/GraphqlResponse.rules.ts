import {
  API_ERROR_CODES,
  API_ERROR_SOURCES,
  WebApiError,
  type ApiErrorCode,
} from '@/apis/WebApi.errors';
import { HTTP_STATUS } from '@/configs/Http.constants';

/** One GraphQL operation: its text and the name sent with it. */
export interface GraphqlDocument {
  query: string;
  operationName: string;
}

/** True when the API refused the call because the token is missing or no longer accepted. */
export function isUnauthenticatedGraphqlError(error: unknown): boolean {
  return (
    error instanceof WebApiError &&
    error.source === API_ERROR_SOURCES.CMS_API_GRAPHQL &&
    (error.statusCode === HTTP_STATUS.UNAUTHORIZED ||
      error.errorCode === API_ERROR_CODES.GRAPHQL.UNAUTHENTICATED)
  );
}

interface GraphqlResponseBody {
  data?: unknown;
  errors?: unknown;
}

function firstErrorCodeOf(errors: unknown): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const code = (errors[0] as { extensions?: { code?: unknown } } | null)?.extensions?.code;
  return typeof code === 'string' ? code : API_ERROR_CODES.GRAPHQL.UNKNOWN;
}

function graphqlErrorOf(
  errorCode: ApiErrorCode,
  status: number,
  operation: string,
  upstreamErrorCode?: string,
): WebApiError {
  return new WebApiError({
    source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
    errorCode,
    statusCode: status,
    operation,
    upstreamErrorCode,
  });
}

/**
 * Why an answer is not a clean read, or `undefined` when it is one. An API error code outside the
 * closed list is `UNKNOWN_ERROR`, with the API's code in `upstreamErrorCode`.
 */
export function graphqlFailureOf(
  status: number,
  errorCode: string | undefined,
  hasData: boolean,
  operation: string,
): WebApiError | undefined {
  if (errorCode !== undefined) {
    const isUnauthenticated = errorCode === API_ERROR_CODES.GRAPHQL.UNAUTHENTICATED;
    return graphqlErrorOf(
      isUnauthenticated ? API_ERROR_CODES.GRAPHQL.UNAUTHENTICATED : API_ERROR_CODES.GRAPHQL.UNKNOWN,
      status,
      operation,
      errorCode,
    );
  }
  if (status !== HTTP_STATUS.OK) {
    return graphqlErrorOf(API_ERROR_CODES.GRAPHQL.HTTP, status, operation);
  }
  return hasData ? undefined : graphqlErrorOf(API_ERROR_CODES.GRAPHQL.NO_DATA, status, operation);
}

/** The `data` of a clean 200 answer; anything else throws one `WebApiError`. */
export function unwrapGraphqlResponse<T>(status: number, body: unknown, operation: string): T {
  const { data, errors } = (
    typeof body === 'object' && body !== null ? body : {}
  ) as GraphqlResponseBody;
  const failure = graphqlFailureOf(
    status,
    firstErrorCodeOf(errors),
    data !== undefined && data !== null,
    operation,
  );
  if (failure !== undefined) throw failure;
  return data as T;
}

export interface GraphqlRootFields {
  /** The answer's `data` object, or `null` when the call gave none (non-200, no object). */
  data: Readonly<Record<string, unknown>> | null;
  /** The first error code of the answer, when it has errors. */
  errorCode: string | undefined;
  status: number;
  /**
   * The root fields the answer failed: `'all'` when it has no `data` or an error without a root
   * field `path`, else the root fields named by the `path[0]` of its errors. A null or empty
   * root field without an error is not a failure.
   */
  failedRootFields: ReadonlySet<string> | 'all';
}

function failedRootFieldsOf(
  errors: unknown,
  hasData: boolean,
): GraphqlRootFields['failedRootFields'] {
  if (!hasData) return 'all';
  if (!Array.isArray(errors)) return new Set();
  const failed = new Set<string>();
  for (const entry of errors) {
    const root = (entry as { path?: unknown } | null)?.path;
    const rootField = Array.isArray(root) ? (root[0] as unknown) : undefined;
    if (typeof rootField !== 'string') return 'all';
    failed.add(rootField);
  }
  return failed;
}

/**
 * Reads an answer root field by root field and never throws: a partial answer
 * keeps the fields that came back, so the caller can fill only the failed ones.
 */
export function readGraphqlRootFields(status: number, body: unknown): GraphqlRootFields {
  const { data, errors } = (
    typeof body === 'object' && body !== null ? body : {}
  ) as GraphqlResponseBody;
  const isDataObject = typeof data === 'object' && data !== null && !Array.isArray(data);
  const readableData =
    status === HTTP_STATUS.OK && isDataObject ? (data as Record<string, unknown>) : null;
  return {
    data: readableData,
    errorCode: firstErrorCodeOf(errors),
    status,
    failedRootFields: failedRootFieldsOf(errors, readableData !== null),
  };
}
