import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { TurnstileModule } from '../../infrastructure/turnstile/turnstile.module';
import { AccessModule } from '../access';
import { IdentityModule } from '../identity';
import { SecurityAuditModule } from '../security-audit';
import { ReviewerCleanupJob } from './reviewer-cleanup.job';
import { ReviewerController } from './http/Reviewer.controller';
import { ReviewerService } from './reviewer.service';

/** Reviewer toggle, sessions and cleanup (D2). */
@Module({
  imports: [
    AccessModule,
    DatabaseModule,
    IdentityModule,
    SecurityAuditModule,
    TurnstileModule,
  ],
  controllers: [ReviewerController],
  providers: [ReviewerService, ReviewerCleanupJob],
})
export class ReviewerModule {}
