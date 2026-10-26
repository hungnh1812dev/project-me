import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { COPY } from '../../config/Copy.constants';
import {
  API_ERROR_CODES,
  API_TOKEN_LIMITS,
  HTTP_STATUS,
} from '../../config/Http.constants';
import type { ApiToken, UpdateApiTokenInput } from './access.api';
import { useAccessApi } from './access-api-context';
import { toAccessError } from './access-error';
import { ACCESS_QUERY_KEYS } from './access-queries';
import { cellIssues, cellsAt, type CellRef } from './permission-matrix';
import { expiryIso, localDateOf } from './token-expiry';
import {
  sameScopeEntries,
  serializeScope,
  type ScopeState,
  type SerializedScope,
} from './token-scope';

const copy = COPY.access.tokenForm;

export type TokenDialogOutcome =
  | { kind: 'created'; name: string }
  | { kind: 'updated'; name: string }
  | { kind: 'revoked-meanwhile' }
  | { kind: 'expired-meanwhile' }
  | { kind: 'gone' };

export interface TokenFormValues {
  name: string;
  expiresOn: string;
}

interface CreatedToken {
  name: string;
  token: string;
}

interface UseTokenSubmitOptions {
  /** The token being edited, or null when creating. */
  editing: ApiToken | null;
  form: UseFormReturn<TokenFormValues>;
  scope: ScopeState;
  subjects: readonly string[];
  onClose: () => void;
  onDone: (outcome: TokenDialogOutcome) => void;
  onLockChange: (locked: boolean) => void;
}

/** Message when the scope cannot be sent, else null. */
function scopeProblemOf(entries: readonly unknown[]): string | null {
  if (entries.length === 0) return copy.validation.scopeRequired;
  if (entries.length > API_TOKEN_LIMITS.MAX_SCOPE_ENTRIES) {
    return copy.validation.scopeTooLong;
  }
  return null;
}

/**
 * Create or update mutation of the token form, with the mapping of every API
 * failure to a form alert, a field error or a dialog outcome.
 */
export function useTokenSubmit({
  editing,
  form,
  scope,
  subjects,
  onClose,
  onDone,
  onLockChange,
}: UseTokenSubmitOptions) {
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const initialEntries = editing?.scope.permissions;
  const initialExpiry = localDateOf(editing?.expiresAt ?? null);

  const [scopeError, setScopeError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<CreatedToken | null>(null);

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
      case API_ERROR_CODES.API_TOKEN_EXPIRED:
        void refresh();
        onDone({ kind: 'expired-meanwhile' });
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

  const submitCreate = (values: TokenFormValues, entries: SerializedScope) => {
    const expiresIso =
      values.expiresOn === '' ? null : expiryIso(values.expiresOn);
    onLockChange(true);
    create.mutate(
      {
        name: values.name.trim(),
        scope: { permissions: entries.entries },
        ...(expiresIso === null ? {} : { expiresAt: expiresIso }),
      },
      { onError: (cause) => fail(cause, entries.cells) },
    );
  };

  const submitUpdate = (
    current: ApiToken,
    values: TokenFormValues,
    serialized: SerializedScope,
  ) => {
    const name = values.name.trim();
    const input: UpdateApiTokenInput = {};
    if (name !== current.name) input.name = name;
    if (!sameScopeEntries(serialized.entries, initialEntries ?? [])) {
      input.scope = { permissions: serialized.entries };
    }
    if (values.expiresOn !== initialExpiry) {
      input.expiresAt =
        values.expiresOn === '' ? null : expiryIso(values.expiresOn);
    }
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    onLockChange(true);
    update.mutate(input, { onError: (cause) => fail(cause, serialized.cells) });
  };

  const submit = form.handleSubmit(
    (values) => {
      setAlert(null);
      setMarked(new Set());
      const serialized = serializeScope(scope, subjects);
      const problem = scopeProblemOf(serialized.entries);
      setScopeError(problem);
      if (problem !== null) return;
      if (editing === null) submitCreate(values, serialized);
      else submitUpdate(editing, values, serialized);
    },
    // Show the scope problem together with the field errors.
    () =>
      setScopeError(scopeProblemOf(serializeScope(scope, subjects).entries)),
  );

  const clearScopeMarks = () => {
    setScopeError(null);
    setMarked(new Set());
  };

  return {
    submit,
    pending: create.isPending || update.isPending,
    alert,
    scopeError,
    marked,
    created,
    clearScopeMarks,
  };
}
