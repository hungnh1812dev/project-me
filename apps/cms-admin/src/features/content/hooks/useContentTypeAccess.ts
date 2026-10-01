import { useMemo } from 'react';

import { useAppSelector } from '@/app/hooks';
import { selectActor } from '@/features/auth/store/selectors';

import { contentTypeAccess, type ContentTypeAccess } from '../access';
import type { ContentTypeRef } from '../types';

/**
 * `contentTypeAccess` for the signed-in actor on `ref`. Memoized on the actor, `ref.slug` and
 * `ref.draftToPublish`, so a new `ref` object with equal values keeps the same result, and a
 * permission change (`userLoaded`) recomputes it.
 */
export function useContentTypeAccess(ref: ContentTypeRef): ContentTypeAccess {
  const actor = useAppSelector(selectActor);
  const { slug, draftToPublish } = ref;
  return useMemo(
    () => contentTypeAccess(actor, { slug, draftToPublish }),
    [actor, slug, draftToPublish],
  );
}
