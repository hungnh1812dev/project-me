import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { TurnstileModule } from '../../infrastructure/turnstile/turnstile.module';
import { AccessModule } from '../access/access.module';
import { IdentityModule } from '../identity/identity.module';
import { ReviewerCleanupJob } from './reviewer-cleanup.job';
import { ReviewerController } from './reviewer.controller';
import { ReviewerService } from './reviewer.service';

/** Reviewer toggle, sessions and cleanup (T31, D2). */
@Module({
  imports: [AccessModule, DatabaseModule, IdentityModule, TurnstileModule],
  controllers: [ReviewerController],
  providers: [ReviewerService, ReviewerCleanupJob],
})
export class ReviewerModule {}
