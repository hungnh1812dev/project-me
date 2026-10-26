import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MediaStorageModule } from '../../infrastructure/media/media-storage.module';
import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine';
import { SecurityAuditModule } from '../security-audit';
import { MediaController } from './http/Media.controller';
import { MediaDeleteService } from './media-delete.service';
import { DocumentMediaService } from './document-media.service';
import { MediaUpdateService } from './media-update.service';
import { MediaPurgeJob } from './media-purge.job';
import { MediaService } from './media.service';
import { UPLOAD_PROCESSOR } from './application/Media.port';
import { UploadMediaService } from './application/UploadMedia.service';
import { UploadProcessingAdapter } from './adapters/UploadProcessing.adapter';

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
    UploadMediaService,
    { provide: UPLOAD_PROCESSOR, useClass: UploadProcessingAdapter },
  ],
  exports: [MediaService, DocumentMediaService],
})
export class MediaModule {}
