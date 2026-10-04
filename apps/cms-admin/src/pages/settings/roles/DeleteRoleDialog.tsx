import { useQueryClient } from '@tanstack/react-query';

import { ConfirmDialog } from '@repo/ui/form/ConfirmDialog';

import type { Role } from '@/features/auth/types';
import { useDeleteRole } from '@/features/settings/hooks/useRoles';
import { settingsKeys } from '@/features/settings/queryKeys';
import type { User } from '@/features/settings/types';

export interface DeleteRoleDialogProps {
  role: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after R4 succeeds. */
  onDeleted: (message: string) => void;
}

const IN_USE = 'This role is still assigned to users. Assign them another role first.';

/**
 * Confirms deleting one role, naming it (AC-7, AC-21). Sends R4. On a 409 the role is still
 * assigned: the dialog says so, adds how many users hold it when the users list is cached, and
 * offers only Close. Any other error stays in the dialog (AC-9). Mount it with a fresh `key` per
 * opening so its state resets.
 */
export const DeleteRoleDialog: React.FC<DeleteRoleDialogProps> = ({
  role,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const remove = useDeleteRole();
  const queryClient = useQueryClient();
  const inUse = remove.error?.status === 409;

  let error: string | undefined = remove.error?.message;
  if (inUse) {
    const users = queryClient.getQueryData<User[]>(settingsKeys.users());
    const count = users?.filter((user) => user.roleId === role.documentId).length ?? 0;
    error =
      count > 0 ? `${IN_USE} Assigned to ${count} ${count === 1 ? 'user' : 'users'}.` : IN_USE;
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete role "${role.name}"?`}
      description={
        inUse ? undefined : "Users can no longer be given this role. This can't be undone."
      }
      confirmLabel="Delete role"
      cancelLabel={inUse ? 'Close' : 'Cancel'}
      hideConfirm={inUse}
      onConfirm={async () => {
        await remove.mutateAsync(role);
        onDeleted(`Role "${role.name}" deleted.`);
      }}
      error={error}
    />
  );
};
DeleteRoleDialog.displayName = 'DeleteRoleDialog';
