/** Lifecycle state of an account. Values are stored in accounts.status, so they stay byte-identical to the database enum. */
export const AccountStatus = {
  invited: 'invited',
  active: 'active',
  disabled: 'disabled',
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
