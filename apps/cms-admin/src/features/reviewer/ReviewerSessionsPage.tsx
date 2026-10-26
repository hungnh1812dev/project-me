import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
  FormAlert,
  type SheetColumn,
  SortableSheet,
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { COPY } from '../../config/Copy.constants';
import { REVIEWER_SETTINGS_SUBJECT } from './Reviewer.constants';
import { isForbidden, toAccessError, useCallerAccess } from '../access';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { Pagination } from '../../components/Pagination';
import { useClampedPage } from '../../components/useClampedPage';
import { formatDateTime } from '../../lib/DateFormat.rules';
import { useReviewerApi } from './ReviewerApi.context';
import {
  REVIEWER_QUERY_KEYS,
  useReviewerEnabledQuery,
  useReviewerSessionsQuery,
} from './Reviewer.queries';
import type { ReviewerSession } from './Reviewer.api';

const copy = COPY.reviewer;

const STATUS_CLASS = {
  active: 'bg-success-soft text-success-strong',
  ended: 'bg-muted text-muted-foreground',
} as const;

/** `/reviewer` (owner): the on/off switch and who asked for access. */
export function ReviewerSessionsPage() {
  const [page, setPage] = useState(1);
  const sessions = useReviewerSessionsQuery(page);

  useClampedPage(page, setPage, sessions.data?.meta);

  const rows = sessions.data?.data ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={copy.title} description={copy.description} />
      <AccessSwitch />
      {sessions.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : sessions.isError ? (
        isForbidden(sessions.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            isRetrying={sessions.isFetching}
            onRetry={() => void sessions.refetch()}
          />
        )
      ) : rows.length === 0 ? (
        <div className="grid justify-items-start gap-1">
          <p className="m-0 font-medium">{copy.empty}</p>
          <p className="m-0 text-sm text-muted-foreground">{copy.emptyHint}</p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-md border border-border bg-card">
          <SortableSheet
            className="rounded-none border-0"
            caption={copy.tableLabel}
            columns={SESSION_COLUMNS}
            rows={rows}
            getRowId={(session) => session.id}
            getRowLabel={(session) => session.visitorRole}
          />
          {sessions.data === undefined ? null : (
            <Pagination
              meta={sessions.data.meta}
              count={rows.length}
              onPage={setPage}
              copy={copy.pagination}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Notes and the browser string come from a visitor: shown as text, never HTML. */
const SESSION_COLUMNS: readonly SheetColumn<ReviewerSession>[] = [
  {
    key: 'visitor',
    header: copy.columns.visitor,
    rowHeader: true,
    renderCell: (session) => session.visitorRole,
  },
  {
    key: 'purposes',
    header: copy.columns.purposes,
    renderCell: (session) =>
      session.purposeTags.length === 0
        ? copy.noPurposes
        : session.purposeTags.join(', '),
  },
  {
    key: 'notes',
    header: copy.columns.notes,
    renderCell: (session) =>
      session.notes === null || session.notes === '' ? (
        <span className="text-muted-foreground">{copy.noNotes}</span>
      ) : (
        <span className="block max-w-72 whitespace-pre-wrap break-words text-foreground">
          {session.notes}
        </span>
      ),
  },
  {
    key: 'browser',
    header: copy.columns.browser,
    renderCell: (session) => (
      <span
        className="line-clamp-2 max-w-48 break-words"
        title={session.userAgent ?? undefined}
      >
        {session.userAgent ?? copy.noBrowser}
      </span>
    ),
  },
  {
    key: 'started',
    header: copy.columns.started,
    renderCell: (session) => (
      <span className="tabular-nums">{formatDateTime(session.createdAt)}</span>
    ),
  },
  {
    key: 'status',
    header: copy.columns.status,
    renderCell: (session) => {
      const status = session.active ? 'active' : 'ended';
      return (
        <>
          <span
            className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
          >
            {copy.status[status]}
          </span>
          {session.active ? (
            <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
              {copy.until(formatDateTime(session.expiresAt))}
            </span>
          ) : null}
        </>
      );
    },
  },
];

/** The owner's toggle. Switching off asks first: it ends live sessions. */
function AccessSwitch() {
  const api = useReviewerApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const enabled = useReviewerEnabledQuery();
  const labelId = useId();
  const [confirmOff, setConfirmOff] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const canChange =
    caller.isReady && caller.can(REVIEWER_SETTINGS_SUBJECT, 'update');

  const change = useMutation({
    mutationFn: api.setEnabled,
    onSuccess: async (next) => {
      setConfirmOff(false);
      setFailed(null);
      queryClient.setQueryData(REVIEWER_QUERY_KEYS.enabled, next);
      // Switching off ends sessions, so the log's "Active" column changed.
      await queryClient.invalidateQueries({
        queryKey: REVIEWER_QUERY_KEYS.sessions,
      });
    },
    onError: (cause) => {
      setConfirmOff(false);
      setFailed(
        isForbidden(cause) ? copy.forbidden : toAccessError(cause).message,
      );
    },
  });

  if (enabled.isPending) {
    return (
      <p className="m-0 text-sm text-muted-foreground">{copy.switch.loading}</p>
    );
  }
  if (enabled.isError) {
    return (
      <LoadError
        message={copy.switch.loadFailed}
        isRetrying={enabled.isFetching}
        onRetry={() => void enabled.refetch()}
      />
    );
  }

  const isOn = enabled.data;
  return (
    <section className="grid gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <Label id={labelId} htmlFor={`${labelId}-switch`}>
            {copy.switch.label}
          </Label>
          <p className="m-0 text-sm text-muted-foreground">
            {isOn ? copy.switch.onHint : copy.switch.offHint}
          </p>
        </div>
        <Switch
          id={`${labelId}-switch`}
          checked={isOn}
          disabled={!canChange || change.isPending}
          onCheckedChange={(next) => {
            setFailed(null);
            if (next) change.mutate(true);
            else setConfirmOff(true);
          }}
        />
      </div>
      {failed === null ? null : <FormAlert tone="error">{failed}</FormAlert>}
      <Dialog
        open={confirmOff}
        onOpenChange={(next) => {
          if (!next && !change.isPending) setConfirmOff(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.confirmOff.title}</DialogTitle>
            <DialogDescription>{copy.confirmOff.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" disabled={change.isPending}>
                {copy.confirmOff.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              loading={change.isPending}
              onClick={() => change.mutate(false)}
            >
              {copy.confirmOff.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
