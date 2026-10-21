import { Module } from '@nestjs/common';

import { ActivityModule } from '../../infrastructure/activity/activity.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AccessModule } from '../access/access.module';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
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
  controllers: [DocumentsController],
  providers: [
    DocumentAuthGuard,
    DocumentsQueryService,
    DocumentsCommandService,
    PublishService,
    PresenceService,
  ],
})
export class DocumentsModule {}
