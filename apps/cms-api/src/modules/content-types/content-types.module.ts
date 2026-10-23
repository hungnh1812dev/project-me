import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { ContentTypesController } from './content-types.controller';
import { ContentTypesService } from './content-types.service';

/** Read-only content types API (T17b): needs the access policy. */
@Module({
  imports: [AccessModule],
  controllers: [ContentTypesController],
  providers: [ContentTypesService],
})
export class ContentTypesModule {}
