import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { SecurityAuditService } from './security-audit.service';

/** D15 security audit: the one provider of `SecurityAuditService`. */
@Module({
  imports: [DatabaseModule],
  providers: [SecurityAuditService],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
