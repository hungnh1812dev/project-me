import type { AxiosInstance } from 'axios';

import type { TwoFactorMethod } from '../../config/auth.constants';
import { API_ENDPOINTS } from '../../config/endpoints';

/** `POST /auth/2fa/totp/setup`: the QR is drawn here from the URI. */
export interface TotpSetup {
  otpauthUri: string;
  /** Base32 key for manual entry. */
  secret: string;
}

export interface EnableTwoFactorInput {
  method: TwoFactorMethod;
  password: string;
  code: string;
}

export interface DisableTwoFactorInput {
  password: string;
  code: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Security settings of the signed-in account. Bearer token through the
 * interceptor; re-auth failures come back as 403, so they never look like an
 * expired session.
 */
export function createSecurityApi(client: AxiosInstance) {
  const { TWO_FACTOR, PASSWORD } = API_ENDPOINTS;
  return {
    setupTotp: async (): Promise<TotpSetup> => {
      const { data } = await client.post<TotpSetup>(TWO_FACTOR.TOTP_SETUP);
      return data;
    },

    enableTwoFactor: async (input: EnableTwoFactorInput): Promise<void> => {
      await client.post(TWO_FACTOR.ENABLE, input);
    },

    disableTwoFactor: async (input: DisableTwoFactorInput): Promise<void> => {
      await client.post(TWO_FACTOR.DISABLE, input);
    },

    /** Emails a code for turning email 2FA on or off (202). */
    sendEmailCode: async (): Promise<void> => {
      await client.post(TWO_FACTOR.EMAIL_SEND_CODE);
    },

    /** 204, and every session ends, this one included. */
    changePassword: async (input: ChangePasswordInput): Promise<void> => {
      await client.post(PASSWORD.CHANGE, input);
    },
  };
}

export type SecurityApi = ReturnType<typeof createSecurityApi>;
