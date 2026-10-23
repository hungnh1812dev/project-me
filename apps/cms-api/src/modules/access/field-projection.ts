import type { TableNode } from '../content-engine';
import { joinFieldPath } from './field-paths';
import type { FieldSelection } from './policy-evaluator';
import {
  hiddenSystemColumns,
  type RecordReadAccess,
} from './record-read-access';

/**
 * SPEC D3: unreadable columns are never selected. Returns a copy of the
 * table tree (from the registry plan) that keeps only readable columns and
 * drops component tables nothing readable lies in. A component that is
 * only partly readable is kept with its readable columns.
 *
 * Read paths pass the result where they would pass the registry's
 * `type.root`: `loadComponentTrees(db, projected, ids)` and `rowToValues`
 * then never touch a masked column or table, and `selectedColumns()` gives
 * the root select list. Names still come only from the plan.
 */
export function projectTable(
  table: TableNode,
  readable: FieldSelection,
  prefix = '',
): TableNode {
  if (readable.all) return table;
  const columns = table.plan.columns.filter((column) =>
    readable.allows(joinFieldPath(prefix, column.field.name)),
  );
  const components = table.components.flatMap((component) => {
    const path = joinFieldPath(prefix, component.field.name);
    if (!readable.reaches(path)) return [];
    return [
      { ...component, table: projectTable(component.table, readable, path) },
    ];
  });
  return {
    plan: { ...table.plan, columns },
    columnsByField: new Map(
      columns.map((column) => [column.field.name, column]),
    ),
    components,
  };
}

/**
 * System columns the access may see plus the (projected) field columns of
 * a table, for `.select()`. Hidden system fields (`created_by` /
 * `updated_by` for anonymous and reviewer actors) are not selected either;
 * a row condition may still compare them in the WHERE clause.
 */
export function selectedColumns(
  table: TableNode,
  access: RecordReadAccess,
): string[] {
  const hidden = hiddenSystemColumns(access);
  return [
    ...table.plan.systemColumns.filter((column) => !hidden.has(column)),
    ...table.plan.columns.map((column) => column.name),
  ];
}
