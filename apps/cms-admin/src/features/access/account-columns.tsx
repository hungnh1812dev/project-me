import { Button, type SheetColumn } from '@abyss/form-commons';

import { COPY } from '../../config/Copy.constants';
import { formatDate } from '../../lib/DateFormat.rules';
import type { Account } from './access.api';
import { AccountRowActions, type RowNotice } from './AccountRowActions';

const copy = COPY.access.accounts;

const STATUS_CLASS: Record<Account['status'], string> = {
  invited: 'bg-info-soft text-info-strong',
  active: 'bg-success-soft text-success-strong',
  disabled: 'bg-muted text-muted-foreground',
};

interface AccountColumnsOptions {
  currentUserId: string | undefined;
  showActions: boolean;
  canEnable: boolean;
  canResend: boolean;
  onNotice: (notice: RowNotice) => void;
  onDisable: (account: Account, opener: HTMLElement) => void;
}

/** The actions column exists only for actors who may invite or disable. */
export function accountColumns({
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
