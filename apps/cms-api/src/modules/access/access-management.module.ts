import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { IdentityModule } from '../identity/identity.module';
import { AccessModule } from './access.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/**
 * Accounts and roles API (T17). A module of its own because it needs
 * identity (OTP invites, JWT guard) while identity already imports
 * AccessModule for the version cache and the audit.
 */
@Module({
  imports: [AccessModule, DatabaseModule, IdentityModule, MailModule],
  controllers: [AccountsController, RolesController],
  providers: [AccountsService, RolesService],
})
export class AccessManagementModule {}
