import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MediaStorageModule } from '../../infrastructure/media/media-storage.module';
import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { IdentityModule } from '../identity';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { MediaController } from './media.controller';
import { MediaDeleteService } from './media-delete.service';
import { MediaRefsService } from './media-refs.service';
import { MediaUpdateService } from './media-update.service';
import { MediaPurgeJob } from './media-purge.job';
import { MediaService } from './media.service';
import { UploadPipeline } from './upload.pipeline';

/** File library: streaming upload pipeline, storage port and list (T27). */
@Module({
  imports: [
    AccessModule,
    ContentEngineModule,
    DatabaseModule,
    IdentityModule,
    MediaStorageModule,
    SecurityAuditModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaDeleteService,
    MediaUpdateService,
    MediaRefsService,
    MediaPurgeJob,
    UploadPipeline,
  ],
  exports: [MediaService, MediaRefsService],
})
export class MediaModule {}
