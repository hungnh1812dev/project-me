import { Injectable } from '@nestjs/common';

import {
  type AuditActorType,
  type Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import type {
  AuditLogWriter,
  AuditTransaction,
} from '../application/SecurityAudit.service';
import type {
  AuditActor,
  AuditEntry,
  AuditMetadataValue,
} from '../domain/AuditActor.rules';

/** Anything that can insert an audit row: a transaction or the client. */
export type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

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
 * Inserts one `audit_logs` row with `writer`. Pass the caller's transaction
 * so the row commits or rolls back with the change it records (D15). Also
 * used by CLIs that run without Nest (`owner:reset-2fa`) and, until CR-cl-1,
 * by callers that still hold a Prisma transaction.
 */
export async function writeAuditLog(
  writer: AuditWriter,
  entry: AuditEntry,
): Promise<void> {
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

/** Never opens a transaction: the row joins the caller's, or uses the client for `writeStandalone`. */
@Injectable()
export class PrismaAuditLogRepository implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  write(transaction: AuditTransaction, entry: AuditEntry): Promise<void> {
    const writer =
      'auditLog' in transaction
        ? (transaction as AuditWriter)
        : prismaTxOf(transaction);
    return writeAuditLog(writer, entry);
  }

  writeStandalone(entry: AuditEntry): Promise<void> {
    return writeAuditLog(this.prisma, entry);
  }
}
