import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AUDIT_ACTIONS,
  OWNER_CREATED_CHANNELS,
  SETUP_REJECTION_REASONS,
  type SetupRejectionReason,
} from '../security-audit';
import { SecurityAuditService } from '../security-audit';
import {
  OWNER_BOOTSTRAP_ERRORS,
  OWNER_SETUP_ERROR_CODES,
  OWNER_SETUP_MESSAGES,
} from './domain/Identity.constants';
import { OWNER_ROLE_SLUG } from '../access';
import { bootstrapOwner, OwnerBootstrapError } from './owner-bootstrap';
import {
  carriesSetupToken,
  parseOwnerSetupBody,
  submittedSetupToken,
} from './owner-setup.requests';
import { isSetupTokenValid } from './domain/SetupToken.rules';

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
 */
@Injectable()
export class OwnerSetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OwnerSetupService.name);
  private readonly token: string | undefined;
  private closed = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SecurityAuditService,
    @Inject(APP_CONFIG) config: IAppConfig,
  ) {
    this.token = config.secrets.ownerSetupToken;
  }

  /** Warns once at boot when the token is still set after the owner exists. */
  async onApplicationBootstrap(): Promise<void> {
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

  /** `body` is the raw JSON body; the token is checked before anything else is read. */
  async createOwner(
    body: unknown,
    meta: SetupClientMeta,
  ): Promise<{ email: string }> {
    const configured = this.token;
    if (configured === undefined || !(await this.isOpen())) {
      return this.refuseClosed(body, meta);
    }

    if (!isSetupTokenValid(submittedSetupToken(body), configured)) {
      await this.reject(SETUP_REJECTION_REASONS.BAD_TOKEN, meta);
      throw new UnauthorizedException({
        errorCode: OWNER_SETUP_ERROR_CODES.TOKEN_INVALID,
        message: OWNER_SETUP_MESSAGES.TOKEN_INVALID,
      });
    }

    const input = parseOwnerSetupBody(body);
    try {
      const owner = await bootstrapOwner(this.prisma, input, {
        channel: OWNER_CREATED_CHANNELS.SETUP_PAGE,
        ip: meta.ip,
      });
      this.closed = true;
      this.logger.warn(OWNER_SETUP_MESSAGES.TOKEN_STILL_SET);
      return { email: owner.email };
    } catch (error) {
      if (!(error instanceof OwnerBootstrapError)) throw error;
      switch (error.code) {
        case OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS:
          this.closed = true;
          return this.refuseClosed(body, meta);
        case OWNER_BOOTSTRAP_ERRORS.EMAIL_TAKEN:
          throw new ConflictException({
            errorCode: OWNER_SETUP_ERROR_CODES.EMAIL_TAKEN,
            message: OWNER_SETUP_MESSAGES.EMAIL_TAKEN,
          });
        case OWNER_BOOTSTRAP_ERRORS.ROLE_MISSING:
          throw new ServiceUnavailableException({
            errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: OWNER_SETUP_MESSAGES.UNAVAILABLE,
          });
        default:
          throw error;
      }
    }
  }

  /** True once a live owner exists; sets the latch and warns on the first sight. */
  private async hasOwnerAccount(): Promise<boolean> {
    if (this.closed) return true;
    const owner = await this.prisma.account.findFirst({
      where: { roleSlug: OWNER_ROLE_SLUG, deletedAt: null },
      select: { id: true },
    });
    if (owner === null) return false;
    this.closed = true;
    if (this.token !== undefined) {
      this.logger.warn(OWNER_SETUP_MESSAGES.TOKEN_STILL_SET);
    }
    return true;
  }

  private async refuseClosed(
    body: unknown,
    meta: SetupClientMeta,
  ): Promise<never> {
    if (carriesSetupToken(body)) {
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
