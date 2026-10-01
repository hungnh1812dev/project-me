import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { userLoaded } from '@/features/auth/store/AuthSlice';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import type { ContentTypeRef } from '../types';
import { useContentTypeAccess } from './useContentTypeAccess';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

describe('useContentTypeAccess', () => {
  it('returns the contentTypeAccess decisions for the signed-in actor', () => {
    const { result } = renderHookWithProviders(
      () => useContentTypeAccess({ slug: 'blog', draftToPublish: true }),
      signedIn(['document:update:blog', 'content_type:manager']),
    );

    expect(result.current.update).toEqual({ allowed: true, reason: null });
    expect(result.current.read).toEqual({
      allowed: false,
      reason: 'Requires the "document:read:blog" permission.',
    });
    expect(result.current.configureColumns).toEqual({ allowed: true, reason: null });
  });

  it('keeps the same object for a new ref with equal slug and draftToPublish', () => {
    const { result, rerender } = renderHookWithProviders(
      () => useContentTypeAccess({ slug: 'blog', draftToPublish: true }),
      signedIn(['document:read']),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('recomputes when the slug or draftToPublish changes', () => {
    let ref: ContentTypeRef = { slug: 'blog', draftToPublish: true };
    const { result, rerender } = renderHookWithProviders(
      () => useContentTypeAccess(ref),
      signedIn(['document:publish:blog']),
    );
    expect(result.current.publish.allowed).toBe(true);

    ref = { slug: 'news', draftToPublish: true };
    rerender();
    expect(result.current.publish).toEqual({
      allowed: false,
      reason: 'Requires the "document:publish:news" permission.',
    });

    ref = { slug: 'blog', draftToPublish: false };
    rerender();
    expect(result.current.publish).toEqual({
      allowed: false,
      reason: 'This content type does not use draft and publish.',
    });
  });

  it('recomputes after userLoaded changes the permissions', () => {
    const { result, store } = renderHookWithProviders(
      () => useContentTypeAccess({ slug: 'blog', draftToPublish: true }),
      signedIn([]),
    );
    expect(result.current.delete.allowed).toBe(false);

    act(() => {
      store.dispatch(userLoaded(makeMeUser({ role: makeRole({ permissions: ['document:delete'] }) })));
    });

    expect(result.current.delete).toEqual({ allowed: true, reason: null });
    expect(result.current.bulkDelete).toEqual({ allowed: true, reason: null });
  });
});
