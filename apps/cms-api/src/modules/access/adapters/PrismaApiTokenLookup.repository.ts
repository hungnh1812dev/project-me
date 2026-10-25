import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  ApiTokenLookup,
  ApiTokenRecord,
} from '../application/Access.port';

/** Narrow on purpose: the select never includes `token_hash`. */
@Injectable()
export class PrismaApiTokenLookupRepository implements ApiTokenLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        documentId: true,
        scope: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdBy: { select: { documentId: true } },
      },
    });
    if (row === null) return null;
    return {
      id: row.id,
      documentId: row.documentId,
      scope: row.scope,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
      creatorDocumentId: row.createdBy.documentId,
    };
  }

  async writeLastUsedAt(id: number, usedAt: Date): Promise<void> {
    // Raw, so the `@updatedAt` of the row does not move on every use.
    await this.prisma.$executeRaw`
      UPDATE api_tokens SET last_used_at = ${usedAt} WHERE id = ${id}`;
  }
}
