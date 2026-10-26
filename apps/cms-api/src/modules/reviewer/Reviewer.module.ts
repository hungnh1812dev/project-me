import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AccessModule } from '../access';
import { IdentityModule } from '../identity';
import { SecurityAuditModule } from '../security-audit';
import { PrismaReviewerRepository } from './adapters/PrismaReviewer.repository';
import { PrismaReviewerAccountAdapter } from './adapters/PrismaReviewerAccount.adapter';
import {
  TurnstileClient,
  UnconfiguredTurnstileVerifier,
} from './adapters/Turnstile.client';
import {
  REVIEWER_ACCOUNT_GATEWAY,
  REVIEWER_IP_KEY,
  REVIEWER_REPOSITORY,
  TURNSTILE_VERIFIER,
  type TurnstileVerifier,
} from './application/Reviewer.port';
import {
  deriveReviewerIpKey,
  ReviewerAccessService,
} from './application/ReviewerAccess.service';
import { ReviewerCleanupService } from './application/ReviewerCleanup.service';
import { ReviewerController } from './http/Reviewer.controller';
import { ReviewerCleanupJob } from './jobs/ReviewerCleanup.job';

export function createTurnstileVerifier(config: IAppConfig): TurnstileVerifier {
  const secret = config.secrets.turnstileSecretKey;
  return secret === undefined
    ? new UnconfiguredTurnstileVerifier()
    : new TurnstileClient(secret, {
        expectedHostname: config.reviewer.turnstileExpectedHostname,
      });
}

/** Reviewer toggle, sessions, Turnstile check and cleanup (D2). */
@Module({
  imports: [AccessModule, DatabaseModule, IdentityModule, SecurityAuditModule],
  controllers: [ReviewerController],
  providers: [
    ReviewerAccessService,
    ReviewerCleanupService,
    ReviewerCleanupJob,
    { provide: REVIEWER_REPOSITORY, useClass: PrismaReviewerRepository },
    {
      provide: REVIEWER_ACCOUNT_GATEWAY,
      useClass: PrismaReviewerAccountAdapter,
    },
    {
      provide: TURNSTILE_VERIFIER,
      inject: [APP_CONFIG],
      useFactory: createTurnstileVerifier,
    },
    {
      provide: REVIEWER_IP_KEY,
      inject: [APP_CONFIG],
      useFactory: (config: IAppConfig) =>
        deriveReviewerIpKey(config.secrets.otpPepper),
    },
  ],
})
export class ReviewerModule {}
