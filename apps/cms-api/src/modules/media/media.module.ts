import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MediaStorageModule } from '../../infrastructure/media/media-storage.module';
import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine';
import { SecurityAuditModule } from '../security-audit';
import { MediaController } from './media.controller';
import { MediaDeleteService } from './media-delete.service';
import { DocumentMediaService } from './document-media.service';
import { MediaUpdateService } from './media-update.service';
import { MediaPurgeJob } from './media-purge.job';
import { MediaService } from './media.service';
import { UploadPipeline } from './upload.pipeline';

/** File library: streaming upload pipeline, storage port and list. */
@Module({
  imports: [
    AccessModule,
    ContentEngineModule,
    DatabaseModule,
    MediaStorageModule,
    SecurityAuditModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaDeleteService,
    MediaUpdateService,
    DocumentMediaService,
    MediaPurgeJob,
    UploadPipeline,
  ],
  exports: [MediaService, DocumentMediaService],
})
export class MediaModule {}
