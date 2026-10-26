import type { Kysely } from 'kysely';

import type { ContentMetaDatabase } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import { PgContentTypeRepository } from '../../src/modules/content-engine/adapters/PgContentType.repository';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';

/** The registry `content:migrate` left in a database, read the way the app reads it. */
export async function loadRegistryFromDatabase(
  migrationDb: Kysely<ContentMetaDatabase>,
): Promise<ContentTypeRegistry> {
  const stored = await new PgContentTypeRepository(
    migrationDb,
  ).loadDefinitions();
  if (stored.status !== 'loaded') {
    throw new Error('content:migrate has not run on this database');
  }
  return ContentTypeRegistry.fromDefinitions(stored.definitions);
}
