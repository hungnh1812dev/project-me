import {
  Button,
  FormAlert,
  type FormAlertTone,
  type SheetColumn,
  SortableSheet,
} from '@abyss/form-commons';
import { useRef, useState } from 'react';

import { useClampedPage } from '../../components/use-clamped-page';
import { useRestoreFocus } from '../../components/use-restore-focus';
import { formatDate } from '../../lib/date-format';

import { COPY } from '../../config/copy.constants';
import { useCurrentUser } from '../auth';
import type { Account, InvitedAccount } from './access.api';
import { isForbidden } from './access-error';
import { AccountRowActions } from './AccountRowActions';
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

  const columns = accountColumns({
    currentUserId: me?.id,
    showActions,
    canEnable: canDisable,
    canResend: canInvite,
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

interface AccountColumnsOptions {
  currentUserId: string | undefined;
  showActions: boolean;
  canEnable: boolean;
  canResend: boolean;
  onNotice: (notice: Notice) => void;
  onDisable: (account: Account, opener: HTMLElement) => void;
}

/** The actions column exists only for actors who may invite or disable. */
function accountColumns({
  currentUserId,
  showActions,
  canEnable,
  canResend,
  onNotice,
  onDisable,
}: AccountColumnsOptions): SheetColumn<Account>[] {
  const actionsColumn: SheetColumn<Account> = {
    key: 'actions',
    header: <span className="sr-only">{copy.columns.actions}</span>,
    align: 'right',
    renderCell: (account) => (
      <>
        <AccountRowActions
          account={account}
          canEnable={canEnable}
          canResend={canResend}
          onNotice={onNotice}
        />
        {canEnable && account.manageable && account.status !== 'disabled' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={copy.disableLabel(account.displayName)}
            onClick={(event) => onDisable(account, event.currentTarget)}
          >
            {copy.disable}
          </Button>
        ) : null}
      </>
    ),
  };

  return [
    {
      key: 'name',
      header: copy.columns.name,
      rowHeader: true,
      renderCell: (account) => (
        <>
          <span className="font-medium">{account.displayName}</span>
          {account.id === currentUserId ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {copy.you}
            </span>
          ) : null}
          <span className="block font-normal text-muted-foreground">
            {account.email}
          </span>
        </>
      ),
    },
    {
      key: 'role',
      header: copy.columns.role,
      renderCell: (account) => (
        <span className="text-foreground">{account.role.name}</span>
      ),
    },
    {
      key: 'status',
      header: copy.columns.status,
      renderCell: (account) => (
        <span
          className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[account.status]}`}
        >
          {copy.status[account.status]}
        </span>
      ),
    },
    {
      key: 'twoFactor',
      header: copy.columns.twoFactor,
      renderCell: (account) =>
        account.twoFactorEnabled ? copy.twoFactorOn : copy.twoFactorOff,
    },
    {
      key: 'created',
      header: copy.columns.created,
      renderCell: (account) => (
        <span className="tabular-nums">{formatDate(account.createdAt)}</span>
      ),
    },
    ...(showActions ? [actionsColumn] : []),
  ];
}
