import type { RegistryService } from '../registry.service';
import { fieldTypeOf } from './field-type.registry';

/** A column that stores a media file's internal id. Structure only, never SQL. */
export interface MediaColumnRef {
  readonly tableName: string;
  readonly columnName: string;
  readonly fieldName: string;
}

const cache = new WeakMap<RegistryService, readonly MediaColumnRef[]>();

function collectMediaColumns(registry: RegistryService): MediaColumnRef[] {
  return registry.slugs().flatMap((slug) =>
    registry.resolve(slug).tables.flatMap((table) =>
      table.columns
        .filter(({ field }) => fieldTypeOf(field.type)?.referencesMedia)
        .map((column) => ({
          tableName: table.name,
          columnName: column.name,
          fieldName: column.field.name,
        })),
    ),
  );
}

/**
 * Every column, in every content table (roots and components), whose field
 * type is marked `referencesMedia` in the field-type registry. The one place
 * that decides which columns hold media references.
 */
export function mediaColumnsOf(
  registry: RegistryService,
): readonly MediaColumnRef[] {
  let columns = cache.get(registry);
  if (columns === undefined) {
    columns = collectMediaColumns(registry);
    cache.set(registry, columns);
  }
  return columns;
}

/** Media field names per table name, for walking a document tree. */
export function mediaFieldNamesByTable(
  registry: RegistryService,
): ReadonlyMap<string, readonly string[]> {
  const byTable = new Map<string, string[]>();
  for (const { tableName, fieldName } of mediaColumnsOf(registry)) {
    byTable.set(tableName, [...(byTable.get(tableName) ?? []), fieldName]);
  }
  return byTable;
}
