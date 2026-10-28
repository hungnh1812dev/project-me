import type { ActorContext, ActorKind, SystemSubject } from '../../access';
import type { AuditAction } from './SecurityAudit.constants';

/** Who did it. `accountId` null: a sign-in attempt for an unknown email. */
export type AuditActor =
  | { readonly type: 'account'; readonly accountId: number | null }
  | {
      readonly type: 'api_token';
      /** The token's creator (`actor_id`). */
      readonly accountId: number;
      readonly tokenId: number;
    }
  | { readonly type: 'system' };

/** Names, ids, counts and flags only: never a field value or a secret (D15). */
export type AuditMetadataValue =
  string | number | boolean | null | readonly string[];

export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

export interface AuditEntry {
  readonly actor: AuditActor;
  readonly action: AuditAction;
  /** The system subject acted on; null for sign-in and self-service events. */
  readonly subject?: SystemSubject | null | undefined;
  /** `document_id` of the target (account or role), never an internal id. */
  readonly targetId?: string | null | undefined;
  readonly metadata?: AuditMetadata | undefined;
  readonly ip?: string | null | undefined;
}

type AuditActorOf<A extends ActorContext> = (actor: A) => AuditActor;

/** One mapping per actor kind, no default. Reviewers and anonymous are audited as accounts. */
const AUDIT_ACTORS: {
  [K in ActorKind]: AuditActorOf<Extract<ActorContext, { kind: K }>>;
} = {
  api_token: (actor) => ({
    type: 'api_token',
    accountId: actor.accountId,
    tokenId: actor.tokenId,
  }),
  account: (actor) => ({ type: 'account', accountId: actor.accountId }),
  reviewer: (actor) => ({ type: 'account', accountId: actor.accountId }),
  anonymous: () => ({ type: 'account', accountId: null }),
};

/** The audit actor of an authenticated request. */
export function auditActorOf(actor: ActorContext): AuditActor {
  return (AUDIT_ACTORS[actor.kind] as AuditActorOf<ActorContext>)(actor);
}

/**
 * An account acting on itself (sign-in, password, 2FA); null for a sign-in
 * attempt with an unknown email.
 */
export function selfActor(accountId: number | null): AuditActor {
  return { type: 'account', accountId };
}
