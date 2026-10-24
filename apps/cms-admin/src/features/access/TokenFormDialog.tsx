import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextInput,
  FormAlert,
} from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { type PermissionAction } from './access.constants';
import { COPY } from '../../config/copy.constants';
import { API_TOKEN_LIMITS } from '../../config/http.constants';
import type { ApiToken } from './access.api';
import { useContentTypesQuery } from './access-queries';
import { useCallerAccess } from './caller-access';
import { LoadError } from '../../components/PageStates';
import { endOfDay, localDateOf } from './token-expiry';
import {
  scopeFromEntries,
  scopeSubjectOrder,
  type ScopeState,
} from './token-scope';
import { TokenReveal } from './TokenReveal';
import { TokenScopeEditor } from './TokenScopeEditor';
import { type TokenDialogOutcome, useTokenSubmit } from './use-token-submit';

export type { TokenDialogOutcome } from './use-token-submit';

const copy = COPY.access.tokenForm;

export type TokenDialogTarget =
  { mode: 'create' } | { mode: 'edit'; token: ApiToken };

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, copy.validation.nameRequired)
    .max(API_TOKEN_LIMITS.NAME_MAX_LENGTH, copy.validation.nameTooLong),
  expiresOn: z.string().refine((value) => {
    if (value === '') return true;
    const end = endOfDay(value);
    return end === null || end.getTime() > Date.now();
  }, copy.validation.expiryPast),
});
type FormValues = z.input<typeof formSchema>;

/**
 * Create or edit an API token. Creating switches the same dialog to
 * the one-time token view; the raw token lives only in that view's state and
 * is gone when the dialog closes.
 */
export function TokenFormDialog({
  target,
  onClose,
  onDone,
  onCloseAutoFocus,
}: {
  target: TokenDialogTarget | null;
  onClose: () => void;
  onDone: (outcome: TokenDialogOutcome) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  // True while a request runs or the raw token is on screen: no way out then.
  const [locked, setLocked] = useState(false);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && !locked) onClose();
      }}
    >
      <DialogContent className="max-w-3xl" onCloseAutoFocus={onCloseAutoFocus}>
        {target === null ? null : (
          <TokenFormBody
            target={target}
            onClose={onClose}
            onDone={onDone}
            onLockChange={setLocked}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TokenFormBody({
  target,
  onClose,
  onDone,
  onLockChange,
}: {
  target: TokenDialogTarget;
  onClose: () => void;
  onDone: (outcome: TokenDialogOutcome) => void;
  onLockChange: (locked: boolean) => void;
}) {
  const caller = useCallerAccess();
  const contentTypes = useContentTypesQuery();
  const editing = target.mode === 'edit' ? target.token : null;

  const [scope, setScope] = useState<ScopeState>(() =>
    scopeFromEntries(editing?.scope.permissions ?? []),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: editing?.name ?? '',
      expiresOn: localDateOf(editing?.expiresAt ?? null),
    },
    mode: 'onTouched',
  });

  const slugs = (contentTypes.data ?? []).map((type) => type.slug);
  const subjects = scopeSubjectOrder(scope, slugs);

  const canGrant = (subject: string, action: PermissionAction) =>
    caller.isOwner ||
    caller.can(subject, action) ||
    (subject !== '*' && caller.can('*', action));

  const {
    submit,
    pending,
    alert,
    scopeError,
    marked,
    created,
    clearScopeMarks,
  } = useTokenSubmit({
    editing,
    form,
    scope,
    subjects,
    onClose,
    onDone,
    onLockChange,
  });

  if (created !== null) {
    return (
      <TokenReveal
        name={created.name}
        token={created.token}
        onDone={() => {
          onLockChange(false);
          onDone({ kind: 'created', name: created.name });
        }}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editing === null ? copy.createTitle : copy.editTitle(editing.name)}
        </DialogTitle>
        <DialogDescription>
          {editing === null ? copy.createDescription : copy.editDescription}
        </DialogDescription>
      </DialogHeader>
      <FormProvider {...form}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => void submit(e)}
        >
          {alert === null ? null : <FormAlert tone="error">{alert}</FormAlert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput<FormValues>
              name="name"
              label={copy.nameLabel}
              description={copy.nameHint}
              autoComplete="off"
              required
            />
            <TextInput<FormValues>
              name="expiresOn"
              type="date"
              label={copy.expiresLabel}
              description={copy.expiresHint}
            />
          </div>
          <section aria-labelledby="token-scope-title" className="grid gap-2">
            <div className="grid gap-1">
              <h3 id="token-scope-title" className="m-0 text-sm font-semibold">
                {copy.scopeTitle}
              </h3>
              <p className="m-0 text-sm text-muted-foreground">
                {copy.scopeDescription}
              </p>
            </div>
            {contentTypes.isError ? (
              <LoadError
                message={COPY.access.role.contentTypesFailed}
                isRetrying={contentTypes.isFetching}
                onRetry={() => void contentTypes.refetch()}
              />
            ) : (
              <TokenScopeEditor
                state={scope}
                onChange={(change) => {
                  setScope(change);
                  clearScopeMarks();
                }}
                contentTypes={contentTypes.data ?? []}
                subjects={subjects}
                canGrant={canGrant}
                marked={marked}
              />
            )}
            {scopeError === null ? null : (
              <FormAlert tone="error">{scopeError}</FormAlert>
            )}
          </section>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" disabled={pending}>
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {editing === null ? copy.submitCreate : copy.submitEdit}
            </Button>
          </DialogFooter>
        </form>
      </FormProvider>
    </>
  );
}
