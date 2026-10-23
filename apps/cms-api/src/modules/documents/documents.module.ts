import { Module } from '@nestjs/common';

import { ActivityModule } from '../../infrastructure/activity/activity.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { IdentityModule } from '../identity';
import { MediaModule } from '../media/media.module';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';
import { DocumentAuthGuard } from './document-auth.guard';
import { DocumentsCommandService } from './documents.command.service';
import { DocumentsController } from './documents.controller';
import { DocumentsQueryService } from './documents.query.service';
import { PresenceService } from './presence.service';
import { PublishService } from './publish.service';

/** Document reads (T20), writes (T21), publish and delete (T22): JWT, API token or anonymous, through the access layer. */
@Module({
  imports: [
    ActivityModule,
    AccessModule,
    ContentEngineModule,
    DatabaseModule,
    IdentityModule,
    MediaModule,
  ],
  // BulkController first: `documents/:slug/bulk/publish` must not match `:slug/:documentId/publish`.
  controllers: [BulkController, DocumentsController],
  providers: [
    DocumentAuthGuard,
    DocumentsQueryService,
    DocumentsCommandService,
    PublishService,
    BulkService,
    PresenceService,
  ],
  exports: [DocumentAuthGuard, DocumentsQueryService],
})
export class DocumentsModule {}
