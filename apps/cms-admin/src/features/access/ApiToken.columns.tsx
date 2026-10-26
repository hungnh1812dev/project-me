import { Button, type SheetColumn } from '@abyss/form-commons';

import { COPY } from '../../config/Copy.constants';
import { formatDate } from '../../lib/DateFormat.rules';
import type { ApiToken } from './Access.api';
import { scopeSummary } from './TokenScope.rules';

const copy = COPY.access.apiTokens;
const matrixCopy = COPY.access.matrix;

const STATUS_CLASS: Record<ApiToken['status'], string> = {
  active: 'bg-success-soft text-success-strong',
  expired: 'bg-warning-soft text-warning-strong',
  revoked: 'bg-muted text-muted-foreground',
};

function accessText(token: ApiToken): string {
  const { permissions, subjects } = scopeSummary(token.scope.permissions);
  if (permissions === 0) return copy.noAccess;
  const names = subjects.map((subject) =>
    subject === '*' ? matrixCopy.wildcard : subject,
  );
  return copy.access(permissions, names.join(', '));
}

interface ApiTokenColumnsOptions {
  currentUserId: string | undefined;
  showCreator: boolean;
  canChange: boolean;
  onEdit: (token: ApiToken, opener: HTMLElement) => void;
  onRevoke: (token: ApiToken, opener: HTMLElement) => void;
}

/**
 * The creator column shows only when someone else made a listed token; the
 * actions column only for actors who may change tokens, and per row only while
 * a token can still be changed: only active
 * tokens are editable, an expired one can only be revoked. Only the token prefix is ever shown.
 */
export function apiTokenColumns({
  currentUserId,
  showCreator,
  canChange,
  onEdit,
  onRevoke,
}: ApiTokenColumnsOptions): SheetColumn<ApiToken>[] {
  const creatorColumn: SheetColumn<ApiToken> = {
    key: 'createdBy',
    header: copy.columns.createdBy,
    renderCell: (token) => (
      <>
        {token.createdBy.displayName}
        {token.createdBy.id === currentUserId ? (
          <span className="ml-2 text-xs">{copy.you}</span>
        ) : null}
      </>
    ),
  };
  const actionsColumn: SheetColumn<ApiToken> = {
    key: 'actions',
    header: <span className="sr-only">{copy.columns.actions}</span>,
    align: 'right',
    renderCell: (token) =>
      token.status === 'revoked' ? null : (
        <>
          {token.status === 'active' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={copy.editLabel(token.name)}
              onClick={(event) => onEdit(token, event.currentTarget)}
            >
              {copy.edit}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={copy.revokeLabel(token.name)}
            onClick={(event) => onRevoke(token, event.currentTarget)}
          >
            {copy.revoke}
          </Button>
        </>
      ),
  };

  return [
    {
      key: 'name',
      header: copy.columns.name,
      rowHeader: true,
      renderCell: (token) => (
        <>
          <span className="font-medium">{token.name}</span>
          <span className="block font-mono text-xs font-normal text-muted-foreground">
            {token.tokenPrefix}&hellip;
          </span>
        </>
      ),
    },
    {
      key: 'access',
      header: copy.columns.access,
      renderCell: (token) => (
        <span className="line-clamp-2 max-w-64" title={accessText(token)}>
          {accessText(token)}
        </span>
      ),
    },
    {
      key: 'status',
      header: copy.columns.status,
      renderCell: (token) => (
        <span
          className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[token.status]}`}
        >
          {copy.status[token.status]}
        </span>
      ),
    },
    {
      key: 'expires',
      header: copy.columns.expires,
      renderCell: (token) => (
        <span className="tabular-nums">
          {token.expiresAt === null
            ? copy.noExpiry
            : formatDate(token.expiresAt)}
        </span>
      ),
    },
    {
      key: 'lastUsed',
      header: copy.columns.lastUsed,
      renderCell: (token) => (
        <span className="tabular-nums">
          {token.lastUsedAt === null
            ? copy.neverUsed
            : formatDate(token.lastUsedAt)}
        </span>
      ),
    },
    ...(showCreator ? [creatorColumn] : []),
    ...(canChange ? [actionsColumn] : []),
  ];
}
