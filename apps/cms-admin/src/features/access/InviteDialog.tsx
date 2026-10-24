import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectInput,
  TextInput,
  FormAlert,
} from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  ACCOUNT_LIMITS,
  OWNER_ROLE_SLUG,
  UNASSIGNABLE_ROLE_SLUGS,
} from '../../config/access.constants';
import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES } from '../../config/http.constants';
import type { InvitedAccount, Role } from './access.api';
import { useAccessApi } from './access-api-context';
import { toAccessError } from './access-error';
import { ACCESS_QUERY_KEYS } from './access-queries';

const copy = COPY.access.invite;

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, copy.validation.emailRequired)
    .max(ACCOUNT_LIMITS.EMAIL_MAX_LENGTH, copy.validation.emailTooLong)
    .pipe(z.email(copy.validation.emailInvalid)),
  displayName: z
    .string()
    .trim()
    .min(1, copy.validation.displayNameRequired)
    .max(
      ACCOUNT_LIMITS.DISPLAY_NAME_MAX_LENGTH,
      copy.validation.displayNameTooLong,
    ),
  roleId: z.string().min(1, copy.validation.roleRequired),
});
type InviteValues = z.input<typeof inviteSchema>;

/** Roles the caller may give to a new account (rank rule, not public/reviewer/owner). */
export function assignableRoles(roles: readonly Role[]): Role[] {
  return roles.filter(
    (role) =>
      role.manageable &&
      role.slug !== OWNER_ROLE_SLUG &&
      !UNASSIGNABLE_ROLE_SLUGS.includes(role.slug),
  );
}

/**
 * Invite dialog (T18). Roles come from the roles list the page already
 * loaded; the server re-checks rank and assignability.
 */
export function InviteDialog({
  open,
  onOpenChange,
  roles,
  onInvited,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: readonly Role[] | undefined;
  onInvited: (account: InvitedAccount) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<string | null>(null);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', displayName: '', roleId: '' },
    mode: 'onTouched',
  });

  const invite = useMutation({
    mutationFn: api.inviteAccount,
    onSuccess: (account) => {
      void queryClient.invalidateQueries({
        queryKey: ACCESS_QUERY_KEYS.accounts,
      });
      void queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.roles });
      form.reset();
      setAlert(null);
      onInvited(account);
    },
    onError: (cause) => {
      const error = toAccessError(cause);
      if (error.errorCode === API_ERROR_CODES.ACCOUNT_EMAIL_TAKEN) {
        form.setError('email', { message: copy.errors.emailTaken });
        form.setFocus('email');
        setAlert(null);
      } else if (error.errorCode === API_ERROR_CODES.ROLE_NOT_ASSIGNABLE) {
        form.setError('roleId', { message: copy.errors.roleNotAssignable });
        setAlert(null);
      } else if (error.errorCode === API_ERROR_CODES.ACCESS_INVALID_REQUEST) {
        setAlert(copy.errors.invalid);
      } else {
        setAlert(error.message);
      }
    },
  });

  const options = assignableRoles(roles ?? []).map((role) => ({
    value: role.id,
    label: role.name,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (invite.isPending) return;
        if (!next) {
          form.reset();
          setAlert(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) => {
              void form.handleSubmit((values) => {
                setAlert(null);
                invite.mutate({
                  email: values.email.trim(),
                  displayName: values.displayName.trim(),
                  roleId: values.roleId,
                });
              })(event);
            }}
          >
            {alert === null ? null : (
              <FormAlert tone="error">{alert}</FormAlert>
            )}
            <TextInput<InviteValues>
              name="email"
              label={copy.emailLabel}
              type="email"
              autoComplete="off"
              required
            />
            <TextInput<InviteValues>
              name="displayName"
              label={copy.displayNameLabel}
              description={copy.displayNameHint}
              autoComplete="off"
              required
            />
            <SelectInput<InviteValues>
              name="roleId"
              label={copy.roleLabel}
              description={copy.roleHint}
              placeholder={copy.rolePlaceholder}
              options={options}
              required
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" disabled={invite.isPending}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                loading={invite.isPending}
              >
                {copy.submit}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
