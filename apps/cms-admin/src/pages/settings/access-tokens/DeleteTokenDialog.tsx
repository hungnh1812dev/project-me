import { ConfirmDialog } from '@repo/ui/form/ConfirmDialog';

import { useDeleteAccessToken } from '@/features/settings/hooks/useAccessTokens';
import type { AccessToken } from '@/features/settings/types';

export interface DeleteTokenDialogProps {
  token: AccessToken;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after T4 succeeds. */
  onDeleted: (message: string) => void;
}

/**
 * Confirms deleting one token, naming it (AC-7, AC-32), then sends T4. Errors stay in the dialog
 * (AC-9). Mount it with a fresh `key` per opening.
 */
export const DeleteTokenDialog: React.FC<DeleteTokenDialogProps> = ({
  token,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const remove = useDeleteAccessToken();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete token "${token.name}"?`}
      description="Anything still using it loses access right away. This can't be undone."
      confirmLabel="Delete token"
      onConfirm={async () => {
        await remove.mutateAsync(token.documentId);
        onDeleted(`Token "${token.name}" deleted.`);
      }}
      error={remove.error?.message}
    />
  );
};
DeleteTokenDialog.displayName = 'DeleteTokenDialog';
