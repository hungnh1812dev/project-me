import { z } from 'zod';

import {
  EMAIL_MAX_LENGTH,
  OTP,
  PASSWORD_MAX_LENGTH,
} from './domain/Identity.constants';

/**
 * Bodies of the password endpoints (SPEC §9). Shape checks only. The
 * new password is any string here; its length rule (D8) is checked apart so
 * it can answer AUTH_WEAK_PASSWORD. Codes of the wrong shape fall through to
 * the OTP check and fail like a wrong code.
 */
const email = z.string().trim().min(1).max(EMAIL_MAX_LENGTH);
/** Generous bound: anything longer can't be a code, and stays cheap to hash. */
const code = z
  .string()
  .trim()
  .max(OTP.DIGITS * 2);

export const requestOtpSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  email,
  code,
  newPassword: z.string(),
  totpCode: z
    .string()
    .trim()
    .max(OTP.DIGITS * 2)
    .optional(),
});

export const setPasswordSchema = z.object({
  email,
  code,
  newPassword: z.string(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string(),
});

export type RequestOtpRequest = z.infer<typeof requestOtpSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type SetPasswordRequest = z.infer<typeof setPasswordSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
