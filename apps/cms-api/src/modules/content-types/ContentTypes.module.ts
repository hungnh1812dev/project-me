import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { ContentTypesController } from './http/ContentTypes.controller';
import { ContentTypesService } from './application/ContentTypes.service';

/** Read-only content types API: needs the access policy. */
@Module({
  imports: [AccessModule],
  controllers: [ContentTypesController],
  providers: [ContentTypesService],
})
export class ContentTypesModule {}
