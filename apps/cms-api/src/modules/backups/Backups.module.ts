import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { APP_CONFIG } from '../../config/Config.constants';
import { AccessModule } from '../access';
import { IdentityModule } from '../identity';
import { SecurityAuditModule } from '../security-audit';
import { S3BackupStorage } from './adapters/S3BackupStorage.adapter';
import {
  BACKUP_PREFIX,
  BACKUP_STORAGE,
  type BackupStorage,
} from './application/Backups.port';
import { BackupsService } from './application/Backups.service';
import { BackupsController } from './http/Backups.controller';

/** No storage config: the feature is off and both routes answer `BACKUPS_NOT_CONFIGURED`. */
export function createBackupStorage(config: IAppConfig): BackupStorage | null {
  return config.backups === undefined
    ? null
    : new S3BackupStorage(config.backups);
}

/** Owner-only list of the nightly dumps and short download links (D20). */
@Module({
  imports: [AccessModule, IdentityModule, SecurityAuditModule],
  controllers: [BackupsController],
  providers: [
    BackupsService,
    {
      provide: BACKUP_STORAGE,
      inject: [APP_CONFIG],
      useFactory: createBackupStorage,
    },
    {
      provide: BACKUP_PREFIX,
      inject: [APP_CONFIG],
      useFactory: (config: IAppConfig) => config.backups?.prefix ?? null,
    },
  ],
})
export class BackupsModule {}
