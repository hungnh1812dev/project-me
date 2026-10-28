import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccountStatus } from '../../access';
import {
  AUDIT_ACTIONS,
  type LoginFailureReason,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import { loginFailureReason } from '../domain/Authentication.rules';
import {
  DUMMY_PASSWORD_BYTES,
  type TwoFaMethod,
} from '../domain/Identity.constants';
import {
  invalidCredentials,
  invalidRefreshToken,
  notSignedIn,
} from '../domain/Identity.errors';
import { AccessTokenService } from './AccessToken.service';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  type LoginAccountRecord,
} from './Identity.port';
import { hashPassword, verifyPassword } from './Password.service';
import { RefreshTokenService } from './RefreshToken.service';

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

@Injectable()
export class AuthService {
  /**
   * Argon2id hash of a random password with the real parameters, made at boot
   * (`ready`) and again whenever it failed. Unknown emails and accounts without a
   * password are verified against it, so they cost the same time as a wrong
   * password.
   */
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: SecurityAuditService,
  ) {}

  /** Makes the dummy hash now; the module awaits it at boot so a failure stops the start. */
  async ready(): Promise<void> {
    await this.dummyHashPromise();
  }

  /** A failed hash is dropped, so the next sign-in makes a new one instead of failing for good. */
  private dummyHashPromise(): Promise<string> {
    this.dummyHash ??= hashPassword(
      randomBytes(DUMMY_PASSWORD_BYTES).toString('hex'),
    ).catch((error: unknown) => {
      this.dummyHash = undefined;
      throw error;
    });
    return this.dummyHash;
  }

  async login(
    credentials: LoginCredentials,
    meta: ClientMeta,
  ): Promise<LoginResult> {
    const account = await this.accounts.findLoginAccount(credentials.email);
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

    const session = await this.startSession(account, meta);
    return { kind: 'session', ...session };
  }

  /** Always runs exactly one Argon2id verify, whatever the account state. */
  private async verifyPasswordAgainstAnyHash(
    account: LoginAccountRecord | null,
    password: string,
  ): Promise<boolean> {
    const passwordHash =
      account?.passwordHash ?? (await this.dummyHashPromise());
    return verifyPassword(passwordHash, password);
  }

  private async recordLoginFailure(
    account: LoginAccountRecord | null,
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
  private startTwoFactorStep(account: LoginAccountRecord): LoginResult {
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
    const refreshToken = await this.runner.run(async (unit) => {
      const token = await this.refreshTokens.issue(account.id, meta, unit);
      await this.audit.record(unit, {
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
    // 'reuse' is audited inside the rotation transaction (RefreshTokenService).
    if (rotation.kind === 'reuse' || rotation.kind === 'invalid') {
      throw invalidRefreshToken();
    }
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
    const account = await this.accounts.findProfile(accountDocumentId);
    if (
      account === null ||
      account.status !== AccountStatus.active ||
      account.deletedAt !== null
    ) {
      throw notSignedIn();
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
}
