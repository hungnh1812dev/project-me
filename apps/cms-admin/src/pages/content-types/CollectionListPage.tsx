import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircleIcon, Columns3Icon, ListFilterIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Skeleton } from '@repo/ui/components/skeleton';
import { Field } from '@repo/ui/form/Field';
import { GatedButton } from '@repo/ui/form/GatedButton';
import { Pagination } from '@repo/ui/form/Pagination';
import { lastPage } from '@repo/ui/lib/pagination';

import type { Decision } from '@/features/auth/permissions/policies';
import { buildColumnCatalog, entryLabeler } from '@/features/content/columns';
import { useDocumentList } from '@/features/content/hooks/useCollectionQueries';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import { MAX_LIST_TEXT_LENGTH } from '@/features/content/listQuery';
import {
  PAGE_SIZES,
  parseListState,
  serializeListState,
  toListParams,
  type ListFilter,
  type ListState,
  type PageSize,
} from '@/features/content/listState';
import type { ContentType } from '@/features/content/types';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';

import { BulkActionBar } from './list/BulkActionBar';
import { ColumnChooserDialog } from './list/ColumnChooserDialog';
import { DocumentsTable } from './list/DocumentsTable';
import { FilterChips } from './list/FilterChips';
import { FilterPanel } from './list/FilterPanel';
import { RowActions } from './list/RowActions';
import { announcementOf } from './paths';

const IGNORED = 'Some filters in the link were ignored.';
const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 5;
const MESSAGE = 'flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm';

/** The same query string in either encoding (`[` or `%5B`). */
const canonical = (query: string) => new URLSearchParams(query).toString();

const CreateEntry: React.FC<{ slug: string; decision: Decision }> = ({ slug, decision }) => {
  const icon = <PlusIcon aria-hidden="true" />;
  if (!decision.allowed)
    return (
      <GatedButton decision={decision}>
        {icon}
        Create entry
      </GatedButton>
    );
  return (
    <Button render={<Link to={`/admin/content-types/${encodeURIComponent(slug)}/new`} />}>
      {icon}
      Create entry
    </Button>
  );
};
CreateEntry.displayName = 'CreateEntry';

/**
 * The collection list (SPEC "Collection list"). The URL holds the list state: it is parsed against
 * the content type's column catalog, and rewritten to its canonical form with `replace`; dropped
 * params are announced (D8). Search is debounced and resets the page. Pagination clamps a page past
 * the end. The selection is cleared whenever the list changes, and drives the bulk action bar.
 * States: skeleton, error with Retry, 403, empty and no match.
 */
const CollectionListPage: React.FC<{ type: ContentType }> = ({ type }) => {
  const catalog = useMemo(() => buildColumnCatalog(type), [type]);
  const access = useContentTypeAccess(type);
  const [searchParams, setSearchParams] = useSearchParams();
  const { message, announce } = useAnnouncer();
  const location = useLocation();

  // "Entry deleted.", sent by the detail page that deleted the entry.
  const opening = announcementOf(location.state);
  useEffect(() => {
    if (opening) announce(opening);
  }, [opening, announce]);

  // A row action's failure shows above the table; its success is announced.
  const [rowError, setRowError] = useState<string | null>(null);
  const onRowResult = useCallback(
    (text: string, error = false) => {
      setRowError(error ? text : null);
      if (!error) announce(text);
    },
    [announce],
  );

  const parsed = useMemo(() => parseListState(searchParams, catalog), [searchParams, catalog]);
  const { state } = parsed;
  const listKey = serializeListState(state);
  const params = useMemo(() => toListParams(state), [state]);
  const { data, error, isPending, isPlaceholderData, refetch } = useDocumentList(
    type,
    params,
    catalog,
  );

  // D8: write the canonical URL in place, and say so when params were dropped.
  useEffect(() => {
    if (canonical(listKey) !== searchParams.toString()) {
      setSearchParams(listKey, { replace: true });
    }
    if (parsed.dropped.length > 0) announce(IGNORED);
  }, [parsed, listKey, searchParams, setSearchParams, announce]);

  const update = useCallback(
    (patch: Partial<ListState>, replace = false) =>
      setSearchParams(serializeListState({ ...state, ...patch }), { replace }),
    [state, setSearchParams],
  );

  // A page past the end goes to the last page.
  const total = data?.total;
  useEffect(() => {
    if (total === undefined || isPlaceholderData) return;
    const last = lastPage(total, state.size);
    if (state.page > last) update({ page: last }, true);
  }, [total, isPlaceholderData, state.page, state.size, update]);

  // Search: the box follows `q`, and typing writes `q` (page 1) after the debounce.
  const [draft, setDraft] = useState(state.q);
  const [syncedQ, setSyncedQ] = useState(state.q);
  if (syncedQ !== state.q) {
    // `q` changed outside the box (Back, "Clear search and filters"): show it.
    setSyncedQ(state.q);
    if (draft.trim() !== state.q) setDraft(state.q);
  }
  useEffect(() => {
    if (draft.trim() === state.q) return;
    const timer = setTimeout(() => update({ q: draft.trim(), page: 1 }, true), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, state.q, update]);

  // The selection belongs to one list: any change of page, size, sort, search or filters clears it.
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
    key: listKey,
    ids: new Set(),
  });
  const selected = selection.key === listKey ? selection.ids : new Set<string>();
  const setSelected = useCallback(
    (ids: Set<string>) => setSelection({ key: listKey, ids }),
    [listKey],
  );
  const labelOf = useMemo(() => entryLabeler(type.listFields, catalog), [type.listFields, catalog]);
  const selectedEntries = (data?.items ?? [])
    .filter((item) => selected.has(item.documentId))
    .map((item) => ({ documentId: item.documentId, status: item.status, label: labelOf(item) }));

  // Filters: the panel edits a copy; Apply, Clear all and chip removal write the URL (page 1) and
  // put focus back on the Filters button.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const filterPanelId = useId();
  const filterCount = Object.keys(state.filters).length;
  const setFilters = (filters: Record<string, ListFilter>) => {
    update({ filters, page: 1 });
    setFiltersOpen(false);
    filtersButton.current?.focus();
  };
  const removeFilter = (field: string) => {
    const { [field]: _, ...rest } = state.filters;
    setFilters(rest);
  };

  // After a delete removes the focused control, focus goes to the entries region, or to the
  // heading once the list is empty (the region unmounts with the last row).
  const regionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deletedRef = useRef(false);
  const focusAfterDelete = useCallback(() => {
    deletedRef.current = true;
    return regionRef.current ?? headingRef.current;
  }, []);
  const emptied = data?.total === 0;
  useEffect(() => {
    if (!deletedRef.current || data === undefined) return;
    deletedRef.current = false;
    if (emptied && document.activeElement === document.body) headingRef.current?.focus();
  }, [data, emptied]);

  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsButton = useRef<HTMLButtonElement>(null);

  const filtered = state.q !== '' || Object.keys(state.filters).length > 0;
  const forbidden = !access.read.allowed || error?.status === 403;

  let body: React.ReactNode;
  if (forbidden) {
    body = (
      <p role="alert" className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />
        You don&apos;t have access to {type.name} entries.
      </p>
    );
  } else if (error) {
    body = (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4 text-sm"
      >
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />
          {error.message}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (isPending) {
    body = (
      <div
        role="group"
        aria-busy="true"
        aria-label="Loading entries"
        className="flex flex-col gap-2"
      >
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  } else if (data.total === 0 && filtered) {
    body = (
      <div className={MESSAGE}>
        <p className="text-muted-foreground">No entries match your search or filters.</p>
        <Button variant="outline" size="sm" onClick={() => update({ q: '', filters: {}, page: 1 })}>
          Clear search and filters
        </Button>
      </div>
    );
  } else if (data.total === 0) {
    body = (
      <div className={MESSAGE}>
        <p className="text-muted-foreground">No entries yet.</p>
        <CreateEntry slug={type.slug} decision={access.create} />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <DocumentsTable
          type={type}
          catalog={catalog}
          items={data.items}
          orderBy={state.orderBy}
          sortDir={state.sortDir}
          onSortChange={(orderBy, sortDir) => update({ orderBy, sortDir, page: 1 })}
          selected={selected}
          onSelectedChange={setSelected}
          busy={isPlaceholderData}
          regionRef={regionRef}
          renderActions={(item, label) => (
            <RowActions
              type={type}
              item={item}
              label={label}
              onResult={onRowResult}
              focusAfterDelete={focusAfterDelete}
            />
          )}
        />
        <Pagination
          page={state.page}
          size={state.size}
          total={data.total}
          sizes={PAGE_SIZES}
          onPageChange={(page) => update({ page })}
          // The select only offers PAGE_SIZES.
          onSizeChange={(size) => update({ size: size as PageSize, page: 1 })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight break-words"
        >
          {type.name}
        </h1>
        {!forbidden && <CreateEntry slug={type.slug} decision={access.create} />}
      </header>
      {!forbidden && (
        <div role="search" className="flex flex-wrap items-end gap-3">
          <Field label="Search entries" hideLabel className="w-full sm:max-w-xs">
            <Input
              type="search"
              value={draft}
              maxLength={MAX_LIST_TEXT_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search entries"
              autoComplete="off"
              leading={<SearchIcon aria-hidden="true" />}
            />
          </Field>
          <Button
            ref={filtersButton}
            variant="outline"
            aria-label={filterCount > 0 ? `Filters (${filterCount} active)` : undefined}
            aria-expanded={filtersOpen}
            aria-controls={filtersOpen ? filterPanelId : undefined}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <ListFilterIcon aria-hidden="true" />
            Filters
            {filterCount > 0 && <Badge aria-hidden="true">{filterCount}</Badge>}
          </Button>
          <GatedButton
            ref={columnsButton}
            variant="outline"
            decision={access.configureColumns}
            onClick={() => setColumnsOpen(true)}
          >
            <Columns3Icon aria-hidden="true" />
            Columns
          </GatedButton>
          <ColumnChooserDialog
            type={type}
            catalog={catalog}
            open={columnsOpen}
            onOpenChange={setColumnsOpen}
            finalFocus={columnsButton}
          />
        </div>
      )}
      {!forbidden && filtersOpen && (
        <div id={filterPanelId}>
          <FilterPanel
            key={JSON.stringify(state.filters)}
            catalog={catalog}
            filters={state.filters}
            onApply={setFilters}
          />
        </div>
      )}
      {!forbidden && (
        <FilterChips catalog={catalog} filters={state.filters} onRemove={removeFilter} />
      )}
      {rowError && (
        <p role="alert" className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />
          {rowError}
        </p>
      )}
      {!forbidden && (
        <BulkActionBar
          type={type}
          selected={selectedEntries}
          onSelectionChange={setSelected}
          onAnnounce={announce}
          focusAfterDelete={focusAfterDelete}
        />
      )}
      {body}
      <LiveRegion message={message} />
    </div>
  );
};
CollectionListPage.displayName = 'CollectionListPage';

export default CollectionListPage;
