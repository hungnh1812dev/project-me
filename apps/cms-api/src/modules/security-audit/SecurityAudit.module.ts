import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/Database.module';
import { PrismaAuditLogRepository } from './adapters/PrismaAuditLog.repository';
import {
  AUDIT_LOG_WRITER,
  SecurityAuditService,
} from './application/SecurityAudit.service';

/** D15 security audit: the one provider of `SecurityAuditService`. */
@Module({
  imports: [DatabaseModule],
  providers: [
    SecurityAuditService,
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogRepository },
  ],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
