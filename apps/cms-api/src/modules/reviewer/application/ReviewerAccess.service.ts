import { createHmac, hkdfSync, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { UNKNOWN_CLIENT_IP } from '../../../common/constants/limits.constants';
import { Clock } from '../../../common/time/clock';
import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import type { PageQuery } from '../../../common/validation/SharedSchemas.rules';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  type AccountActor,
  REVIEWER_SETTINGS_SUBJECT,
  VersionCache,
} from '../../access';
import { AccessTokenService, USER_AGENT_MAX_LENGTH } from '../../identity';
import {
  AUDIT_ACTIONS,
  auditActorOf,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import {
  REVIEWER_ACCOUNT,
  REVIEWER_SESSION_TTL_MS,
} from '../domain/Reviewer.constants';
import {
  type CreatedReviewerSessionView,
  isReviewerAtCapacity,
  isReviewerSessionActive,
  retryAfterSecondsOf,
  REVIEWER_IP_WINDOW_MS,
  reviewerCapacityReached,
  reviewerDisabled,
  reviewerIpLimited,
  reviewerTurnstileFailed,
  reviewerUnavailable,
  type ReviewerSessionPage,
  type ReviewerStatusView,
} from '../domain/ReviewerAdmission.rules';
import {
  REVIEWER_ACCOUNT_GATEWAY,
  REVIEWER_IP_KEY,
  REVIEWER_REPOSITORY,
  TURNSTILE_VERIFIER,
  type ReviewerAccountGateway,
  type ReviewerRepository,
  type TurnstileVerifier,
} from './Reviewer.port';

/** What a visitor sends to start a session (the http layer validates it). */
export interface CreateReviewerSessionInput {
  readonly visitorRole: string;
  readonly purposeTags: readonly string[];
  readonly notes?: string | undefined;
  readonly turnstileToken: string;
}

export interface ReviewerSettingsInput {
  readonly enabled: boolean;
}

/** Keyed HMAC of the visitor IP (`reviewer_sessions.ip_hmac`), derived from OTP_PEPPER. */
const REVIEWER_IP_HMAC = {
  HKDF_DIGEST: 'sha256',
  HKDF_INFO: 'abyss/reviewer-ip/v1',
  KEY_BYTES: 32,
  HMAC_ALGORITHM: 'sha256',
} as const;

/** The key behind `REVIEWER_IP_KEY`; undefined without a pepper (reviewer access then answers 503). */
export function deriveReviewerIpKey(
  pepper: string | undefined,
): Buffer | undefined {
  if (pepper === undefined) return undefined;
  return Buffer.from(
    hkdfSync(
      REVIEWER_IP_HMAC.HKDF_DIGEST,
      Buffer.from(pepper, 'utf8'),
      Buffer.alloc(0),
      REVIEWER_IP_HMAC.HKDF_INFO,
      REVIEWER_IP_HMAC.KEY_BYTES,
    ),
  );
}

/**
 * Reviewer access (D2). The owner's toggle lives in `app_settings`;
 * switching it off bumps the reviewer role's `policy_version` and every
 * reviewer account's `token_version`, so live sessions get 401 on their next
 * request. A visitor passes Turnstile and gets an ephemeral `reviewer`
 * account and a 24 h access token (no refresh token: the JWT `exp` is the
 * session end; the cleanup job then deletes the account).
 */
@Injectable()
export class ReviewerAccessService {
  constructor(
    @Inject(REVIEWER_REPOSITORY) private readonly reviewers: ReviewerRepository,
    @Inject(REVIEWER_ACCOUNT_GATEWAY)
    private readonly accounts: ReviewerAccountGateway,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
    @Inject(REVIEWER_IP_KEY) private readonly ipKey: Buffer | undefined,
    private readonly clock: Clock,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    private readonly tokens: AccessTokenService,
  ) {}

  /** Public: is reviewer access switched on. */
  async status(): Promise<ReviewerStatusView> {
    return { enabled: await this.reviewers.isEnabled() };
  }

  async updateSettings(
    actor: AccountActor,
    input: ReviewerSettingsInput,
    meta: ClientMeta,
  ): Promise<ReviewerStatusView> {
    return this.transactions.run(async (unit) => {
      await this.reviewers.saveEnabled(unit, input.enabled, actor.accountId);
      const roleId = await this.accounts.bumpRolePolicyVersion(unit);
      // Off: kill live sessions (tv mismatch -> 401). Idempotent.
      const accountIds = input.enabled
        ? []
        : await this.accounts.revokeAllSessions(unit);
      await this.audit.record(unit, {
        actor: auditActorOf(actor),
        action: AUDIT_ACTIONS.REVIEWER_SETTINGS_CHANGED,
        subject: REVIEWER_SETTINGS_SUBJECT,
        metadata: {
          enabled: input.enabled,
          sessionsRevoked: accountIds.length,
        },
        ip: meta.ip,
      });
      unit.afterCommit(() => {
        this.versions.invalidateRole(roleId);
        for (const id of accountIds) this.versions.invalidateAccount(id);
      });
      return { enabled: input.enabled };
    });
  }

  async createSession(
    input: CreateReviewerSessionInput,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<CreatedReviewerSessionView> {
    const ipKey = this.requireAvailable();
    const ipHmac = this.hmacOf(ip ?? UNKNOWN_CLIENT_IP, ipKey);

    // Cheap refusals first, so a refused visitor never spends a Turnstile call.
    await this.assertAllowed(ipHmac);
    await this.assertHumanVerified(input.turnstileToken, ip);

    const expiresAt = new Date(this.clock.now() + REVIEWER_SESSION_TTL_MS);
    const created = await this.createAccountAndSession(
      input,
      ipHmac,
      userAgent,
      expiresAt,
    );

    return {
      accessToken: this.tokens.signReviewerSessionToken({
        sub: created.documentId,
        tv: created.tokenVersion,
        pv: created.policyVersion,
      }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Owner: newest first. */
  async listSessions(query: PageQuery): Promise<ReviewerSessionPage> {
    const { total, rows } = await this.reviewers.listSessions(
      query.page,
      query.pageSize,
    );
    const now = this.clock.now();
    return {
      data: rows.map((row) => ({
        id: row.accountDocumentId,
        visitorRole: row.visitorRole,
        purposeTags: row.purposeTags,
        notes: row.notes,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        active: isReviewerSessionActive(row, now),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** Returns the IP hashing key; refuses when Turnstile or the key is missing. */
  private requireAvailable(): Buffer {
    if (!this.turnstile.isConfigured || this.ipKey === undefined) {
      throw reviewerUnavailable();
    }
    return this.ipKey;
  }

  private async assertHumanVerified(
    turnstileToken: string,
    ip: string | undefined,
  ): Promise<void> {
    const outcome = await this.turnstile.verify(turnstileToken, ip);
    if (outcome === 'unavailable') throw reviewerUnavailable();
    if (outcome === 'failed') throw reviewerTurnstileFailed();
  }

  private async createAccountAndSession(
    input: CreateReviewerSessionInput,
    ipHmac: string,
    userAgent: string | undefined,
    expiresAt: Date,
  ) {
    const now = this.clock.now();
    return this.transactions.run(async (unit) => {
      // One creation at a time: the cap and the per-IP rule are then exact.
      await this.reviewers.lockSessionCreation(unit);
      await this.assertAllowed(ipHmac, unit);
      const account = await this.accounts.createAccount(
        unit,
        `${REVIEWER_ACCOUNT.EMAIL_PREFIX}${randomUUID()}@${REVIEWER_ACCOUNT.EMAIL_DOMAIN}`,
      );
      await this.reviewers.addSession(unit, {
        accountId: account.id,
        visitorRole: input.visitorRole,
        purposeTags: input.purposeTags,
        notes: input.notes ?? null,
        ipHmac,
        userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        createdAt: new Date(now),
        expiresAt,
      });
      await this.audit.record(unit, {
        actor: selfActor(account.id),
        action: AUDIT_ACTIONS.REVIEWER_SESSION_CREATED,
        targetId: account.documentId,
        metadata: { purposeCount: input.purposeTags.length },
        // No raw visitor IP anywhere in the reviewer flow: the keyed HMAC.
        ip: ipHmac,
      });
      return account;
    });
  }

  private hmacOf(value: string, key: Buffer): string {
    return createHmac(REVIEWER_IP_HMAC.HMAC_ALGORITHM, key)
      .update(value)
      .digest('hex');
  }

  /**
   * Enabled, under the global cap, and no session from this address in the
   * last 10 min. With a `unit` (the creation transaction) the toggle is read
   * with FOR SHARE, so a concurrent switch-off waits for this commit and then
   * revokes the new session too.
   */
  private async assertAllowed(
    ipHmac: string,
    unit?: UnitOfWork,
  ): Promise<void> {
    const isEnabled =
      unit === undefined
        ? await this.reviewers.isEnabled()
        : await this.reviewers.isEnabledSharedLock(unit);
    if (!isEnabled) throw reviewerDisabled();

    const now = this.clock.now();
    const active = await this.reviewers.countActiveSessions(now, unit);
    if (isReviewerAtCapacity(active)) throw reviewerCapacityReached();

    const lastStart = await this.reviewers.findLastSessionStartOf(
      ipHmac,
      now - REVIEWER_IP_WINDOW_MS,
      unit,
    );
    if (lastStart !== undefined) {
      throw reviewerIpLimited(retryAfterSecondsOf(lastStart.getTime(), now));
    }
  }
}
