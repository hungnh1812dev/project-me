const LOGIN_NOTICES = [
  'password-reset',
  'password-set',
  'password-changed',
  'owner-created',
  'setup-complete',
] as const;

/** Notices the sign-in page shows after a password or setup flow. */
export type LoginNotice = (typeof LOGIN_NOTICES)[number];

/** Router state passed to /login after a reset, an invite, a change or the setup. */
export interface LoginNoticeState {
  notice?: LoginNotice;
  /** Prefills the email field (owner setup). */
  email?: string;
}

export function loginNoticeOf(state: unknown): LoginNotice | undefined {
  const notice = (state as LoginNoticeState | null)?.notice;
  return LOGIN_NOTICES.find((known) => known === notice);
}

export function loginEmailOf(state: unknown): string {
  const email = (state as LoginNoticeState | null)?.email;
  return typeof email === 'string' ? email : '';
}
