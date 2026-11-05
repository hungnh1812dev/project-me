import 'server-only';

import { API_ENDPOINTS } from '../../../configs/Api.endpoints';
import { BEARER_PREFIX } from '../../../configs/Auth.constants';
import {
  API_TIMEOUT_MS,
  AUTHORIZATION_HEADER,
  JSON_MEDIA_TYPE,
} from '../../../configs/Http.constants';
import { getServerEnv } from '../../../configs/Server.env';
import {
  GRAPHQL_FAILURE_CODES,
  GraphqlRequestError,
  unwrapGraphqlResponse,
  type GraphqlDocument,
} from '../../GraphqlResponse.rules';

// Anonymous unless the caller passes an access token (SPEC D14): no cookie, no client IP.
// The page therefore holds only what the `public` role may read, and the data
// cache can never mix actors.
const ANONYMOUS_HEADERS = {
  'content-type': JSON_MEDIA_TYPE,
  accept: JSON_MEDIA_TYPE,
} as const;

export interface GraphqlServerOptions {
  /** A signed-in visitor's access token: sent as Bearer and the data cache is skipped. */
  accessToken?: string;
}

/**
 * Runs a GraphQL query from the Next server as the public role. Cached for
 * WEB_REVALIDATE_SECONDS through the fetch data cache (`next.revalidate`; 0
 * turns the cache off). With an `accessToken` it runs as that visitor and is
 * never cached, so one actor's answer cannot reach another.
 */
export async function fetchGraphql<T>(
  document: GraphqlDocument,
  variables?: Record<string, unknown>,
  { accessToken }: GraphqlServerOptions = {},
): Promise<T> {
  const { apiInternalUrl, revalidateSeconds } = getServerEnv();
  let response: Response;
  try {
    response = await fetch(`${apiInternalUrl}${API_ENDPOINTS.GRAPHQL}`, {
      method: 'POST',
      headers:
        accessToken === undefined
          ? ANONYMOUS_HEADERS
          : { ...ANONYMOUS_HEADERS, [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${accessToken}` },
      body: JSON.stringify({ ...document, variables }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      ...(accessToken === undefined
        ? { next: { revalidate: revalidateSeconds } }
        : { cache: 'no-store' }),
    });
  } catch {
    throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NETWORK);
  }
  const body: unknown = await response.json().catch(() => undefined);
  return unwrapGraphqlResponse<T>(response.status, body);
}
