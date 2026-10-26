import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client';
import { prismaTxOf } from '../../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { UnitOfWork } from '../../../../infrastructure/database/TransactionRunner.port';
import { REVIEWER_ROLE_SLUG } from '../../roles/system-roles';
import type {
  AccountAdminRepository,
  AccountChange,
  NewAccount,
} from '../application/AccessManagement.port';
import { emailTaken } from '../domain/AccessManagement.errors';
import type {
  AccountRecord,
  AccountRoleRecord,
} from '../domain/Account.entity';
import type { AccountStatus } from '../../domain/Access.constants';

/** Postgres unique violation, as Prisma reports it. */
const UNIQUE_VIOLATION = 'P2002';

const ROLE_SELECT = {
  id: true,
  documentId: true,
  slug: true,
  name: true,
  rank: true,
  isSystem: true,
} as const;

const ACCOUNT_SELECT = {
  id: true,
  documentId: true,
  email: true,
  displayName: true,
  status: true,
  is2faEnabled: true,
  twoFaMethod: true,
  createdAt: true,
  role: { select: ROLE_SELECT },
} as const;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION;

/** Accounts for the admin API: row locks, the unique-email mapping and the writes. */
@Injectable()
export class PrismaAccountAdminRepository implements AccountAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPage(
    page: number,
    pageSize: number,
  ): Promise<{ rows: AccountRecord[]; total: number }> {
    // Ephemeral reviewer accounts belong to the reviewer module.
    const where = { deletedAt: null, roleSlug: { not: REVIEWER_ROLE_SLUG } };
    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        select: ACCOUNT_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.account.count({ where }),
    ]);
    return { rows, total };
  }

  async lockManageable(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<AccountRecord | null> {
    const tx = prismaTxOf(unit);
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM accounts
      WHERE document_id = ${documentId}::uuid AND deleted_at IS NULL
        AND role_slug <> ${REVIEWER_ROLE_SLUG}
      FOR UPDATE`;
    const id = locked[0]?.id;
    if (id === undefined) return null;
    return tx.account.findUniqueOrThrow({
      where: { id },
      select: ACCOUNT_SELECT,
    });
  }

  async lockRoleForAssignment(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<AccountRoleRecord | null> {
    const tx = prismaTxOf(unit);
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM roles WHERE document_id = ${documentId}::uuid
      FOR SHARE`;
    const id = locked[0]?.id;
    if (id === undefined) return null;
    return tx.role.findUniqueOrThrow({ where: { id }, select: ROLE_SELECT });
  }

  async isEmailTaken(unit: UnitOfWork, email: string): Promise<boolean> {
    const found = await prismaTxOf(unit).account.findUnique({
      where: { email },
      select: { id: true },
    });
    return found !== null;
  }

  async create(unit: UnitOfWork, account: NewAccount): Promise<AccountRecord> {
    try {
      return await prismaTxOf(unit).account.create({
        data: {
          email: account.email,
          displayName: account.displayName,
          status: 'invited',
          role: {
            connect: {
              id_slug: { id: account.role.id, slug: account.role.slug },
            },
          },
          createdBy: { connect: { id: account.actorId } },
          updatedBy: { connect: { id: account.actorId } },
        },
        select: ACCOUNT_SELECT,
      });
    } catch (error) {
      // A concurrent invite of the same email won the unique index.
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  update(
    unit: UnitOfWork,
    accountId: number,
    change: AccountChange,
  ): Promise<AccountRecord> {
    return prismaTxOf(unit).account.update({
      where: { id: accountId },
      data: {
        ...(change.displayName === undefined
          ? {}
          : { displayName: change.displayName }),
        ...(change.role === undefined
          ? {}
          : {
              role: {
                connect: {
                  id_slug: { id: change.role.id, slug: change.role.slug },
                },
              },
            }),
        updatedBy: { connect: { id: change.actorId } },
      },
      select: ACCOUNT_SELECT,
    });
  }

  async setStatus(
    unit: UnitOfWork,
    accountId: number,
    status: AccountStatus,
    actorId: number,
  ): Promise<void> {
    await prismaTxOf(unit).account.update({
      where: { id: accountId },
      data: { status, updatedBy: { connect: { id: actorId } } },
    });
  }

  async hasPassword(unit: UnitOfWork, accountId: number): Promise<boolean> {
    const credentials = await prismaTxOf(unit).account.findUniqueOrThrow({
      where: { id: accountId },
      select: { passwordHash: true },
    });
    return credentials.passwordHash !== null;
  }
}
