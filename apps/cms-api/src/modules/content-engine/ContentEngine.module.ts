import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { CONTENT_TRANSACTION_RUNNER } from '../../infrastructure/database/TransactionRunner.port';
import { ContentRegistry } from './application/ContentRegistry.service';
import { CONTENT_TYPE_REPOSITORY } from './application/ContentTypeRepository.port';
import { ContentDbProvider } from './adapters/ContentDatabase.adapter';
import { KyselyContentTransactionRunner } from './adapters/KyselyContentTransactionRunner.adapter';
import { createMigrationDb } from './adapters/MigrationDb.adapter';
import { PgContentTypeRepository } from './adapters/PgContentType.repository';

@Module({
  providers: [
    ContentRegistry,
    ContentDbProvider,
    {
      provide: CONTENT_TYPE_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: IAppConfig) =>
        new PgContentTypeRepository(createMigrationDb(config.database)),
    },
    {
      provide: CONTENT_TRANSACTION_RUNNER,
      useClass: KyselyContentTransactionRunner,
    },
  ],
  exports: [ContentRegistry, ContentDbProvider, CONTENT_TRANSACTION_RUNNER],
})
export class ContentEngineModule {}
