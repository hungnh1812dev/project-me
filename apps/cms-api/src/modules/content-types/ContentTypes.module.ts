import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine';
import { ContentTypesService } from './application/ContentTypes.service';
import { DefinitionValidationService } from './application/DefinitionValidation.service';
import { ContentTypesController } from './http/ContentTypes.controller';

/** Content types API: reads need the access policy, the owner's validate check the registry. */
@Module({
  imports: [AccessModule, ContentEngineModule],
  controllers: [ContentTypesController],
  providers: [ContentTypesService, DefinitionValidationService],
})
export class ContentTypesModule {}
