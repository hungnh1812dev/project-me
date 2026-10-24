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

/** A password-checked login waiting for its second step. */
export interface TwoFactorChallenge {
  /** Short-lived (300 s), kept in memory only, never stored. */
  tempToken: string;
  methods: string[];
}

export interface TwoFactorVerification {
  tempToken: string;
  code: string;
}

/** What a login attempt led to. */
export type LoginOutcome =
  | { kind: 'signed-in'; accessToken: string }
  | ({ kind: 'two-factor-required' } & TwoFactorChallenge);

/**
 * Auth endpoints (SPEC §9). None of them goes through the refresh-and-retry
 * interceptor (`shouldSkipAuthRefresh`): a 401 here is the answer, not an expired
 * token.
 */
export function createAuthApi(client: AxiosInstance) {
  return {
    async login(credentials: LoginCredentials): Promise<LoginOutcome> {
      const { data } = await client.post<
        AccessTokenResponse | TwoFactorRequiredResponse
      >(API_ENDPOINTS.AUTH.LOGIN, credentials, { shouldSkipAuthRefresh: true });
      return 'requires2FA' in data
        ? {
            kind: 'two-factor-required',
            tempToken: data.tempToken,
            methods: data.methods,
          }
        : { kind: 'signed-in', accessToken: data.accessToken };
    },

    /** Second login step: a code for the temp token's account. */
    async verifyTwoFactor(input: TwoFactorVerification): Promise<string> {
      const { data } = await client.post<AccessTokenResponse>(
        API_ENDPOINTS.TWO_FACTOR.VERIFY,
        input,
        { shouldSkipAuthRefresh: true },
      );
      return data.accessToken;
    },

    /** Emails the login code of an email-2FA account (202). */
    async sendLoginEmailCode(tempToken: string): Promise<void> {
      await client.post(
        API_ENDPOINTS.TWO_FACTOR.EMAIL_CHALLENGE,
        { tempToken },
        { shouldSkipAuthRefresh: true },
      );
    },

    /** Rotates the refresh cookie and returns a new access token. */
    async refresh(): Promise<string> {
      const { data } = await client.post<AccessTokenResponse>(
        API_ENDPOINTS.AUTH.REFRESH,
        undefined,
        { shouldSkipAuthRefresh: true },
      );
      return data.accessToken;
    },

    async logout(): Promise<void> {
      await client.post(API_ENDPOINTS.AUTH.LOGOUT, undefined, {
        shouldSkipAuthRefresh: true,
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
