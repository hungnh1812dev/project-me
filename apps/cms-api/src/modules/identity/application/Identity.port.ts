import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { AccountStatus } from '../../access';
import type { RotationSuccessorFacts } from '../domain/Authentication.rules';
import type { OtpPurpose, TwoFaMethod } from '../domain/Identity.constants';
import type { SealedSecret } from './SecretBox.service';

/** The TOTP fields of an account row needed to check a code. */
export interface TotpAccount {
  readonly id: number;
  readonly documentId: string;
  readonly totpSecretEnc: string | null;
  readonly totpSecretKid: string | null;
  readonly totpLastStep: number | null;
}

/** An accepted TOTP time step, with the secret sealed again when an older key had sealed it. */
export interface TotpStepClaim {
  readonly accountId: number;
  readonly step: number;
  readonly resealed?: SealedSecret | undefined;
}

/** What a sign-in reads of an account. */
export interface LoginAccountRecord {
  readonly id: number;
  readonly documentId: string;
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
  readonly tokenVersion: number;
  readonly is2faEnabled: boolean;
  readonly twoFaMethod: TwoFaMethod | null;
  readonly policyVersion: number;
}

/** `GET /auth/me`: the profile columns, no secrets. */
export interface AccountProfileRecord {
  readonly documentId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roleSlug: string;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
  readonly is2faEnabled: boolean;
  readonly twoFaMethod: TwoFaMethod | null;
}

/** What a password change re-checks of the signed-in account. */
export interface PasswordAccountRecord {
  readonly id: number;
  readonly documentId: string;
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
}

/** What an emailed code (reset, invite, 2FA) needs of the account it is for. */
export interface CodeAccountRecord {
  readonly id: number;
  readonly documentId: string;
  readonly email: string;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
  readonly is2faEnabled: boolean;
  readonly twoFaMethod: TwoFaMethod | null;
}

/** Everything the two-factor operations read of an account. */
export interface TwoFactorAccountRecord extends TotpAccount {
  readonly email: string;
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
  readonly tokenVersion: number;
  readonly is2faEnabled: boolean;
  readonly twoFaMethod: TwoFaMethod | null;
  readonly policyVersion: number;
}

/** The state a two-factor change writes; the TOTP columns are cleared unless TOTP stays on. */
export type TwoFactorNextState =
  | { readonly isEnabled: false }
  | { readonly isEnabled: true; readonly method: 'email' }
  | {
      readonly isEnabled: true;
      readonly method: 'totp';
      readonly lastStep: number;
    };

/**
 * A guarded two-factor write: it applies only while the account still looks
 * like `expect`, so a concurrent change makes it a no-op (false).
 */
export interface TwoFactorChange {
  readonly accountId: number;
  readonly expect: {
    readonly isEnabled: boolean;
    readonly method?: TwoFaMethod;
    /** The pending TOTP secret the change was checked against. */
    readonly sealedSecret?: string;
  };
  readonly next: TwoFactorNextState;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

/** The account columns identity services read and write. */
export interface AccountRepository {
  findLoginAccount(email: string): Promise<LoginAccountRecord | null>;
  findProfile(documentId: string): Promise<AccountProfileRecord | null>;
  findPasswordAccount(
    documentId: string,
  ): Promise<PasswordAccountRecord | null>;
  findCodeAccount(email: string): Promise<CodeAccountRecord | null>;
  findTwoFactorAccount(
    documentId: string,
  ): Promise<TwoFactorAccountRecord | null>;
  /** Stores the hash (and `status` when given) inside `unit`. */
  storePassword(
    unit: UnitOfWork,
    accountId: number,
    passwordHash: string,
    status?: AccountStatus,
  ): Promise<void>;
  /**
   * Replaces the pending TOTP secret while 2FA is off. False when 2FA was
   * turned on in between.
   */
  storePendingTotp(accountId: number, sealed: SealedSecret): Promise<boolean>;
  /** Applies `change` inside `unit`. True when the account still matched `change.expect`. */
  changeTwoFactor(unit: UnitOfWork, change: TwoFactorChange): Promise<boolean>;
  findTotpAccount(accountId: number): Promise<TotpAccount | null>;
  /**
   * Stores the step only while 2FA by TOTP is on and the stored step is
   * lower, so of two requests with one code only one wins. True for the winner.
   */
  claimTotpStep(claim: TotpStepClaim): Promise<boolean>;
  /** Row lock inside `unit`; the account's document id, or null when it does not exist. */
  lockDocumentId(unit: UnitOfWork, accountId: number): Promise<string | null>;
}

/** What a refresh needs of the account behind a token. */
export interface RefreshTokenAccountFacts {
  readonly documentId: string;
  readonly status: string;
  readonly deletedAt: Date | null;
  readonly tokenVersion: number;
  readonly policyVersion: number;
}

export interface RefreshTokenRecord {
  readonly id: number;
  readonly accountId: number;
  readonly familyId: string;
  readonly replacedById: number | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
  readonly account: RefreshTokenAccountFacts;
}

/** An already-rotated token with its successor, as the grace-or-reuse decision reads it. */
export interface RotatedTokenRecord {
  readonly accountId: number;
  readonly familyId: string;
  readonly revokedAt: Date | null;
  readonly successor: RotationSuccessorFacts | null;
  readonly account: RefreshTokenAccountFacts;
}

export interface NewRefreshToken {
  readonly accountId: number;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
  readonly expiresAt: Date;
}

export interface RefreshTokenFamilyOwner {
  readonly familyId: string;
  readonly accountId: number;
  readonly accountDocumentId: string;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

/** Refresh-token rows (D9). Only the SHA-256 of a token is ever stored. */
export interface RefreshTokenRepository {
  /** Inserts a token; with `unit` it commits with the caller's change. Returns the row id. */
  insert(token: NewRefreshToken, unit?: UnitOfWork): Promise<number>;
  findByHash(
    unit: UnitOfWork,
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null>;
  findFamilyOwnerByHash(
    tokenHash: string,
  ): Promise<RefreshTokenFamilyOwner | null>;
  /** Re-reads a token that lost a rotation race; the row must exist. */
  findRotated(unit: UnitOfWork, tokenId: number): Promise<RotatedTokenRecord>;
  /** Marks `tokenId` replaced and revoked while still unreplaced and unrevoked. True for the winner. */
  claimRotation(
    unit: UnitOfWork,
    tokenId: number,
    successorId: number,
    at: Date,
  ): Promise<boolean>;
  deleteById(unit: UnitOfWork, tokenId: number): Promise<void>;
  revokeFamily(unit: UnitOfWork, familyId: string, at: Date): Promise<void>;
  /** Reuse: revokes the family, then bumps the account's `token_version` so its access tokens die. */
  revokeFamilyAndBumpTokenVersion(
    unit: UnitOfWork,
    familyId: string,
    accountId: number,
    at: Date,
  ): Promise<void>;
}

export interface NewOtpCode {
  readonly accountId: number;
  readonly purpose: OtpPurpose;
  readonly codeHmac: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface LiveOtpCode {
  readonly id: number;
  readonly codeHmac: string;
}

export const OTP_CODE_REPOSITORY = Symbol('OTP_CODE_REPOSITORY');

/** One-time code rows (D8). Only the HMAC of a code is ever stored. */
export interface OtpCodeRepository {
  countIssuedSince(
    unit: UnitOfWork,
    accountId: number,
    since: Date,
  ): Promise<number>;
  /** Ends the unused codes of (account, purpose) that are still live at `at`. */
  expireLive(
    unit: UnitOfWork,
    accountId: number,
    purpose: OtpPurpose,
    at: Date,
  ): Promise<void>;
  insert(unit: UnitOfWork, code: NewOtpCode): Promise<void>;
  /** The newest unused, unexpired code of (account, purpose). */
  findLive(
    accountId: number,
    purpose: OtpPurpose,
    now: Date,
  ): Promise<LiveOtpCode | null>;
  /** Counts one check against a code with fewer than `maxAttempts` spent. True when it was counted. */
  countAttempt(codeId: number, maxAttempts: number): Promise<boolean>;
  /** Marks an unused, unexpired code used. True for the one caller that got it. */
  markUsed(unit: UnitOfWork, codeId: number, at: Date): Promise<boolean>;
}

/** DI token of the TOTP check required by password reset (D8). */
export const RESET_SECOND_FACTOR = Symbol('RESET_SECOND_FACTOR');

/**
 * D8: a password reset of an account with TOTP enabled also needs a valid
 * authenticator code. Called only after the emailed code checked out.
 * Bound to TotpService, which also stores the code's time step.
 */
export interface ResetSecondFactor {
  verify(accountId: number, totpCode: string | undefined): Promise<boolean>;
}

export const SESSION_REVOCATION_REPOSITORY = Symbol(
  'SESSION_REVOCATION_REPOSITORY',
);

/** Ends sessions inside the caller's unit (no connection of its own, so the CLI can build it). */
export interface SessionRevocationRepository {
  /** Bumps `token_version` (live access tokens die) and revokes every live refresh token at `at`. */
  revokeAll(unit: UnitOfWork, accountId: number, at: Date): Promise<void>;
}
