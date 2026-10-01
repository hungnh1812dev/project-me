import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { userLoaded } from '../store/AuthSlice';
import { usePermission, usePermissionDecision } from './usePermission';

const signedInWith = (permissions: string[]) => ({
  auth: {
    status: 'authenticated' as const,
    user: makeMeUser({ role: makeRole({ permissions }) }),
  },
});

describe('usePermission', () => {
  it('is true when the single slug is granted', () => {
    const { result } = renderHookWithProviders(
      () => usePermission('media:read'),
      signedInWith(['media:manager']),
    );

    expect(result.current).toBe(true);
  });

  it('requires every slug by default', () => {
    const { result } = renderHookWithProviders(
      () => usePermission(['media:read', 'role:read']),
      signedInWith(['media:read']),
    );

    expect(result.current).toBe(false);
  });

  it('needs one slug in any mode', () => {
    const { result } = renderHookWithProviders(
      () => usePermission(['media:read', 'role:read'], { mode: 'any' }),
      signedInWith(['role:read']),
    );

    expect(result.current).toBe(true);
  });

  it('scopes document slugs to the content type', () => {
    const { result } = renderHookWithProviders(
      () => usePermission('document:update', { contentTypeSlug: 'blog' }),
      signedInWith(['document:update:blog']),
    );

    expect(result.current).toBe(true);
  });

  it('is false when signed out', () => {
    const { result } = renderHookWithProviders(() => usePermission('media:read'));

    expect(result.current).toBe(false);
  });

  it('re-renders when the user permissions change', () => {
    const { result, store } = renderHookWithProviders(
      () => usePermission('media:read'),
      signedInWith([]),
    );
    expect(result.current).toBe(false);

    act(() => {
      store.dispatch(userLoaded(makeMeUser({ role: makeRole({ permissions: ['media:read'] }) })));
    });

    expect(result.current).toBe(true);
  });
});

describe('usePermissionDecision', () => {
  it('returns the reason for a denial', () => {
    const { result } = renderHookWithProviders(
      () => usePermissionDecision(['media:read', 'role:read']),
      signedInWith(['media:read']),
    );

    expect(result.current).toEqual({
      allowed: false,
      reason: 'Requires the "role:read" permission.',
    });
  });
});
