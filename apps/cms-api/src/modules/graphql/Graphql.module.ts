import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { DocumentAuthModule } from '../access/document-auth';
import { ContentEngineModule } from '../content-engine';
import { DocumentsModule } from '../documents';
import { GraphqlController } from './http/Graphql.controller';
import {
  GraphqlExecutor,
  GraphqlSchemaProvider,
} from './http/Graphql.executor';

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
