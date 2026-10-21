import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ContentEngineModule } from '../content-engine/content-engine.module';
import { AnonymousActorService } from './anonymous-actor.service';
import { ApiTokenAuthenticator, ApiTokenGuard } from './api-token.guard';
import { AccessPolicyService } from './access-policy.service';
import { PermissionGuard } from './permission.guard';
import { RolePermissionsService } from './role-permissions.service';
import { SecurityAuditService } from './security-audit.service';
import { VersionCache } from './version-cache';

/**
 * Authorization (T14/T15): revocation versions, the policy evaluator over
 * the content registry, the `@RequirePermission` guard and the one write
 * path for role permissions; the D15 security audit (T17).
 */
@Module({
  imports: [DatabaseModule, ContentEngineModule],
  providers: [
    AccessPolicyService,
    AnonymousActorService,
    ApiTokenAuthenticator,
    ApiTokenGuard,
    PermissionGuard,
    RolePermissionsService,
    SecurityAuditService,
    VersionCache,
  ],
  exports: [
    AccessPolicyService,
    AnonymousActorService,
    ApiTokenAuthenticator,
    ApiTokenGuard,
    PermissionGuard,
    RolePermissionsService,
    SecurityAuditService,
    VersionCache,
  ],
})
export class AccessModule {}
