import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';

/** DI token of the settings and session store. */
export const REVIEWER_REPOSITORY = Symbol('REVIEWER_REPOSITORY');
/** DI token of the reviewer account and role store. */
export const REVIEWER_ACCOUNT_GATEWAY = Symbol('REVIEWER_ACCOUNT_GATEWAY');
/** DI token for the Turnstile verifier. */
export const TURNSTILE_VERIFIER = Symbol('TURNSTILE_VERIFIER');
/** DI token of the key behind the visitor-IP HMAC (`Buffer | undefined`). */
export const REVIEWER_IP_KEY = Symbol('REVIEWER_IP_KEY');

/**
 * `passed`: the challenge was solved. `failed`: Cloudflare refused the token.
 * `unavailable`: no answer (not configured, network error, bad reply); the
 * caller must fail closed.
 */
export type TurnstileOutcome = 'passed' | 'failed' | 'unavailable';

export interface TurnstileVerifier {
  /** False when no secret key is set: `verify` then always answers `unavailable`. */
  readonly isConfigured: boolean;
  /** Server-side verification of the widget's response token. */
  verify(responseToken: string, remoteIp?: string): Promise<TurnstileOutcome>;
}

export interface NewReviewerSession {
  readonly accountId: number;
  readonly visitorRole: string;
  readonly purposeTags: readonly string[];
  readonly notes: string | null;
  readonly ipHmac: string;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** A stored session joined with its account's public id and token version. */
export interface ReviewerSessionRecord {
  readonly visitorRole: string;
  readonly purposeTags: readonly string[];
  readonly notes: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly accountDocumentId: string;
  readonly accountTokenVersion: number;
}

export interface ReviewerSessionRecordPage {
  readonly total: number;
  readonly rows: readonly ReviewerSessionRecord[];
}

/** The new reviewer account and the role policy version its token carries. */
export interface CreatedReviewerAccount {
  readonly id: number;
  readonly documentId: string;
  readonly tokenVersion: number;
  readonly policyVersion: number;
}

/** Reviewer settings (the owner's toggle) and visitor sessions. A `unit` joins the caller's transaction. */
export interface ReviewerRepository {
  isEnabled(): Promise<boolean>;
  /** Reads the toggle under `FOR SHARE`: a concurrent switch-off waits for this commit. */
  isEnabledSharedLock(unit: UnitOfWork): Promise<boolean>;
  saveEnabled(
    unit: UnitOfWork,
    enabled: boolean,
    updatedByAccountId: number,
  ): Promise<void>;
  /** Serialises session creation, so the cap and the per-IP rule are exact. */
  lockSessionCreation(unit: UnitOfWork): Promise<void>;
  countActiveSessions(nowMs: number, unit?: UnitOfWork): Promise<number>;
  /** When this address last started a session at or after `sinceMs`; undefined if none. */
  findLastSessionStartOf(
    ipHmac: string,
    sinceMs: number,
    unit?: UnitOfWork,
  ): Promise<Date | undefined>;
  addSession(unit: UnitOfWork, session: NewReviewerSession): Promise<void>;
  /** Newest first. */
  listSessions(
    page: number,
    pageSize: number,
  ): Promise<ReviewerSessionRecordPage>;
}

/** The `reviewer` role and its ephemeral accounts. */
export interface ReviewerAccountGateway {
  /** Returns the role id. */
  bumpRolePolicyVersion(unit: UnitOfWork): Promise<number>;
  /** Bumps `token_version` of every reviewer account; returns their ids. */
  revokeAllSessions(unit: UnitOfWork): Promise<number[]>;
  createAccount(
    unit: UnitOfWork,
    email: string,
  ): Promise<CreatedReviewerAccount>;
  /** Reviewer accounts whose every session has expired, by id. */
  findExpiredAccountIds(nowMs: number, limit: number): Promise<number[]>;
  deleteAccounts(ids: readonly number[]): Promise<void>;
}
