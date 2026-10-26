import { createHmac, hkdfSync } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { type IAppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.constants';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { AuditEntry } from '../domain/AuditActor.rules';
import { AUDIT_EMAIL_HMAC } from '../domain/SecurityAudit.constants';

/**
 * The caller's open transaction. Transitional (removedBy CR-cl-1): callers
 * that have not migrated still hand over their Prisma transaction.
 */
export type AuditTransaction = UnitOfWork | { readonly auditLog: unknown };

export const AUDIT_LOG_WRITER = Symbol('AUDIT_LOG_WRITER');

/** The only way an audit row is stored. Neither method opens a transaction. */
export interface AuditLogWriter {
  /** Inserts the row in the caller's transaction, so it commits with the change it records (D15). */
  write(transaction: AuditTransaction, entry: AuditEntry): Promise<void>;
  /** Inserts the row on its own, for events with no write of their own. */
  writeStandalone(entry: AuditEntry): Promise<void>;
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
    @Inject(AUDIT_LOG_WRITER) private readonly writer: AuditLogWriter,
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

  record(transaction: AuditTransaction, entry: AuditEntry): Promise<void> {
    return this.writer.write(transaction, entry);
  }

  recordStandalone(entry: AuditEntry): Promise<void> {
    return this.writer.writeStandalone(entry);
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
