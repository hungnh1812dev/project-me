import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/Database.module';
import { ContentEngineModule } from '../content-engine';
import { PrismaAccountVersionRepository } from './adapters/PrismaAccountVersion.repository';
import { PrismaApiTokenLookupRepository } from './adapters/PrismaApiTokenLookup.repository';
import { PrismaRolePolicyRepository } from './adapters/PrismaRolePolicy.repository';
import {
  ACCOUNT_VERSION_SOURCE,
  API_TOKEN_LOOKUP,
  PERMISSION_REPOSITORY,
  ROLE_LOOKUP,
} from './application/Access.port';
import { AccessPolicyService } from './application/AccessPolicy.service';
import { AnonymousActorService } from './application/AnonymousActor.service';
import { ApiTokenAuthentication } from './application/ApiTokenAuthentication.service';
import { RolePermissionsService } from './application/RolePermissions.service';
import { VersionCache } from './application/VersionCache.service';
import { ApiTokenAuthenticator, ApiTokenGuard } from './http/ApiToken.guard';
import { PermissionGuard } from './http/Permission.guard';

/**
 * Authorization: revocation versions, the policy evaluator over
 * the content registry, the `@RequirePermission` guard and the one write
 * path for role permissions.
 */
@Module({
  imports: [DatabaseModule, ContentEngineModule],
  providers: [
    {
      provide: ACCOUNT_VERSION_SOURCE,
      useClass: PrismaAccountVersionRepository,
    },
    { provide: API_TOKEN_LOOKUP, useClass: PrismaApiTokenLookupRepository },
    PrismaRolePolicyRepository,
    { provide: ROLE_LOOKUP, useExisting: PrismaRolePolicyRepository },
    { provide: PERMISSION_REPOSITORY, useExisting: PrismaRolePolicyRepository },
    AccessPolicyService,
    AnonymousActorService,
    ApiTokenAuthentication,
    ApiTokenAuthenticator,
    ApiTokenGuard,
    PermissionGuard,
    RolePermissionsService,
    VersionCache,
  ],
  exports: [
    ROLE_LOOKUP,
    AccessPolicyService,
    AnonymousActorService,
    ApiTokenAuthenticator,
    ApiTokenGuard,
    PermissionGuard,
    RolePermissionsService,
    VersionCache,
  ],
})
export class AccessModule {}
