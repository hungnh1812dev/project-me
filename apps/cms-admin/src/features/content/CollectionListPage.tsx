import {
  BulkActionBar,
  type BulkAction as BarAction,
  Button,
  type SheetColumn,
  type SheetSort,
  SortableSheet,
  TablePagination,
  FormAlert,
  type FormAlertTone,
} from '@abyss/form-commons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { useClampedPage } from '../../components/use-clamped-page';
import { useRestoreFocus } from '../../components/use-restore-focus';
import { formatDateTime } from '../../lib/date-format';

import {
  BULK_ACTION,
  type BulkAction,
  COLLECTION_KIND,
  LIST_MAX_VALUE_COLUMNS,
  LIST_UPDATED_KEY,
} from '../../config/content.constants';
import {
  CONTENT_WILDCARD_SUBJECT,
  type PermissionAction,
} from '../../config/access.constants';
import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES } from '../../config/http.constants';
import { contentEditPath, contentNewPath } from '../../config/routes';
import { isForbidden, useCallerAccess } from '../access';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { BulkCreateDialog } from './BulkCreateDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { failedItems, itemReason, toBulkFailure } from './bulk';
import { useContentApi } from './content-api-context';
import { isMissing } from './content-error';
import {
  formatListValue,
  isSortableListType,
  listAlignmentOf,
} from './field-registry';
import { CONTENT_QUERY_KEYS, useDocumentListQuery } from './content-queries';
import type { BulkItem, DocumentListItem } from './content.api';

const copy = COPY.content;
const list = copy.collection;
const bulkCopy = copy.bulk;

/** What the page says after a bulk action or an import. */
type Banner =
  | { kind: 'imported'; count: number }
  | { kind: 'error'; message: string }
  | {
      kind: 'result';
      action: BulkAction;
      total: number;
      done: number;
      failures: { name: string; reason: string }[];
    };

function bannerTone(banner: Banner): FormAlertTone {
  if (banner.kind === 'imported') return 'success';
  if (banner.kind === 'error') return 'error';
  if (banner.failures.length === 0) return 'success';
  return banner.done === 0 ? 'error' : 'warning';
}

function toItem(action: BulkAction, row: DocumentListItem): BulkItem {
  return action === BULK_ACTION.PUBLISH
    ? { documentId: row.documentId, expectedVersion: row.version }
    : { documentId: row.documentId };
}

/**
 * `/content/:slug` (T35): the draft list of a collection with sortable
 * columns, paging, bulk publish / unpublish / delete and JSON import.
 */
export function CollectionListPage() {
  const { slug = '' } = useParams();
  const api = useContentApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SheetSort>({
    key: LIST_UPDATED_KEY,
    direction: 'desc',
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importing, setImporting] = useState(false);
  // Controlled dialogs have no trigger, so Radix cannot restore focus itself.
  const { rememberOpener, restoreFocus } = useRestoreFocus();

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

  const can = (action: PermissionAction) =>
    caller.ready &&
    (caller.can(slug, action) || caller.can(CONTENT_WILDCARD_SUBJECT, action));
  const canCreate = can('create');
  const canPublish = draftAndPublish && can('publish');
  const canUnpublish = draftAndPublish && can('unpublish');
  const canDelete = can('delete');
  const selectable = canPublish || canUnpublish || canDelete;

  const valueFields = useMemo(
    () =>
      (type.data?.fields ?? [])
        .filter(
          (field) =>
            field.rootScalar &&
            !field.system &&
            !field.component &&
            isSortableListType(field.type),
        )
        .slice(0, LIST_MAX_VALUE_COLUMNS),
    [type.data],
  );

  const rows = documents.data?.data ?? [];
  const meta = documents.data?.meta;
  useClampedPage(page, setPage, meta);

  const nameOf = (row: DocumentListItem): string => {
    const first = valueFields[0];
    const text =
      first === undefined
        ? ''
        : formatListValue(first.type, row.values[first.path]);
    return text === '' ||
      text === list.emptyValue ||
      text === list.protectedValue
      ? `${list.untitled} (${row.documentId.slice(0, 8)})`
      : text;
  };

  const columns: SheetColumn<DocumentListItem>[] = [
    ...valueFields.map((field, index): SheetColumn<DocumentListItem> => ({
      key: field.path,
      header: field.path,
      sortable: true,
      rowHeader: index === 0,
      align: listAlignmentOf(field.type),
      renderCell: (row) =>
        index === 0 ? (
          <Button asChild variant="link" className="h-auto p-0">
            <Link to={contentEditPath(slug, row.documentId)}>
              {nameOf(row)}
            </Link>
          </Button>
        ) : (
          formatListValue(field.type, row.values[field.path])
        ),
    })),
    {
      key: LIST_UPDATED_KEY,
      header: list.columns.updated,
      sortable: true,
      rowHeader: valueFields.length === 0,
      renderCell: (row) =>
        row.updatedAt === undefined ? (
          list.emptyValue
        ) : valueFields.length === 0 ? (
          <Button asChild variant="link" className="h-auto p-0">
            <Link to={contentEditPath(slug, row.documentId)}>
              {formatDateTime(row.updatedAt)}
            </Link>
          </Button>
        ) : (
          formatDateTime(row.updatedAt)
        ),
    },
  ];

  const selectedRows = rows.filter((row) => selected.has(row.documentId));

  const run = useMutation({
    mutationFn: (input: { action: BulkAction; rows: DocumentListItem[] }) =>
      api.bulk(
        slug,
        input.action,
        input.rows.map((row) => toItem(input.action, row)),
        false,
      ),
    onSuccess: (response, input) => {
      void queryClient.invalidateQueries({
        queryKey: CONTENT_QUERY_KEYS.list(slug),
      });
      const failures = failedItems(response).map((item) => {
        const row = input.rows[item.index];
        const notPublished =
          input.action === BULK_ACTION.UNPUBLISH &&
          item.errorCode === API_ERROR_CODES.DOCUMENT_NOT_FOUND;
        return {
          id: row?.documentId,
          name: row === undefined ? String(item.index + 1) : nameOf(row),
          reason: notPublished
            ? bulkCopy.itemErrors.notPublished
            : itemReason(item.errorCode, item.message),
        };
      });
      setBanner({
        kind: 'result',
        action: input.action,
        total: input.rows.length,
        done: response.succeeded,
        failures,
      });
      setSelected(
        new Set(
          failures.flatMap((failure) =>
            failure.id === undefined ? [] : [failure.id],
          ),
        ),
      );
    },
    onError: (cause) =>
      setBanner({ kind: 'error', message: toBulkFailure(cause).message }),
  });

  const start = (action: BulkAction) => {
    setBanner(null);
    run.mutate({ action, rows: selectedRows });
  };
  const inFlight = run.isPending ? run.variables?.action : undefined;

  const barActions: BarAction[] = [
    ...(canPublish
      ? [
          {
            id: BULK_ACTION.PUBLISH,
            label: bulkCopy.publish(selectedRows.length),
            variant: 'success' as const,
            loading: inFlight === BULK_ACTION.PUBLISH,
            onClick: () => start(BULK_ACTION.PUBLISH),
          },
        ]
      : []),
    ...(canUnpublish
      ? [
          {
            id: BULK_ACTION.UNPUBLISH,
            label: bulkCopy.unpublish(selectedRows.length),
            variant: 'warning' as const,
            loading: inFlight === BULK_ACTION.UNPUBLISH,
            onClick: () => start(BULK_ACTION.UNPUBLISH),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            id: BULK_ACTION.DELETE,
            label: bulkCopy.delete(selectedRows.length),
            variant: 'destructive' as const,
            loading: inFlight === BULK_ACTION.DELETE,
            onClick: () => {
              rememberOpener(document.activeElement);
              setConfirmingDelete(true);
            },
          },
        ]
      : []),
  ];

  const changePage = (next: number) => {
    setSelected(new Set());
    setPage(next);
  };

  const heading = (
    <PageHeader
      title={list.title(slug)}
      description={list.description(draftAndPublish)}
      action={
        canCreate && isCollection ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={(event) => {
                rememberOpener(event.currentTarget);
                setBanner(null);
                setImporting(true);
              }}
            >
              {bulkCopy.import}
            </Button>
            <Button asChild variant="primary">
              <Link to={contentNewPath(slug)}>{list.newDocument}</Link>
            </Button>
          </div>
        ) : null
      }
    />
  );

  if (type.isPending) {
    return (
      <div className="grid gap-6">
        {heading}
        <TableSkeleton label={list.loading} />
      </div>
    );
  }
  if (type.isError) {
    return (
      <div className="grid gap-6">
        {heading}
        {isMissing(type.error) ? (
          <FormAlert tone="info">{copy.typeNotFound}</FormAlert>
        ) : (
          <LoadError
            message={list.loadFailed}
            retrying={type.isFetching}
            onRetry={() => void type.refetch()}
          />
        )}
      </div>
    );
  }
  if (!isCollection) {
    return (
      <div className="grid gap-6">
        {heading}
        <FormAlert tone="info">{list.notCollection}</FormAlert>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {heading}
      {banner === null ? null : (
        <div className="grid gap-2">
          <FormAlert tone={bannerTone(banner)}>
            {banner.kind === 'imported'
              ? bulkCopy.importDialog.created(banner.count)
              : banner.kind === 'error'
                ? banner.message
                : bulkCopy.summary[banner.action as 'publish'](
                    banner.done,
                    banner.total,
                  )}
          </FormAlert>
          {banner.kind === 'result' && banner.failures.length > 0 ? (
            <div className="grid gap-1 text-sm">
              <p className="m-0 font-medium">
                {bulkCopy.summary.failedHeading(banner.failures.length)}
              </p>
              <ul className="m-0 grid list-disc gap-0.5 pl-5">
                {banner.failures.map((failure, index) => (
                  <li key={`${failure.name}-${index}`}>
                    {bulkCopy.summary.failedItem(failure.name, failure.reason)}
                  </li>
                ))}
              </ul>
              <p className="m-0 text-muted-foreground">
                {bulkCopy.summary.stillSelected}
              </p>
            </div>
          ) : null}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBanner(null)}
            >
              {bulkCopy.summary.dismiss}
            </Button>
          </div>
        </div>
      )}
      {documents.isPending ? (
        <TableSkeleton label={list.loading} />
      ) : documents.isError ? (
        isForbidden(documents.error) ? (
          <FormAlert tone="info">{list.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={list.loadFailed}
            retrying={documents.isFetching}
            onRetry={() => void documents.refetch()}
          />
        )
      ) : rows.length === 0 && page === 1 ? (
        <div className="grid justify-items-start gap-1">
          <p className="m-0 font-medium">{list.empty}</p>
          <p className="m-0 text-sm text-muted-foreground">
            {canCreate ? list.emptyHint : list.emptyHintReadOnly}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {selectable ? (
            <BulkActionBar
              selectedCount={selectedRows.length}
              actions={barActions}
              busy={run.isPending}
              onClear={() => setSelected(new Set())}
              labels={{
                region: bulkCopy.region,
                selected: bulkCopy.selected,
                clear: bulkCopy.clear,
              }}
            />
          ) : null}
          <div className="rounded-md border border-border bg-card">
            <SortableSheet
              className="rounded-none border-0"
              caption={list.tableLabel(slug)}
              columns={columns}
              rows={rows}
              getRowId={(row) => row.documentId}
              getRowLabel={nameOf}
              sort={sort}
              onSortChange={(next) => {
                setSelected(new Set());
                setPage(1);
                setSort(next);
              }}
              {...(selectable
                ? { selectedIds: selected, onSelectedChange: setSelected }
                : {})}
              labels={{
                selectAll: list.selectAll,
                selectRow: list.selectRow,
              }}
              busy={documents.isFetching && documents.isPlaceholderData}
            />
            {meta === undefined ? null : (
              <TablePagination
                page={meta.page}
                pageSize={meta.pageSize}
                total={meta.total}
                count={rows.length}
                onPageChange={changePage}
                labels={{
                  nav: list.pagination.label,
                  previous: list.pagination.previous,
                  next: list.pagination.next,
                  range: list.pagination.range,
                }}
              />
            )}
          </div>
        </div>
      )}
      <BulkDeleteDialog
        onCloseAutoFocus={restoreFocus}
        count={selectedRows.length}
        draftAndPublish={draftAndPublish}
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          start(BULK_ACTION.DELETE);
        }}
      />
      <BulkCreateDialog
        onCloseAutoFocus={restoreFocus}
        slug={slug}
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(count) => {
          setImporting(false);
          setPage(1);
          setSort({ key: LIST_UPDATED_KEY, direction: 'desc' });
          setBanner({ kind: 'imported', count });
        }}
      />
    </div>
  );
}
