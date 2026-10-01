import type { MeUser, Role } from '@/features/auth/types';

export function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    documentId: 'role-editor',
    name: 'Editor',
    slug: 'editor',
    permissions: ['document:read', 'document:update'],
    level: 20,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
    ...overrides,
  };
}

export function makeMeUser(overrides: Partial<MeUser> = {}): MeUser {
  return {
    documentId: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    username: 'janedoe',
    accountType: false,
    verified: true,
    roleId: 'role-editor',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    role: makeRole(),
    ...overrides,
  };
}
