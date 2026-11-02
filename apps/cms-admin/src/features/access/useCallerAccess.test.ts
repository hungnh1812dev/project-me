import type { Role } from './Access.api';
import { callerAccessOf } from './useCallerAccess';

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
    expect(callerAccessOf('owner', undefined).can('roles', 'delete')).toBe(true);
  });
  it('derives actions from the own role rows', () => {
    const access = callerAccessOf('admin', [admin]);
    expect(access.can('accounts', 'read')).toBe(true);
    expect(access.can('accounts', 'create')).toBe(false);
    expect(access.can('roles', 'read')).toBe(false);
  });
  it('allows nothing when roles are unknown', () => {
    expect(callerAccessOf('admin', undefined).can('accounts', 'read')).toBe(false);
  });
});

describe('callerAccessOf canWriteEveryField', () => {
  const roleWith = (
    ...rows: { subject: string; action?: 'update' | 'read'; fields: string[] | null }[]
  ): Role => ({
    ...admin,
    permissions: rows.map((row) => ({
      subject: row.subject,
      action: row.action ?? 'update',
      readableFields: null,
      writableFields: row.fields,
      conditions: null,
    })),
  });
  const check = (role: Role, names: string[]) =>
    callerAccessOf('admin', [role]).canWriteEveryField('article', names);

  it('is true for the owner', () => {
    expect(callerAccessOf('owner', undefined).canWriteEveryField('article', ['a'])).toBe(true);
  });
  it('is true when writableFields is null', () => {
    expect(check(roleWith({ subject: 'article', fields: null }), ['a', 'b'])).toBe(true);
  });
  it('is true when the list names every field', () => {
    expect(check(roleWith({ subject: 'article', fields: ['a', 'b', 'c'] }), ['a', 'b'])).toBe(true);
  });
  it('is false when the list misses a field', () => {
    expect(check(roleWith({ subject: 'article', fields: ['a'] }), ['a', 'b'])).toBe(false);
  });
  it('is false when the list holds only nested paths', () => {
    expect(check(roleWith({ subject: 'article', fields: ['a.title'] }), ['a'])).toBe(false);
  });
  it('uses a wildcard row', () => {
    expect(check(roleWith({ subject: '*', fields: null }), ['a'])).toBe(true);
    expect(check(roleWith({ subject: '*', fields: ['a'] }), ['a'])).toBe(true);
  });
  it('combines the type row and the wildcard row', () => {
    const role = roleWith({ subject: 'article', fields: ['a'] }, { subject: '*', fields: ['b'] });
    expect(check(role, ['a', 'b'])).toBe(true);
  });
  it('is false without an update row', () => {
    expect(check(roleWith({ subject: 'article', action: 'read', fields: null }), ['a'])).toBe(
      false,
    );
    expect(check(roleWith({ subject: 'other', fields: null }), ['a'])).toBe(false);
  });
});
