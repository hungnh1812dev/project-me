import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PermissionAction } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  MEDIA_SUBJECT,
  AccessPolicyService,
  type AccountActor,
} from '../access';
import { ContentDbProvider } from '../content-engine';
import {
  DELETED_AT_COLUMN,
  MEDIA_ERROR_CODES,
  MEDIA_ERROR_MESSAGES,
  MEDIA_TABLE,
} from './domain/Media.constants';
import type { MediaRecord } from './domain/Media.entity';

/**
 * `PATCH /media/:id`: edits the alt text. Not audited: SPEC §7 lists
 * media delete only. The policy row filter for `update` decides reachability.
 */
@Injectable()
export class MediaUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentDbProvider,
    private readonly access: AccessPolicyService,
  ) {}

  async update(
    actor: AccountActor,
    documentId: string,
    alt: string | null,
  ): Promise<MediaRecord> {
    const { evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(
      actor,
      PermissionAction.update,
      MEDIA_SUBJECT,
    );
    if (!filter.allowed) throw new ForbiddenException();
    const reachable = await this.content.db
      .selectFrom(MEDIA_TABLE)
      .select('id')
      .where('document_id', '=', documentId)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(filter.where !== null, (qb) =>
        qb.where(filter.where as NonNullable<typeof filter.where>),
      )
      .executeTakeFirst();
    if (reachable === undefined) throw notFound();
    const { count } = await this.prisma.fileLibrary.updateMany({
      where: { documentId, deletedAt: null },
      data: { alt, updatedById: actor.accountId },
    });
    if (count === 0) throw notFound();
    const row = await this.prisma.fileLibrary.findFirst({
      where: { documentId, deletedAt: null },
    });
    if (row === null) throw notFound();
    return row;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MEDIA_ERROR_CODES.NOT_FOUND,
    message: MEDIA_ERROR_MESSAGES.NOT_FOUND,
  });
}
