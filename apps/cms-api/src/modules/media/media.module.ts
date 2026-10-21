import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MediaStorageModule } from '../../infrastructure/media/media-storage.module';
import { AccessModule } from '../access/access.module';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaController } from './media.controller';
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
  ],
  controllers: [MediaController],
  providers: [MediaService, UploadPipeline],
  exports: [MediaService],
})
export class MediaModule {}
