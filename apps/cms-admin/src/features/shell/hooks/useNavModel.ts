import { useMemo } from 'react';

import { useAppSelector } from '@/app/hooks';
import { selectActor } from '@/features/auth/store/selectors';
import { useContentTypes } from '@/features/content/hooks/useContentTypes';

import { buildNavModel, type NavModel } from '../navigation';

/**
 * What the Content section shows (AC-23, AC-24): nothing (`hidden`: no `content_type:read`, or C1
 * answered 403), skeleton rows, the error with Retry, or the links.
 */
export type ContentStatus = 'hidden' | 'loading' | 'error' | 'ready';

export interface NavModelState extends NavModel {
  contentStatus: ContentStatus;
  /** Refetches C1 (the "Retry" button). */
  retryContent: () => void;
}

/**
 * The side menu for the signed-in user. It recomputes when the user (and so the permissions)
 * changes or the C1 cache changes, so the menu follows both without a reload (AC-30).
 */
export function useNavModel(): NavModelState {
  const actor = useAppSelector(selectActor);
  const { data, error, isError, isFetching, refetch, decision } = useContentTypes();

  let contentStatus: ContentStatus;
  if (!decision.allowed) contentStatus = 'hidden';
  else if (data) contentStatus = 'ready';
  else if (isError && error.status === 403) contentStatus = 'hidden';
  else if (isError && !isFetching) contentStatus = 'error';
  else contentStatus = 'loading';

  const types = contentStatus === 'ready' ? (data ?? null) : null;
  const model = useMemo(() => buildNavModel(actor, types), [actor, types]);

  return {
    ...model,
    contentStatus,
    retryContent: () => void refetch(),
  };
}
