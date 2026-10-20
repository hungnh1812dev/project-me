/** Success notices the sign-in page shows after a password flow. */
export type LoginNotice =
  'password-reset' | 'password-set' | 'password-changed';

/** Router state passed to /login after a reset, an invite or a change. */
export interface LoginNoticeState {
  notice: LoginNotice;
}

export function loginNoticeOf(state: unknown): LoginNotice | undefined {
  const notice = (state as Partial<LoginNoticeState> | null)?.notice;
  return notice === 'password-reset' ||
    notice === 'password-set' ||
    notice === 'password-changed'
    ? notice
    : undefined;
}
