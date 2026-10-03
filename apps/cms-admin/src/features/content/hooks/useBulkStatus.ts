import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { toApiError, type ApiError } from '@/core/api/apiError';
import { guard } from '@/features/auth/permissions/guard';

import { publishDocument, unpublishDocument } from '../api/documentsApi';
import { planBulkStatus, type BulkTarget } from '../bulk';
import { contentKeys } from '../queryKeys';
import type { ContentTypeRef, DocumentStatus } from '../types';
import { useContentTypeAccess } from './useContentTypeAccess';

/** Where a running bulk publish or unpublish is: on entry `current` of `total` (1-based). */
export interface BulkStatusProgress {
  target: BulkTarget;
  current: number;
  total: number;
}

/** How a run ended. `skipped` entries already had the target status; no request was sent. */
export interface BulkStatusResult {
  target: BulkTarget;
  succeeded: string[];
  failed: { documentId: string; error: ApiError }[];
  skipped: string[];
}

const SEND = { publish: publishDocument, unpublish: unpublishDocument } as const;

/**
 * Bulk publish and unpublish (D5, AC-31). `run(target, items)` checks the scoped `publish` or
 * `unpublish` decision first (a denial rejects with `ERR_CLIENT_FORBIDDEN` and sends nothing), skips
 * the entries already in the target status, then sends D6 or D7 for one entry at a time. A failure
 * is recorded and the run carries on. `progress` follows the entry in flight. At the end, when
 * anything was sent, `lists(slug)` is invalidated once, with the `detail` of every entry acted on.
 */
export function useBulkStatus(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  const { slug } = ref;
  const [progress, setProgress] = useState<BulkStatusProgress | null>(null);

  const run = useCallback(
    async (
      target: BulkTarget,
      items: readonly { documentId: string; status: DocumentStatus }[],
    ): Promise<BulkStatusResult> => {
      guard(access[target]);
      const { act, skipped } = planBulkStatus(items, target);
      const result: BulkStatusResult = { target, succeeded: [], failed: [], skipped };
      try {
        for (const [index, documentId] of act.entries()) {
          setProgress({ target, current: index + 1, total: act.length });
          try {
            await SEND[target](slug, documentId);
            result.succeeded.push(documentId);
          } catch (error) {
            result.failed.push({ documentId, error: toApiError(error) });
          }
        }
      } finally {
        setProgress(null);
      }
      if (act.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: contentKeys.lists(slug) }),
          ...act.map((documentId) =>
            queryClient.invalidateQueries({ queryKey: contentKeys.detail(slug, documentId) }),
          ),
        ]);
      }
      return result;
    },
    [access, slug, queryClient],
  );

  return { run, progress, running: progress !== null };
}
