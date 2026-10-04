import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { contentKeys } from '@/features/content/queryKeys';
import { entryLabel } from '@/features/content/schema';
import type { ContentType, ContentTypeSummary, Document } from '@/features/content/types';

import {
  buildBreadcrumbs,
  contentDocumentIdOf,
  contentTypeSlugOf,
  type Crumb,
} from '../breadcrumbs';

/** The cached name of a content type: C2 first, then the C1 list. Reading never fetches. */
const cachedName = (client: QueryClient, slug: string): string | undefined =>
  client.getQueryData<ContentType>(contentKeys.type(slug))?.name ??
  client.getQueryData<ContentTypeSummary[]>(contentKeys.typeList())?.find((t) => t.slug === slug)
    ?.name;

/**
 * The cached label of an entry (D3 `detail`), from its content type's fields (C2). `undefined` until
 * both are cached. Reading never fetches.
 */
const cachedEntryLabel = (
  client: QueryClient,
  slug: string,
  documentId: string,
): string | undefined => {
  const type = client.getQueryData<ContentType>(contentKeys.type(slug));
  const doc = client.getQueryData<Document>(contentKeys.detail(slug, documentId));
  return type && doc ? entryLabel(type.fields, doc) : undefined;
};

/**
 * The breadcrumb trail of the current location (AC-31). On a content-type page the name, and on an
 * entry page the entry label, come only from the React Query cache, which it watches for changes but
 * never fills (AC-32, Phase 5 AC-39).
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
  const documentId = contentDocumentIdOf(pathname);
  const getEntryLabel = () =>
    slug && documentId ? cachedEntryLabel(client, slug, documentId) : undefined;
  const label = useSyncExternalStore(subscribe, getEntryLabel, getEntryLabel);

  return useMemo(
    () => buildBreadcrumbs(pathname, { contentTypeName, entryLabel: label }),
    [pathname, contentTypeName, label],
  );
}
