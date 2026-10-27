import {
  Button,
  FormAlert,
  type SheetColumn,
  SortableSheet,
} from '@abyss/form-commons';
import { useState } from 'react';

import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { COPY } from '../../config/Copy.constants';
import { formatDateTime } from '../../lib/DateFormat.rules';
import { isForbidden, useCallerAccess } from '../access';
import type { BackupFile, BackupsList } from './Backups.api';
import {
  isBackupsNotConfigured,
  isBackupsRateLimited,
  useBackupsQuery,
} from './Backups.queries';
import { DownloadBackupDialog } from './DownloadBackupDialog';

const copy = COPY.backups;

const BYTES_PER_STEP = 1024;
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const ENCRYPTED_EXTENSION = '.age';

/** "184.2 MiB": binary units, one decimal from KiB up. */
function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_STEP && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_STEP;
    unit += 1;
  }
  const text = value.toLocaleString(undefined, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  });
  return `${text} ${BYTE_UNITS[unit]}`;
}

/** "2026-10-27 03:00 UTC" from an ISO time, for the tooltip. */
function utcTextOf(iso: string): string {
  const minutes = new Date(iso).toISOString().replace('T', ' ');
  return copy.utc(minutes.replace(/:\d{2}\.\d+Z$/, ''));
}

function columnsOf(
  onDownload: (backup: BackupFile) => void,
): readonly SheetColumn<BackupFile>[] {
  return [
    {
      key: 'created',
      header: copy.columns.created,
      rowHeader: true,
      renderCell: (backup) => (
        <time
          dateTime={backup.createdAt}
          title={utcTextOf(backup.createdAt)}
          className="tabular-nums"
        >
          {formatDateTime(backup.createdAt)}
        </time>
      ),
    },
    {
      key: 'type',
      header: copy.columns.type,
      renderCell: (backup) => copy.kind[backup.kind],
    },
    {
      key: 'size',
      header: copy.columns.size,
      align: 'right',
      renderCell: (backup) => (
        <span className="tabular-nums">{formatBytes(backup.sizeBytes)}</span>
      ),
    },
    {
      key: 'actions',
      header: copy.columns.actions,
      align: 'right',
      renderCell: (backup) => (
        <Button
          type="button"
          size="sm"
          aria-label={copy.download.buttonLabel(backup.fileName)}
          onClick={() => onDownload(backup)}
        >
          {copy.download.button}
        </Button>
      ),
    },
  ];
}

function SummaryLine({ meta }: { meta: BackupsList['meta'] }) {
  const parts = [
    copy.summary.count(meta.count),
    copy.summary.total(formatBytes(meta.totalBytes)),
    ...(meta.latestAt === null
      ? []
      : [copy.summary.latest(formatDateTime(meta.latestAt))]),
  ];
  return (
    <p className="m-0 text-sm tabular-nums text-muted-foreground">
      {parts.join(' · ')}
    </p>
  );
}

/** `/backups` (owner): the nightly dumps and a download behind password + code. */
export function BackupsPage() {
  const backups = useBackupsQuery();
  const caller = useCallerAccess();
  const [chosen, setChosen] = useState<BackupFile | null>(null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={copy.title} description={copy.description} />
      {!caller.isOwner ? (
        <FormAlert tone="info">{copy.forbidden}</FormAlert>
      ) : backups.isPending && backups.fetchStatus === 'idle' ? (
        <div className="grid justify-items-start gap-3">
          <p className="m-0 max-w-prose text-sm text-muted-foreground">
            {copy.check.hint}
          </p>
          <Button type="button" onClick={() => void backups.refetch()}>
            {copy.check.button}
          </Button>
        </div>
      ) : backups.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : backups.isError ? (
        isBackupsNotConfigured(backups.error) ? (
          <div className="grid justify-items-start gap-1">
            <p className="m-0 font-medium">{copy.notConfigured.title}</p>
            <p className="m-0 max-w-prose text-sm text-muted-foreground">
              {copy.notConfigured.hint}
            </p>
          </div>
        ) : isForbidden(backups.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={
              isBackupsRateLimited(backups.error)
                ? copy.rateLimited
                : copy.loadFailed
            }
            isRetrying={backups.isFetching}
            onRetry={() => void backups.refetch()}
          />
        )
      ) : backups.data.data.length === 0 ? (
        <div className="grid justify-items-start gap-1">
          <p className="m-0 font-medium">{copy.empty}</p>
          <p className="m-0 text-sm text-muted-foreground">{copy.emptyHint}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SummaryLine meta={backups.data.meta} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={backups.isFetching}
              onClick={() => void backups.refetch()}
            >
              {copy.check.refresh}
            </Button>
          </div>
          {backups.data.meta.isStale ? (
            <FormAlert tone="warning">{copy.stale}</FormAlert>
          ) : null}
          {backups.data.data.some((backup) =>
            backup.fileName.endsWith(ENCRYPTED_EXTENSION),
          ) ? (
            <FormAlert tone="info">{copy.encryptedNote}</FormAlert>
          ) : null}
          <div className="relative overflow-x-auto rounded-md border border-border bg-card">
            <SortableSheet
              className="rounded-none border-0"
              caption={copy.tableLabel}
              columns={columnsOf(setChosen)}
              rows={backups.data.data}
              getRowId={(backup) => backup.key}
              getRowLabel={(backup) => backup.fileName}
            />
          </div>
        </>
      )}
      {chosen === null ? null : (
        <DownloadBackupDialog backup={chosen} onClose={() => setChosen(null)} />
      )}
    </div>
  );
}
