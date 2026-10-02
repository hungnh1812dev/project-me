import { useRef, useState } from 'react';

import { Field } from '@/components/form/Field';
import { PermissionTree } from '@/components/form/PermissionTree';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Role } from '@/features/auth/types';
import { usePermissions } from '@/features/settings/hooks/usePermissions';
import { useCreateRole, useUpdateRole } from '@/features/settings/hooks/useRoles';
import {
  ROLE_LEVEL_MAX,
  roleChanges,
  roleSlugFromName,
  validateRole,
  type RoleErrors,
  type RoleValues,
} from '@/features/settings/validation';

export interface RoleFormDialogProps {
  /** The role to edit. Omit it to create one. */
  role?: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after R2 or R3 succeeds. */
  onSaved: (message: string) => void;
}

const DUPLICATE_SLUG = 'A role with this slug already exists.';
const DEFAULT_LOCKED = 'The name and level of a default role cannot be changed.';

/**
 * Creates or edits a role (AC-19, AC-20). On create, the slug follows the name through
 * `roleSlugFromName` until the user edits it, and a 409 shows on Slug. On edit, Slug is read-only,
 * a default role's Name and Level are disabled, Save stays disabled until something changes, and R3
 * gets only the changed fields. Permissions come from the PermissionTree (AC-23). Validation runs on
 * submit, then on every change; other server errors show as an alert (AC-9). No level-hierarchy
 * rule applies (D4). Mount it with a fresh `key` per opening so its state resets.
 */
export const RoleFormDialog: React.FC<RoleFormDialogProps> = ({
  role,
  open,
  onOpenChange,
  onSaved,
}) => {
  const isEdit = role !== undefined;
  const locked = role?.isDefault ?? false;
  const create = useCreateRole();
  const update = useUpdateRole();
  const mutation = isEdit ? update : create;
  const catalog = usePermissions();
  const [values, setValues] = useState<RoleValues>({
    name: role?.name ?? '',
    slug: role?.slug ?? '',
    level: role ? String(role.level) : '',
    permissions: role?.permissions ?? [],
  });
  const [slugEdited, setSlugEdited] = useState(isEdit);
  const [errors, setErrors] = useState<RoleErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const duplicate = !isEdit && create.error?.status === 409;
  const serverError = mutation.error && !duplicate ? mutation.error.message : null;
  const changes = role ? roleChanges(role, values) : {};
  const unchanged = isEdit && Object.keys(changes).length === 0;

  const set = (next: RoleValues) => {
    setValues(next);
    if (submitted) setErrors(validateRole(next, { isEdit }));
    if (duplicate && next.slug !== values.slug) create.reset();
  };

  const save = async () => {
    if (role) {
      await update.mutateAsync({ role, changes });
      onSaved(`Role "${changes.name ?? role.name}" updated.`);
    } else {
      const created = await create.mutateAsync({
        name: values.name.trim(),
        slug: values.slug,
        permissions: [...new Set(values.permissions)],
        level: Number(values.level.trim()),
      });
      onSaved(`Role "${created.name}" created.`);
    }
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.isPending || unchanged) return;
    const found = validateRole(values, { isEdit });
    setSubmitted(true);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // The failure is shown from the mutation's `error`.
    save().catch(() => {});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl" initialFocus={locked ? undefined : nameRef}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit role' : 'New role'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Change what ${role.name} can do.`
              : 'Bundle permissions under a name and level, then assign it to users.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              required={!locked}
              description={locked ? DEFAULT_LOCKED : undefined}
              error={errors.name}
            >
              <Input
                ref={nameRef}
                value={values.name}
                disabled={locked}
                onChange={(event) => {
                  const name = event.target.value;
                  set({ ...values, name, slug: slugEdited ? values.slug : roleSlugFromName(name) });
                }}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Slug"
              required={!isEdit}
              description={
                isEdit
                  ? "The slug can't be changed."
                  : "Derived from the name until you edit it. It can't be changed later."
              }
              error={errors.slug ?? (duplicate ? DUPLICATE_SLUG : undefined)}
            >
              <Input
                value={values.slug}
                readOnly={isEdit}
                onChange={(event) => {
                  setSlugEdited(true);
                  set({ ...values, slug: event.target.value });
                }}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
          </div>
          <Field
            label="Level"
            required={!locked}
            description={
              locked ? DEFAULT_LOCKED : '0 to 100. Higher levels can manage users at lower levels.'
            }
            error={errors.level}
            className="sm:max-w-48"
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={ROLE_LEVEL_MAX}
              step={1}
              value={values.level}
              disabled={locked}
              onChange={(event) => set({ ...values, level: event.target.value })}
            />
          </Field>
          <PermissionTree
            value={values.permissions}
            onChange={(permissions) => set({ ...values, permissions })}
            catalog={catalog.data}
            canReadCatalog={catalog.decision.allowed}
            isLoading={catalog.isPending && catalog.decision.allowed}
            error={catalog.error?.message}
            onRetry={() => void catalog.refetch()}
          />
          {serverError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" loading={mutation.isPending} disabled={unchanged}>
              {isEdit ? 'Save changes' : 'Create role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
RoleFormDialog.displayName = 'RoleFormDialog';
