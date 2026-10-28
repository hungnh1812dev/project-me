import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../infrastructure/database/Database.module';
import { MailModule } from '../../../infrastructure/mail/Mail.module';
import { IdentityModule } from '../../identity';
import { SecurityAuditModule } from '../../security-audit';
import { AccessModule } from '../Access.module';
import { PrismaAccountAdminRepository } from './adapters/PrismaAccount.repository';
import { PrismaApiTokenAdminRepository } from './adapters/PrismaApiToken.repository';
import { PrismaRoleRepository } from './adapters/PrismaRole.repository';
import {
  ACCOUNT_ADMIN_REPOSITORY,
  API_TOKEN_ADMIN_REPOSITORY,
  ROLE_REPOSITORY,
} from './application/AccessManagement.port';
import { AccountsService } from './application/Accounts.service';
import { ApiTokensService } from './application/ApiTokens.service';
import { InvitationsService } from './application/Invitations.service';
import { RolesService } from './application/Roles.service';
import { AccountsController } from './http/Accounts.controller';
import { ApiTokensController } from './http/ApiTokens.controller';
import { RolesController } from './http/Roles.controller';

/**
 * Accounts, roles and API tokens API. A module of its own because it needs
 * identity (OTP invites, JWT guard) while identity already imports
 * AccessModule for the version cache and the audit.
 */
@Module({
  imports: [
    AccessModule,
    DatabaseModule,
    IdentityModule,
    MailModule,
    SecurityAuditModule,
  ],
  controllers: [AccountsController, ApiTokensController, RolesController],
  providers: [
    {
      provide: ACCOUNT_ADMIN_REPOSITORY,
      useClass: PrismaAccountAdminRepository,
    },
    {
      provide: API_TOKEN_ADMIN_REPOSITORY,
      useClass: PrismaApiTokenAdminRepository,
    },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    AccountsService,
    ApiTokensService,
    InvitationsService,
    RolesService,
  ],
})
export class AccessManagementModule {}
