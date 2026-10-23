import { randomBytes } from 'node:crypto';

import {
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  DUMMY_PASSWORD_BYTES,
} from '../../common/constants/auth.constants';
import {
  type AccountStatus,
  type TwoFaMethod,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AUDIT_ACTIONS,
  LOGIN_FAILURE_REASONS,
  type LoginFailureReason,
} from '../security-audit/security-audit.constants';
import {
  SecurityAuditService,
  selfActor,
} from '../security-audit/security-audit.service';
import { AccessTokenService } from './access-token.service';
import { hashPassword, verifyPassword } from './password-hasher';
import { RefreshTokenService } from './refresh-token.service';
import { type ClientMeta } from '../../common/http/client-meta';

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/** Tokens for a signed-in session. The refresh token goes into the cookie only. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export type LoginResult =
  | ({ readonly kind: 'session' } & SessionTokens)
  | {
      readonly kind: 'two-factor';
      readonly tempToken: string;
      readonly methods: readonly TwoFaMethod[];
    };

/** `GET /auth/me`: the current account, no secrets. */
export interface CurrentAccountProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly twoFactorEnabled: boolean;
  /** The 2FA method when 2FA is on, else null (T13 Q10). */
  readonly twoFactorMethod: TwoFaMethod | null;
  /** Effective `subject:action` permissions of the caller, sorted (T33a). */
  readonly permissions: readonly string[];
}

/** What `AuthService.me` returns: the profile before permissions are added. */
export type AccountProfile = Omit<CurrentAccountProfile, 'permissions'>;

/** `refresh`: no refresh token inside the grace window (T11a). */
export interface RefreshedTokens {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
}

/** What `startSession` needs of an account whose sign-in is complete. */
export interface SessionAccount {
  readonly id: number;
  readonly documentId: string;
  readonly tokenVersion: number;
  readonly policyVersion: number;
}

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    message: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
  });
}

export function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    errorCode: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
    message: AUTH_ERROR_MESSAGES.INVALID_REFRESH_TOKEN,
  });
}

/** Why a sign-in fails, or undefined when it may go on (T17 Q4 reasons). */
function loginFailureReason(
  account: {
    readonly passwordHash: string | null;
    readonly status: AccountStatus;
    readonly deletedAt: Date | null;
  } | null,
  passwordOk: boolean,
): LoginFailureReason | undefined {
  if (account === null) return LOGIN_FAILURE_REASONS.UNKNOWN_ACCOUNT;
  if (account.passwordHash === null) return LOGIN_FAILURE_REASONS.NO_PASSWORD;
  if (!passwordOk) return LOGIN_FAILURE_REASONS.BAD_PASSWORD;
  if (account.status !== 'active' || account.deletedAt !== null) {
    return LOGIN_FAILURE_REASONS.NOT_ACTIVE;
  }
  return undefined;
}

@Injectable()
export class AuthService implements OnModuleInit {
  /**
   * Argon2id hash of a random password with the real parameters. Unknown
   * emails and accounts without a password are verified against it, so they
   * cost the same time as a wrong password.
   */
  private dummyHash: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: SecurityAuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.createDummyHash();
  }

  async login(
    credentials: LoginCredentials,
    meta: ClientMeta,
  ): Promise<LoginResult> {
    const account = await this.prisma.account.findUnique({
      where: { email: credentials.email },
      select: {
        id: true,
        documentId: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        tokenVersion: true,
        is2faEnabled: true,
        twoFaMethod: true,
        role: { select: { policyVersion: true } },
      },
    });

    // Always run exactly one Argon2id verify, whatever the account state.
    const passwordHash =
      account?.passwordHash ??
      (this.dummyHash ??= await this.createDummyHash());
    const passwordOk = await verifyPassword(passwordHash, credentials.password);

    const failure = loginFailureReason(account, passwordOk);
    if (failure !== undefined) {
      // No write to share a transaction with: a standalone row (T17 Q4).
      await this.audit.recordStandalone({
        actor: selfActor(account?.id ?? null),
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        targetId: account?.documentId ?? null,
        metadata:
          account === null
            ? {
                reason: failure,
                emailHmac: this.audit.emailHmac(credentials.email),
              }
            : { reason: failure },
        ip: meta.ip,
      });
      throw invalidCredentials();
    }
    if (account === null) throw invalidCredentials();

    if (account.is2faEnabled) {
      // Second step: POST /auth/2fa/verify with this token (T13).
      return {
        kind: 'two-factor',
        tempToken: this.accessTokens.signTwoFactorTempToken({
          sub: account.documentId,
          tv: account.tokenVersion,
        }),
        // T13 Q8: only the configured method, never an email fallback.
        methods: account.twoFaMethod === null ? [] : [account.twoFaMethod],
      };
    }

    const session = await this.startSession(
      {
        id: account.id,
        documentId: account.documentId,
        tokenVersion: account.tokenVersion,
        policyVersion: account.role.policyVersion,
      },
      meta,
    );
    return { kind: 'session', ...session };
  }

  /**
   * Issues the refresh token and access token of a completed sign-in, with
   * its `auth.login_succeeded` row in the same transaction (D15).
   * `twoFactorMethod`: the second factor used, null for password only.
   */
  async startSession(
    account: SessionAccount,
    meta: ClientMeta,
    twoFactorMethod: TwoFaMethod | null = null,
  ): Promise<SessionTokens> {
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const token = await this.refreshTokens.issue(account.id, meta, tx);
      await this.audit.record(tx, {
        actor: selfActor(account.id),
        action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
        targetId: account.documentId,
        metadata: { twoFactorMethod },
        ip: meta.ip,
      });
      return token;
    });
    return {
      refreshToken,
      accessToken: this.accessTokens.signAccessToken({
        sub: account.documentId,
        tv: account.tokenVersion,
        pv: account.policyVersion,
      }),
    };
  }

  /**
   * Rotates the refresh token. `refreshToken` is undefined for a concurrent
   * refresh inside the grace window (T11a): the browser already holds the
   * successor, so the cookie is left alone.
   */
  async refresh(rawToken: string, meta: ClientMeta): Promise<RefreshedTokens> {
    const result = await this.refreshTokens.rotate(rawToken, meta);
    if (result.kind === 'reuse') {
      // Audited inside the rotation transaction (RefreshTokenService).
      throw invalidRefreshToken();
    }
    if (result.kind === 'invalid') throw invalidRefreshToken();
    return {
      refreshToken: result.kind === 'rotated' ? result.token : undefined,
      accessToken: this.accessTokens.signAccessToken({
        sub: result.account.documentId,
        tv: result.account.tokenVersion,
        pv: result.account.policyVersion,
      }),
    };
  }

  async logout(rawToken: string | undefined, meta: ClientMeta): Promise<void> {
    if (rawToken === undefined) return;
    await this.refreshTokens.revokeFamilyOf(rawToken, meta);
  }

  async me(accountDocumentId: string): Promise<AccountProfile> {
    const account = await this.prisma.account.findUnique({
      where: { documentId: accountDocumentId },
      select: {
        documentId: true,
        email: true,
        displayName: true,
        roleSlug: true,
        status: true,
        deletedAt: true,
        is2faEnabled: true,
        twoFaMethod: true,
      },
    });
    if (
      account === null ||
      account.status !== 'active' ||
      account.deletedAt !== null
    ) {
      throw new UnauthorizedException();
    }
    return {
      id: account.documentId,
      email: account.email,
      displayName: account.displayName,
      role: account.roleSlug,
      twoFactorEnabled: account.is2faEnabled,
      twoFactorMethod: account.is2faEnabled ? account.twoFaMethod : null,
    };
  }

  private createDummyHash(): Promise<string> {
    return hashPassword(randomBytes(DUMMY_PASSWORD_BYTES).toString('hex'));
  }
}
