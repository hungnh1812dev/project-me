import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { MailModule } from '../../../infrastructure/mail/mail.module';
import { IdentityModule } from '../../identity';
import { SecurityAuditModule } from '../../security-audit';
import { AccessModule } from '../access.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { ApiTokensController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/**
 * Accounts, roles (T17) and API tokens (T19) API. A module of its own because it needs
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
  providers: [AccountsService, ApiTokensService, RolesService],
})
export class AccessManagementModule {}
