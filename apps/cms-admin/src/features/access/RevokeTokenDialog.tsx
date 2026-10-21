import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES } from '../../config/http.constants';
import { FormAlert } from '../auth/FormAlert';
import type { ApiToken } from './access.api';
import { useAccessApi } from './access-api-context';
import { toAccessError } from './access-error';
import { ACCESS_QUERY_KEYS } from './access-queries';

const copy = COPY.access.revokeToken;

export type RevokeOutcome = 'revoked' | 'already-revoked' | 'gone';

/** Confirmation for revoking a token; the button names the token. */
export function RevokeTokenDialog({
  token,
  onClose,
  onDone,
  onCloseAutoFocus,
}: {
  token: ApiToken | null;
  onClose: () => void;
  onDone: (token: ApiToken, outcome: RevokeOutcome) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.apiTokens });

  const revoke = useMutation({
    mutationFn: (target: ApiToken) => api.revokeApiToken(target.id),
    onSuccess: (_data, target) => {
      void refresh();
      onDone(target, 'revoked');
    },
    onError: (cause, target) => {
      const error = toAccessError(cause);
      if (error.errorCode === API_ERROR_CODES.API_TOKEN_REVOKED) {
        void refresh();
        onDone(target, 'already-revoked');
      } else if (error.errorCode === API_ERROR_CODES.API_TOKEN_NOT_FOUND) {
        void refresh();
        onDone(target, 'gone');
      } else {
        setAlert(error.message);
      }
    },
  });

  return (
    <Dialog
      open={token !== null}
      onOpenChange={(next) => {
        if (next || revoke.isPending) return;
        setAlert(null);
        onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {token === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title(token.name)}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            {alert === null ? null : (
              <FormAlert tone="error">{alert}</FormAlert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" disabled={revoke.isPending}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                loading={revoke.isPending}
                onClick={() => {
                  setAlert(null);
                  revoke.mutate(token);
                }}
              >
                {copy.submit(token.name)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
