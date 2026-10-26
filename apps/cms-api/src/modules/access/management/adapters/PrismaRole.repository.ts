import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client';
import { prismaTxOf } from '../../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../../infrastructure/database/TransactionRunner.port';
import type {
  NewRole,
  RoleChange,
  RoleRecord,
  RoleRepository,
} from '../application/AccessManagement.port';
import { roleSlugTaken } from '../domain/AccessManagement.errors';

/** Advisory-lock key serialising custom role creation (the 50-role cap). */
const ROLE_CAP_LOCK = 1_700_017_003;
/** Postgres unique violation, as Prisma reports it. */
const UNIQUE_VIOLATION = 'P2002';

const ROLE_SELECT = {
  id: true,
  documentId: true,
  slug: true,
  name: true,
  rank: true,
  isSystem: true,
  policyVersion: true,
  permissions: {
    select: {
      subject: true,
      action: true,
      readableFields: true,
      writableFields: true,
      conditions: true,
    },
    orderBy: { id: 'asc' },
  },
} as const;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION;

/** Roles for the admin API: the cap lock, row locks and the writes. */
@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWithAccountCounts(): Promise<{
    roles: RoleRecord[];
    accountCounts: ReadonlyMap<number, number>;
  }> {
    const [roles, holders] = await Promise.all([
      this.prisma.role.findMany({
        select: ROLE_SELECT,
        orderBy: [{ rank: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.$queryRaw<{ role_id: number; holders: number }[]>`
        SELECT role_id, count(*)::int AS holders FROM accounts GROUP BY role_id`,
    ]);
    return {
      roles,
      accountCounts: new Map(
        holders.map((group) => [group.role_id, group.holders]),
      ),
    };
  }

  findByDocumentId(documentId: string): Promise<RoleRecord | null> {
    return this.prisma.role.findUnique({
      where: { documentId },
      select: ROLE_SELECT,
    });
  }

  async lockByDocumentId(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<RoleRecord | null> {
    const tx = prismaTxOf(unit);
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM roles WHERE document_id = ${documentId}::uuid FOR UPDATE`;
    if (locked[0] === undefined) return null;
    return tx.role.findUnique({ where: { documentId }, select: ROLE_SELECT });
  }

  countAccounts(roleId: number, unit?: UnitOfWork): Promise<number> {
    const db = unit === undefined ? this.prisma : prismaTxOf(unit);
    return db.account.count({ where: { roleId } });
  }

  async lockAndCountCustomRoles(unit: UnitOfWork): Promise<number> {
    const tx = prismaTxOf(unit);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_CAP_LOCK})`;
    return tx.role.count({ where: { isSystem: false } });
  }

  async create(unit: UnitOfWork, role: NewRole): Promise<RoleRecord> {
    try {
      return await prismaTxOf(unit).role.create({
        data: {
          slug: role.slug,
          name: role.name,
          rank: role.rank,
          isSystem: false,
          createdById: role.actorId,
          updatedById: role.actorId,
        },
        select: ROLE_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw roleSlugTaken();
      throw error;
    }
  }

  update(
    unit: UnitOfWork,
    roleId: number,
    change: RoleChange,
  ): Promise<RoleRecord> {
    return prismaTxOf(unit).role.update({
      where: { id: roleId },
      data: {
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.rank === undefined ? {} : { rank: change.rank }),
        // The rank feeds `$actor.roleRank` and D6 checks: a new policy.
        policyVersion: { increment: 1 },
        updatedById: change.actorId,
      },
      select: ROLE_SELECT,
    });
  }

  async remove(unit: UnitOfWork, roleId: number): Promise<void> {
    await prismaTxOf(unit).role.delete({ where: { id: roleId } });
  }
}
