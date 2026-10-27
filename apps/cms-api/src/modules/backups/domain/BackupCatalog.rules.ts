import { MS_PER_HOUR } from '../../../common/constants/Time.constants';
import {
  BACKUP_FILE_NAME_PATTERN,
  BACKUP_KINDS,
  NIGHTLY_BACKUP_KIND,
  STALE_AFTER_HOURS,
  type BackupKind,
} from './Backups.constants';

/** A bucket object whose key follows the section 2 pattern. */
export interface BackupEntry {
  /** Full key, including the configured prefix. */
  readonly key: string;
  readonly kind: BackupKind;
  readonly fileName: string;
  /** Parsed from the file name, UTC. */
  readonly createdAt: Date;
}

export interface BackupSummary {
  readonly count: number;
  readonly totalBytes: number;
  readonly latestAt: Date | null;
  readonly isStale: boolean;
}

const KEY_SEPARATOR = '/';
const KEY_PARTS = 2;
const MONTH_OFFSET = 1;
const TIMESTAMP_GROUPS = 6;

function isBackupKind(value: string): value is BackupKind {
  return (BACKUP_KINDS as readonly string[]).includes(value);
}

/** The instant a file name stands for, or null when a field is out of range. */
function timestampOf(fileName: string): Date | null {
  const groups = BACKUP_FILE_NAME_PATTERN.exec(fileName)?.slice(1);
  if (groups?.length !== TIMESTAMP_GROUPS) return null;
  const [year, month, day, hour, minute, second] = groups.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(
    Date.UTC(year, month - MONTH_OFFSET, day, hour, minute, second),
  );
  const isRealInstant =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - MONTH_OFFSET &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return isRealInstant ? date : null;
}

/**
 * `<prefix><kind>/<file name>` or null. Anything else, including a key outside
 * the prefix or with `..` or extra folders, is not a backup.
 */
export function parseBackupKey(
  key: string,
  prefix: string,
): BackupEntry | null {
  if (!key.startsWith(prefix)) return null;
  const parts = key.slice(prefix.length).split(KEY_SEPARATOR);
  if (parts.length !== KEY_PARTS) return null;
  const [kind, fileName] = parts as [string, string];
  if (!isBackupKind(kind)) return null;
  const createdAt = timestampOf(fileName);
  return createdAt === null ? null : { key, kind, fileName, createdAt };
}

export function sortNewestFirst<T extends { createdAt: Date }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/** `isStale` is true when no `daily` dump is newer than the limit, or none exists. */
export function summarizeBackups(
  entries: readonly (BackupEntry & { sizeBytes: number })[],
  nowMs: number,
): BackupSummary {
  const staleBeforeMs = nowMs - STALE_AFTER_HOURS * MS_PER_HOUR;
  const latest = sortNewestFirst(entries)[0];
  return {
    count: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    latestAt: latest?.createdAt ?? null,
    isStale: !entries.some(
      (entry) =>
        entry.kind === NIGHTLY_BACKUP_KIND &&
        entry.createdAt.getTime() >= staleBeforeMs,
    ),
  };
}
