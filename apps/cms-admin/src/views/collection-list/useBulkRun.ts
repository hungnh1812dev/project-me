import { useState } from 'react';
import type { BulkAction as BarAction } from '@abyss/form-commons';
import { API_ERROR_CODES } from '@configs/Http.constants';
import { useScreenText } from '@configs/locales';
import type { ContentTypeField } from '@features/content-types';
import type { BulkItem, DocumentListItem } from '@features/content/Content.api';
import { BULK_ACTION, type BulkAction } from '@features/content/Content.constants';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { useContentApi } from '@features/content/ContentApi.context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { failedItems, itemReason, toBulkFailure } from './Bulk.rules';
import type { Banner } from './BulkBanner.rules';
import { documentNameOf } from './Collection.columns';

function toItem(action: BulkAction, row: DocumentListItem): BulkItem {
  return action === BULK_ACTION.PUBLISH
    ? { documentId: row.documentId, expectedVersion: row.version }
    : { documentId: row.documentId };
}

export interface BulkRunInput {
  slug: string;
  valueFields: readonly ContentTypeField[];
  selectedRows: DocumentListItem[];
  /** Keeps only the rows that failed selected, so the user can retry them. */
  onSelectFailed: (documentIds: ReadonlySet<string>) => void;
  allowed: { publish: boolean; unpublish: boolean; delete: boolean };
  /** Delete needs a confirmation dialog, which the page owns. */
  onDeleteRequested: () => void;
}

/** Runs bulk publish / unpublish / delete on the selected rows and reports the outcome in a banner. */
export function useBulkRun({
  slug,
  valueFields,
  selectedRows,
  onSelectFailed,
  allowed,
  onDeleteRequested,
}: BulkRunInput) {
  const text = useScreenText('content');
  const bulkCopy = text.content.bulk;
  const api = useContentApi();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<Banner | null>(null);

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
          name: row === undefined ? String(item.index + 1) : documentNameOf(valueFields, row, text),
          reason: notPublished
            ? bulkCopy.itemErrors.notPublished
            : itemReason(item.errorCode, item.message, undefined, text),
        };
      });
      setBanner({
        kind: 'result',
        action: input.action,
        total: input.rows.length,
        done: response.succeeded,
        failures,
      });
      onSelectFailed(
        new Set(failures.flatMap((failure) => (failure.id === undefined ? [] : [failure.id]))),
      );
    },
    onError: (cause) => setBanner({ kind: 'error', message: toBulkFailure(cause, text).message }),
  });

  const start = (action: BulkAction) => {
    setBanner(null);
    run.mutate({ action, rows: selectedRows });
  };
  const inFlight = run.isPending ? run.variables?.action : undefined;

  const barActions: BarAction[] = [
    ...(allowed.publish
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
    ...(allowed.unpublish
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
    ...(allowed.delete
      ? [
          {
            id: BULK_ACTION.DELETE,
            label: bulkCopy.delete(selectedRows.length),
            variant: 'destructive' as const,
            loading: inFlight === BULK_ACTION.DELETE,
            onClick: onDeleteRequested,
          },
        ]
      : []),
  ];

  return {
    banner,
    clearBanner: () => setBanner(null),
    showImported: (count: number) => setBanner({ kind: 'imported', count }),
    start,
    barActions,
    isRunning: run.isPending,
  };
}
