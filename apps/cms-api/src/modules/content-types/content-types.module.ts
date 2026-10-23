import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { IdentityModule } from '../identity';
import { ContentTypesController } from './content-types.controller';
import { ContentTypesService } from './content-types.service';

/** Read-only content types API (T17b): needs the policy and the JWT guard. */
@Module({
  imports: [AccessModule, IdentityModule],
  controllers: [ContentTypesController],
  providers: [ContentTypesService],
})
export class ContentTypesModule {}
