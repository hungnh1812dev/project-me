import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { DocumentsModule } from '../documents/documents.module';
import { IdentityModule } from '../identity';
import { GraphqlController } from './graphql.controller';
import { GraphqlExecutor } from './graphql.executor';
import { GraphqlSchemaProvider } from './graphql.schema.provider';

/**
 * GraphQL read API (SPEC D18, GQ2). Reads go through `DocumentsQueryService`
 * only; `DocumentAuthGuard` needs the identity and access modules.
 */
@Module({
  imports: [AccessModule, ContentEngineModule, DocumentsModule, IdentityModule],
  controllers: [GraphqlController],
  providers: [GraphqlExecutor, GraphqlSchemaProvider],
})
export class GraphqlModule {}
