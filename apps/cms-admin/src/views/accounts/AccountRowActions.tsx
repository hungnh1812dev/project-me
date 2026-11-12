import { Button, useToast, type ToastTone } from '@abyss/form-commons';
import { API_ERROR_CODES } from '@configs/Http.constants';
import { useScreenText } from '@configs/locales';
import type { Account } from '@features/access/Access.api';
import { toAccessError } from '@features/access/Access.errors';
import { ACCESS_QUERY_KEYS } from '@features/access/Access.queries';
import { useAccessApi } from '@features/access/AccessApi.context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const ROW_TOAST_KEY = 'account-row-action';

/**
 * Enable and Resend invite of one account row. Neither asks for
 * confirmation: both are reversible and mail nothing destructive.
 * Disable stays a dialog on the page.
 */
export function AccountRowActions({
  account,
  canEnable,
  canResend,
}: {
  account: Account;
  canEnable: boolean;
  canResend: boolean;
}) {
  const access = useScreenText('access');
  const copy = access.access.accounts;
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const notify = (tone: ToastTone, title: string) => showToast({ tone, title, key: ROW_TOAST_KEY });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEYS.accounts });

  const enable = useMutation({
    mutationFn: () => api.enableAccount(account.id),
    onSuccess: () => {
      void refresh();
      notify('success', copy.enabled(account.displayName));
    },
    onError: (cause) => {
      const error = toAccessError(cause, access);
      if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_DISABLED) {
        void refresh();
        notify('info', copy.alreadyEnabled);
      } else if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_FOUND) {
        void refresh();
        notify('info', copy.gone);
      } else {
        notify(error.tone, error.message);
      }
    },
  });

  const resend = useMutation({
    mutationFn: () => api.resendInvite(account.id),
    onSuccess: (result) => {
      if (result.invitationSent) notify('success', copy.resent);
      else notify('warning', copy.resentNoEmail);
    },
    onError: (cause) => {
      const error = toAccessError(cause, access);
      if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_INVITED) {
        void refresh();
        notify('info', copy.notInvited);
      } else if (error.errorCode === API_ERROR_CODES.ACCOUNT_NOT_FOUND) {
        void refresh();
        notify('info', copy.gone);
      } else {
        notify(error.tone, error.message);
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
