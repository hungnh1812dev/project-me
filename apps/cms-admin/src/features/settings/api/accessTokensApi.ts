import { cmsApi } from '@/core/api/CmsApi';

import type { AccessToken, AccessTokenSecret, ExpiresIn } from '../types';

// Pure request functions for the access-token endpoints (SPEC T1–T4). Every id in a path is
// encoded. Errors reject as the `ApiError` the `cmsApi` interceptor built. Only T2 and T3 return a
// secret, and it goes straight back to the caller: nothing here stores it (AC-33).

const tokenPath = (id: string) => `/access-tokens/${encodeURIComponent(id)}`;

/** T2's body. */
export interface CreateAccessTokenInput {
  name: string;
  permissions: string[];
  expiresIn: ExpiresIn;
}

/** T1 `GET /access-tokens`: every token. A stray `token` field is dropped, never kept (AC-28). */
export async function getAccessTokens(signal?: AbortSignal): Promise<AccessToken[]> {
  const { data } = await cmsApi.get<(AccessToken & { token?: unknown })[]>('/access-tokens', {
    signal,
  });
  return data.map(({ token: _secret, ...token }) => token);
}

/** T2 `POST /access-tokens`: creates a token and returns its secret once (400 unknown slug). */
export async function createAccessToken(input: CreateAccessTokenInput): Promise<AccessTokenSecret> {
  const { data } = await cmsApi.post<AccessTokenSecret>('/access-tokens', input);
  return data;
}

/** T3 `POST /access-tokens/:id/revoke` with `{}` (AC-31): rotates the secret and returns it once. */
export async function revokeAccessToken(id: string): Promise<AccessTokenSecret> {
  const { data } = await cmsApi.post<AccessTokenSecret>(`${tokenPath(id)}/revoke`, {});
  return data;
}

/** T4 `DELETE /access-tokens/:id`: deletes it (204), 404 when it is gone. */
export async function deleteAccessToken(id: string): Promise<void> {
  await cmsApi.delete(tokenPath(id));
}
