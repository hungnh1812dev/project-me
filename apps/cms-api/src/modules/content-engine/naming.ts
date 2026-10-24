import {
  COMPONENT_SYSTEM_COLUMNS,
  MEDIA_FIELD_TYPE,
  RELATION_NAME_SUFFIXES,
  ROOT_SYSTEM_COLUMNS,
  TABLE_PATH_SEPARATOR,
} from './content-engine.constants';
import {
  type ComponentFieldDefinition,
  type ContentTypeDefinition,
  type FieldDefinition,
  isComponentField,
} from './definition.schema';

/**
 * The single place where SQL names are composed from a definition.
 * The validator checks exactly these names; the SQL generator
 * and repository must use them too, never their own string building.
 * Rules are documented in docs/modules/content-schema.md ("Naming").
 */

const UPPERCASE_LETTER = /[A-Z]/g;
const SLUG_SEPARATOR = /-/g;

/** Field name (camelCase or snake_case) -> column / table segment. `teamSize` -> `team_size`. */
export function toSqlIdentifier(fieldName: string): string {
  return fieldName.replace(
    UPPERCASE_LETTER,
    (letter) => `_${letter.toLowerCase()}`,
  );
}

/** Slug -> root table name. `cv-page` -> `cv_page`. */
export function rootTableName(slug: string): string {
  return slug.replace(SLUG_SEPARATOR, '_');
}

/** Parent table + component field -> child table. `cv_page` + `experience` -> `cv_page__experience`. */
export function componentTableName(
  parentTable: string,
  fieldName: string,
): string {
  return `${parentTable}${TABLE_PATH_SEPARATOR}${toSqlIdentifier(fieldName)}`;
}

export const relationNames = {
  primaryKey: (table: string) => `${table}${RELATION_NAME_SUFFIXES.primaryKey}`,
  parentForeignKey: (table: string) =>
    `${table}${RELATION_NAME_SUFFIXES.parentForeignKey}`,
  parentOrderIndex: (table: string) =>
    `${table}${RELATION_NAME_SUFFIXES.parentOrderIndex}`,
  draftUnique: (table: string) =>
    `${table}${RELATION_NAME_SUFFIXES.draftUnique}`,
  publishedUnique: (table: string) =>
    `${table}${RELATION_NAME_SUFFIXES.publishedUnique}`,
  publishedListIndex: (table: string) =>
    `${table}${RELATION_NAME_SUFFIXES.publishedListIndex}`,
  mediaForeignKey: (table: string, column: string) =>
    `${table}_${column}${RELATION_NAME_SUFFIXES.mediaForeignKey}`,
} as const;

/** Byte length as Postgres counts it (UTF-8). */
export function identifierBytes(name: string): number {
  return Buffer.byteLength(name, 'utf8');
}

export interface ColumnPlan {
  name: string;
  field: FieldDefinition;
  /** JSON path of the field inside the definition, for error reporting. */
  path: (string | number)[];
}

export interface RelationNamePlan {
  name: string;
  /** JSON path of the slug or field name it derives from, for error reporting. */
  namePath: (string | number)[];
}

export interface TablePlan {
  name: string;
  kind: 'root' | 'component';
  /** 0 for the root, 1..3 for components. */
  depth: number;
  parentTable: string | null;
  /** JSON path of the component field (empty for the root). */
  path: (string | number)[];
  /** JSON path of the name the table is composed from (`slug` or `...name`). */
  namePath: (string | number)[];
  systemColumns: readonly string[];
  columns: ColumnPlan[];
  /** Constraint and index names this table owns (schema-wide namespace). */
  relationNames: RelationNamePlan[];
}

function ownRelationNames(
  table: string,
  kind: TablePlan['kind'],
  namePath: (string | number)[],
  columns: ColumnPlan[],
): RelationNamePlan[] {
  const tableLevel =
    kind === 'root'
      ? [
          relationNames.primaryKey(table),
          relationNames.draftUnique(table),
          relationNames.publishedUnique(table),
          relationNames.publishedListIndex(table),
        ]
      : [
          relationNames.primaryKey(table),
          relationNames.parentForeignKey(table),
          relationNames.parentOrderIndex(table),
        ];
  const names = tableLevel.map((name) => ({ name, namePath }));
  for (const column of columns) {
    if (column.field.type === MEDIA_FIELD_TYPE) {
      names.push({
        name: relationNames.mediaForeignKey(table, column.name),
        namePath: [...column.path, 'name'],
      });
    }
  }
  return names;
}

/**
 * Every table a definition produces, root first, then components depth-first
 * in field order. Assumes the definition already passed the shape check.
 */
export function planTables(definition: ContentTypeDefinition): TablePlan[] {
  const tables: TablePlan[] = [];

  const visit = (
    name: string,
    kind: TablePlan['kind'],
    depth: number,
    parentTable: string | null,
    path: (string | number)[],
    fields: FieldDefinition[],
  ): void => {
    const columns: ColumnPlan[] = [];
    const children: {
      field: ComponentFieldDefinition;
      path: (string | number)[];
    }[] = [];

    fields.forEach((field, index) => {
      const fieldPath = [...path, 'fields', index];
      if (isComponentField(field)) {
        children.push({ field, path: fieldPath });
      } else {
        columns.push({
          name: toSqlIdentifier(field.name),
          field,
          path: fieldPath,
        });
      }
    });

    const namePath = path.length === 0 ? ['slug'] : [...path, 'name'];
    tables.push({
      name,
      kind,
      depth,
      parentTable,
      path,
      namePath,
      systemColumns:
        kind === 'root' ? ROOT_SYSTEM_COLUMNS : COMPONENT_SYSTEM_COLUMNS,
      columns,
      relationNames: ownRelationNames(name, kind, namePath, columns),
    });

    for (const child of children) {
      visit(
        componentTableName(name, child.field.name),
        'component',
        depth + 1,
        name,
        child.path,
        child.field.fields,
      );
    }
  };

  visit(rootTableName(definition.slug), 'root', 0, null, [], definition.fields);
  return tables;
}
