import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { contentKeys } from '@/features/content/queryKeys';
import type { ContentType, ContentTypeSummary } from '@/features/content/types';

import { buildBreadcrumbs, contentTypeSlugOf, type Crumb } from '../breadcrumbs';

/** The cached name of a content type: C2 first, then the C1 list. Reading never fetches. */
const cachedName = (client: QueryClient, slug: string): string | undefined =>
  client.getQueryData<ContentType>(contentKeys.type(slug))?.name ??
  client.getQueryData<ContentTypeSummary[]>(contentKeys.typeList())?.find((t) => t.slug === slug)
    ?.name;

/**
 * The breadcrumb trail of the current location (AC-31). On a content-type page the name comes only
 * from the React Query cache, which it watches for changes but never fills (AC-32).
 */
export function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const client = useQueryClient();
  const slug = contentTypeSlugOf(pathname);

  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  const getName = () => (slug ? cachedName(client, slug) : undefined);
  const contentTypeName = useSyncExternalStore(subscribe, getName, getName);

  return useMemo(
    () => buildBreadcrumbs(pathname, { contentTypeName }),
    [pathname, contentTypeName],
  );
}
