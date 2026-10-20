/** D8 password rule, mirrored from cms-api so the form can explain it up front. */
export const PASSWORD_LENGTH = { MIN: 12, MAX: 128 } as const;

/** Emailed one-time codes (SPEC §6): 6 digits, valid for 5 minutes. */
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
