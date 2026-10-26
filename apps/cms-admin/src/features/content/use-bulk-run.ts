import type { BulkAction as BarAction } from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { COPY } from '../../config/Copy.constants';
import { API_ERROR_CODES } from '../../config/Http.constants';
import { failedItems, itemReason, toBulkFailure } from './bulk';
import type { Banner } from './bulk-banner';
import { documentNameOf } from './collection-columns';
import { useContentApi } from './content-api-context';
import { CONTENT_QUERY_KEYS } from './content-queries';
import type { BulkItem, DocumentListItem } from './content.api';
import { BULK_ACTION, type BulkAction } from './content.constants';
import type { ContentTypeField } from '../content-types';

const bulkCopy = COPY.content.bulk;

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
          name:
            row === undefined
              ? String(item.index + 1)
              : documentNameOf(valueFields, row),
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
      onSelectFailed(
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
