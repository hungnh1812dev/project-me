/** What a one-time code may be used for. Values are stored in the database, so they stay byte-identical to the database enum. */
export const OtpPurpose = {
  INVITE_SET_PASSWORD: 'INVITE_SET_PASSWORD',
  RESET_PASSWORD: 'RESET_PASSWORD',
  LOGIN_2FA_EMAIL: 'LOGIN_2FA_EMAIL',
} as const;

export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];
