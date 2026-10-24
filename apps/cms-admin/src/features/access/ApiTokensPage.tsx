import {
  Button,
  FormAlert,
  type FormAlertTone,
  SortableSheet,
} from '@abyss/form-commons';
import { useRef, useState } from 'react';

import { useClampedPage } from '../../components/use-clamped-page';
import { useRestoreFocus } from '../../components/use-restore-focus';

import { COPY } from '../../config/copy.constants';
import { useCurrentUser } from '../auth';
import type { ApiToken } from './access.api';
import { apiTokenColumns } from './api-token-columns';
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
import {
  TokenFormDialog,
  type TokenDialogOutcome,
  type TokenDialogTarget,
} from './TokenFormDialog';

const copy = COPY.access.apiTokens;

interface Notice {
  tone: FormAlertTone;
  message: string;
}

/** `/api-tokens`: who may call the API with a key, and what each key may do. */
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

  const canCreate = caller.isReady && caller.can('api_tokens', 'create');
  const canChange = caller.isReady && caller.can('api_tokens', 'update');

  const meta = tokens.data?.meta;
  const lastPage = useClampedPage(page, setPage, meta);

  const open = (opener: HTMLElement, next: () => void) => {
    rememberOpener(opener);
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
  const columns = apiTokenColumns({
    currentUserId: me?.id,
    showCreator,
    canChange,
    onEdit: (token, opener) =>
      open(opener, () => setDialog({ mode: 'edit', token })),
    onRevoke: (token, opener) => open(opener, () => setRevoking(token)),
  });

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
                open(event.currentTarget, () => setDialog({ mode: 'create' }))
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
            isRetrying={tokens.isFetching}
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
          <SortableSheet
            className="rounded-none border-0"
            caption={copy.tableLabel}
            columns={columns}
            rows={rows}
            getRowId={(token) => token.id}
            getRowLabel={(token) => token.name}
          />
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
