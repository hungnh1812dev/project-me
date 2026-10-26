import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client';
import { prismaTxOf } from '../../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../../infrastructure/database/TransactionRunner.port';
import type {
  ApiTokenAdminRepository,
  ApiTokenChange,
  ManagedApiToken,
  NewApiToken,
} from '../application/AccessManagement.port';
import type { TokenScope } from '../../domain/ActorContext.entity';

const TOKEN_SELECT = {
  id: true,
  documentId: true,
  name: true,
  tokenPrefix: true,
  scope: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
  createdById: true,
  createdBy: {
    select: { documentId: true, displayName: true, roleId: true },
  },
} as const;

/** A scope as `Json` input (field lists copied out of their readonly arrays). */
function scopeJson(scope: TokenScope): Prisma.InputJsonObject {
  return {
    permissions: scope.permissions.map((entry) => ({
      subject: entry.subject,
      action: entry.action,
      ...(entry.readableFields === undefined
        ? {}
        : {
            readableFields:
              entry.readableFields === null ? null : [...entry.readableFields],
          }),
      ...(entry.writableFields === undefined
        ? {}
        : {
            writableFields:
              entry.writableFields === null ? null : [...entry.writableFields],
          }),
    })),
  };
}

/** API tokens for the admin API. The raw token is never stored; only its hash. */
@Injectable()
export class PrismaApiTokenAdminRepository implements ApiTokenAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPage(
    createdById: number | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ rows: ManagedApiToken[]; total: number }> {
    const where: Prisma.ApiTokenWhereInput =
      createdById === undefined ? {} : { createdById };
    const [rows, total] = await Promise.all([
      this.prisma.apiToken.findMany({
        where,
        select: TOKEN_SELECT,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiToken.count({ where }),
    ]);
    return { rows, total };
  }

  create(unit: UnitOfWork, token: NewApiToken): Promise<ManagedApiToken> {
    return prismaTxOf(unit).apiToken.create({
      data: {
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        tokenHash: token.tokenHash,
        scope: scopeJson(token.scope),
        expiresAt: token.expiresAt,
        createdBy: { connect: { id: token.creatorId } },
      },
      select: TOKEN_SELECT,
    });
  }

  async lockByDocumentId(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<ManagedApiToken | null> {
    const tx = prismaTxOf(unit);
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM api_tokens WHERE document_id = ${documentId}::uuid FOR UPDATE`;
    if (locked[0] === undefined) return null;
    return tx.apiToken.findUnique({
      where: { id: locked[0].id },
      select: TOKEN_SELECT,
    });
  }

  update(
    unit: UnitOfWork,
    tokenId: number,
    change: ApiTokenChange,
  ): Promise<ManagedApiToken> {
    return prismaTxOf(unit).apiToken.update({
      where: { id: tokenId },
      data: {
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.scope === undefined
          ? {}
          : { scope: scopeJson(change.scope) }),
        ...(change.expiresAt === undefined
          ? {}
          : { expiresAt: change.expiresAt }),
      },
      select: TOKEN_SELECT,
    });
  }

  async markRevoked(
    unit: UnitOfWork,
    tokenId: number,
    revokedAt: Date,
  ): Promise<void> {
    await prismaTxOf(unit).apiToken.update({
      where: { id: tokenId },
      data: { revokedAt },
      select: { id: true },
    });
  }
}
