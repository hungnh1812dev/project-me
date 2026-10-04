import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select';
import { ConfirmDialog } from '@repo/ui/form/ConfirmDialog';
import { Field } from '@repo/ui/form/Field';

import type { Role } from '@/features/auth/types';
import { useAssignRole } from '@/features/settings/hooks/useUsers';
import type { UserRow } from '@/features/settings/roleHierarchy';

export interface ChangeRoleDialogProps {
  row: UserRow;
  /** `assignableRoles(roles, actor.level)`: the only roles offered. */
  roles: readonly Role[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after U3 succeeds. */
  onChanged: (message: string) => void;
}

const roleLabel = (role: Role) => `${role.name} (level ${role.level})`;

/**
 * Confirms a role change for one user (AC-7, AC-15): a Select of the assignable roles, with the
 * current role preselected when it is one of them. Saving sends U3 `{ roleId }`; a server or guard
 * error stays in the dialog (AC-9). Mount it with a fresh `key` per opening so its state resets.
 */
export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({
  row,
  roles,
  open,
  onOpenChange,
  onChanged,
}) => {
  const assign = useAssignRole();
  const [roleId, setRoleId] = useState<string | null>(
    roles.some((role) => role.documentId === row.user.roleId) ? row.user.roleId : null,
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const items = roles.map((role) => ({ value: role.documentId, label: roleLabel(role) }));
  const { email } = row.user;

  const confirm = async () => {
    const role = roles.find((candidate) => candidate.documentId === roleId);
    if (!role) {
      setFieldError('Choose a role.');
      throw new Error('No role chosen.');
    }
    await assign.mutateAsync({
      userId: row.user.documentId,
      roleId: role.documentId,
      targetLevel: row.level,
      newRoleLevel: role.level,
    });
    onChanged(`Role of ${email} changed to ${role.name}.`);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Change the role of ${email}?`}
      description="They get the new role's permissions on their next request."
      confirmLabel="Change role"
      onConfirm={confirm}
      error={assign.error?.message}
    >
      <Select
        items={items}
        value={roleId}
        onValueChange={(value) => {
          setRoleId(value);
          setFieldError(null);
        }}
      >
        <Field label="Role" error={fieldError}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
        </Field>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ConfirmDialog>
  );
};
ChangeRoleDialog.displayName = 'ChangeRoleDialog';
