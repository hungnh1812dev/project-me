import {
  API_ERROR_CODES,
  API_ERROR_SOURCES,
  WebApiError,
  type ApiErrorCode,
} from '@/apis/WebApi.errors';
import { HTTP_STATUS } from '@/configs/Http.constants';

const OPERATION_NAME_PATTERN = /\b(?:query|mutation)\s+([A-Za-z_]\w*)/;
const UNNAMED_OPERATION = 'anonymous';

/** The operation name of a query string, for logs and errors; `anonymous` when it has none. */
export function operationNameOf(query: string): string {
  return OPERATION_NAME_PATTERN.exec(query)?.[1] ?? UNNAMED_OPERATION;
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
