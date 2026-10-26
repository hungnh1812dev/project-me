import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  NewReviewerSession,
  ReviewerRepository,
  ReviewerSessionRecordPage,
} from '../application/Reviewer.port';

/** `app_settings.key` holding the owner's reviewer toggle (value: boolean). */
const REVIEWER_ENABLED_SETTING_KEY = 'reviewer.enabled';

/** Postgres advisory lock serialising session creation (cap and per-IP rule). */
const REVIEWER_SESSION_LOCK = 1_700_031_001;

/** Reviewer settings and visitor sessions in the core database. */
@Injectable()
export class PrismaReviewerRepository implements ReviewerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: REVIEWER_ENABLED_SETTING_KEY },
      select: { value: true },
    });
    return row?.value === true;
  }

  async isEnabledSharedLock(unit: UnitOfWork): Promise<boolean> {
    const rows = await prismaTxOf(unit).$queryRaw<{ value: unknown }[]>`
      SELECT value FROM app_settings
      WHERE key = ${REVIEWER_ENABLED_SETTING_KEY} FOR SHARE`;
    return rows[0]?.value === true;
  }

  async saveEnabled(
    unit: UnitOfWork,
    enabled: boolean,
    updatedByAccountId: number,
  ): Promise<void> {
    const by = { connect: { id: updatedByAccountId } };
    await prismaTxOf(unit).appSetting.upsert({
      where: { key: REVIEWER_ENABLED_SETTING_KEY },
      create: {
        key: REVIEWER_ENABLED_SETTING_KEY,
        value: enabled,
        createdBy: by,
        updatedBy: by,
      },
      update: { value: enabled, updatedBy: by },
    });
  }

  async lockSessionCreation(unit: UnitOfWork): Promise<void> {
    await prismaTxOf(unit)
      .$executeRaw`SELECT pg_advisory_xact_lock(${REVIEWER_SESSION_LOCK})`;
  }

  countActiveSessions(nowMs: number, unit?: UnitOfWork): Promise<number> {
    return this.clientOf(unit).reviewerSession.count({
      where: { expiresAt: { gt: new Date(nowMs) } },
    });
  }

  async findLastSessionStartOf(
    ipHmac: string,
    sinceMs: number,
    unit?: UnitOfWork,
  ): Promise<Date | undefined> {
    const recent = await this.clientOf(unit).reviewerSession.findFirst({
      where: { ipHmac, createdAt: { gt: new Date(sinceMs) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return recent?.createdAt;
  }

  async addSession(
    unit: UnitOfWork,
    session: NewReviewerSession,
  ): Promise<void> {
    await prismaTxOf(unit).reviewerSession.create({
      data: {
        accountId: session.accountId,
        visitorRole: session.visitorRole,
        purposeTags: [...session.purposeTags],
        notes: session.notes,
        ipHmac: session.ipHmac,
        userAgent: session.userAgent,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        lastActiveAt: session.createdAt,
      },
    });
  }

  async listSessions(
    page: number,
    pageSize: number,
  ): Promise<ReviewerSessionRecordPage> {
    const [total, rows] = await Promise.all([
      this.prisma.reviewerSession.count(),
      this.prisma.reviewerSession.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          visitorRole: true,
          purposeTags: true,
          notes: true,
          userAgent: true,
          createdAt: true,
          expiresAt: true,
          account: { select: { documentId: true, tokenVersion: true } },
        },
      }),
    ]);
    return {
      total,
      rows: rows.map((row) => ({
        visitorRole: row.visitorRole,
        purposeTags: Array.isArray(row.purposeTags)
          ? row.purposeTags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : [],
        notes: row.notes,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        accountDocumentId: row.account.documentId,
        accountTokenVersion: row.account.tokenVersion,
      })),
    };
  }

  private clientOf(unit: UnitOfWork | undefined) {
    return unit === undefined ? this.prisma : prismaTxOf(unit);
  }
}
