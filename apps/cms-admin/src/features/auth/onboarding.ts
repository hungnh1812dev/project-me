import type { ApiErrorData } from '@/core/api/axiosBaseQuery';

/** Rules for the register, verify-OTP and reset-password forms (SPEC AC-32…AC-34). */
export const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;

const PASSWORD_TOO_SHORT = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
const TOO_MANY = 'Too many attempts. Please try again later.';
const NO_ACCOUNT = 'No account was found for this email.';
const ALREADY_VERIFIED = 'This email is already verified.';

export interface RegisterForm {
  name: string;
  username: string;
  email: string;
  password: string;
}

export type RegisterErrors = Partial<Record<keyof RegisterForm, string>>;

/** Client-side checks before `POST /auth/register`. An empty object means the form is valid. */
export function validateRegister({
  name,
  username,
  email,
  password,
}: RegisterForm): RegisterErrors {
  const errors: RegisterErrors = {};
  if (name.trim() === '') errors.name = 'Name is required.';
  if (!USERNAME_PATTERN.test(username)) {
    errors.username = 'Username must be 3–32 letters, digits, dots, dashes or underscores.';
  }
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = PASSWORD_TOO_SHORT;
  return errors;
}

export function validateEmail(email: string): string | null {
  return EMAIL_PATTERN.test(email) ? null : 'Enter a valid email.';
}

export function validateOtp(otp: string): string | null {
  return OTP_PATTERN.test(otp) ? null : 'Enter the 6-digit code.';
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT;
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

type ErrorLike = Pick<ApiErrorData, 'status' | 'message'>;

function messageFor(map: Record<number, string>, error: ErrorLike): string {
  return map[error.status] ?? error.message;
}

export function registerErrorMessage(error: ErrorLike): string {
  return messageFor({ 409: 'Email or username is already in use.', 429: TOO_MANY }, error);
}

export function verifyOtpErrorMessage(error: ErrorLike): string {
  return messageFor(
    {
      400: 'The code is invalid or has expired.',
      404: NO_ACCOUNT,
      409: ALREADY_VERIFIED,
      429: TOO_MANY,
    },
    error,
  );
}

export function resendOtpErrorMessage(error: ErrorLike): string {
  return messageFor({ 404: NO_ACCOUNT, 409: ALREADY_VERIFIED, 429: TOO_MANY }, error);
}

/** The email that `/register` passes to `/verify-otp` in router state, or `''`. */
export function emailFromState(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('email' in state)) return '';
  return typeof state.email === 'string' ? state.email : '';
}

const LOGIN_NOTICES = {
  verified: 'Your email is verified. Please sign in.',
  passwordReset: 'Your password has been reset. Please sign in.',
} as const;

export type LoginNotice = keyof typeof LOGIN_NOTICES;

/** Router state for `/login` that shows a one-line notice above the form. */
export function loginNoticeState(notice: LoginNotice): { notice: LoginNotice } {
  return { notice };
}

export function loginNoticeMessage(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('notice' in state)) return null;
  const { notice } = state;
  if (typeof notice !== 'string' || !Object.hasOwn(LOGIN_NOTICES, notice)) return null;
  return LOGIN_NOTICES[notice as LoginNotice];
}
