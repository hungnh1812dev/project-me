import { HTTP_STATUS } from '@/configs/Http.constants';

/** One GraphQL operation: its text and the name sent with it. */
export interface GraphqlDocument {
  query: string;
  operationName: string;
}

export const GRAPHQL_FAILURE_CODES = {
  HTTP: 'HTTP_ERROR',
  NETWORK: 'NETWORK_ERROR',
  NO_DATA: 'NO_DATA',
  UNKNOWN: 'UNKNOWN_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
} as const;

/**
 * A failed GraphQL call. It carries the first error code and never the server
 * message or the variables, which may hold what the visitor typed.
 */
export class GraphqlRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(`GraphQL request failed: ${code}`);
    this.name = 'GraphqlRequestError';
  }
}

/** True when the API refused the call because the token is missing or no longer accepted. */
export function isUnauthenticatedGraphqlError(error: unknown): boolean {
  return (
    error instanceof GraphqlRequestError &&
    (error.status === HTTP_STATUS.UNAUTHORIZED ||
      error.code === GRAPHQL_FAILURE_CODES.UNAUTHENTICATED)
  );
}

interface GraphqlResponseBody {
  data?: unknown;
  errors?: unknown;
}

function firstErrorCodeOf(errors: unknown): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const code = (errors[0] as { extensions?: { code?: unknown } } | null)?.extensions?.code;
  return typeof code === 'string' ? code : GRAPHQL_FAILURE_CODES.UNKNOWN;
}

/** The `data` of a clean 200 answer; anything else throws one typed error. */
export function unwrapGraphqlResponse<T>(status: number, body: unknown): T {
  const { data, errors } = (
    typeof body === 'object' && body !== null ? body : {}
  ) as GraphqlResponseBody;
  const errorCode = firstErrorCodeOf(errors);
  if (errorCode !== undefined) throw new GraphqlRequestError(errorCode, status);
  if (status !== HTTP_STATUS.OK) {
    throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.HTTP, status);
  }
  if (data === undefined || data === null) {
    throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NO_DATA, status);
  }
  return data as T;
}

export interface GraphqlRootFields {
  /** The answer's `data` object, or `null` when the call gave none (non-200, no object). */
  data: Readonly<Record<string, unknown>> | null;
  /** The first error code of the answer, when it has errors. */
  errorCode: string | undefined;
  status: number;
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
  return {
    data: status === HTTP_STATUS.OK && isDataObject ? (data as Record<string, unknown>) : null,
    errorCode: firstErrorCodeOf(errors),
    status,
  };
}
