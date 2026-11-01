import { RICHTEXT_FIELD_TYPE } from '../ContentEngine.constants';
import type { ContentTypeRegistry } from '../ContentTypeRegistry.entity';
import { fieldTypeOf } from './FieldTypeRegistry.rules';

/** A column that stores a media file's internal id, or richtext that embeds media. Structure only, never SQL. */
export interface MediaColumnRef {
  readonly tableName: string;
  readonly columnName: string;
  readonly fieldName: string;
}

type ColumnPicker = (fieldType: string) => boolean;

const mediaCache = new WeakMap<ContentTypeRegistry, readonly MediaColumnRef[]>();
const richtextCache = new WeakMap<ContentTypeRegistry, readonly MediaColumnRef[]>();

const isMediaType: ColumnPicker = (type) => fieldTypeOf(type)?.referencesMedia === true;
const isRichtextType: ColumnPicker = (type) => type === RICHTEXT_FIELD_TYPE;

function collectColumns(registry: ContentTypeRegistry, picks: ColumnPicker): MediaColumnRef[] {
  return registry.slugs().flatMap((slug) =>
    registry.resolve(slug).tables.flatMap((table) =>
      table.columns
        .filter(({ field }) => picks(field.type))
        .map((column) => ({
          tableName: table.name,
          columnName: column.name,
          fieldName: column.field.name,
        })),
    ),
  );
}

function cachedColumns(
  cache: WeakMap<ContentTypeRegistry, readonly MediaColumnRef[]>,
  registry: ContentTypeRegistry,
  picks: ColumnPicker,
): readonly MediaColumnRef[] {
  let columns = cache.get(registry);
  if (columns === undefined) {
    columns = collectColumns(registry, picks);
    cache.set(registry, columns);
  }
  return columns;
}

function fieldNamesByTable(
  columns: readonly MediaColumnRef[],
): ReadonlyMap<string, readonly string[]> {
  const byTable = new Map<string, string[]>();
  for (const { tableName, fieldName } of columns) {
    byTable.set(tableName, [...(byTable.get(tableName) ?? []), fieldName]);
  }
  return byTable;
}

/**
 * Every column, in every content table (roots and components), whose field
 * type is marked `referencesMedia` in the field-type registry. The one place
 * that decides which columns hold media references.
 */
export function mediaColumnsOf(registry: ContentTypeRegistry): readonly MediaColumnRef[] {
  return cachedColumns(mediaCache, registry, isMediaType);
}

/** Every `richtext` column, roots and components: their images reference media files too. */
export function richtextColumnsOf(registry: ContentTypeRegistry): readonly MediaColumnRef[] {
  return cachedColumns(richtextCache, registry, isRichtextType);
}

/** Media field names per table name, for walking a document tree. */
export function mediaFieldNamesByTable(
  registry: ContentTypeRegistry,
): ReadonlyMap<string, readonly string[]> {
  return fieldNamesByTable(mediaColumnsOf(registry));
}

/** Richtext field names per table name, for walking a document tree. */
export function richtextFieldNamesByTable(
  registry: ContentTypeRegistry,
): ReadonlyMap<string, readonly string[]> {
  return fieldNamesByTable(richtextColumnsOf(registry));
}
