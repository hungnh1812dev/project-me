import { ForbiddenException } from '@nestjs/common';

import type { PermissionGrant } from './actor-context';
import { type ActorContext, isOwnerRole } from './actor-context';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
} from './access-management.constants';
import type { PolicyEvaluator } from './policy-evaluator';
import type { SubjectCatalog } from './subject-catalog';

/**
 * A signed-in account: the only actor that manages accounts and roles
 * (API tokens are content-only, reviewers read-only, D2/D5).
 */
export type AccountActor = Extract<ActorContext, { kind: 'account' }>;

/** @throws ForbiddenException for every actor that is not a signed-in account. */
export function requireAccountActor(actor: ActorContext): AccountActor {
  if (actor.kind !== 'account') throw new ForbiddenException();
  return actor;
}

/**
 * D6 role hierarchy (C7, §12-7): an actor may manage an account, assign a
 * role or edit a role only when the target's rank is strictly below its own.
 * No exception for "created by me", none for the owner acting on itself.
 */
export function outranks(actor: ActorContext, targetRank: number): boolean {
  return targetRank < actor.role.rank;
}

export function rankForbidden(): ForbiddenException {
  return new ForbiddenException({
    errorCode: MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN,
    message: MANAGEMENT_ERROR_MESSAGES.RANK_FORBIDDEN,
  });
}

/** @throws ForbiddenException (ACCESS_RANK_FORBIDDEN) unless `actor` outranks every rank. */
export function assertOutranks(
  actor: ActorContext,
  ...targetRanks: readonly number[]
): void {
  if (!targetRanks.every((rank) => outranks(actor, rank))) {
    throw rankForbidden();
  }
}

/**
 * System subject grants the actor does not hold itself, as indexes into
 * `grants`. Without this check an admin could hand `audit_logs` (owner only)
 * to a lower custom role and read it through a second account. Content
 * subjects are bounded by the rank rule alone (field-level subsets are not
 * compared). The owner holds everything.
 */
export function grantsBeyondActor(
  actor: ActorContext,
  grants: readonly PermissionGrant[],
  catalog: SubjectCatalog,
  evaluator: PolicyEvaluator,
): number[] {
  if (isOwnerRole(actor.role)) return [];
  const beyond: number[] = [];
  grants.forEach((grant, index) => {
    if (
      catalog.isSystemSubject(grant.subject) &&
      !evaluator.can(actor, grant.action, grant.subject)
    ) {
      beyond.push(index);
    }
  });
  return beyond;
}
