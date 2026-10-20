import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';
import type { CurrentUser } from './auth.slice';

export interface LoginCredentials {
  email: string;
  password: string;
}

interface AccessTokenResponse {
  accessToken: string;
}

interface TwoFactorRequiredResponse {
  requires2FA: true;
  tempToken: string;
  methods: string[];
}

/** What a login attempt led to. The 2FA temp token is deliberately dropped (T13). */
export type LoginOutcome =
  { kind: 'signed-in'; accessToken: string } | { kind: 'two-factor-required' };

/**
 * Auth endpoints (SPEC §9). None of them goes through the refresh-and-retry
 * interceptor (`skipAuthRefresh`): a 401 here is the answer, not an expired
 * token.
 */
export function createAuthApi(client: AxiosInstance) {
  return {
    async login(credentials: LoginCredentials): Promise<LoginOutcome> {
      const { data } = await client.post<
        AccessTokenResponse | TwoFactorRequiredResponse
      >(API_ENDPOINTS.AUTH.LOGIN, credentials, { skipAuthRefresh: true });
      return 'requires2FA' in data
        ? { kind: 'two-factor-required' }
        : { kind: 'signed-in', accessToken: data.accessToken };
    },

    /** Rotates the refresh cookie and returns a new access token. */
    async refresh(): Promise<string> {
      const { data } = await client.post<AccessTokenResponse>(
        API_ENDPOINTS.AUTH.REFRESH,
        undefined,
        { skipAuthRefresh: true },
      );
      return data.accessToken;
    },

    async logout(): Promise<void> {
      await client.post(API_ENDPOINTS.AUTH.LOGOUT, undefined, {
        skipAuthRefresh: true,
      });
    },

    /** Uses the Bearer token; may refresh once through the interceptor. */
    async me(): Promise<CurrentUser> {
      const { data } = await client.get<CurrentUser>(API_ENDPOINTS.AUTH.ME);
      return data;
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
