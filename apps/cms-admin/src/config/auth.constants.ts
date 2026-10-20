/** D8 password rule, mirrored from cms-api so the form can explain it up front. */
export const PASSWORD_LENGTH = { MIN: 12, MAX: 128 } as const;

/** Emailed one-time codes (SPEC §6): 6 digits, valid for 5 minutes. */
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;

/** Authenticator (TOTP) codes: 6 digits (D8). */
export const TOTP_CODE_LENGTH = 6;
/** Seconds between new authenticator codes. */
export const TOTP_PERIOD_SECONDS = 30;

/** The base32 setup key is shown in groups of this many characters. */
export const TOTP_SECRET_GROUP_SIZE = 4;

/** Rendered size of the setup QR code, in CSS pixels. */
export const TOTP_QR_SIZE_PX = 176;

/** 2FA methods cms-api offers (`two_fa_method`). */
export const TWO_FACTOR_METHODS = ['totp', 'email'] as const;
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number];

/**
 * Cross-tab refresh (T11a): Web Locks name that lets one tab refresh at a
 * time, and the BroadcastChannel on which it shares the new access token.
 */
export const REFRESH_LOCK_NAME = 'abyss-admin:refresh';
export const SESSION_CHANNEL_NAME = 'abyss-admin:session';
