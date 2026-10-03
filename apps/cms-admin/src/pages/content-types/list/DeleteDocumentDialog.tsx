import { useState } from 'react';

import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { useDeleteDocument } from '@/features/content/hooks/useCollectionMutations';
import type { ContentTypeRef } from '@/features/content/types';

import { actionErrorText } from '../actionError';

export interface DeleteDocumentDialogProps {
  type: ContentTypeRef;
  documentId: string;
  /** The entry's label, named in the title: `Delete "<label>"?`. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after D5 succeeded, before the dialog closes. */
  onDeleted: () => void;
}

/**
 * Confirms deleting one entry (D5). The title names the entry; a failure (a 403 shows "no access")
 * stays inside the dialog as an alert, and the dialog stays open.
 */
export const DeleteDocumentDialog: React.FC<DeleteDocumentDialogProps> = ({
  type,
  documentId,
  label,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const remove = useDeleteDocument(type);
  const [error, setError] = useState<string | null>(null);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={`Delete "${label}"?`}
      description="The entry is removed for everyone. This can't be undone."
      confirmLabel="Delete entry"
      error={error}
      onConfirm={async () => {
        setError(null);
        try {
          await remove.mutateAsync(documentId);
        } catch (failure) {
          setError(actionErrorText(failure));
          throw failure;
        }
        onDeleted();
      }}
    />
  );
};
DeleteDocumentDialog.displayName = 'DeleteDocumentDialog';
