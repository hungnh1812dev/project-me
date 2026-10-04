import { ConfirmDialog } from '@repo/ui/form/ConfirmDialog';

import { useDeleteUser } from '@/features/settings/hooks/useUsers';
import type { UserRow } from '@/features/settings/roleHierarchy';

export interface DeleteUserDialogProps {
  row: UserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after U4 succeeds. */
  onDeleted: (message: string) => void;
}

/**
 * Confirms deleting one user, naming the email (AC-7, AC-16). Sends U4; a server or guard error
 * stays in the dialog (AC-9). Mount it with a fresh `key` per opening so its state resets.
 */
export const DeleteUserDialog: React.FC<DeleteUserDialogProps> = ({
  row,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const remove = useDeleteUser();
  const { email } = row.user;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${email}?`}
      description="The account and its access are removed right away. This can't be undone."
      confirmLabel="Delete user"
      onConfirm={async () => {
        await remove.mutateAsync({ userId: row.user.documentId, targetLevel: row.level });
        onDeleted(`User ${email} deleted.`);
      }}
      error={remove.error?.message}
    />
  );
};
DeleteUserDialog.displayName = 'DeleteUserDialog';
