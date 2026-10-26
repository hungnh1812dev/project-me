import type { Kysely } from 'kysely';

import { KyselyContentTransactionRunner } from '../../src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter';
import type { ContentDbProvider } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import type { UnitOfWork } from '../../src/infrastructure/database/TransactionRunner.port';

const SILENT_LOGGER = { warn: () => undefined, error: () => undefined };

/** Runs `work` in one content transaction opened by the real runner, for specs that seed rows on their own Kysely handle. */
export function inContentUnit<T>(
  db: Kysely<ContentDatabase>,
  work: (unit: UnitOfWork) => Promise<T>,
): Promise<T> {
  const provider = { db } as ContentDbProvider;
  return new KyselyContentTransactionRunner(provider, SILENT_LOGGER).run(work);
}
