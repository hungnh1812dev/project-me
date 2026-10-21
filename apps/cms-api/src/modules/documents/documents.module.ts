import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { IdentityModule } from '../identity/identity.module';
import { DocumentAuthGuard } from './document-auth.guard';
import { DocumentsController } from './documents.controller';
import { DocumentsQueryService } from './documents.query.service';

/** Document reads (T20): JWT, API token or anonymous, through the access layer. */
@Module({
  imports: [AccessModule, ContentEngineModule, IdentityModule],
  controllers: [DocumentsController],
  providers: [DocumentAuthGuard, DocumentsQueryService],
})
export class DocumentsModule {}
