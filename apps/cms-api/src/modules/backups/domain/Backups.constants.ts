/** The folders under the configured prefix that hold dumps (ADR 0013 section 2). */
export const BACKUP_KINDS = ['daily', 'monthly'] as const;

export type BackupKind = (typeof BACKUP_KINDS)[number];

/** The kind the nightly job writes; a missing recent one makes the set stale. */
export const NIGHTLY_BACKUP_KIND: BackupKind = 'daily';

/**
 * Lifetime of a download link. A fixed rule of the endpoint, never a request
 * value: the shortest window that still lets the browser start the download.
 */
export const DOWNLOAD_LINK_TTL_SECONDS = 60;

/** A backup set is stale when no `daily` dump is newer than this. */
export const STALE_AFTER_HOURS = 26;

/** The dump file name the nightly job writes: `abyss-<YYYYMMDDTHHMMSSZ>.dump.age`. */
export const BACKUP_FILE_NAME_PATTERN =
  /^abyss-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump\.age$/;

/** Upper bound of the `key` field; far above the longest valid key. */
export const BACKUP_KEY_MAX_LENGTH = 512;

export const BACKUPS_ERROR_CODES = {
  NOT_CONFIGURED: 'BACKUPS_NOT_CONFIGURED',
  NOT_FOUND: 'BACKUP_NOT_FOUND',
} as const;

export const BACKUPS_ERROR_MESSAGES = {
  NOT_CONFIGURED: 'Backup storage is not set up on this server.',
  NOT_FOUND: 'No such backup.',
  INVALID_KEY: 'The backup key is not valid.',
} as const;
