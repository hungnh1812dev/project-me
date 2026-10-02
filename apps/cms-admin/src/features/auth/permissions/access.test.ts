import { describe, expect, it } from 'vitest';

import { checkAccess } from './access';
import type { Actor } from './policies';

const actor = (permissions: string[], level = 20, userId: string | null = 'me'): Actor => ({
  userId,
  level,
  permissions,
});

describe('checkAccess', () => {
  it('allows when nothing is required', () => {
    expect(checkAccess(actor([]), {})).toEqual({ allowed: true, reason: null });
  });

  it('checks permission slugs', () => {
    expect(checkAccess(actor(['user:read']), { permission: 'user:read' }).allowed).toBe(true);
    expect(checkAccess(actor([]), { permission: 'user:read' })).toEqual({
      allowed: false,
      reason: 'Requires the "user:read" permission.',
    });
  });

  it('honours mode and contentTypeSlug for permissions', () => {
    expect(
      checkAccess(actor(['role:read']), { permission: ['user:read', 'role:read'], mode: 'any' })
        .allowed,
    ).toBe(true);
    expect(
      checkAccess(actor(['document:read']), {
        permission: 'document:read',
        contentTypeSlug: 'article',
      }).allowed,
    ).toBe(true);
  });

  it('checks the minimum role level', () => {
    expect(checkAccess(actor([], 50), { minLevel: 50 }).allowed).toBe(true);
    expect(checkAccess(actor([], 20), { minLevel: 50 })).toEqual({
      allowed: false,
      reason: 'Requires role level 50 or higher.',
    });
  });

  it('checks an ABAC policy', () => {
    expect(
      checkAccess(actor(['media:manager']), { can: { I: 'upload', a: 'media' } }).allowed,
    ).toBe(true);
    expect(checkAccess(actor([]), { can: { I: 'upload', a: 'media' } })).toEqual({
      allowed: false,
      reason: 'Requires the "media:manager" permission.',
    });
  });

  it('passes ABAC attributes to the policy', () => {
    const decision = checkAccess(actor(['user:manager'], 50), {
      can: { I: 'delete', a: 'user', with: { targetUserId: 'other', targetLevel: 50 } },
    });
    expect(decision.allowed).toBe(false);
  });

  it('requires every given check, reporting the first failure', () => {
    const decision = checkAccess(actor(['user:read'], 20), {
      permission: 'user:read',
      minLevel: 50,
      can: { I: 'read', a: 'role' },
    });
    expect(decision).toEqual({ allowed: false, reason: 'Requires role level 50 or higher.' });
  });
});
