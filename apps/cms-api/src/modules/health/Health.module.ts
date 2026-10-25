import { Module } from '@nestjs/common';

import { PrismaDatabaseHealth } from './adapters/PrismaDatabaseHealth.adapter';
import { CheckReadinessService } from './application/CheckReadiness.service';
import { DATABASE_HEALTH } from './application/DatabaseHealth.port';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { HealthController } from './http/Health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    CheckReadinessService,
    { provide: DATABASE_HEALTH, useClass: PrismaDatabaseHealth },
  ],
})
export class HealthModule {}
