import { useRef, useState } from 'react';
import { InfoIcon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';

import { Field } from '@/components/form/Field';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Textarea } from '@/components/ui/textarea';
import { useCreatePermission, useUpdatePermission } from '@/features/settings/hooks/usePermissions';
import type { Permission } from '@/features/settings/types';
import {
  PERMISSION_DESCRIPTION_MAX,
  permissionChanges,
  validatePermission,
  type PermissionErrors,
  type PermissionValues,
} from '@/features/settings/validation';

export interface PermissionFormDialogProps {
  /** The permission to edit. Omit it to create one. */
  permission?: Permission;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after P2 or P3 succeeds. */
  onSaved: (message: string) => void;
}

const DUPLICATE_SLUG = 'A permission with this slug already exists.';

/**
 * Creates or edits a permission (AC-25, AC-26). Validation runs on submit, then on every change. On
 * create, a 409 shows on Slug; any other server error shows as an alert in the dialog (AC-9). On
 * edit, Slug is read-only and P3 gets only the changed fields; with no change the dialog just
 * closes. Mount it with a fresh `key` per opening so its state resets.
 */
export const PermissionFormDialog: React.FC<PermissionFormDialogProps> = ({
  permission,
  open,
  onOpenChange,
  onSaved,
}) => {
  const isEdit = permission !== undefined;
  const create = useCreatePermission();
  const update = useUpdatePermission();
  const mutation = isEdit ? update : create;
  const [values, setValues] = useState<PermissionValues>({
    slug: permission?.slug ?? '',
    name: permission?.name ?? '',
    description: permission?.description ?? '',
  });
  const [errors, setErrors] = useState<PermissionErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const duplicate = !isEdit && create.error?.status === 409;
  const serverError = mutation.error && !duplicate ? mutation.error.message : null;

  const change = (field: keyof PermissionValues) => (value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(validatePermission(next, { isEdit }));
    if (field === 'slug' && duplicate) create.reset();
  };

  const save = async () => {
    if (isEdit) {
      const changes = permissionChanges(permission, values);
      if (Object.keys(changes).length === 0) return onOpenChange(false);
      await update.mutateAsync({ id: permission.documentId, changes });
      onSaved(`Permission "${permission.slug}" updated.`);
    } else {
      const created = await create.mutateAsync({
        slug: values.slug,
        name: values.name.trim(),
        description: values.description.trim(),
      });
      onSaved(`Permission "${created.slug}" created.`);
    }
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const found = validatePermission(values, { isEdit });
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
      <DialogContent initialFocus={isEdit ? nameRef : slugRef}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit permission' : 'New permission'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Change the name or description of ${permission.slug}.`
              : 'Add a slug to the catalog so roles and access tokens can grant it.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="Slug"
            required={!isEdit}
            description={
              isEdit
                ? "The slug can't be changed."
                : "resource:action, lowercase. It can't be changed later."
            }
            error={errors.slug ?? (duplicate ? DUPLICATE_SLUG : undefined)}
          >
            <Input
              ref={slugRef}
              value={values.slug}
              onChange={(event) => change('slug')(event.target.value)}
              readOnly={isEdit}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Name" required error={errors.name}>
            <Input
              ref={nameRef}
              value={values.name}
              onChange={(event) => change('name')(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Description" required error={errors.description}>
            <Textarea
              value={values.description}
              onChange={(event) => change('description')(event.target.value)}
              maxLength={PERMISSION_DESCRIPTION_MAX}
              rows={3}
            />
          </Field>
          {!isEdit && (
            <Alert role="note">
              <InfoIcon aria-hidden="true" />
              <AlertDescription>
                Creating a permission grants nothing by itself. The API must check this slug before
                it has any effect.
              </AlertDescription>
            </Alert>
          )}
          {serverError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" loading={mutation.isPending}>
              {isEdit ? 'Save changes' : 'Create permission'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
PermissionFormDialog.displayName = 'PermissionFormDialog';
