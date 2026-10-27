/** DI token of the `BackupStorage` adapter. */
export const BACKUP_STORAGE = Symbol('BACKUP_STORAGE');

/**
 * DI token of the key prefix (ends with `/`). `null` while the feature is off,
 * together with a `null` `BACKUP_STORAGE`.
 */
export const BACKUP_PREFIX = Symbol('BACKUP_PREFIX');

/** One object in the backup bucket, as the bucket reports it. */
export interface StoredBackupObject {
  /** Full key, including the configured prefix. */
  readonly key: string;
  readonly sizeBytes: number;
}

/** Read-only view of the backup bucket (ADR 0013 section 4). */
export interface BackupStorage {
  /** Every object whose key starts with `prefix`, across all result pages. */
  list(prefix: string): Promise<StoredBackupObject[]>;
  /** `null` when the key does not exist; any other failure throws. */
  find(key: string): Promise<StoredBackupObject | null>;
  /** A presigned GET URL that starts a download for `expiresInSeconds`. */
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** A bucket request failed. Carries the operation and the error name only, never a credential. */
export class BackupStorageError extends Error {
  constructor(operation: string, reason: string) {
    super(`Backup storage ${operation} failed: ${reason}`);
    this.name = 'BackupStorageError';
  }
}
