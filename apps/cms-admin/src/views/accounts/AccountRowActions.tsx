import { Button, type FormAlertTone } from '@abyss/form-commons';
import { API_ERROR_CODES } from '@configs/Http.constants';
import { useScreenText } from '@configs/locales';
import type { Account } from '@features/access/Access.api';
import { toAccessError } from '@features/access/Access.errors';
import { ACCESS_QUERY_KEYS } from '@features/access/Access.queries';
import { useAccessApi } from '@features/access/AccessApi.context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface RowNotice {
  tone: FormAlertTone;
  message: string;
}

/**
 * Enable and Resend invite of one account row. Neither asks for
 * confirmation: both are reversible and mail nothing destructive.
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
  const access = useScreenText('access');
  const copy = access.access.accounts;
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.accounts });

  const enable = useMutation({
    mutationFn: () => api.enableAccount(account.id),
    onSuccess: () => {
      void refresh();
      onNotice({ tone: 'success', message: copy.enabled(account.displayName) });
    },
    onError: (cause) => {
      const error = toAccessError(cause, access);
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
      const error = toAccessError(cause, access);
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
