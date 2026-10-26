import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/Api.endpoints';

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
  totpCode?: string;
}

export interface SetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

/**
 * Password endpoints for signed-out users (SPEC §9). No Bearer token
 * and no refresh-and-retry: a 401 here is the answer.
 */
export function createPasswordApi(client: AxiosInstance) {
  return {
    /** Always 202, whether or not the email has an account. */
    requestCode: async (email: string): Promise<void> => {
      await client.post(
        API_ENDPOINTS.PASSWORD.REQUEST_OTP,
        { email },
        { shouldSkipAuthRefresh: true },
      );
    },

    reset: async (input: ResetPasswordInput): Promise<void> => {
      await client.post(API_ENDPOINTS.PASSWORD.RESET, input, {
        shouldSkipAuthRefresh: true,
      });
    },

    setPassword: async (input: SetPasswordInput): Promise<void> => {
      await client.post(API_ENDPOINTS.PASSWORD.SET, input, {
        shouldSkipAuthRefresh: true,
      });
    },
  };
}

export type PasswordApi = ReturnType<typeof createPasswordApi>;
