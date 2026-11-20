import { API_ENDPOINTS } from '@configs/Api.endpoints';
import type { AxiosInstance } from 'axios';

export interface RequestCodeInput {
  email: string;
  turnstileToken: string;
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
  totpCode?: string;
  turnstileToken: string;
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
    requestCode: async (input: RequestCodeInput): Promise<void> => {
      await client.post(API_ENDPOINTS.PASSWORD.REQUEST_OTP, input, {
        shouldSkipAuthRefresh: true,
      });
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
