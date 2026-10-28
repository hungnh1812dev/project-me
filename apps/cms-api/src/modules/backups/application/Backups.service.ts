import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { Clock } from '../../../common/time/Clock.service';
import { MS_PER_SECOND } from '../../../common/constants/Time.constants';
import type { AccountActor } from '../../access';
import { ReauthenticationService } from '../../identity';
import {
  AUDIT_ACTIONS,
  REAUTH_PURPOSES,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import {
  parseBackupKey,
  sortNewestFirst,
  summarizeBackups,
  type BackupEntry,
  type BackupSummary,
} from '../domain/BackupCatalog.rules';
import {
  BACKUP_KINDS,
  BACKUPS_ERROR_CODES,
  BACKUPS_ERROR_MESSAGES,
  DOWNLOAD_LINK_TTL_SECONDS,
} from '../domain/Backups.constants';
import {
  BACKUP_PREFIX,
  BACKUP_STORAGE,
  BackupStorageError,
  type BackupStorage,
} from './Backups.port';

export interface BackupListItem extends BackupEntry {
  readonly sizeBytes: number;
}

export interface BackupListing {
  readonly data: BackupListItem[];
  readonly meta: BackupSummary;
}

export interface DownloadLinkInput {
  readonly key: string;
  readonly password: string;
  readonly code: string;
}

export interface DownloadLinkView {
  readonly url: string;
  readonly fileName: string;
  readonly expiresAt: string;
}

/** Who asks: the owner account and its `accounts.document_id` for re-authentication. */
export interface BackupsCaller {
  readonly actor: AccountActor;
  readonly accountDocumentId: string;
}

const notConfigured = (): DomainError =>
  new DomainError({
    kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
    errorCode: BACKUPS_ERROR_CODES.NOT_CONFIGURED,
    message: BACKUPS_ERROR_MESSAGES.NOT_CONFIGURED,
  });

const notFound = (): DomainError =>
  new DomainError({
    kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
    errorCode: BACKUPS_ERROR_CODES.NOT_FOUND,
    message: BACKUPS_ERROR_MESSAGES.NOT_FOUND,
  });

const invalidKey = (): DomainError =>
  new DomainError({
    kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
    message: BACKUPS_ERROR_MESSAGES.INVALID_KEY,
  });

/** A bucket failure is a bare 503: nothing about the bucket reaches the client. */
const storageUnavailable = (): DomainError =>
  new DomainError({ kind: DOMAIN_ERROR_KINDS.UNAVAILABLE });

async function whenStorageAnswers<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof BackupStorageError) throw storageUnavailable();
    throw error;
  }
}

/**
 * Lists the nightly dumps and hands out short download links (D20). Read-only
 * on the bucket. A link needs re-authentication, and the order of checks is
 * fixed: key shape (400), password and code (403), existence (404), link, audit.
 */
@Injectable()
export class BackupsService {
  constructor(
    @Inject(BACKUP_STORAGE) private readonly storage: BackupStorage | null,
    @Inject(BACKUP_PREFIX) private readonly prefix: string | null,
    private readonly reauthentication: ReauthenticationService,
    private readonly audit: SecurityAuditService,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<BackupListing> {
    const { storage, prefix } = this.configured();
    const listed = await whenStorageAnswers(() =>
      Promise.all(
        BACKUP_KINDS.map((kind) => storage.list(`${prefix}${kind}/`)),
      ),
    );
    const items = listed.flat().flatMap((object): BackupListItem[] => {
      const entry = parseBackupKey(object.key, prefix);
      return entry === null ? [] : [{ ...entry, sizeBytes: object.sizeBytes }];
    });
    return {
      data: sortNewestFirst(items),
      meta: summarizeBackups(items, this.clock.now()),
    };
  }

  async createDownloadLink(
    caller: BackupsCaller,
    input: DownloadLinkInput,
    meta: ClientMeta,
  ): Promise<DownloadLinkView> {
    const { storage, prefix } = this.configured();
    const entry = parseBackupKey(input.key, prefix);
    if (entry === null) throw invalidKey();

    await this.reauthentication.confirm(
      caller.accountDocumentId,
      { password: input.password, code: input.code },
      REAUTH_PURPOSES.BACKUP_DOWNLOAD,
      meta,
    );

    const found = await whenStorageAnswers(() => storage.find(entry.key));
    if (found === null) throw notFound();
    const url = await whenStorageAnswers(() =>
      storage.createDownloadUrl(entry.key, DOWNLOAD_LINK_TTL_SECONDS),
    );

    await this.audit.recordStandalone({
      actor: selfActor(caller.actor.accountId),
      action: AUDIT_ACTIONS.BACKUP_DOWNLOAD_LINK_CREATED,
      targetId: entry.fileName,
      metadata: { kind: entry.kind, sizeBytes: found.sizeBytes },
      ip: meta.ip,
    });
    return {
      url,
      fileName: entry.fileName,
      expiresAt: new Date(
        this.clock.now() + DOWNLOAD_LINK_TTL_SECONDS * MS_PER_SECOND,
      ).toISOString(),
    };
  }

  private configured(): { storage: BackupStorage; prefix: string } {
    if (this.storage === null || this.prefix === null) throw notConfigured();
    return { storage: this.storage, prefix: this.prefix };
  }
}
