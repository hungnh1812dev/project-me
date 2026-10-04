import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import { parsePermissionConflict } from './conflict';

const conflict = (body: unknown, message = 'Permission is in use') =>
  new ApiError({ status: 409, message, body });

describe('parsePermissionConflict (AC-27)', () => {
  it.each([
    [
      2,
      1,
      'This permission is still used by 2 roles and 1 access token. Remove it from them first.',
    ],
    [
      1,
      3,
      'This permission is still used by 1 role and 3 access tokens. Remove it from them first.',
    ],
    [2, 0, 'This permission is still used by 2 roles. Remove it from them first.'],
    [0, 1, 'This permission is still used by 1 access token. Remove it from them first.'],
    [1, 0, 'This permission is still used by 1 role. Remove it from them first.'],
  ])('describes %i roles and %i tokens', (roleCount, accessTokenCount, text) => {
    expect(
      parsePermissionConflict(conflict({ message: 'x', roleCount, accessTokenCount })),
    ).toEqual({ roleCount, accessTokenCount, text });
  });

  it.each([
    ['no body', undefined],
    ['missing counts', { message: 'Permission is in use' }],
    ['one count missing', { roleCount: 2 }],
    ['non-numeric counts', { roleCount: '2', accessTokenCount: 1 }],
    ['negative counts', { roleCount: -1, accessTokenCount: 1 }],
    ['both counts zero', { roleCount: 0, accessTokenCount: 0 }],
  ])('falls back to the server message with %s', (_, body) => {
    expect(parsePermissionConflict(conflict(body))).toEqual({
      roleCount: null,
      accessTokenCount: null,
      text: 'Permission is in use',
    });
  });

  it('uses a default text when the server message is empty', () => {
    expect(parsePermissionConflict(conflict(null, ''))?.text).toBe(
      'This permission is still in use. Remove it from its roles and access tokens first.',
    );
  });

  it('returns null for anything but a 409', () => {
    expect(parsePermissionConflict(new ApiError({ status: 404, message: 'Not found' }))).toBeNull();
    expect(parsePermissionConflict(new Error('boom'))).toBeNull();
    expect(parsePermissionConflict(null)).toBeNull();
  });
});
