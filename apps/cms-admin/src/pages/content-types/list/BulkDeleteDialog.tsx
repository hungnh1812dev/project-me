import { useState } from 'react';

import { ConfirmDialog, type ConfirmDialogProps } from '@/components/form/ConfirmDialog';
import { useBulkDeleteDocuments } from '@/features/content/hooks/useCollectionMutations';
import type { BulkDeleteResult, ContentTypeRef } from '@/features/content/types';

import { actionErrorText } from '../actionError';

export interface BulkDeleteDialogProps {
  type: ContentTypeRef;
  /** The selected entries, at most one page (100). */
  documentIds: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs with the D10 result (which may list failures), before the dialog closes. */
  onDeleted: (result: BulkDeleteResult) => void;
  /** Where focus goes on close; see `ConfirmDialog`. */
  finalFocus?: ConfirmDialogProps['finalFocus'];
}

/**
 * Confirms deleting the selected entries (D10, AC-30): "Delete 3 entries?". A partial result still
 * resolves and goes to `onDeleted`; a request failure (a 403 shows "no access") stays inside the
 * dialog as an alert, and the dialog stays open.
 */
export const BulkDeleteDialog: React.FC<BulkDeleteDialogProps> = ({
  type,
  documentIds,
  open,
  onOpenChange,
  onDeleted,
  finalFocus,
}) => {
  const remove = useBulkDeleteDocuments(type);
  const [error, setError] = useState<string | null>(null);
  const count = documentIds.length;

  return (
    <ConfirmDialog
      open={open}
      finalFocus={finalFocus}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={count === 1 ? 'Delete 1 entry?' : `Delete ${count} entries?`}
      description="The selected entries are removed for everyone. This can't be undone."
      confirmLabel={count === 1 ? 'Delete entry' : 'Delete entries'}
      error={error}
      onConfirm={async () => {
        setError(null);
        let result: BulkDeleteResult;
        try {
          result = await remove.mutateAsync([...documentIds]);
        } catch (failure) {
          setError(actionErrorText(failure));
          throw failure;
        }
        onDeleted(result);
      }}
    />
  );
};
BulkDeleteDialog.displayName = 'BulkDeleteDialog';
