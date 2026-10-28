import { Module } from '@nestjs/common';

import { IdentityModule } from '../../identity';
import { AccessModule } from '../Access.module';
import { DocumentAuthGuard } from './http/DocumentAuth.guard';

/**
 * Who is reading content (SPEC D5). Kept apart from `AccessModule` because
 * the guard needs `IdentityModule`, which already imports `AccessModule`.
 * `IdentityModule` is re-exported because `@UseGuards(DocumentAuthGuard)`
 * makes Nest build the guard again inside each controller's module, and
 * that module must then resolve `JwtAuthGuard` itself.
 */
@Module({
  imports: [AccessModule, IdentityModule],
  providers: [DocumentAuthGuard],
  exports: [DocumentAuthGuard, IdentityModule],
})
export class DocumentAuthModule {}
