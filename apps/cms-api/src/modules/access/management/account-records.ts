import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  type AccountStatus,
  Prisma,
  type TwoFaMethod,
} from '../../../generated/prisma/client';
import { type ClientMeta } from '../../../common/http/client-meta';
import {
  type AuditActor,
  AUDIT_ACTIONS,
  type SecurityAuditService,
} from '../../security-audit';
import {
  type AccountActor,
  assertOutranks,
  outranks,
  rankForbidden,
} from '../domain/Rank.rules';
import {
  REVIEWER_ROLE_SLUG,
  UNASSIGNABLE_ROLE_SLUGS,
} from '../roles/system-roles';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
} from './access-management.constants';

export type Tx = Prisma.TransactionClient;

const ACCOUNTS_SUBJECT = 'accounts';
/** Postgres unique violation, as Prisma reports it. */
const UNIQUE_VIOLATION = 'P2002';

/** A role as accounts show it. */
export interface AccountRoleView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly rank: number;
}

/** `GET /accounts` item. No password, secret or token data. */
export interface AccountView {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: AccountStatus;
  readonly twoFactorEnabled: boolean;
  readonly twoFactorMethod: TwoFaMethod | null;
  readonly role: AccountRoleView;
  readonly createdAt: string;
  /** Whether the current actor may update, disable or sign out this account (D6). */
  readonly manageable: boolean;
}

export const ROLE_SELECT = {
  id: true,
  documentId: true,
  slug: true,
  name: true,
  rank: true,
  isSystem: true,
} as const;

export const ACCOUNT_SELECT = {
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

export type AccountRow = Prisma.AccountGetPayload<{
  select: typeof ACCOUNT_SELECT;
}>;
export type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

export function accountNotFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_FOUND,
    message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
  });
}

function roleNotFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_FOUND,
    message: MANAGEMENT_ERROR_MESSAGES.ROLE_NOT_FOUND,
  });
}

function isAssignable(role: RoleRow): boolean {
  return !(
    role.isSystem &&
    (UNASSIGNABLE_ROLE_SLUGS as readonly string[]).includes(role.slug)
  );
}

export function emailTaken(): ConflictException {
  return new ConflictException({
    errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_EMAIL_TAKEN,
    message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_EMAIL_TAKEN,
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

export function toAccountView(
  actor: AccountActor,
  row: AccountRow,
): AccountView {
  return {
    id: row.documentId,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    twoFactorEnabled: row.is2faEnabled,
    twoFactorMethod: row.is2faEnabled ? row.twoFaMethod : null,
    role: {
      id: row.role.documentId,
      slug: row.role.slug,
      name: row.role.name,
      rank: row.role.rank,
    },
    createdAt: row.createdAt.toISOString(),
    manageable: row.id !== actor.accountId && outranks(actor, row.role.rank),
  };
}

/**
 * The target account, row-locked for this transaction, after the D6
 * checks: 404 when unknown, deleted or a reviewer account, 403 for the actor itself or an
 * account of equal or higher rank.
 */
export async function lockManageableAccount(
  tx: Tx,
  actor: AccountActor,
  documentId: string,
): Promise<AccountRow> {
  const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM accounts
      WHERE document_id = ${documentId}::uuid AND deleted_at IS NULL
        AND role_slug <> ${REVIEWER_ROLE_SLUG}
      FOR UPDATE`;
  const id = locked[0]?.id;
  if (id === undefined) throw accountNotFound();
  if (id === actor.accountId) throw rankForbidden();
  const target = await tx.account.findUniqueOrThrow({
    where: { id },
    select: ACCOUNT_SELECT,
  });
  assertOutranks(actor, target.role.rank);
  return target;
}

export type AccountAuditEvent = {
  readonly action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
  readonly metadata?: Readonly<Record<string, string | readonly string[]>>;
};

/** Writes the audit row inside the caller's transaction. */
export function recordAccountEvent(
  audit: SecurityAuditService,
  tx: Tx,
  actor: AuditActor,
  target: { readonly documentId: string },
  meta: ClientMeta,
  event: AccountAuditEvent,
): Promise<void> {
  return audit.record(tx, {
    actor,
    action: event.action,
    subject: ACCOUNTS_SUBJECT,
    targetId: target.documentId,
    metadata: event.metadata,
    ip: meta.ip,
  });
}

/**
 * The role to assign: 404 when unknown, 403 unless the actor outranks it
 * (so `owner` is never assignable, D6), 400 for roles accounts never hold.
 * Locked for share so its rank can't change before the commit.
 */
export async function lockAssignableRole(
  tx: Tx,
  actor: AccountActor,
  roleDocumentId: string,
): Promise<RoleRow> {
  const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM roles WHERE document_id = ${roleDocumentId}::uuid
      FOR SHARE`;
  const id = locked[0]?.id;
  if (id === undefined) throw roleNotFound();
  const role = await tx.role.findUniqueOrThrow({
    where: { id },
    select: ROLE_SELECT,
  });
  assertOutranks(actor, role.rank);
  if (!isAssignable(role)) {
    throw new BadRequestException({
      errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_ASSIGNABLE,
      message: MANAGEMENT_ERROR_MESSAGES.ROLE_NOT_ASSIGNABLE,
    });
  }
  return role;
}
