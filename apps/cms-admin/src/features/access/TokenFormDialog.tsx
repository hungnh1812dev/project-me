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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  API_TOKEN_LIMITS,
  type PermissionAction,
} from '../../config/access.constants';
import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/http.constants';
import type { ApiToken, UpdateApiTokenInput } from './access.api';
import { useAccessApi } from './access-api-context';
import { toAccessError } from './access-error';
import { ACCESS_QUERY_KEYS, useContentTypesQuery } from './access-queries';
import { useCallerAccess } from './caller-access';
import { LoadError } from './PageStates';
import { cellIssues, cellsAt, type CellRef } from './permission-matrix';
import { endOfDay, expiryIso, localDateOf } from './token-expiry';
import {
  sameScopeEntries,
  scopeFromEntries,
  scopeSubjectOrder,
  type ScopeState,
  serializeScope,
} from './token-scope';
import { TokenReveal } from './TokenReveal';
import { TokenScopeEditor } from './TokenScopeEditor';

const copy = COPY.access.tokenForm;

export type TokenDialogTarget =
  { mode: 'create' } | { mode: 'edit'; token: ApiToken };

export type TokenDialogOutcome =
  | { kind: 'created'; name: string }
  | { kind: 'updated'; name: string }
  | { kind: 'revoked-meanwhile' }
  | { kind: 'gone' };

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
 * Create or edit an API token (T19). Creating switches the same dialog to
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
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const contentTypes = useContentTypesQuery();
  const editing = target.mode === 'edit' ? target.token : null;
  const initialEntries = editing?.scope.permissions;
  const initialExpiry = localDateOf(editing?.expiresAt ?? null);

  const [scope, setScope] = useState<ScopeState>(() =>
    scopeFromEntries(initialEntries ?? []),
  );
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<{
    name: string;
    token: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: editing?.name ?? '', expiresOn: initialExpiry },
    mode: 'onTouched',
  });

  const slugs = (contentTypes.data ?? []).map((type) => type.slug);
  const subjects = scopeSubjectOrder(scope, slugs);

  const canGrant = (subject: string, action: PermissionAction) =>
    caller.isOwner ||
    caller.can(subject, action) ||
    (subject !== '*' && caller.can('*', action));

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.apiTokens });

  const fail = (cause: unknown, cells: readonly CellRef[]) => {
    const error = toAccessError(cause);
    onLockChange(false);
    switch (error.errorCode) {
      case API_ERROR_CODES.API_TOKEN_NOT_FOUND:
        void refresh();
        onDone({ kind: 'gone' });
        return;
      case API_ERROR_CODES.API_TOKEN_REVOKED:
        void refresh();
        onDone({ kind: 'revoked-meanwhile' });
        return;
      case API_ERROR_CODES.API_TOKEN_SCOPE_NOT_HELD:
        setMarked(cellsAt(error.indexes, cells));
        setAlert(error.message);
        return;
      default: {
        if (error.status !== HTTP_STATUS.BAD_REQUEST) {
          setAlert(error.message);
          return;
        }
        // 400: bad body, scope or expiry; issue paths name the request body.
        const expiry = error.issues.find((i) => i.path[0] === 'expiresAt');
        if (expiry !== undefined) {
          form.setError('expiresOn', { message: expiry.message });
        }
        const scopeIssues = error.issues
          .filter((i) => i.path[0] === 'permissions')
          .map((i) => ({ ...i, path: i.path.slice(1) }));
        setMarked(new Set(cellIssues(scopeIssues, cells).keys()));
        setAlert(copy.errors.invalid);
      }
    }
  };

  const create = useMutation({
    // The answer holds the raw token: do not keep it in the mutation cache.
    gcTime: 0,
    mutationFn: api.createApiToken,
    onSuccess: (token) => {
      void refresh();
      setCreated({ name: token.name, token: token.token });
      onLockChange(true);
    },
  });

  const update = useMutation({
    mutationFn: (input: UpdateApiTokenInput) =>
      api.updateApiToken(editing?.id ?? '', input),
    onSuccess: (token) => {
      void refresh();
      onLockChange(false);
      onDone({ kind: 'updated', name: token.name });
    },
  });

  const pending = create.isPending || update.isPending;

  /** Message when the scope cannot be sent, else null. */
  const scopeProblem = (entries: readonly unknown[]): string | null => {
    if (entries.length === 0) return copy.validation.scopeRequired;
    if (entries.length > API_TOKEN_LIMITS.MAX_SCOPE_ENTRIES) {
      return copy.validation.scopeTooLong;
    }
    return null;
  };

  const submit = form.handleSubmit(
    (values) => {
      setAlert(null);
      setMarked(new Set());
      const { entries, cells } = serializeScope(scope, subjects);
      const problem = scopeProblem(entries);
      setScopeError(problem);
      if (problem !== null) return;
      const name = values.name.trim();
      const expiresIso =
        values.expiresOn === '' ? null : expiryIso(values.expiresOn);

      if (editing === null) {
        onLockChange(true);
        create.mutate(
          {
            name,
            scope: { permissions: entries },
            ...(expiresIso === null ? {} : { expiresAt: expiresIso }),
          },
          { onError: (cause) => fail(cause, cells) },
        );
        return;
      }

      const input: UpdateApiTokenInput = {};
      if (name !== editing.name) input.name = name;
      if (!sameScopeEntries(entries, initialEntries ?? [])) {
        input.scope = { permissions: entries };
      }
      if (values.expiresOn !== initialExpiry) input.expiresAt = expiresIso;
      if (Object.keys(input).length === 0) {
        onClose();
        return;
      }
      onLockChange(true);
      update.mutate(input, { onError: (cause) => fail(cause, cells) });
    },
    // Show the scope problem together with the field errors.
    () => setScopeError(scopeProblem(serializeScope(scope, subjects).entries)),
  );

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
                retrying={contentTypes.isFetching}
                onRetry={() => void contentTypes.refetch()}
              />
            ) : (
              <TokenScopeEditor
                state={scope}
                onChange={(change) => {
                  setScope(change);
                  setScopeError(null);
                  setMarked(new Set());
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
