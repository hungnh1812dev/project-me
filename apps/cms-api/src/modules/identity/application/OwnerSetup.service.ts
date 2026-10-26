import { Inject, Injectable } from '@nestjs/common';

import { type IAppConfig } from '../../../config/AppConfig.setup';
import { APP_CONFIG } from '../../../config/Config.constants';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  AUDIT_ACTIONS,
  OWNER_CREATED_CHANNELS,
  SecurityAuditService,
  SETUP_REJECTION_REASONS,
  type SetupRejectionReason,
} from '../../security-audit';
import {
  OWNER_BOOTSTRAP_ERRORS,
  OWNER_SETUP_MESSAGES,
} from '../domain/Identity.constants';
import {
  ownerEmailTaken,
  setupTokenInvalid,
  setupUnavailable,
} from '../domain/Identity.errors';
import { isSetupTokenValid } from '../domain/SetupToken.rules';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './Identity.port';
import {
  OwnerBootstrapError,
  type OwnerBootstrapInput,
  OwnerBootstrapService,
} from './OwnerBootstrap.service';

/** Thrown when the setup is closed; the controller answers the unknown-route 404. */
export class SetupClosedError extends Error {
  constructor() {
    super('Owner setup is closed.');
    this.name = 'SetupClosedError';
  }
}

export interface SetupClientMeta {
  readonly ip: string | undefined;
}

/**
 * One-time owner setup (ADR 0005). Open only while a setup token is
 * configured and no live owner exists. Once an owner is seen the `closed`
 * latch stops all further owner queries; the DB advisory lock and the
 * single-owner index still decide when several requests race.
 *
 * The HTTP layer calls `admit` with the submitted token before it reads any
 * other part of the body, then `createOwner` with the parsed values.
 */
@Injectable()
export class OwnerSetupService {
  private readonly token: string | undefined;
  private closed = false;

  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly audit: SecurityAuditService,
    private readonly bootstrap: OwnerBootstrapService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
    @Inject(APP_CONFIG) config: IAppConfig,
  ) {
    this.token = config.secrets.ownerSetupToken;
  }

  /** Warns once at boot when the token is still set after the owner exists. */
  async warnWhenTokenOutlivesSetup(): Promise<void> {
    if (this.token === undefined) return;
    try {
      await this.hasOwnerAccount();
    } catch {
      // The database may not be reachable yet; the first request decides.
    }
  }

  async isOpen(): Promise<boolean> {
    if (this.token === undefined || this.closed) return false;
    return !(await this.hasOwnerAccount());
  }

  /**
   * Lets a submit through only while the setup is open and `submittedToken`
   * matches. Closed answers `SetupClosedError`; a wrong token is audited and
   * answers 401.
   */
  async admit(submittedToken: unknown, meta: SetupClientMeta): Promise<void> {
    const configured = this.token;
    if (configured === undefined || !(await this.isOpen())) {
      return this.refuseClosed(isNonEmptyText(submittedToken), meta);
    }
    if (!isSetupTokenValid(submittedToken, configured)) {
      await this.reject(SETUP_REJECTION_REASONS.BAD_TOKEN, meta);
      throw setupTokenInvalid();
    }
  }

  /** Creates the owner from values that passed `admit` and the body check. */
  async createOwner(
    input: OwnerBootstrapInput,
    meta: SetupClientMeta,
  ): Promise<{ email: string }> {
    try {
      const owner = await this.bootstrap.bootstrap(input, {
        channel: OWNER_CREATED_CHANNELS.SETUP_PAGE,
        ip: meta.ip,
      });
      this.closed = true;
      this.warnTokenStillSet();
      return { email: owner.email };
    } catch (error) {
      if (!(error instanceof OwnerBootstrapError)) throw error;
      switch (error.code) {
        case OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS:
          this.closed = true;
          return this.refuseClosed(true, meta);
        case OWNER_BOOTSTRAP_ERRORS.EMAIL_TAKEN:
          throw ownerEmailTaken();
        case OWNER_BOOTSTRAP_ERRORS.ROLE_MISSING:
          throw setupUnavailable();
        default:
          throw error;
      }
    }
  }

  private warnTokenStillSet(): void {
    this.logger.warn(
      OWNER_SETUP_MESSAGES.TOKEN_STILL_SET,
      OwnerSetupService.name,
    );
  }

  /** True once a live owner exists; sets the latch and warns on the first sight. */
  private async hasOwnerAccount(): Promise<boolean> {
    if (this.closed) return true;
    if (!(await this.accounts.hasLiveOwner())) return false;
    this.closed = true;
    if (this.token !== undefined) {
      this.warnTokenStillSet();
    }
    return true;
  }

  /** A closed submit is audited only when it names a token (so port scans leave no rows). */
  private async refuseClosed(
    carriesToken: boolean,
    meta: SetupClientMeta,
  ): Promise<never> {
    if (carriesToken) {
      await this.reject(SETUP_REJECTION_REASONS.CLOSED, meta);
    }
    throw new SetupClosedError();
  }

  private reject(
    reason: SetupRejectionReason,
    meta: SetupClientMeta,
  ): Promise<void> {
    return this.audit.recordStandalone({
      actor: { type: 'account', accountId: null },
      action: AUDIT_ACTIONS.OWNER_SETUP_REJECTED,
      metadata: { reason },
      ip: meta.ip,
    });
  }
}

function isNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
}
