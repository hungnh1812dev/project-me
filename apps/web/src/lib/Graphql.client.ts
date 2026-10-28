import { API_ENDPOINTS } from '../config/Api.endpoints';
import { BEARER_PREFIX } from '../config/Auth.constants';
import { apiClient } from './Api.client';
import {
  GRAPHQL_FAILURE_CODES,
  GraphqlRequestError,
  unwrapGraphqlResponse,
  type GraphqlDocument,
} from './GraphqlResponse.rules';

/**
 * Runs a GraphQL query from the browser as the signed-in visitor. The caller
 * passes the access token it got from `useWebSession`.
 */
export async function requestGraphql<T>(
  document: GraphqlDocument,
  variables: Record<string, unknown> | undefined,
  accessToken: string,
): Promise<T> {
  let response: { status: number; data: unknown };
  try {
    response = await apiClient.post<unknown>(
      API_ENDPOINTS.GRAPHQL,
      { ...document, variables },
      {
        headers: { Authorization: `${BEARER_PREFIX}${accessToken}` },
        // GraphQL answers errors with a body worth reading, so status codes
        // are judged by unwrapGraphqlResponse, not by Axios.
        validateStatus: () => true,
      },
    );
  } catch {
    throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NETWORK);
  }
  return unwrapGraphqlResponse<T>(response.status, response.data);
}
