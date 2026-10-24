import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';
import {
  PERMISSION_STRING_SEPARATOR,
  READ_ACTION,
  BEARER_PREFIX,
} from '../../config/auth.constants';

export interface LoginCredentials {
  email: string;
  password: string;
}

/** The signed-in account as `/auth/me` returns it. */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  /** `subject:action` strings, e.g. `article:update` (T33a). */
  permissions: string[];
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
  /** Short-lived, kept in memory only, never stored. */
  tempToken: string;
  methods: string[];
}

export interface TwoFactorVerification {
  tempToken: string;
  code: string;
}

export type LoginOutcome =
  | { kind: 'signed-in'; accessToken: string }
  | ({ kind: 'two-factor-required' } & TwoFactorChallenge);

/**
 * The account can manage the CMS (admin or write access), so it signs in on
 * the admin console only. The web holds no session for it (D14).
 */
export class PrivilegedAccessError extends Error {
  constructor() {
    super('Privileged accounts sign in on the admin console.');
    this.name = 'PrivilegedAccessError';
  }
}

/**
 * Privileged = holds any permission other than `read` (write or management).
 * Fails closed: a missing or malformed list counts as privileged.
 */
export function isPrivileged(user: CurrentUser): boolean {
  if (!Array.isArray(user.permissions)) return true;
  return user.permissions.some(
    (permission) =>
      permission.split(PERMISSION_STRING_SEPARATOR).pop() !== READ_ACTION,
  );
}

/**
 * Auth calls, made from the browser to cms-api (D14). The Next server never
 * sees a credential, a token or the refresh cookie.
 */
export function createAuthApi(client: AxiosInstance) {
  return {
    async login(credentials: LoginCredentials): Promise<LoginOutcome> {
      const { data } = await client.post<
        AccessTokenResponse | TwoFactorRequiredResponse
      >(API_ENDPOINTS.AUTH.LOGIN, credentials);
      return 'requires2FA' in data
        ? {
            kind: 'two-factor-required',
            tempToken: data.tempToken,
            methods: data.methods,
          }
        : { kind: 'signed-in', accessToken: data.accessToken };
    },

    async verifyTwoFactor(input: TwoFactorVerification): Promise<string> {
      const { data } = await client.post<AccessTokenResponse>(
        API_ENDPOINTS.TWO_FACTOR.VERIFY,
        input,
      );
      return data.accessToken;
    },

    /** Emails the login code of an email-2FA account (202). */
    async sendLoginEmailCode(tempToken: string): Promise<void> {
      await client.post(API_ENDPOINTS.TWO_FACTOR.EMAIL_CHALLENGE, {
        tempToken,
      });
    },

    /** Rotates the refresh cookie and returns a new access token. */
    async refresh(): Promise<string> {
      const { data } = await client.post<AccessTokenResponse>(
        API_ENDPOINTS.AUTH.REFRESH,
      );
      return data.accessToken;
    },

    async logout(): Promise<void> {
      await client.post(API_ENDPOINTS.AUTH.LOGOUT);
    },

    async me(accessToken: string): Promise<CurrentUser> {
      const { data } = await client.get<CurrentUser>(API_ENDPOINTS.AUTH.ME, {
        headers: { Authorization: `${BEARER_PREFIX}${accessToken}` },
      });
      return data;
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
