import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { userLoaded } from '../store/AuthSlice';
import { useCan, useRoleLevel } from './useCan';

describe('useCan', () => {
  it('returns the policy decision for the signed-in user', () => {
    const user = makeMeUser({
      documentId: 'me',
      role: makeRole({ level: 50, permissions: ['user:manager'] }),
    });

    const { result } = renderHookWithProviders(
      () => useCan('delete', 'user', { targetUserId: 'other', targetLevel: 20 }),
      { auth: { status: 'authenticated', user } },
    );

    expect(result.current).toEqual({ allowed: true, reason: null });
  });

  it('denies with a reason when signed out', () => {
    const { result } = renderHookWithProviders(() => useCan('read', 'media'));

    expect(result.current).toEqual({
      allowed: false,
      reason: 'Requires the "media:read" permission.',
    });
  });

  it('keeps the same decision object while nothing changes', () => {
    const { result, rerender } = renderHookWithProviders(() => useCan('read', 'media'));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('re-renders when the user permissions change', () => {
    const { result, store } = renderHookWithProviders(() => useCan('upload', 'media'), {
      auth: { status: 'authenticated', user: makeMeUser() },
    });
    expect(result.current.allowed).toBe(false);

    act(() => {
      store.dispatch(
        userLoaded(makeMeUser({ role: makeRole({ permissions: ['media:manager'] }) })),
      );
    });

    expect(result.current).toEqual({ allowed: true, reason: null });
  });
});

describe('useRoleLevel', () => {
  it('returns the role level, 0 when signed out', () => {
    const signedIn = renderHookWithProviders(() => useRoleLevel(), {
      auth: { user: makeMeUser({ role: makeRole({ level: 50 }) }) },
    });
    const signedOut = renderHookWithProviders(() => useRoleLevel());

    expect(signedIn.result.current).toBe(50);
    expect(signedOut.result.current).toBe(0);
  });

  it('re-renders when the role changes', () => {
    const { result, store } = renderHookWithProviders(() => useRoleLevel(), {
      auth: { user: makeMeUser({ role: makeRole({ level: 20 }) }) },
    });

    act(() => {
      store.dispatch(userLoaded(makeMeUser({ role: makeRole({ level: 100 }) })));
    });

    expect(result.current).toBe(100);
  });
});
