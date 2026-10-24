import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { PermissionAction } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  MEDIA_SUBJECT,
  AccessPolicyService,
  type AccountActor,
} from '../access';
import { AUDIT_ACTIONS } from '../security-audit';
import { auditActorOf, SecurityAuditService } from '../security-audit';
import { ContentDbProvider } from '../content-engine';
import { ContentRegistryProvider } from '../content-engine';
import type { ClientMeta } from '../../common/http/client-meta';
import {
  DELETED_AT_COLUMN,
  MEDIA_ERROR_CODES,
  MEDIA_ERROR_MESSAGES,
  MEDIA_TABLE,
} from './media.constants';
import { isMediaReferenced } from './media-usage';

/**
 * `DELETE /media/:id`: soft delete, refused with 409 `MEDIA_IN_USE`
 * while a draft or published document still uses the file. The stored object
 * stays until `MediaPurgeJob` removes it after the grace period.
 */
@Injectable()
export class MediaDeleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentDbProvider,
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistryProvider,
    private readonly audit: SecurityAuditService,
  ) {}

  async remove(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const mediaId = await this.reachableId(actor, documentId);
    const registry = await this.registry.registry();
    await this.prisma.$transaction(async (tx) => {
      // The row lock serialises two deletes of the same file.
      const locked = await tx.$queryRaw<{ id: number }[]>`
        select id from public.file_library
        where id = ${mediaId} and deleted_at is null for update`;
      if (locked.length === 0) throw notFound();
      if (await isMediaReferenced(tx, registry, mediaId)) {
        throw new ConflictException({
          errorCode: MEDIA_ERROR_CODES.IN_USE,
          message: MEDIA_ERROR_MESSAGES.IN_USE,
        });
      }
      const row = await tx.fileLibrary.update({
        where: { id: mediaId },
        data: { deletedAt: new Date(), updatedById: actor.accountId },
        select: { documentId: true, mimeType: true },
      });
      await this.audit.record(tx, {
        actor: auditActorOf(actor),
        action: AUDIT_ACTIONS.MEDIA_DELETED,
        subject: MEDIA_SUBJECT,
        targetId: row.documentId,
        metadata: { mimeType: row.mimeType },
        ip: meta.ip,
      });
    });
  }

  /** Internal id of a live file the actor's `media` delete rows reach, else 404. */
  private async reachableId(
    actor: AccountActor,
    documentId: string,
  ): Promise<number> {
    const { evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(
      actor,
      PermissionAction.delete,
      MEDIA_SUBJECT,
    );
    if (!filter.allowed) throw new ForbiddenException();
    const row = await this.content.db
      .selectFrom(MEDIA_TABLE)
      .select('id')
      .where('document_id', '=', documentId)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(filter.where !== null, (qb) =>
        qb.where(filter.where as NonNullable<typeof filter.where>),
      )
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    return Number((row as { id: number }).id);
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MEDIA_ERROR_CODES.NOT_FOUND,
    message: MEDIA_ERROR_MESSAGES.NOT_FOUND,
  });
}
