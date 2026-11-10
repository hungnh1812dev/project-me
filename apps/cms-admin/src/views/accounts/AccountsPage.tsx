import { useRef, useState } from 'react';
import { Button, Card, FormAlert, SortableSheet, type FormAlertTone } from '@abyss/form-commons';
import { EmptyState, LoadError, PageHeader, TableSkeleton } from '@components/PageStates';
import { Pagination } from '@components/Pagination';
import { useClampedPage } from '@components/useClampedPage';
import { useRestoreFocus } from '@components/useRestoreFocus';
import { useScreenText } from '@configs/locales';
import type { Account, InvitedAccount } from '@features/access/Access.api';
import { isForbidden } from '@features/access/Access.errors';
import { useAccountsQuery, useRolesQuery } from '@features/access/Access.queries';
import { useCallerAccess } from '@features/access/useCallerAccess';
import { useCurrentUser } from '@features/auth';

import { accountColumns } from './Account.columns';
import { DisableAccountDialog, type DisableOutcome } from './DisableAccountDialog';
import { InviteDialog } from './InviteDialog';

interface Notice {
  tone: FormAlertTone;
  message: string;
}

/** `/accounts`: who can sign in; invite and disable. */
export function AccountsPage() {
  const text = useScreenText('access');
  const copy = text.access.accounts;
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

  const canInvite = caller.isReady && caller.can('accounts', 'create');
  const canDisable = caller.isReady && caller.can('accounts', 'update');
  const showActions = canDisable || canInvite;

  const meta = accounts.data?.meta;
  const lastPage = useClampedPage(page, setPage, meta);

  const columns = accountColumns({
    currentUserId: me?.id,
    showActions,
    canEnable: canDisable,
    canResend: canInvite,
    text,
    onNotice: setNotice,
    onDisable: (account, opener) => {
      rememberOpener(opener);
      setNotice(null);
      setDisabling(account);
    },
  });

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
      {notice === null ? null : <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
      {accounts.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : accounts.isError ? (
        isForbidden(accounts.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            isRetrying={accounts.isFetching}
            onRetry={() => void accounts.refetch()}
          />
        )
      ) : page > lastPage ? (
        <TableSkeleton label={copy.loading} />
      ) : accounts.data.data.length === 0 ? (
        <EmptyState title={copy.empty} hint={copy.emptyHint} />
      ) : (
        <Card padding="flush" className="relative overflow-x-auto">
          <SortableSheet
            className="rounded-none border-0"
            caption={copy.tableLabel}
            columns={columns}
            rows={accounts.data.data}
            getRowId={(account) => account.id}
            getRowLabel={(account) => account.displayName}
          />
          <Pagination
            meta={accounts.data.meta}
            count={accounts.data.data.length}
            onPage={setPage}
            copy={copy.pagination}
          />
        </Card>
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
