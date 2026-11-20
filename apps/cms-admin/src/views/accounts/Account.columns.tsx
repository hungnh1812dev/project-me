import { Button, type SheetColumn } from '@abyss/form-commons';
import type { ScreenText } from '@configs/locales';
import type { Account } from '@features/access/Access.api';
import { formatDate } from '@utils/DateFormat.rules';

import { AccountRowActions } from './AccountRowActions';

const STATUS_CLASS: Record<Account['status'], string> = {
  invited: 'bg-info-soft text-info-strong border border-border/40',
  active: 'bg-success-soft text-success-strong border border-border/40',
  disabled: 'bg-muted text-muted-foreground border border-border/40',
};

interface AccountColumnsOptions {
  currentUserId: string | undefined;
  showActions: boolean;
  canEnable: boolean;
  canResend: boolean;
  text: ScreenText<'access'>;
  onDisable: (account: Account, opener: HTMLElement) => void;
}

/** The actions column exists only for actors who may invite or disable. */
export function accountColumns({
  currentUserId,
  showActions,
  canEnable,
  canResend,
  text,
  onDisable,
}: AccountColumnsOptions): SheetColumn<Account>[] {
  const copy = text.access.accounts;
  const actionsColumn: SheetColumn<Account> = {
    key: 'actions',
    header: <span className="sr-only">{copy.columns.actions}</span>,
    align: 'right',
    renderCell: (account) => (
      <>
        <AccountRowActions account={account} canEnable={canEnable} canResend={canResend} />
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
          <span className="font-semibold text-foreground">{account.displayName}</span>
          {account.id === currentUserId ? (
            <span className="ml-2 rounded-control bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {copy.you}
            </span>
          ) : null}
          <span className="block text-xs font-normal text-muted-foreground">{account.email}</span>
        </>
      ),
    },
    {
      key: 'role',
      header: copy.columns.role,
      renderCell: (account) => (
        <span className="inline-flex items-center rounded-control bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground">
          {account.role.name}
        </span>
      ),
    },
    {
      key: 'status',
      header: copy.columns.status,
      renderCell: (account) => (
        <span
          className={`inline-flex items-center rounded-control px-2.5 py-0.5 text-xs font-medium tracking-wide shadow-xs ${STATUS_CLASS[account.status]}`}
        >
          {copy.status[account.status]}
        </span>
      ),
    },
    {
      key: 'twoFactor',
      header: copy.columns.twoFactor,
      renderCell: (account) => (account.twoFactorEnabled ? copy.twoFactorOn : copy.twoFactorOff),
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
