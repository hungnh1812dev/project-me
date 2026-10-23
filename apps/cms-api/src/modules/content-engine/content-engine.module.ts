import { Module } from '@nestjs/common';

import { ContentDbProvider } from './content-database';
import { ContentRegistryProvider } from './content-registry.provider';

@Module({
  providers: [ContentRegistryProvider, ContentDbProvider],
  exports: [ContentRegistryProvider, ContentDbProvider],
})
export class ContentEngineModule {}
