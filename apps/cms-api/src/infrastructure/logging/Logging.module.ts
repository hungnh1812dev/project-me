import { Global, Module } from '@nestjs/common';

import { APP_LOGGER } from './AppLogger.port';
import { NestAppLogger } from './NestAppLogger.adapter';

/** Global so a use case can inject `APP_LOGGER` without importing a module. */
@Global()
@Module({
  providers: [{ provide: APP_LOGGER, useClass: NestAppLogger }],
  exports: [APP_LOGGER],
})
export class LoggingModule {}
