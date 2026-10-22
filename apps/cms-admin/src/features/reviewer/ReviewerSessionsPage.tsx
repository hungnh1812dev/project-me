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
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { COPY } from '../../config/copy.constants';
import { REVIEWER_SETTINGS_SUBJECT } from '../../config/reviewer.constants';
import { isForbidden, toAccessError } from '../access/access-error';
import { useCallerAccess } from '../access/caller-access';
import {
  LoadError,
  PageHeader,
  Pagination,
  TableSkeleton,
} from '../access/PageStates';
import { FormAlert } from '../auth/FormAlert';
import { useReviewerApi } from './reviewer-api-context';
import {
  REVIEWER_QUERY_KEYS,
  useReviewerEnabledQuery,
  useReviewerSessionsQuery,
} from './reviewer-queries';
import type { ReviewerSession } from './reviewer.api';

const copy = COPY.reviewer;

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS_CLASS = {
  active: 'bg-success-soft text-success-strong',
  ended: 'bg-muted text-muted-foreground',
} as const;

/** `/reviewer` (T32, owner): the on/off switch and who asked for access. */
export function ReviewerSessionsPage() {
  const [page, setPage] = useState(1);
  const sessions = useReviewerSessionsQuery(page);

  const meta = sessions.data?.meta;
  const lastPage = meta
    ? Math.max(1, Math.ceil(meta.total / meta.pageSize))
    : 1;
  if (page > lastPage) setPage(lastPage); // adjust during render, not in an effect

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
            retrying={sessions.isFetching}
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
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{copy.tableLabel}</caption>
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                {Object.values(copy.columns).map((label) => (
                  <th key={label} scope="col" className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </tbody>
          </table>
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
function SessionRow({ session }: { session: ReviewerSession }) {
  const status = session.active ? 'active' : 'ended';
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="px-3 py-2 text-left font-medium">
        {session.visitorRole}
      </th>
      <td className="px-3 py-2 text-muted-foreground">
        {session.purposeTags.length === 0
          ? copy.noPurposes
          : session.purposeTags.join(', ')}
      </td>
      <td className="max-w-72 px-3 py-2">
        {session.notes === null || session.notes === '' ? (
          <span className="text-muted-foreground">{copy.noNotes}</span>
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {session.notes}
          </span>
        )}
      </td>
      <td
        className="max-w-48 px-3 py-2 text-muted-foreground"
        title={session.userAgent ?? undefined}
      >
        <span className="line-clamp-2 break-words">
          {session.userAgent ?? copy.noBrowser}
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">
        {dateTimeFormat.format(new Date(session.createdAt))}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
        >
          {copy.status[status]}
        </span>
        {session.active ? (
          <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
            {copy.until(dateTimeFormat.format(new Date(session.expiresAt)))}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

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
    caller.ready && caller.can(REVIEWER_SETTINGS_SUBJECT, 'update');

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
        retrying={enabled.isFetching}
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
