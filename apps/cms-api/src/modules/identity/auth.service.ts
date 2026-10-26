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
} from './domain/Identity.constants';
import {
  type AccountStatus,
  type TwoFaMethod,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS, type LoginFailureReason } from '../security-audit';
import { SecurityAuditService, selfActor } from '../security-audit';
import { loginFailureReason } from './domain/Authentication.rules';
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
  /** The 2FA method when 2FA is on, else null. */
  readonly twoFactorMethod: TwoFaMethod | null;
  /** Effective `subject:action` permissions of the caller, sorted. */
  readonly permissions: readonly string[];
}

/** What `AuthService.me` returns: the profile before permissions are added. */
export type AccountProfile = Omit<CurrentAccountProfile, 'permissions'>;

/** `refresh`: no refresh token inside the grace window. */
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

/** The account columns a sign-in reads. */
interface LoginAccount {
  readonly id: number;
  readonly documentId: string;
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
  readonly tokenVersion: number;
  readonly is2faEnabled: boolean;
  readonly twoFaMethod: TwoFaMethod | null;
  readonly role: { readonly policyVersion: number };
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
    const account = await this.findLoginAccount(credentials.email);
    const isPasswordCorrect = await this.verifyPasswordAgainstAnyHash(
      account,
      credentials.password,
    );

    const failure = loginFailureReason(account, isPasswordCorrect);
    if (failure !== undefined) {
      await this.recordLoginFailure(account, failure, credentials.email, meta);
      throw invalidCredentials();
    }
    if (account === null) throw invalidCredentials();

    if (account.is2faEnabled) return this.startTwoFactorStep(account);

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

  private findLoginAccount(email: string): Promise<LoginAccount | null> {
    return this.prisma.account.findUnique({
      where: { email },
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
  }

  /** Always runs exactly one Argon2id verify, whatever the account state. */
  private async verifyPasswordAgainstAnyHash(
    account: LoginAccount | null,
    password: string,
  ): Promise<boolean> {
    const passwordHash =
      account?.passwordHash ??
      (this.dummyHash ??= await this.createDummyHash());
    return verifyPassword(passwordHash, password);
  }

  private async recordLoginFailure(
    account: LoginAccount | null,
    reason: LoginFailureReason,
    email: string,
    meta: ClientMeta,
  ): Promise<void> {
    // No write to share a transaction with: a standalone row.
    await this.audit.recordStandalone({
      actor: selfActor(account?.id ?? null),
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      targetId: account?.documentId ?? null,
      metadata:
        account === null
          ? { reason, emailHmac: this.audit.emailHmac(email) }
          : { reason },
      ip: meta.ip,
    });
  }

  /** Second step: POST /auth/2fa/verify with the returned token. */
  private startTwoFactorStep(account: LoginAccount): LoginResult {
    return {
      kind: 'two-factor',
      tempToken: this.accessTokens.signTwoFactorTempToken({
        sub: account.documentId,
        tv: account.tokenVersion,
      }),
      // Only the configured method, never an email fallback.
      methods: account.twoFaMethod === null ? [] : [account.twoFaMethod],
    };
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
   * refresh inside the grace window: the browser already holds the
   * successor, so the cookie is left alone.
   */
  async refresh(rawToken: string, meta: ClientMeta): Promise<RefreshedTokens> {
    const rotation = await this.refreshTokens.rotate(rawToken, meta);
    if (rotation.kind === 'reuse') {
      // Audited inside the rotation transaction (RefreshTokenService).
      throw invalidRefreshToken();
    }
    if (rotation.kind === 'invalid') throw invalidRefreshToken();
    return {
      refreshToken: rotation.kind === 'rotated' ? rotation.token : undefined,
      accessToken: this.accessTokens.signAccessToken({
        sub: rotation.account.documentId,
        tv: rotation.account.tokenVersion,
        pv: rotation.account.policyVersion,
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
