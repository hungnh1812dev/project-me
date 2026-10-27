import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import type { PermissionGrant } from './ActorContext.entity';
import { type ActorContext, isOwnerRole } from './ActorContext.entity';
import { RANK_FORBIDDEN_ERROR } from './Access.constants';
import type { PolicyEvaluator } from './PolicyEvaluator.rules';
import type { SubjectCatalog } from './SubjectCatalog.rules';

/**
 * A signed-in account: the only actor that manages accounts and roles
 * (API tokens are content-only, reviewers read-only, D2/D5).
 */
export type AccountActor = Extract<ActorContext, { kind: 'account' }>;

/** @throws DomainError (forbidden) for every actor that is not a signed-in account. */
export function requireAccountActor(actor: ActorContext): AccountActor {
  if (actor.kind !== 'account')
    throw new DomainError({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
  return actor;
}

/**
 * Owner-only actions (D20): a hard check on the role, so no grant of any
 * other role can open it.
 * @throws DomainError (forbidden) unless `actor` is a signed-in owner account.
 */
export function requireOwnerActor(actor: ActorContext): AccountActor {
  const account = requireAccountActor(actor);
  if (!isOwnerRole(account.role))
    throw new DomainError({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
  return account;
}

/**
 * D6 role hierarchy (C7, §12-7): an actor may manage an account, assign a
 * role or edit a role only when the target's rank is strictly below its own.
 * No exception for "created by me", none for the owner acting on itself.
 */
export function outranks(actor: ActorContext, targetRank: number): boolean {
  return targetRank < actor.role.rank;
}

export function rankForbidden(): DomainError {
  return new DomainError({
    kind: DOMAIN_ERROR_KINDS.FORBIDDEN,
    errorCode: RANK_FORBIDDEN_ERROR.CODE,
    message: RANK_FORBIDDEN_ERROR.MESSAGE,
  });
}

/** @throws DomainError (forbidden, ACCESS_RANK_FORBIDDEN) unless `actor` outranks every rank. */
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
