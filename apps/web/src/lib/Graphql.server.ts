import 'server-only';

import { API_ENDPOINTS } from '../config/Api.endpoints';
import { API_TIMEOUT_MS, JSON_MEDIA_TYPE } from '../config/Http.constants';
import { getServerEnv } from '../config/Server.env';
import {
  GRAPHQL_FAILURE_CODES,
  GraphqlRequestError,
  unwrapGraphqlResponse,
  type GraphqlDocument,
} from './GraphqlResponse.rules';

// Anonymous on purpose (SPEC D14): no Authorization, no cookie, no client IP.
// The page therefore holds only what the `public` role may read, and the data
// cache can never mix actors.
const ANONYMOUS_HEADERS = {
  'content-type': JSON_MEDIA_TYPE,
  accept: JSON_MEDIA_TYPE,
} as const;

/**
 * Runs a GraphQL query from the Next server as the public role. Cached for
 * WEB_REVALIDATE_SECONDS through the fetch data cache (`next.revalidate`; 0
 * turns the cache off).
 */
export async function fetchGraphql<T>(
  document: GraphqlDocument,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { apiInternalUrl, revalidateSeconds } = getServerEnv();
  let response: Response;
  try {
    response = await fetch(`${apiInternalUrl}${API_ENDPOINTS.GRAPHQL}`, {
      method: 'POST',
      headers: ANONYMOUS_HEADERS,
      body: JSON.stringify({ ...document, variables }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      next: { revalidate: revalidateSeconds },
    });
  } catch {
    throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NETWORK);
  }
  const body: unknown = await response.json().catch(() => undefined);
  return unwrapGraphqlResponse<T>(response.status, body);
}
