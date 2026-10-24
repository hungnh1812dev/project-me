import { Button, FormAlert, type FormAlertTone } from '@abyss/form-commons';
import { useRef, useState } from 'react';

import { useClampedPage } from '../../components/use-clamped-page';
import { useRestoreFocus } from '../../components/use-restore-focus';
import { formatDate } from '../../lib/date-format';

import { COPY } from '../../config/copy.constants';
import { useCurrentUser } from '../auth';
import type { ApiToken } from './access.api';
import { isForbidden } from './access-error';
import { useApiTokensQuery } from './access-queries';
import { useCallerAccess } from './caller-access';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { Pagination } from '../../components/Pagination';
import { RevokeTokenDialog, type RevokeOutcome } from './RevokeTokenDialog';
import { scopeSummary } from './token-scope';
import {
  TokenFormDialog,
  type TokenDialogOutcome,
  type TokenDialogTarget,
} from './TokenFormDialog';

const copy = COPY.access.apiTokens;
const matrixCopy = COPY.access.matrix;

const STATUS_CLASS: Record<ApiToken['status'], string> = {
  active: 'bg-success-soft text-success-strong',
  expired: 'bg-warning-soft text-warning-strong',
  revoked: 'bg-muted text-muted-foreground',
};

interface Notice {
  tone: FormAlertTone;
  message: string;
}

function accessText(token: ApiToken): string {
  const { permissions, subjects } = scopeSummary(token.scope.permissions);
  if (permissions === 0) return copy.noAccess;
  const names = subjects.map((subject) =>
    subject === '*' ? matrixCopy.wildcard : subject,
  );
  return copy.access(permissions, names.join(', '));
}

/** `/api-tokens` (T19): who may call the API with a key, and what each key may do. */
export function ApiTokensPage() {
  const [page, setPage] = useState(1);
  const tokens = useApiTokensQuery(page);
  const caller = useCallerAccess();
  const me = useCurrentUser();
  const [dialog, setDialog] = useState<TokenDialogTarget | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const { rememberOpener, restoreFocus } = useRestoreFocus(headingRef);

  const canCreate = caller.ready && caller.can('api_tokens', 'create');
  const canChange = caller.ready && caller.can('api_tokens', 'update');

  const meta = tokens.data?.meta;
  const lastPage = useClampedPage(page, setPage, meta);

  const open = (event: { currentTarget: HTMLElement }, next: () => void) => {
    rememberOpener(event.currentTarget);
    setNotice(null);
    next();
  };

  const onFormDone = (outcome: TokenDialogOutcome) => {
    setDialog(null);
    switch (outcome.kind) {
      case 'created':
        setNotice({ tone: 'success', message: copy.created(outcome.name) });
        break;
      case 'updated':
        setNotice({ tone: 'success', message: copy.updated(outcome.name) });
        break;
      case 'revoked-meanwhile':
        setNotice({ tone: 'info', message: copy.alreadyRevoked });
        break;
      case 'gone':
        setNotice({ tone: 'info', message: copy.gone });
        break;
    }
  };

  const onRevoked = (token: ApiToken, outcome: RevokeOutcome) => {
    setRevoking(null);
    if (outcome === 'gone') rememberOpener(null);
    setNotice(
      outcome === 'revoked'
        ? { tone: 'success', message: copy.revoked(token.name) }
        : {
            tone: 'info',
            message: outcome === 'gone' ? copy.gone : copy.alreadyRevoked,
          },
    );
  };

  const rows = tokens.data?.data ?? [];
  const showCreator = rows.some((token) => token.createdBy.id !== me?.id);
  const showActions = canChange;

  return (
    <div ref={headingRef} className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        action={
          canCreate ? (
            <Button
              type="button"
              variant="primary"
              onClick={(event) =>
                open(event, () => setDialog({ mode: 'create' }))
              }
            >
              {copy.create}
            </Button>
          ) : null
        }
      />
      {notice === null ? null : (
        <FormAlert tone={notice.tone}>{notice.message}</FormAlert>
      )}
      {tokens.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : tokens.isError ? (
        isForbidden(tokens.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            retrying={tokens.isFetching}
            onRetry={() => void tokens.refetch()}
          />
        )
      ) : page > lastPage ? (
        <TableSkeleton label={copy.loading} />
      ) : rows.length === 0 ? (
        <div className="grid justify-items-start gap-1">
          <p className="m-0 font-medium">{copy.empty}</p>
          <p className="m-0 text-sm text-muted-foreground">
            {canCreate ? copy.emptyHint : copy.emptyHintReadOnly}
          </p>
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
                  {copy.columns.access}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.status}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.expires}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.lastUsed}
                </th>
                {showCreator ? (
                  <th scope="col" className="px-3 py-2 font-medium">
                    {copy.columns.createdBy}
                  </th>
                ) : null}
                {showActions ? (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">{copy.columns.actions}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((token) => {
                const changeable = canChange && token.status !== 'revoked';
                return (
                  <tr key={token.id} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="font-medium">{token.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {token.tokenPrefix}&hellip;
                      </span>
                    </th>
                    <td
                      className="max-w-64 px-3 py-2 text-muted-foreground"
                      title={accessText(token)}
                    >
                      <span className="line-clamp-2">{accessText(token)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[token.status]}`}
                      >
                        {copy.status[token.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {token.expiresAt === null
                        ? copy.noExpiry
                        : formatDate(token.expiresAt)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {token.lastUsedAt === null
                        ? copy.neverUsed
                        : formatDate(token.lastUsedAt)}
                    </td>
                    {showCreator ? (
                      <td className="px-3 py-2 text-muted-foreground">
                        {token.createdBy.displayName}
                        {token.createdBy.id === me?.id ? (
                          <span className="ml-2 text-xs">{copy.you}</span>
                        ) : null}
                      </td>
                    ) : null}
                    {showActions ? (
                      <td className="px-3 py-2 text-right">
                        {changeable ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={copy.editLabel(token.name)}
                              onClick={(event) =>
                                open(event, () =>
                                  setDialog({ mode: 'edit', token }),
                                )
                              }
                            >
                              {copy.edit}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={copy.revokeLabel(token.name)}
                              onClick={(event) =>
                                open(event, () => setRevoking(token))
                              }
                            >
                              {copy.revoke}
                            </Button>
                          </>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tokens.data === undefined ? null : (
            <Pagination
              meta={tokens.data.meta}
              count={rows.length}
              onPage={setPage}
              copy={copy.pagination}
            />
          )}
        </div>
      )}
      <TokenFormDialog
        target={dialog}
        onClose={() => setDialog(null)}
        onDone={onFormDone}
        onCloseAutoFocus={restoreFocus}
      />
      <RevokeTokenDialog
        token={revoking}
        onClose={() => setRevoking(null)}
        onDone={onRevoked}
        onCloseAutoFocus={restoreFocus}
      />
    </div>
  );
}
