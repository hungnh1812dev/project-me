import { normalizeListParams } from './listQuery';
import type { ListParams } from './types';

const ROOT = 'content';

/**
 * The React Query key factory for content types and documents. Every key starts with `['content']`,
 * and every document key for a slug starts with `documents(slug)`, so invalidating by prefix reaches
 * exactly one content type. Build content keys only through this factory.
 */
export const contentKeys = {
  /** `['content']`: everything this feature caches. */
  all: [ROOT] as const,
  /** `['content', 'types']`: the content-type list and every content-type detail. */
  types: () => [ROOT, 'types'] as const,
  /** `['content', 'types', 'list']`: C1. */
  typeList: () => [ROOT, 'types', 'list'] as const,
  /** `['content', 'types', 'detail', slug]`: C2. */
  type: (slug: string) => [ROOT, 'types', 'detail', slug] as const,
  /** `['content', 'documents', slug]`: the prefix of every document key for one content type. */
  documents: (slug: string) => [ROOT, 'documents', slug] as const,
  /** `['content', 'documents', slug, 'single']`: S1. */
  single: (slug: string) => [ROOT, 'documents', slug, 'single'] as const,
  /** `['content', 'documents', slug, 'list']`: the prefix of every list page for one content type. */
  lists: (slug: string) => [ROOT, 'documents', slug, 'list'] as const,
  /** `['content', 'documents', slug, 'list', normalizedParams]`: one D1 page. */
  list: (slug: string, params: ListParams) =>
    [ROOT, 'documents', slug, 'list', normalizeListParams(params)] as const,
  /** `['content', 'documents', slug, 'detail', documentId]`: D3. */
  detail: (slug: string, documentId: string) =>
    [ROOT, 'documents', slug, 'detail', documentId] as const,
};
