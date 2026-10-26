import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import type { PageQuery } from '../../../common/validation/SharedSchemas.rules';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  AccessPolicyService,
  MEDIA_SUBJECT,
  PermissionAction,
  type AccountActor,
  type ActorContext,
  type RowCondition,
} from '../../access';
import {
  AUDIT_ACTIONS,
  auditActorOf,
  SecurityAuditService,
} from '../../security-audit';
import {
  mediaForbidden,
  mediaInUse,
  mediaNotFound,
  type MediaPage,
  type MediaRecord,
} from '../domain/Media.entity';
import {
  MEDIA_REFERENCE_CHECKER,
  MEDIA_REPOSITORY,
  type MediaReferenceChecker,
  type MediaRepository,
} from './Media.port';

/**
 * The library use cases of one aggregate: list, edit the alt text, delete.
 * The policy's row filter for the action decides which files an actor
 * reaches; unknown, deleted and out-of-scope files all answer 404.
 */
@Injectable()
export class MediaLibraryService {
  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly repository: MediaRepository,
    @Inject(MEDIA_REFERENCE_CHECKER)
    private readonly references: MediaReferenceChecker,
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    private readonly access: AccessPolicyService,
    private readonly audit: SecurityAuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * Newest first. Read-only actors (reviewer) only get preset rows, whatever
   * their role is called. Soft-deleted rows are never listed.
   */
  async list(actor: ActorContext, query: PageQuery): Promise<MediaPage> {
    const rowCondition = await this.rowConditionOf(
      actor,
      PermissionAction.read,
    );
    return this.repository.list({ rowCondition, ...query });
  }

  /** Alt text only; not audited (SPEC §7 lists media delete only). */
  async updateAlt(
    actor: AccountActor,
    documentId: string,
    alt: string | null,
  ): Promise<MediaRecord> {
    const rowCondition = await this.rowConditionOf(
      actor,
      PermissionAction.update,
    );
    const updated = await this.repository.updateAlt({
      documentId,
      alt,
      updatedById: actor.accountId,
      rowCondition,
    });
    if (updated === undefined) throw mediaNotFound();
    return updated;
  }

  /**
   * Soft delete, refused while a draft or published document still uses the
   * file. The stored object stays until the purge job removes it.
   */
  async remove(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const rowCondition = await this.rowConditionOf(
      actor,
      PermissionAction.delete,
    );
    const mediaId = await this.repository.findLiveId(documentId, rowCondition);
    if (mediaId === undefined) throw mediaNotFound();
    await this.runner.run(async (unit) => {
      // The row lock serialises two deletes of the same file.
      if (!(await this.repository.lockLive(unit, mediaId))) {
        throw mediaNotFound();
      }
      if (await this.references.isReferenced(mediaId, unit)) {
        throw mediaInUse();
      }
      const row = await this.repository.softDelete(unit, {
        mediaId,
        deletedAt: new Date(this.clock.now()),
        updatedById: actor.accountId,
      });
      await this.audit.record(unit, {
        actor: auditActorOf(actor),
        action: AUDIT_ACTIONS.MEDIA_DELETED,
        subject: MEDIA_SUBJECT,
        targetId: row.documentId,
        metadata: { mimeType: row.mimeType },
        ip: meta.ip,
      });
    });
  }

  private async rowConditionOf(
    actor: ActorContext,
    action: PermissionAction,
  ): Promise<RowCondition | null> {
    const { evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(actor, action, MEDIA_SUBJECT);
    if (!filter.allowed) throw mediaForbidden();
    return filter.where;
  }
}
