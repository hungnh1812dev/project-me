import { ERROR_CODES } from '../common/constants/Error.constants';
import {
  ACCESS_ERROR_CODES,
  PERMISSION_ACTIONS,
  SYSTEM_SUBJECT_ACTIONS,
} from '../modules/access';
import { RICHTEXT_ALLOWED_URL_SCHEMES } from '../modules/content-engine';
import {
  AUTH_ERROR_CODES,
  OTP,
  OWNER_DISPLAY_NAME_MAX_LENGTH,
  OWNER_SETUP_ERROR_CODES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REFRESH_COOKIE,
  SETUP_TOKEN_MAX_LENGTH,
  TOTP,
} from '../modules/identity';
import {
  REVIEWER_ERROR_CODES,
  REVIEWER_INPUT_LIMITS,
} from '../modules/reviewer';

/**
 * The cms-api constants that the admin, the web, the kit and the e2e suite
 * mirror. Built from `*.constants.ts` exports only: no env value and
 * no secret can reach the file. Add a key here when a client mirrors a new
 * constant.
 */
export function buildPublicConstants() {
  return {
    password: {
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    },
    ownerDisplayNameMaxLength: OWNER_DISPLAY_NAME_MAX_LENGTH,
    setupTokenMaxLength: SETUP_TOKEN_MAX_LENGTH,
    otp: { digits: OTP.DIGITS, ttlSeconds: OTP.TTL_SECONDS },
    totp: { digits: TOTP.DIGITS, periodSeconds: TOTP.PERIOD_SECONDS },
    refreshCookieName: REFRESH_COOKIE.NAME,
    reviewerInputLimits: { ...REVIEWER_INPUT_LIMITS },
    errorCodes: {
      common: { ...ERROR_CODES },
      auth: { ...AUTH_ERROR_CODES },
      ownerSetup: { ...OWNER_SETUP_ERROR_CODES },
      reviewer: { ...REVIEWER_ERROR_CODES },
      access: { ...ACCESS_ERROR_CODES },
    },
    permissionActions: [...PERMISSION_ACTIONS],
    systemSubjects: Object.fromEntries(
      Object.entries(SYSTEM_SUBJECT_ACTIONS).map(([subject, actions]) => [
        subject,
        [...actions],
      ]),
    ),
    richtextUrlSchemes: [...RICHTEXT_ALLOWED_URL_SCHEMES],
  };
}

export type PublicConstants = ReturnType<typeof buildPublicConstants>;

/** The committed file's text: stable key order, two-space indent, final newline. */
export function renderPublicConstants(): string {
  return `${JSON.stringify(buildPublicConstants(), null, 2)}\n`;
}
