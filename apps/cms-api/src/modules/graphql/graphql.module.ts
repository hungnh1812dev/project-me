import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { DocumentAuthModule } from '../access/document-auth';
import { ContentEngineModule } from '../content-engine';
import { DocumentsModule } from '../documents';
import { GraphqlController } from './graphql.controller';
import { GraphqlExecutor } from './graphql.executor';
import { GraphqlSchemaProvider } from './graphql.schema.provider';

/**
 * GraphQL read API (SPEC D18, GQ2). Reads go through `DocumentsQueryService`
 * only; `DocumentAuthGuard` comes from `DocumentAuthModule`.
 */
@Module({
  imports: [
    AccessModule,
    ContentEngineModule,
    DocumentAuthModule,
    DocumentsModule,
  ],
  controllers: [GraphqlController],
  providers: [GraphqlExecutor, GraphqlSchemaProvider],
})
export class GraphqlModule {}
