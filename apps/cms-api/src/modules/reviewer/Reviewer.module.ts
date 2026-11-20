import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { APP_CONFIG } from '../../config/Config.constants';
import { DatabaseModule } from '../../infrastructure/database/Database.module';
import { AccessModule } from '../access';
import { HumanCheckModule } from '../human-check';
import { IdentityModule } from '../identity';
import { SecurityAuditModule } from '../security-audit';
import { PrismaReviewerRepository } from './adapters/PrismaReviewer.repository';
import { PrismaReviewerAccountAdapter } from './adapters/PrismaReviewerAccount.adapter';
import {
  IS_REVIEWER_FEATURE_ENABLED,
  REVIEWER_ACCOUNT_GATEWAY,
  REVIEWER_IP_KEY,
  REVIEWER_REPOSITORY,
} from './application/Reviewer.port';
import { deriveReviewerIpKey, ReviewerAccessService } from './application/ReviewerAccess.service';
import { ReviewerCleanupService } from './application/ReviewerCleanup.service';
import { ReviewerController } from './http/Reviewer.controller';
import { ReviewerCleanupJob } from './jobs/ReviewerCleanup.job';

/** Reviewer toggle, sessions, Turnstile check and cleanup (D2). */
@Module({
  imports: [AccessModule, DatabaseModule, HumanCheckModule, IdentityModule, SecurityAuditModule],
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
      provide: IS_REVIEWER_FEATURE_ENABLED,
      inject: [APP_CONFIG],
      useFactory: (config: IAppConfig) => config.reviewer.isFeatureEnabled,
    },
    {
      provide: REVIEWER_IP_KEY,
      inject: [APP_CONFIG],
      useFactory: (config: IAppConfig) => deriveReviewerIpKey(config.secrets.otpPepper),
    },
  ],
})
export class ReviewerModule {}
