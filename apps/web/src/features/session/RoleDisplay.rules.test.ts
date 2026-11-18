import { isVisibleTo } from './RoleDisplay.rules';

const SIGNED_OUT = { status: 'anonymous', user: null } as const;
const UNKNOWN = { status: 'unknown', user: null } as const;
const READER = { status: 'authenticated', user: { role: 'reader' } } as const;

describe('isVisibleTo', () => {
  it.each([null, undefined, ''])('shows an item with no role (%s) to everyone', (requiresRole) => {
    expect(isVisibleTo(requiresRole, SIGNED_OUT)).toBe(true);
    expect(isVisibleTo(requiresRole, UNKNOWN)).toBe(true);
    expect(isVisibleTo(requiresRole, READER)).toBe(true);
  });

  it('hides a role item from a signed-out viewer', () => {
    expect(isVisibleTo('reader', SIGNED_OUT)).toBe(false);
  });

  it('hides a role item while the session is unknown', () => {
    expect(isVisibleTo('reader', UNKNOWN)).toBe(false);
  });

  it('shows a role item to a viewer with that role only', () => {
    expect(isVisibleTo('reader', READER)).toBe(true);
    expect(isVisibleTo('editor', READER)).toBe(false);
  });
});
