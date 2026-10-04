import type { MeUser, Role } from '@/features/auth/types';
import type {
  AccessToken,
  AccessTokenSecret,
  MediaAsset,
  Permission,
  User,
} from '@/features/settings/types';

const STAMP = '2026-01-01T00:00:00.000Z';

export function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    documentId: 'role-editor',
    name: 'Editor',
    slug: 'editor',
    permissions: ['document:read', 'document:update'],
    level: 20,
    isDefault: false,
    createdAt: STAMP,
    updatedAt: STAMP,
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

/** A `User` (U1 item): `user-2`, John Smith, an editor. */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    documentId: 'user-2',
    email: 'john@example.com',
    name: 'John Smith',
    username: 'john',
    accountType: false,
    verified: true,
    roleId: 'role-editor',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

/** A `Permission` (P1 item): `role:read`. */
export function makePermission(overrides: Partial<Permission> = {}): Permission {
  return {
    documentId: 'perm-role-read',
    slug: 'role:read',
    name: 'Read roles',
    description: 'List roles.',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
    ...overrides,
  };
}

/** An `AccessToken` (T1 item, no secret): `tok-1`, "CI deploy", reads documents. */
export function makeAccessToken(overrides: Partial<AccessToken> = {}): AccessToken {
  return {
    documentId: 'tok-1',
    name: 'CI deploy',
    permissions: ['document:read'],
    expiresAt: '2026-02-01T00:00:00.000Z',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
    ...overrides,
  };
}

/** An `AccessTokenSecret` (T2/T3): `makeAccessToken` plus a plaintext `token`. */
export function makeAccessTokenSecret(
  overrides: Partial<AccessTokenSecret> = {},
): AccessTokenSecret {
  return { ...makeAccessToken(), token: 'cms_secret_1', ...overrides };
}

/** A `MediaAsset` (M1 item): a 640×480 PNG. */
export function makeMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    documentId: 'media-1',
    fileName: 'cat.png',
    mimeType: 'image/png',
    size: 20480,
    width: 640,
    height: 480,
    url: 'https://media.example.com/cat.png',
    thumbnailUrl: 'https://media.example.com/thumb/cat.png',
    publicId: 'cms/cat',
    hash: 'a'.repeat(64),
    uploadedBy: 'user-1',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}
