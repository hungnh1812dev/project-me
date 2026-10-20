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
import { type TwoFaMethod } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AccessTokenService } from './access-token.service';
import { hashPassword, verifyPassword } from './password-hasher';
import { type ClientMeta, RefreshTokenService } from './refresh-token.service';

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

    if (
      account === null ||
      account.passwordHash === null ||
      !passwordOk ||
      account.status !== 'active' ||
      account.deletedAt !== null
    ) {
      // TODO(T17): SecurityAuditService login failure (same transaction, D15).
      throw invalidCredentials();
    }

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

    // TODO(T17): SecurityAuditService login success (same transaction, D15).
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

  /** Issues the refresh token and access token of a completed sign-in. */
  async startSession(
    account: SessionAccount,
    meta: ClientMeta,
  ): Promise<SessionTokens> {
    const refreshToken = await this.refreshTokens.issue(account.id, meta);
    return {
      refreshToken,
      accessToken: this.accessTokens.signAccessToken({
        sub: account.documentId,
        tv: account.tokenVersion,
        pv: account.policyVersion,
      }),
    };
  }

  async refresh(rawToken: string, meta: ClientMeta): Promise<SessionTokens> {
    const result = await this.refreshTokens.rotate(rawToken, meta);
    if (result.kind === 'reuse') {
      // TODO(T17): SecurityAuditService refresh-token reuse (family revoked, tv bumped).
      throw invalidRefreshToken();
    }
    if (result.kind === 'invalid') throw invalidRefreshToken();
    return {
      refreshToken: result.token,
      accessToken: this.accessTokens.signAccessToken({
        sub: result.account.documentId,
        tv: result.account.tokenVersion,
        pv: result.account.policyVersion,
      }),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken === undefined) return;
    // TODO(T17): SecurityAuditService token revoke (logout).
    await this.refreshTokens.revokeFamilyOf(rawToken);
  }

  async me(accountDocumentId: string): Promise<CurrentAccountProfile> {
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
