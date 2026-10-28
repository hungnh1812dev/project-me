import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { BackupStorageConfig } from '../../../config/AppConfig.setup';
import {
  BackupStorageError,
  type BackupStorage,
  type StoredBackupObject,
} from '../application/Backups.port';

const NOT_FOUND_ERROR_NAMES: readonly string[] = ['NotFound', 'NoSuchKey'];
const NOT_FOUND_STATUS = 404;

export interface S3BackupStorageOptions {
  /**
   * Bucket name in the path, not in the host: works on R2's account host and
   * on stand-ins reached by IP.
   */
  readonly forcePathStyle?: boolean;
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

function isNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return (
    NOT_FOUND_ERROR_NAMES.includes(error.name) || status === NOT_FOUND_STATUS
  );
}

/** `BackupStorage` on the S3 API (Cloudflare R2 in production). Only reads and signs. */
export class S3BackupStorage implements BackupStorage {
  private readonly client: S3Client;

  constructor(
    private readonly config: BackupStorageConfig,
    options: S3BackupStorageOptions = {},
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async list(prefix: string): Promise<StoredBackupObject[]> {
    const objects: StoredBackupObject[] = [];
    let continuationToken: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (item.Key === undefined) continue;
          objects.push({ key: item.Key, sizeBytes: item.Size ?? 0 });
        }
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken !== undefined);
    } catch (error) {
      throw new BackupStorageError('list', describeFailure(error));
    }
    return objects;
  }

  async find(key: string): Promise<StoredBackupObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { key, sizeBytes: head.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new BackupStorageError('find', describeFailure(error));
    }
  }

  async createDownloadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      throw new BackupStorageError('sign', describeFailure(error));
    }
  }
}
