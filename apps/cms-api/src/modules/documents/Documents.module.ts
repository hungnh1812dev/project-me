import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AccessModule } from '../access';
import { DocumentAuthModule } from '../access/document-auth';
import { ContentEngineModule } from '../content-engine';
import { MediaModule } from '../media';
import { KyselyDocumentRepository } from './adapters/KyselyDocument.repository';
import { PrismaPresenceAccountAdapter } from './adapters/PrismaPresenceAccount.adapter';
import {
  ACTIVITY_RECORDER,
  type ActivityRecorder,
  DOCUMENT_REPOSITORY,
  PRESENCE_ACCOUNT_LOOKUP,
} from './application/Documents.port';
import { DocumentsCommandService } from './application/DocumentsCommand.service';
import { DocumentsQueryService } from './application/DocumentsQuery.service';
import { BulkService } from './application/Bulk.service';
import { PresenceService } from './application/Presence.service';
import { PublishService } from './application/Publish.service';
import { BulkController } from './http/Bulk.controller';
import { DocumentsController } from './http/Documents.controller';

/** Activity tracking `none`: the default; records nothing. A `database` recorder replaces this binding. */
const NO_ACTIVITY_RECORDER: ActivityRecorder = {
  record: () => Promise.resolve(),
};

/** Document reads, writes, publish and delete: JWT, API token or anonymous, through the access layer. */
@Module({
  imports: [
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
    { provide: DOCUMENT_REPOSITORY, useClass: KyselyDocumentRepository },
    {
      provide: PRESENCE_ACCOUNT_LOOKUP,
      useClass: PrismaPresenceAccountAdapter,
    },
    { provide: ACTIVITY_RECORDER, useValue: NO_ACTIVITY_RECORDER },
  ],
  exports: [DocumentsQueryService],
})
export class DocumentsModule {}
