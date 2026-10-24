import { Button, type FormAlertTone } from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES } from '../../config/http.constants';
import type { Account } from './access.api';
import { useAccessApi } from './access-api-context';
import { toAccessError } from './access-error';
import { ACCESS_QUERY_KEYS } from './access-queries';

const copy = COPY.access.accounts;

export interface RowNotice {
  tone: FormAlertTone;
  message: string;
}

/**
 * Enable and Resend invite of one account row (T18a). Neither asks for
 * confirmation (Q13): both are reversible and mail nothing destructive.
 * Disable stays a dialog on the page.
 */
export function AccountRowActions({
  account,
  canEnable,
  canResend,
  onNotice,
}: {
  account: Account;
  canEnable: boolean;
  canResend: boolean;
  onNotice: (notice: RowNotice) => void;
}) {
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.accounts });

  const enable = useMutation({
    mutationFn: () => api.enableAccount(account.id),
    onSuccess: () => {
      void refresh();
      onNotice({ tone: 'success', message: copy.enabled(account.displayName) });
    },
    onError: (cause) => {
      const error = toAccessError(cause);
      if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_DISABLED) {
        void refresh();
        onNotice({ tone: 'info', message: copy.alreadyEnabled });
      } else if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_FOUND) {
        void refresh();
        onNotice({ tone: 'info', message: copy.gone });
      } else {
        onNotice({ tone: error.tone, message: error.message });
      }
    },
  });

  const resend = useMutation({
    mutationFn: () => api.resendInvite(account.id),
    onSuccess: (result) => {
      onNotice(
        result.invitationSent
          ? { tone: 'success', message: copy.resent(account.email) }
          : { tone: 'warning', message: copy.resentNoEmail(account.email) },
      );
    },
    onError: (cause) => {
      const error = toAccessError(cause);
      if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_INVITED) {
        void refresh();
        onNotice({ tone: 'info', message: copy.notInvited });
      } else if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_FOUND) {
        void refresh();
        onNotice({ tone: 'info', message: copy.gone });
      } else {
        onNotice({ tone: error.tone, message: error.message });
      }
    },
  });

  if (!account.manageable) return null;

  return (
    <>
      {canEnable && account.status === 'disabled' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={copy.enableLabel(account.displayName)}
          loading={enable.isPending}
          onClick={() => enable.mutate()}
        >
          {copy.enable}
        </Button>
      ) : null}
      {canResend && account.status === 'invited' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={copy.resendLabel(account.displayName)}
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {copy.resend}
        </Button>
      ) : null}
    </>
  );
}
