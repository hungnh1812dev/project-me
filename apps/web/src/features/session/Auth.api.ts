import type { AxiosInstance } from 'axios';

import { apiFailureOf } from '@/apis/client/ApiFailure.errors';
import { BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { BFF_ERROR_CODES } from '@/configs/Auth.constants';

/** The signed-in account as the BFF returns it: no token, no permission list. */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

/** Carried by every sign-in step; the Turnstile token is supplied by the dialog. */
export interface HumanCheckInput {
  humanCheckToken?: string;
}

export interface LoginCredentials extends HumanCheckInput {
  email: string;
  password: string;
}

/** A password-checked login waiting for its second step; the BFF keeps the temp token. */
export interface TwoFactorChallenge {
  methods: string[];
}

export interface TwoFactorVerification extends HumanCheckInput {
  code: string;
}

export type LoginOutcome =
  { kind: 'signed-in'; user: CurrentUser } | ({ kind: 'two-factor-required' } & TwoFactorChallenge);

type LoginResponse =
  { status: 'signed-in'; user: CurrentUser } | { status: 'two-factor-required'; methods: string[] };

/**
 * The account can manage the CMS (admin or write access), so it signs in on
 * the admin console only. The BFF refuses it and the web holds no session (D14).
 */
export class PrivilegedAccessError extends Error {
  constructor() {
    super('Privileged accounts sign in on the admin console.');
    this.name = 'PrivilegedAccessError';
  }
}

async function rethrowPrivilegedRefusal<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (cause) {
    const failure = apiFailureOf(cause);
    if (failure.kind === 'http' && failure.errorCode === BFF_ERROR_CODES.PRIVILEGED_ACCOUNT) {
      throw new PrivilegedAccessError();
    }
    throw cause;
  }
}

/**
 * Auth calls, made from the browser to the BFF of this site (ADR 0018). No
 * token or refresh cookie is readable here: the BFF keeps them in a sealed
 * HttpOnly cookie and sets it on its own responses.
 */
export function createAuthApi(client: AxiosInstance) {
  return {
    /** The signed-in visitor, or null. */
    async readSession(): Promise<CurrentUser | null> {
      const { data } = await client.get<{ user: CurrentUser | null }>(BFF_ENDPOINTS.SESSION);
      return data.user;
    },

    async login(credentials: LoginCredentials): Promise<LoginOutcome> {
      const { data } = await rethrowPrivilegedRefusal(
        client.post<LoginResponse>(BFF_ENDPOINTS.LOGIN, credentials),
      );
      return data.status === 'signed-in'
        ? { kind: 'signed-in', user: data.user }
        : { kind: 'two-factor-required', methods: data.methods };
    },

    async verifyTwoFactor(input: TwoFactorVerification): Promise<CurrentUser> {
      const { data } = await rethrowPrivilegedRefusal(
        client.post<{ user: CurrentUser }>(BFF_ENDPOINTS.VERIFY_TWO_FACTOR, input),
      );
      return data.user;
    },

    /** Emails the login code of an email-2FA account (202). The BFF requires a JSON body. */
    async sendLoginEmailCode(input: HumanCheckInput = {}): Promise<void> {
      await client.post(BFF_ENDPOINTS.EMAIL_CODE, input);
    },

    /** Clears the session at the BFF; it requires a JSON body. */
    async logout(): Promise<void> {
      await client.post(BFF_ENDPOINTS.LOGOUT, {});
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
