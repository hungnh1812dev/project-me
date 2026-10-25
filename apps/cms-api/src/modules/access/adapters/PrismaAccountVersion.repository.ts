import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  AccountVersions,
  AccountVersionSource,
} from '../application/Access.port';

@Injectable()
export class PrismaAccountVersionRepository implements AccountVersionSource {
  constructor(private readonly prisma: PrismaService) {}

  async findByDocumentId(documentId: string): Promise<AccountVersions | null> {
    const row = await this.prisma.account.findUnique({
      where: { documentId },
      select: {
        id: true,
        documentId: true,
        tokenVersion: true,
        status: true,
        deletedAt: true,
        roleId: true,
        reviewerSessions: { select: { id: true }, take: 1 },
      },
    });
    if (row === null) return null;
    return {
      id: row.id,
      documentId: row.documentId,
      tokenVersion: row.tokenVersion,
      status: row.status,
      isDeleted: row.deletedAt !== null,
      roleId: row.roleId,
      reviewerSessionId: row.reviewerSessions[0]?.id ?? null,
    };
  }
}
