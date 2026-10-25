import { Inject, Injectable, Logger } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { type DatabaseConnection } from '../../infrastructure/database/database-config';
import { createMigrationDb } from './cli/migrate';
import { CONTENT_NOT_MIGRATED_PG_CODES } from './adapters/ContentEnginePersistence.constants';
import { RegistryService } from './registry.service';

const LOGGER_CONTEXT = 'ContentRegistry';

function isNotMigrated(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    CONTENT_NOT_MIGRATED_PG_CODES.includes(error.code)
  );
}

/**
 * Reads the registry from `content._content_types` (definitions are
 * re-validated there). When `content:migrate` never ran, the registry is
 * empty: every content subject is unknown and so denied (fails closed).
 */
export async function loadContentRegistry(
  connection: DatabaseConnection,
): Promise<RegistryService> {
  const db = createMigrationDb(connection);
  try {
    return await RegistryService.fromDatabase(db);
  } catch (error) {
    if (!isNotMigrated(error)) throw error;
    new Logger(LOGGER_CONTEXT).warn(
      'content._content_types not found (run content:migrate); no content types are registered.',
    );
    return RegistryService.fromDefinitions([]);
  } finally {
    await db.destroy();
  }
}

/**
 * The app's content registry, loaded on first use rather than at boot, so
 * the API starts (and readiness reports 503) while the database is down. A
 * failed load is retried on the next call; a successful one is kept for the
 * process lifetime, because content types change only through
 * `content:migrate` plus a restart (D10).
 */
@Injectable()
export class ContentRegistryProvider {
  private loading: Promise<RegistryService> | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: IAppConfig) {}

  registry(): Promise<RegistryService> {
    if (this.loading === undefined) {
      const attempt = this.load();
      this.loading = attempt;
      attempt.catch(() => {
        if (this.loading === attempt) this.loading = undefined;
      });
    }
    return this.loading;
  }

  /** Overridable in tests (fixture registries). */
  protected load(): Promise<RegistryService> {
    return loadContentRegistry(this.config.database);
  }
}
