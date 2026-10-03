import { Link } from 'react-router-dom';

import { ConfirmDialog } from '@repo/ui/form/ConfirmDialog';

import { useCan } from '@/features/auth/hooks/useCan';
import { parsePermissionConflict } from '@/features/settings/conflict';
import { useDeletePermission } from '@/features/settings/hooks/usePermissions';
import type { Permission } from '@/features/settings/types';

export interface DeletePermissionDialogProps {
  permission: Permission;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after P4 succeeds. */
  onDeleted: (message: string) => void;
}

const LINK = 'font-medium text-primary underline underline-offset-4';

/**
 * Confirms deleting one permission, naming the slug (AC-7). Sends P4. On a 409 it switches to the
 * conflict state (AC-27): the pluralized counts (or the server message), links to Roles and Access
 * tokens when the actor can read them, and only Close. Any other error stays in the dialog (AC-9).
 * Mount it with a fresh `key` per opening so its state resets.
 */
export const DeletePermissionDialog: React.FC<DeletePermissionDialogProps> = ({
  permission,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const remove = useDeletePermission();
  const canReadRoles = useCan('read', 'role').allowed;
  const canReadTokens = useCan('read', 'api_token').allowed;
  const conflict = parsePermissionConflict(remove.error);
  const { slug } = permission;
  const close = () => onOpenChange(false);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={conflict ? `${slug} is still in use` : `Delete ${slug}?`}
      description={
        conflict
          ? undefined
          : "Roles and access tokens can no longer grant it. This can't be undone."
      }
      confirmLabel="Delete permission"
      cancelLabel={conflict ? 'Close' : 'Cancel'}
      hideConfirm={conflict !== null}
      onConfirm={async () => {
        await remove.mutateAsync(permission.documentId);
        onDeleted(`Permission "${slug}" deleted.`);
      }}
      error={conflict ? undefined : remove.error?.message}
    >
      {conflict && (
        <div className="flex flex-col gap-2 text-sm">
          <p role="alert" className="font-medium text-destructive">
            {conflict.text}
          </p>
          {(canReadRoles || canReadTokens) && (
            <p className="flex flex-wrap gap-4">
              {canReadRoles && (
                <Link to="/admin/settings/roles" className={LINK} onClick={close}>
                  Roles
                </Link>
              )}
              {canReadTokens && (
                <Link to="/admin/settings/access-tokens" className={LINK} onClick={close}>
                  Access tokens
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
};
DeletePermissionDialog.displayName = 'DeletePermissionDialog';
