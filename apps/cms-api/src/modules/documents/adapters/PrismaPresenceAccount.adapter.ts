import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import type {
  PresenceAccount,
  PresenceAccountLookup,
} from '../application/Documents.port';

/** Reads `documentId` and `displayName` only: never an email, role or other account column. */
@Injectable()
export class PrismaPresenceAccountAdapter implements PresenceAccountLookup {
  constructor(private readonly prisma: PrismaService) {}

  findByAccountId(accountId: number): Promise<PresenceAccount | null> {
    return this.prisma.account.findUnique({
      where: { id: accountId },
      select: { documentId: true, displayName: true },
    });
  }
}
