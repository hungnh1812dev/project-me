import { createHmac, hkdfSync, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Clock } from '../../common/time/clock';
import { UNKNOWN_CLIENT_IP } from '../../common/constants/limits.constants';
import { USER_AGENT_MAX_LENGTH } from '../identity';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  TURNSTILE_VERIFIER,
  type TurnstileVerifier,
} from '../../infrastructure/turnstile/turnstile.port';
import type { PageQuery } from '../../common/http/request-parsing';
import { AUDIT_ACTIONS } from '../security-audit';
import {
  auditActorOf,
  SecurityAuditService,
  selfActor,
} from '../security-audit';
import {
  VersionCache,
  type AccountActor,
  REVIEWER_ROLE_SLUG,
  REVIEWER_SETTINGS_SUBJECT,
} from '../access';
import { AccessTokenService } from '../identity';
import type { ClientMeta } from '../../common/http/client-meta';
import {
  REVIEWER_ACCOUNT,
  REVIEWER_ERROR_CODES,
  REVIEWER_ERROR_MESSAGES,
  REVIEWER_SESSION_TTL_MS,
} from './domain/Reviewer.constants';
import {
  REVIEWER_IP_WINDOW_MS,
  type CreatedReviewerSessionView,
  isReviewerAtCapacity,
  isReviewerSessionActive,
  retryAfterSecondsOf,
  reviewerIpLimited,
  type ReviewerSessionPage,
  type ReviewerStatusView,
} from './domain/ReviewerAdmission.rules';
import type {
  CreateReviewerSessionRequest,
  ReviewerSettingsRequest,
} from './http/Reviewer.requests';

type Tx = Prisma.TransactionClient;

/** `app_settings.key` holding the owner's reviewer toggle (value: boolean). */
const REVIEWER_ENABLED_SETTING_KEY = 'reviewer.enabled';

/** Postgres advisory lock serialising session creation (cap and per-IP rule). */
const REVIEWER_SESSION_LOCK = 1_700_031_001;

/** Keyed HMAC of the visitor IP (`reviewer_sessions.ip_hmac`), derived from OTP_PEPPER. */
const REVIEWER_IP_HMAC = {
  HKDF_DIGEST: 'sha256',
  HKDF_INFO: 'abyss/reviewer-ip/v1',
  KEY_BYTES: 32,
  HMAC_ALGORITHM: 'sha256',
} as const;

function disabled(): ForbiddenException {
  return new ForbiddenException({
    errorCode: REVIEWER_ERROR_CODES.DISABLED,
    message: REVIEWER_ERROR_MESSAGES.DISABLED,
  });
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    errorCode: REVIEWER_ERROR_CODES.UNAVAILABLE,
    message: REVIEWER_ERROR_MESSAGES.UNAVAILABLE,
  });
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
export class ReviewerService {
  private readonly ipKey: Buffer | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    private readonly tokens: AccessTokenService,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
    @Inject(APP_CONFIG) config: IAppConfig,
  ) {
    const pepper = config.secrets.otpPepper;
    this.ipKey =
      pepper === undefined
        ? undefined
        : Buffer.from(
            hkdfSync(
              REVIEWER_IP_HMAC.HKDF_DIGEST,
              Buffer.from(pepper, 'utf8'),
              Buffer.alloc(0),
              REVIEWER_IP_HMAC.HKDF_INFO,
              REVIEWER_IP_HMAC.KEY_BYTES,
            ),
          );
  }

  /** Public: is reviewer access switched on. */
  async status(): Promise<ReviewerStatusView> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: REVIEWER_ENABLED_SETTING_KEY },
      select: { value: true },
    });
    return { enabled: row?.value === true };
  }

  async updateSettings(
    actor: AccountActor,
    input: ReviewerSettingsRequest,
    meta: ClientMeta,
  ): Promise<ReviewerStatusView> {
    const revoked = await this.prisma.$transaction(async (tx) => {
      const by = { connect: { id: actor.accountId } };
      await tx.appSetting.upsert({
        where: { key: REVIEWER_ENABLED_SETTING_KEY },
        create: {
          key: REVIEWER_ENABLED_SETTING_KEY,
          value: input.enabled,
          createdBy: by,
          updatedBy: by,
        },
        update: { value: input.enabled, updatedBy: by },
      });
      const role = await tx.role.update({
        where: { slug: REVIEWER_ROLE_SLUG },
        data: { policyVersion: { increment: 1 } },
        select: { id: true },
      });
      // Off: kill live sessions (tv mismatch -> 401). Idempotent.
      const accountIds = input.enabled
        ? []
        : (
            await tx.$queryRaw<{ id: number }[]>`
              UPDATE accounts SET token_version = token_version + 1, updated_at = now()
              WHERE role_slug = ${REVIEWER_ROLE_SLUG} RETURNING id`
          ).map((row) => row.id);
      await this.audit.record(tx, {
        actor: auditActorOf(actor),
        action: AUDIT_ACTIONS.REVIEWER_SETTINGS_CHANGED,
        subject: REVIEWER_SETTINGS_SUBJECT,
        metadata: {
          enabled: input.enabled,
          sessionsRevoked: accountIds.length,
        },
        ip: meta.ip,
      });
      return { roleId: role.id, accountIds };
    });
    this.versions.invalidateRole(revoked.roleId);
    for (const id of revoked.accountIds) this.versions.invalidateAccount(id);
    return { enabled: input.enabled };
  }

  async createSession(
    input: CreateReviewerSessionRequest,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<CreatedReviewerSessionView> {
    const ipKey = this.requireAvailable();
    const ipHmac = this.hmacOf(ip ?? UNKNOWN_CLIENT_IP, ipKey);

    // Cheap refusals first, so a refused visitor never spends a Turnstile call.
    await this.assertAllowed(this.prisma, ipHmac);
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
        sub: created.account.documentId,
        tv: created.account.tokenVersion,
        pv: created.policyVersion,
      }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Returns the IP hashing key; refuses when Turnstile or the key is missing. */
  private requireAvailable(): Buffer {
    if (!this.turnstile.isConfigured || this.ipKey === undefined) {
      throw unavailable();
    }
    return this.ipKey;
  }

  private async assertHumanVerified(
    turnstileToken: string,
    ip: string | undefined,
  ): Promise<void> {
    const outcome = await this.turnstile.verify(turnstileToken, ip);
    if (outcome === 'unavailable') throw unavailable();
    if (outcome === 'failed') {
      throw new BadRequestException({
        errorCode: REVIEWER_ERROR_CODES.TURNSTILE_FAILED,
        message: REVIEWER_ERROR_MESSAGES.TURNSTILE_FAILED,
      });
    }
  }

  private async createAccountAndSession(
    input: CreateReviewerSessionRequest,
    ipHmac: string,
    userAgent: string | undefined,
    expiresAt: Date,
  ) {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      // One creation at a time: the cap and the per-IP rule are then exact.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REVIEWER_SESSION_LOCK})`;
      await this.assertAllowed(tx, ipHmac, true);
      const role = await tx.role.findUniqueOrThrow({
        where: { slug: REVIEWER_ROLE_SLUG },
        select: { id: true, slug: true, policyVersion: true },
      });
      const account = await tx.account.create({
        data: {
          email: `${REVIEWER_ACCOUNT.EMAIL_PREFIX}${randomUUID()}@${REVIEWER_ACCOUNT.EMAIL_DOMAIN}`,
          displayName: REVIEWER_ACCOUNT.DISPLAY_NAME,
          status: 'active',
          role: { connect: { id_slug: { id: role.id, slug: role.slug } } },
        },
        select: { id: true, documentId: true, tokenVersion: true },
      });
      await tx.reviewerSession.create({
        data: {
          accountId: account.id,
          visitorRole: input.visitorRole,
          purposeTags: input.purposeTags,
          notes: input.notes ?? null,
          ipHmac,
          userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
          expiresAt,
          createdAt: new Date(now),
          lastActiveAt: new Date(now),
        },
      });
      await this.audit.record(tx, {
        actor: selfActor(account.id),
        action: AUDIT_ACTIONS.REVIEWER_SESSION_CREATED,
        targetId: account.documentId,
        metadata: { purposeCount: input.purposeTags.length },
        // No raw visitor IP anywhere in the reviewer flow: the keyed HMAC.
        ip: ipHmac,
      });
      return { account, policyVersion: role.policyVersion };
    });
  }

  /** Owner: newest first. */
  async listSessions(query: PageQuery): Promise<ReviewerSessionPage> {
    const [total, rows] = await Promise.all([
      this.prisma.reviewerSession.count(),
      this.prisma.reviewerSession.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
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
    const now = this.clock.now();
    return {
      data: rows.map((row) => ({
        id: row.account.documentId,
        visitorRole: row.visitorRole,
        purposeTags: Array.isArray(row.purposeTags)
          ? row.purposeTags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : [],
        notes: row.notes,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        active: isReviewerSessionActive(
          {
            expiresAt: row.expiresAt,
            accountTokenVersion: row.account.tokenVersion,
          },
          now,
        ),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  private hmacOf(value: string, key: Buffer): string {
    return createHmac(REVIEWER_IP_HMAC.HMAC_ALGORITHM, key)
      .update(value)
      .digest('hex');
  }

  /**
   * Enabled, under the global cap, and no session from this address in the
   * last 10 min. `lockSetting`: inside the creation transaction, read the
   * toggle with FOR SHARE so a concurrent switch-off waits for this commit
   * and then revokes the new session too.
   */
  private async assertAllowed(
    db: Tx | PrismaService,
    ipHmac: string,
    lockSetting = false,
  ): Promise<void> {
    const rows = lockSetting
      ? await db.$queryRaw<{ value: unknown }[]>`
          SELECT value FROM app_settings
          WHERE key = ${REVIEWER_ENABLED_SETTING_KEY} FOR SHARE`
      : await db.appSetting.findMany({
          where: { key: REVIEWER_ENABLED_SETTING_KEY },
          select: { value: true },
        });
    if (rows[0]?.value !== true) throw disabled();

    const now = this.clock.now();
    const active = await db.reviewerSession.count({
      where: { expiresAt: { gt: new Date(now) } },
    });
    if (isReviewerAtCapacity(active)) {
      throw new ServiceUnavailableException({
        errorCode: REVIEWER_ERROR_CODES.CAPACITY_REACHED,
        message: REVIEWER_ERROR_MESSAGES.CAPACITY_REACHED,
      });
    }
    const recent = await db.reviewerSession.findFirst({
      where: {
        ipHmac,
        createdAt: { gt: new Date(now - REVIEWER_IP_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent !== null) {
      throw reviewerIpLimited(
        retryAfterSecondsOf(recent.createdAt.getTime(), now),
      );
    }
  }
}
