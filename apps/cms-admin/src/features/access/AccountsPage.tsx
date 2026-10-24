import { Button, FormAlert, type FormAlertTone } from '@abyss/form-commons';
import { useRef, useState } from 'react';

import { useClampedPage } from '../../components/use-clamped-page';
import { useRestoreFocus } from '../../components/use-restore-focus';
import { formatDate } from '../../lib/date-format';

import { COPY } from '../../config/copy.constants';
import { useCurrentUser } from '../auth';
import type { Account, InvitedAccount } from './access.api';
import { AccountRowActions } from './AccountRowActions';
import { isForbidden } from './access-error';
import { useAccountsQuery, useRolesQuery } from './access-queries';
import { useCallerAccess } from './caller-access';
import {
  DisableAccountDialog,
  type DisableOutcome,
} from './DisableAccountDialog';
import { InviteDialog } from './InviteDialog';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { Pagination } from '../../components/Pagination';

const copy = COPY.access.accounts;

const STATUS_CLASS: Record<Account['status'], string> = {
  invited: 'bg-info-soft text-info-strong',
  active: 'bg-success-soft text-success-strong',
  disabled: 'bg-muted text-muted-foreground',
};

interface Notice {
  tone: FormAlertTone;
  message: string;
}

/** `/accounts` (T18): who can sign in; invite and disable. */
export function AccountsPage() {
  const [page, setPage] = useState(1);
  const accounts = useAccountsQuery(page);
  const roles = useRolesQuery();
  const caller = useCallerAccess();
  const me = useCurrentUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [disabling, setDisabling] = useState<Account | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const { rememberOpener, restoreFocus } = useRestoreFocus(headingRef);

  const canInvite = caller.ready && caller.can('accounts', 'create');
  const canDisable = caller.ready && caller.can('accounts', 'update');
  const showActions = canDisable || canInvite;

  const meta = accounts.data?.meta;
  const lastPage = useClampedPage(page, setPage, meta);

  const onInvited = (account: InvitedAccount) => {
    setInviteOpen(false);
    setNotice(
      account.invitationSent
        ? { tone: 'success', message: copy.invited(account.email) }
        : { tone: 'warning', message: copy.invitedNoEmail(account.email) },
    );
  };

  const onDisabled = (account: Account, outcome: DisableOutcome) => {
    setDisabling(null);
    if (outcome === 'gone') rememberOpener(null);
    setNotice(
      outcome === 'disabled'
        ? { tone: 'success', message: copy.disabled(account.displayName) }
        : {
            tone: 'info',
            message: outcome === 'gone' ? copy.gone : copy.alreadyDisabled,
          },
    );
  };

  return (
    <div ref={headingRef} className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        action={
          canInvite ? (
            <Button
              type="button"
              variant="primary"
              onClick={(event) => {
                rememberOpener(event.currentTarget);
                setNotice(null);
                setInviteOpen(true);
              }}
            >
              {copy.invite}
            </Button>
          ) : null
        }
      />
      {notice === null ? null : (
        <FormAlert tone={notice.tone}>{notice.message}</FormAlert>
      )}
      {accounts.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : accounts.isError ? (
        isForbidden(accounts.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            retrying={accounts.isFetching}
            onRetry={() => void accounts.refetch()}
          />
        )
      ) : page > lastPage ? (
        <TableSkeleton label={copy.loading} />
      ) : accounts.data.data.length === 0 ? (
        <div className="grid justify-items-start gap-1">
          <p className="m-0 font-medium">{copy.empty}</p>
          <p className="m-0 text-sm text-muted-foreground">{copy.emptyHint}</p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{copy.tableLabel}</caption>
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.name}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.role}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.status}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.twoFactor}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.created}
                </th>
                {showActions ? (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">{copy.columns.actions}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {accounts.data.data.map((account) => (
                <tr key={account.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-medium">{account.displayName}</span>
                    {account.id === me?.id ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {copy.you}
                      </span>
                    ) : null}
                    <span className="block text-muted-foreground">
                      {account.email}
                    </span>
                  </th>
                  <td className="px-3 py-2">{account.role.name}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[account.status]}`}
                    >
                      {copy.status[account.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {account.twoFactorEnabled
                      ? copy.twoFactorOn
                      : copy.twoFactorOff}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDate(account.createdAt)}
                  </td>
                  {showActions ? (
                    <td className="px-3 py-2 text-right">
                      <AccountRowActions
                        account={account}
                        canEnable={canDisable}
                        canResend={canInvite}
                        onNotice={setNotice}
                      />
                      {canDisable &&
                      account.manageable &&
                      account.status !== 'disabled' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={copy.disableLabel(account.displayName)}
                          onClick={(event) => {
                            rememberOpener(event.currentTarget);
                            setNotice(null);
                            setDisabling(account);
                          }}
                        >
                          {copy.disable}
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            meta={accounts.data.meta}
            count={accounts.data.data.length}
            onPage={setPage}
            copy={copy.pagination}
          />
        </div>
      )}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles.data}
        onInvited={onInvited}
        onCloseAutoFocus={restoreFocus}
      />
      <DisableAccountDialog
        account={disabling}
        onClose={() => setDisabling(null)}
        onDone={onDisabled}
        onCloseAutoFocus={restoreFocus}
      />
    </div>
  );
}
