import { Inject, Injectable } from '@nestjs/common';

import {
  type AuditActorType,
  type Prisma,
} from '../../../generated/prisma/client';
import { PrismaClient } from '../../../infrastructure/database/prisma-client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import type { AuditLogWriter } from '../application/SecurityAudit.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  AuditActor,
  AuditEntry,
  AuditMetadataValue,
} from '../domain/AuditActor.rules';

/** Anything that can insert an audit row: a transaction or the client. */
type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

const ACTOR_TYPE: Readonly<Record<AuditActor['type'], AuditActorType>> = {
  account: 'account',
  api_token: 'api_token',
  system: 'system',
};

function actorIdOf(actor: AuditActor): number | null {
  return actor.type === 'system' ? null : actor.accountId;
}

function metadataOf(entry: AuditEntry): Prisma.InputJsonObject {
  const metadata: Record<string, AuditMetadataValue> = {
    ...(entry.metadata ?? {}),
  };
  if (entry.actor.type === 'api_token') metadata.tokenId = entry.actor.tokenId;
  return metadata;
}

/**
 * Inserts audit rows. Also built by hand for CLIs that run without Nest
 * (`owner:reset-2fa`). Never opens a transaction: the row joins the caller's
 * unit so it commits or rolls back with the change it records (D15), or uses
 * the client for `writeStandalone`.
 */
@Injectable()
export class PrismaAuditLogRepository implements AuditLogWriter {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  write(unit: UnitOfWork, entry: AuditEntry): Promise<void> {
    return this.insert(prismaTxOf(unit), entry);
  }

  writeStandalone(entry: AuditEntry): Promise<void> {
    return this.insert(this.prisma, entry);
  }

  private async insert(writer: AuditWriter, entry: AuditEntry): Promise<void> {
    await writer.auditLog.create({
      data: {
        actorId: actorIdOf(entry.actor),
        actorType: ACTOR_TYPE[entry.actor.type],
        action: entry.action,
        subject: entry.subject ?? null,
        targetId: entry.targetId ?? null,
        metadata: metadataOf(entry),
        ip: entry.ip ?? null,
      },
    });
  }
}
