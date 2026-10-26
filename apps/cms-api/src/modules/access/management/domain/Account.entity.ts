import type { TwoFaMethod } from '../../../identity';
import { type AccountStatus } from '../../domain/Access.constants';
import {
  type AccountActor,
  assertOutranks,
  outranks,
  rankForbidden,
} from '../../domain/Rank.rules';
import { UNASSIGNABLE_ROLE_SLUGS } from '../../roles/system-roles';
import {
  accountNotFound,
  roleNotAssignable,
  roleNotFound,
} from './AccessManagement.errors';

/** A role as an account row carries it. */
export interface AccountRoleRecord {
  readonly id: number;
  readonly documentId: string;
  readonly slug: string;
  readonly name: string;
  readonly rank: number;
  readonly isSystem: boolean;
}

/** An account row with its role. No password, secret or token data. */
export interface AccountRecord {
  readonly id: number;
  readonly documentId: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: AccountStatus;
  readonly is2faEnabled: boolean;
  readonly twoFaMethod: TwoFaMethod | null;
  readonly createdAt: Date;
  readonly role: AccountRoleRecord;
}

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

export function toAccountView(
  actor: AccountActor,
  row: AccountRecord,
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
 * D6 on a locked target: 404 when the lock found nothing (unknown, deleted or
 * a reviewer account), 403 for the actor itself or an account of equal or
 * higher rank.
 */
export function assertManageable(
  actor: AccountActor,
  target: AccountRecord | null,
): AccountRecord {
  if (target === null) throw accountNotFound();
  if (target.id === actor.accountId) throw rankForbidden();
  assertOutranks(actor, target.role.rank);
  return target;
}

function isAssignable(role: AccountRoleRecord): boolean {
  return !(
    role.isSystem &&
    (UNASSIGNABLE_ROLE_SLUGS as readonly string[]).includes(role.slug)
  );
}

/**
 * D6 on a locked role: 404 when unknown, 403 unless the actor outranks it (so `owner` is never
 * assignable), 400 for roles accounts never hold.
 */
export function assertAssignable(
  actor: AccountActor,
  role: AccountRoleRecord | null,
): AccountRoleRecord {
  if (role === null) throw roleNotFound();
  assertOutranks(actor, role.rank);
  if (!isAssignable(role)) throw roleNotAssignable();
  return role;
}
