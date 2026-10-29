import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/Database.module';
import { PrismaDatabaseHealth } from './adapters/PrismaDatabaseHealth.adapter';
import { CheckReadinessService, DATABASE_HEALTH } from './application/CheckReadiness.service';
import { HealthController } from './http/Health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [CheckReadinessService, { provide: DATABASE_HEALTH, useClass: PrismaDatabaseHealth }],
})
export class HealthModule {}
