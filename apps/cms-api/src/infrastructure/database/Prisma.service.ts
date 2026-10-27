import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Pool } from 'pg';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { APP_CONFIG } from '../../config/Config.constants';
import { APP_LOGGER, type AppLogger } from '../logging/AppLogger.port';
import {
  APP_SCHEMAS,
  DDL_CHECK_FAILED_WARNING,
  type DatabaseRoleFacts,
  ddlRiskNamesOf,
  ddlRiskWarningOf,
} from './DatabaseConfig.rules';
import { createPgAdapter, PrismaClient } from './PrismaClient.adapter';

const ROLE_FACTS_QUERY = `
  SELECT r.rolsuper AS "isSuperuser",
         has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateInDatabase",
         COALESCE((SELECT array_agg(n.nspname::text ORDER BY n.nspname) FROM pg_namespace n
                   WHERE n.nspname = ANY($1) AND has_schema_privilege(current_user, n.oid, 'CREATE')), '{}'::text[]) AS "schemasWithCreate",
         COALESCE((SELECT array_agg(DISTINCT n.nspname::text ORDER BY n.nspname::text) FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = ANY($1) AND c.relowner = r.oid), '{}'::text[]) AS "schemasWithOwnedObjects",
         COALESCE((SELECT array_agg(g.rolname::text ORDER BY g.rolname::text) FROM pg_auth_members m
                   JOIN pg_roles g ON g.oid = m.roleid
                   WHERE m.member = r.oid), '{}'::text[]) AS "memberOfRoles"
  FROM pg_roles r WHERE r.rolname = current_user`;

/**
 * The app's Prisma client (schema `public`). Connects lazily on first query.
 * In production it also checks once, without delaying boot, that its role
 * cannot run DDL, and only warns (ADR 0012 section 7).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly isProduction: boolean;
  private readonly logger: AppLogger;

  /** Settles when the boot role check has finished; it never rejects. */
  roleCheck: Promise<void> = Promise.resolve();

  constructor(
    @Inject(APP_CONFIG) config: IAppConfig,
    @Inject(APP_LOGGER) logger: AppLogger,
  ) {
    const { adapter, pool } = createPgAdapter(config.database);
    super({ adapter });
    this.pool = pool;
    this.isProduction = config.isProduction;
    this.logger = logger;
  }

  onModuleInit(): void {
    if (this.isProduction) this.roleCheck = this.warnIfRoleCanRunDdl();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }

  private async warnIfRoleCanRunDdl(): Promise<void> {
    try {
      const { rows } = await this.pool.query<DatabaseRoleFacts>(
        ROLE_FACTS_QUERY,
        [APP_SCHEMAS],
      );
      const riskNames = ddlRiskNamesOf(rows[0] as DatabaseRoleFacts);
      if (riskNames.length > 0) {
        this.logger.warn(ddlRiskWarningOf(riskNames), PrismaService.name);
      }
    } catch {
      this.logger.warn(DDL_CHECK_FAILED_WARNING, PrismaService.name);
    }
  }
}
