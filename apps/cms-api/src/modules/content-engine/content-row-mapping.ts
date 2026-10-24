import { fieldTypeOf } from './field-types';
import type { TableNode } from './registry.service';
import type { FieldValues } from './tree-input';
import {
  type ComponentTrees,
  type ContentRow,
  rowToValues,
} from './tree-loader';

/** A root row with its component tree. `values` and `components` use API names. */
export interface ContentDocument {
  id: number;
  documentId: string;
  version: number;
  publishedAt: Date | null;
  locale: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  updatedBy: number | null;
  values: FieldValues;
  components: ComponentTrees;
}

/** API values -> column values; a type's `encodeForColumn` applies to non-null values. */
export function toColumnValues(
  table: TableNode,
  values: FieldValues | undefined,
): ContentRow {
  const row: ContentRow = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    const column = table.columnsByField.get(name);
    if (column === undefined || value === undefined) continue;
    const encode = fieldTypeOf(column.field.type)?.encodeForColumn;
    row[column.name] =
      encode !== undefined && value !== null ? encode(value) : value;
  }
  return row;
}

/** Maps a root row (selected with its projected columns) and its trees to a document. */
export function toDocument(
  root: TableNode,
  row: ContentRow,
  components: ComponentTrees,
): ContentDocument {
  return {
    id: row.id as number,
    documentId: row.document_id as string,
    version: row.version as number,
    publishedAt: (row.published_at as Date | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    createdBy: (row.created_by as number | null) ?? null,
    updatedBy: (row.updated_by as number | null) ?? null,
    values: rowToValues(root, row),
    components,
  };
}
