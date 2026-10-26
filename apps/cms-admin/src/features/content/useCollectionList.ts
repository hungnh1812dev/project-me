import type { SheetSort } from '@abyss/form-commons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useClampedPage } from '../../components/useClampedPage';
import { listValueFieldsOf } from './Collection.columns';
import { useContentApi } from './ContentApi.context';
import { CONTENT_QUERY_KEYS, useDocumentListQuery } from './Content.queries';
import { COLLECTION_KIND, LIST_UPDATED_KEY } from './Content.constants';

const DEFAULT_SORT: SheetSort = { key: LIST_UPDATED_KEY, direction: 'desc' };

/** The content type, one page of its drafts, and the page / sort / selection state around them. */
export function useCollectionList(slug: string) {
  const api = useContentApi();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SheetSort>(DEFAULT_SORT);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const type = useQuery({
    queryKey: CONTENT_QUERY_KEYS.type(slug),
    queryFn: () => api.getContentType(slug),
  });
  const draftAndPublish = type.data?.draftAndPublish ?? false;
  const isCollection = type.data?.kind === COLLECTION_KIND;
  const sortParam = `${sort.direction === 'desc' ? '-' : ''}${sort.key}`;
  const documents = useDocumentListQuery(
    slug,
    page,
    sortParam,
    draftAndPublish,
    type.isSuccess && isCollection,
  );

  const valueFields = useMemo(
    () => listValueFieldsOf(type.data?.fields ?? []),
    [type.data],
  );
  const rows = documents.data?.data ?? [];
  const meta = documents.data?.meta;
  useClampedPage(page, setPage, meta);

  const clearSelection = () => setSelected(new Set());

  return {
    type,
    draftAndPublish,
    isCollection,
    documents,
    valueFields,
    rows,
    meta,
    page,
    sort,
    selected,
    selectedRows: rows.filter((row) => selected.has(row.documentId)),
    setSelected,
    clearSelection,
    changePage: (next: number) => {
      clearSelection();
      setPage(next);
    },
    changeSort: (next: SheetSort) => {
      clearSelection();
      setPage(1);
      setSort(next);
    },
    showFirstPageByUpdated: () => {
      setPage(1);
      setSort(DEFAULT_SORT);
    },
  };
}
