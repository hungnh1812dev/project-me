import {
  CONTENT_DB_SCHEMA,
  MEDIA_FIELD_TYPE,
} from '../content-engine/content-engine.constants';
import type { RegistryService } from '../content-engine/registry.service';
import { quoteIdentifier } from '../content-engine/sql-generator';

/** Anything that can run raw SQL: a Prisma client or transaction. */
export interface RawQueryRunner {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/**
 * `select exists(...) or exists(...) as used` over every `media` column of
 * every content table (roots and components). Draft and published rows share
 * the tables, so a hit in either counts. Names come from the validated
 * registry and are quoted; the file id is the bound parameter `$1`. Null when
 * no content type has a media field.
 */
export function mediaReferenceQuery(registry: RegistryService): string | null {
  const probes: string[] = [];
  for (const slug of registry.slugs()) {
    for (const table of registry.resolve(slug).tables) {
      for (const column of table.columns) {
        if (column.field.type !== MEDIA_FIELD_TYPE) continue;
        probes.push(
          `exists (select 1 from ${quoteIdentifier(CONTENT_DB_SCHEMA)}.${quoteIdentifier(table.name)} where ${quoteIdentifier(column.name)} = $1)`,
        );
      }
    }
  }
  return probes.length === 0 ? null : `select ${probes.join(' or ')} as used`;
}

/** True when any draft or published document points at the file. */
export async function isMediaReferenced(
  runner: RawQueryRunner,
  registry: RegistryService,
  mediaId: number,
): Promise<boolean> {
  const query = mediaReferenceQuery(registry);
  if (query === null) return false;
  const rows = await runner.$queryRawUnsafe<{ used: boolean }[]>(
    query,
    mediaId,
  );
  return rows[0]?.used === true;
}
