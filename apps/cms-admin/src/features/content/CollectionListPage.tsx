import {
  BulkActionBar,
  Button,
  FormAlert,
  SortableSheet,
  TablePagination,
} from '@abyss/form-commons';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { useRestoreFocus } from '../../components/useRestoreFocus.state';
import { COPY } from '../../config/Copy.constants';
import { contentNewPath } from '../../config/App.routes';
import {
  CONTENT_WILDCARD_SUBJECT,
  isForbidden,
  type PermissionAction,
  useCallerAccess,
} from '../access';
import { BulkBanner } from './BulkBanner';
import { BulkCreateDialog } from './BulkCreateDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { collectionColumnsOf, documentNameOf } from './collection-columns';
import { isMissing } from './content-error';
import { BULK_ACTION } from './content.constants';
import { SingleTypeRedirect } from './SingleTypeRedirect';
import { useBulkRun } from './use-bulk-run';
import { useCollectionList } from './use-collection-list';

const copy = COPY.content;
const list = copy.collection;
const bulkCopy = copy.bulk;

/**
 * `/content/:slug`: the draft list of a collection with sortable
 * columns, paging, bulk publish / unpublish / delete and JSON import.
 */
export function CollectionListPage() {
  const { slug = '' } = useParams();
  const caller = useCallerAccess();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // Controlled dialogs have no trigger, so Radix cannot restore focus itself.
  const { rememberOpener, restoreFocus } = useRestoreFocus();

  const {
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
    selectedRows,
    setSelected,
    clearSelection,
    changePage,
    changeSort,
    showFirstPageByUpdated,
  } = useCollectionList(slug);

  const can = (action: PermissionAction) =>
    caller.isReady &&
    (caller.can(slug, action) || caller.can(CONTENT_WILDCARD_SUBJECT, action));
  const canCreate = can('create');
  const allowed = {
    publish: draftAndPublish && can('publish'),
    unpublish: draftAndPublish && can('unpublish'),
    delete: can('delete'),
  };
  const selectable = allowed.publish || allowed.unpublish || allowed.delete;

  const bulk = useBulkRun({
    slug,
    valueFields,
    selectedRows,
    onSelectFailed: setSelected,
    allowed,
    onDeleteRequested: () => {
      rememberOpener(document.activeElement);
      setIsConfirmingDelete(true);
    },
  });

  const columns = collectionColumnsOf(slug, valueFields);
  const nameOf = (row: (typeof rows)[number]) =>
    documentNameOf(valueFields, row);

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
                bulk.clearBanner();
                setIsImporting(true);
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
            isRetrying={type.isFetching}
            onRetry={() => void type.refetch()}
          />
        )}
      </div>
    );
  }
  if (!isCollection) {
    return <SingleTypeRedirect slug={slug} draftAndPublish={draftAndPublish} />;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {heading}
      {bulk.banner === null ? null : (
        <BulkBanner banner={bulk.banner} onDismiss={bulk.clearBanner} />
      )}
      {documents.isPending ? (
        <TableSkeleton label={list.loading} />
      ) : documents.isError ? (
        isForbidden(documents.error) ? (
          <FormAlert tone="info">{list.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={list.loadFailed}
            isRetrying={documents.isFetching}
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
              actions={bulk.barActions}
              busy={bulk.isRunning}
              onClear={clearSelection}
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
              onSortChange={changeSort}
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
        open={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={() => {
          setIsConfirmingDelete(false);
          bulk.start(BULK_ACTION.DELETE);
        }}
      />
      <BulkCreateDialog
        onCloseAutoFocus={restoreFocus}
        slug={slug}
        open={isImporting}
        onClose={() => setIsImporting(false)}
        onImported={(count) => {
          setIsImporting(false);
          showFirstPageByUpdated();
          bulk.showImported(count);
        }}
      />
    </div>
  );
}
