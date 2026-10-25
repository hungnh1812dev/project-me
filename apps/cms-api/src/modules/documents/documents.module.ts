import { Module } from '@nestjs/common';

import { ActivityModule } from '../../infrastructure/activity/activity.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AccessModule } from '../access';
import { DocumentAuthModule } from '../access/document-auth';
import { ContentEngineModule } from '../content-engine';
import { MediaModule } from '../media';
import { BulkController } from './http/Bulk.controller';
import { BulkService } from './bulk.service';
import { DocumentsCommandService } from './documents.command.service';
import { DocumentsController } from './http/Documents.controller';
import { DocumentsQueryService } from './documents.query.service';
import { PresenceService } from './presence.service';
import { PublishService } from './publish.service';

/** Document reads, writes, publish and delete: JWT, API token or anonymous, through the access layer. */
@Module({
  imports: [
    ActivityModule,
    AccessModule,
    ContentEngineModule,
    DatabaseModule,
    DocumentAuthModule,
    MediaModule,
  ],
  // BulkController first: `documents/:slug/bulk/publish` must not match `:slug/:documentId/publish`.
  controllers: [BulkController, DocumentsController],
  providers: [
    DocumentsQueryService,
    DocumentsCommandService,
    PublishService,
    BulkService,
    PresenceService,
  ],
  exports: [DocumentsQueryService],
})
export class DocumentsModule {}
