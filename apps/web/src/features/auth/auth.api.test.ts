import { type CurrentUser, isPrivileged } from './auth.api';
import { TEST_USER } from './test-utils';

function userWith(permissions: string[]): CurrentUser {
  return { ...TEST_USER, permissions };
}

describe('isPrivileged', () => {
  it('is false for a reader: only read permissions', () => {
    expect(isPrivileged(userWith(['article:read', 'profile:read']))).toBe(
      false,
    );
  });

  it('is false for an account with no permissions', () => {
    expect(isPrivileged(userWith([]))).toBe(false);
  });

  it.each(['article:update', 'article:publish', 'roles:create'])(
    'is true when %s is held (editor, admin)',
    (permission) => {
      expect(isPrivileged(userWith(['article:read', permission]))).toBe(true);
    },
  );

  it('fails closed when the list is missing', () => {
    const user = { ...TEST_USER } as Partial<CurrentUser>;
    delete user.permissions;
    expect(isPrivileged(user as CurrentUser)).toBe(true);
  });
});
