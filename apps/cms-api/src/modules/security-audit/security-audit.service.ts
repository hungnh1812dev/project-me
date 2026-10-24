import { createHmac, hkdfSync } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  type AuditActorType,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { ActorContext, ActorKind, SystemSubject } from '../access';
import { AUDIT_EMAIL_HMAC, type AuditAction } from './security-audit.constants';

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

/** Anything that can insert an audit row: a transaction or the client. */
export type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

const ACTOR_TYPE: Readonly<Record<AuditActor['type'], AuditActorType>> = {
  account: 'account',
  api_token: 'api_token',
  system: 'system',
};

function actorIdOf(actor: AuditActor): number | null {
  return actor.type === 'system' ? null : actor.accountId;
}

function metadataOf(entry: AuditEntry): Prisma.InputJsonObject {
  const metadata: Record<string, AuditMetadataValue> = {
    ...(entry.metadata ?? {}),
  };
  if (entry.actor.type === 'api_token') metadata.tokenId = entry.actor.tokenId;
  return metadata;
}

/**
 * Inserts one `audit_logs` row with `writer`. Pass the caller's transaction
 * so the row commits or rolls back with the change it records (D15). Also
 * used by CLIs that run without Nest (`owner:reset-2fa`).
 */
export async function writeAuditLog(
  writer: AuditWriter,
  entry: AuditEntry,
): Promise<void> {
  await writer.auditLog.create({
    data: {
      actorId: actorIdOf(entry.actor),
      actorType: ACTOR_TYPE[entry.actor.type],
      action: entry.action,
      subject: entry.subject ?? null,
      targetId: entry.targetId ?? null,
      metadata: metadataOf(entry),
      ip: entry.ip ?? null,
    },
  });
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

/**
 * D15 SecurityAuditService: always on, independent of activity tracking.
 * `record` writes inside the caller's transaction; `recordStandalone` is
 * for events with no write of their own (a failed sign-in or re-auth).
 */
@Injectable()
export class SecurityAuditService {
  private readonly emailKey: Buffer | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) config: IAppConfig,
  ) {
    const pepper = config.secrets.otpPepper;
    this.emailKey =
      pepper === undefined
        ? undefined
        : Buffer.from(
            hkdfSync(
              AUDIT_EMAIL_HMAC.HKDF_DIGEST,
              Buffer.from(pepper, 'utf8'),
              Buffer.alloc(0),
              AUDIT_EMAIL_HMAC.HKDF_INFO,
              AUDIT_EMAIL_HMAC.KEY_BYTES,
            ),
          );
  }

  record(tx: AuditWriter, entry: AuditEntry): Promise<void> {
    return writeAuditLog(tx, entry);
  }

  recordStandalone(entry: AuditEntry): Promise<void> {
    return writeAuditLog(this.prisma, entry);
  }

  /**
   * Keyed HMAC (hex) of the normalized email, or null when OTP_PEPPER is
   * unset (development only; production requires it, D17).
   */
  emailHmac(email: string): string | null {
    if (this.emailKey === undefined) return null;
    return createHmac(AUDIT_EMAIL_HMAC.HMAC_ALGORITHM, this.emailKey)
      .update(email.trim().toLowerCase())
      .digest('hex');
  }
}
