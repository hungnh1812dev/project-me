/** Second-factor method an account can use. Values are stored in the database, so they stay byte-identical to the database enum. */
export const TwoFaMethod = {
  totp: 'totp',
  email: 'email',
} as const;

export type TwoFaMethod = (typeof TwoFaMethod)[keyof typeof TwoFaMethod];
