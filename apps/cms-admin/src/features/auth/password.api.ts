import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';

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
        { skipAuthRefresh: true },
      );
    },

    reset: async (input: ResetPasswordInput): Promise<void> => {
      await client.post(API_ENDPOINTS.PASSWORD.RESET, input, {
        skipAuthRefresh: true,
      });
    },

    setPassword: async (input: SetPasswordInput): Promise<void> => {
      await client.post(API_ENDPOINTS.PASSWORD.SET, input, {
        skipAuthRefresh: true,
      });
    },
  };
}

export type PasswordApi = ReturnType<typeof createPasswordApi>;
