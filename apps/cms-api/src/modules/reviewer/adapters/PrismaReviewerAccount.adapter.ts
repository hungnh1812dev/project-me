import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import { REVIEWER_ROLE_SLUG } from '../../access';
import { REVIEWER_ACCOUNT } from '../domain/Reviewer.constants';
import type {
  CreatedReviewerAccount,
  ReviewerAccountGateway,
} from '../application/Reviewer.port';

/** The `reviewer` role and its ephemeral accounts in the core database. */
@Injectable()
export class PrismaReviewerAccountAdapter implements ReviewerAccountGateway {
  constructor(private readonly prisma: PrismaService) {}

  async bumpRolePolicyVersion(unit: UnitOfWork): Promise<number> {
    const role = await prismaTxOf(unit).role.update({
      where: { slug: REVIEWER_ROLE_SLUG },
      data: { policyVersion: { increment: 1 } },
      select: { id: true },
    });
    return role.id;
  }

  async revokeAllSessions(unit: UnitOfWork): Promise<number[]> {
    const rows = await prismaTxOf(unit).$queryRaw<{ id: number }[]>`
      UPDATE accounts SET token_version = token_version + 1, updated_at = now()
      WHERE role_slug = ${REVIEWER_ROLE_SLUG} RETURNING id`;
    return rows.map((row) => row.id);
  }

  async createAccount(
    unit: UnitOfWork,
    email: string,
  ): Promise<CreatedReviewerAccount> {
    const tx = prismaTxOf(unit);
    const role = await tx.role.findUniqueOrThrow({
      where: { slug: REVIEWER_ROLE_SLUG },
      select: { id: true, slug: true, policyVersion: true },
    });
    const account = await tx.account.create({
      data: {
        email,
        displayName: REVIEWER_ACCOUNT.DISPLAY_NAME,
        status: 'active',
        role: { connect: { id_slug: { id: role.id, slug: role.slug } } },
      },
      select: { id: true, documentId: true, tokenVersion: true },
    });
    return { ...account, policyVersion: role.policyVersion };
  }

  async findExpiredAccountIds(nowMs: number, limit: number): Promise<number[]> {
    const rows = await this.prisma.account.findMany({
      where: {
        roleSlug: REVIEWER_ROLE_SLUG,
        reviewerSessions: { every: { expiresAt: { lt: new Date(nowMs) } } },
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async deleteAccounts(ids: readonly number[]): Promise<void> {
    await this.prisma.account.deleteMany({
      where: { id: { in: [...ids] }, roleSlug: REVIEWER_ROLE_SLUG },
    });
  }
}
