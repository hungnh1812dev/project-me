import { z } from 'zod';

import { TWO_FACTOR_TEMP_TOKEN_MAX_LENGTH } from '../../common/constants/auth.constants';
import { PASSWORD_MAX_LENGTH, TOTP } from './identity.constants';

/**
 * Bodies of the 2FA endpoints (SPEC §9, T13 Q10). Shape checks only; codes
 * of the wrong shape fail like a wrong code.
 */
const code = z
  .string()
  .trim()
  .max(TOTP.DIGITS * 2);
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const tempToken = z.string().min(1).max(TWO_FACTOR_TEMP_TOKEN_MAX_LENGTH);

export const enableTwoFactorSchema = z.object({
  method: z.enum(['totp', 'email']),
  password,
  code,
});

export const disableTwoFactorSchema = z.object({ password, code });

export const verifyTwoFactorSchema = z.object({ tempToken, code });

export const emailChallengeSchema = z.object({ tempToken });

export type EnableTwoFactorRequest = z.infer<typeof enableTwoFactorSchema>;
export type DisableTwoFactorRequest = z.infer<typeof disableTwoFactorSchema>;
export type VerifyTwoFactorRequest = z.infer<typeof verifyTwoFactorSchema>;
