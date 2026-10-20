import { z } from 'zod';

import { OTP_CODE_LENGTH, PASSWORD_LENGTH } from '../../config/auth.constants';
import { COPY } from '../../config/copy.constants';
import type { PasswordError, PasswordErrorKind } from './password-error';
import type { FormAlertTone } from './FormAlert';

const OTP_CODE_PATTERN = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`);
const { validation } = COPY.password;

export const emailField = z
  .string()
  .trim()
  .min(1, validation.emailRequired)
  .pipe(z.email(validation.emailInvalid));

export const codeField = z
  .string()
  .trim()
  .regex(OTP_CODE_PATTERN, validation.codeInvalid);

/** Empty until the server asks for it (AUTH_TOTP_REQUIRED). */
export const optionalTotpField = z
  .string()
  .trim()
  .refine((value) => value === '' || OTP_CODE_PATTERN.test(value), {
    message: validation.totpInvalid,
  });

const newPasswordField = z
  .string()
  .min(PASSWORD_LENGTH.MIN, validation.passwordTooShort)
  .max(PASSWORD_LENGTH.MAX, validation.passwordTooLong);

/** New password + confirmation fields; pair with `passwordsMatch`. */
export const newPasswordShape = {
  newPassword: newPasswordField,
  confirmPassword: z.string(),
};

export function passwordsMatch(values: {
  newPassword: string;
  confirmPassword: string;
}): boolean {
  return values.newPassword === values.confirmPassword;
}

/** The mismatch error sits on the confirmation field. */
export const PASSWORDS_MATCH_ISSUE = {
  message: validation.passwordsDiffer,
  path: ['confirmPassword'],
};

export const ALERT_TONE_BY_ERROR: Record<PasswordErrorKind, FormAlertTone> = {
  'invalid-code': 'error',
  'weak-password': 'error',
  'totp-required': 'info',
  'rate-limited': 'warning',
  network: 'warning',
  unexpected: 'error',
};

export type { PasswordError };
