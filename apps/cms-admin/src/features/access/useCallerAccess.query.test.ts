import type { Role } from './Access.api';
import { callerAccessOf } from './useCallerAccess.query';

const admin: Role = {
  id: 'r1',
  slug: 'admin',
  name: 'Admin',
  rank: 80,
  isSystem: true,
  accountCount: 1,
  manageable: true,
  permissions: [
    {
      subject: 'accounts',
      action: 'read',
      readableFields: null,
      writableFields: null,
      conditions: null,
    },
  ],
};

describe('callerAccessOf', () => {
  it('lets the owner do everything', () => {
    expect(callerAccessOf('owner', undefined).can('roles', 'delete')).toBe(
      true,
    );
  });
  it('derives actions from the own role rows', () => {
    const access = callerAccessOf('admin', [admin]);
    expect(access.can('accounts', 'read')).toBe(true);
    expect(access.can('accounts', 'create')).toBe(false);
    expect(access.can('roles', 'read')).toBe(false);
  });
  it('allows nothing when roles are unknown', () => {
    expect(callerAccessOf('admin', undefined).can('accounts', 'read')).toBe(
      false,
    );
  });
});
