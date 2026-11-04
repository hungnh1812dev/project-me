import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormAlert,
} from '@abyss/form-commons';
import { COPY } from '@configs/Copy.constants';
import { API_ERROR_CODES } from '@configs/Http.constants';
import type { Account } from '@features/access/Access.api';
import { toAccessError } from '@features/access/Access.errors';
import { ACCESS_QUERY_KEYS } from '@features/access/Access.queries';
import { useAccessApi } from '@features/access/AccessApi.context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const copy = COPY.access.disable;

export type DisableOutcome = 'disabled' | 'already-disabled' | 'gone';

/** Confirmation for disabling an account; the button names the account. */
export function DisableAccountDialog({
  account,
  onClose,
  onDone,
  onCloseAutoFocus,
}: {
  account: Account | null;
  onClose: () => void;
  onDone: (account: Account, outcome: DisableOutcome) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.accounts });

  const disable = useMutation({
    mutationFn: (target: Account) => api.disableAccount(target.id),
    onSuccess: (_data, target) => {
      void refresh();
      onDone(target, 'disabled');
    },
    onError: (cause, target) => {
      const error = toAccessError(cause, { access: COPY.access });
      if (error.errorCode === API_ERROR_CODES.ACCOUNT_ALREADY_DISABLED) {
        void refresh();
        onDone(target, 'already-disabled');
      } else if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_FOUND) {
        void refresh();
        onDone(target, 'gone');
      } else {
        setAlert(error.message);
      }
    },
  });

  return (
    <Dialog
      open={account !== null}
      onOpenChange={(next) => {
        if (next || disable.isPending) return;
        setAlert(null);
        onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {account === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title(account.displayName)}</DialogTitle>
              <DialogDescription>{copy.description(account.email)}</DialogDescription>
            </DialogHeader>
            {alert === null ? null : <FormAlert tone="error">{alert}</FormAlert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" disabled={disable.isPending}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                loading={disable.isPending}
                onClick={() => {
                  setAlert(null);
                  disable.mutate(account);
                }}
              >
                {copy.submit(account.displayName)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
