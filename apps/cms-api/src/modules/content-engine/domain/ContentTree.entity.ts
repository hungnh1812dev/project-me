import type { TableNode } from '../registry.service';
import type { FieldValues } from './TreeInput.rules';

/**
 * Kysely view of the generated content tables. Their names and columns are
 * only known at runtime (from the registry plans), so rows are loose records.
 */
export type ContentRow = Record<string, unknown>;

export type ComponentTrees = Record<string, ComponentNode[]>;

export interface ComponentNode {
  id: number;
  componentUid: string;
  orderIndex: number;
  values: FieldValues;
  components: ComponentTrees;
}

/** Plan columns -> API field names. Every planned field is present (null when empty). */
export function rowToValues(table: TableNode, row: ContentRow): FieldValues {
  const values: FieldValues = {};
  for (const column of table.plan.columns) {
    values[column.field.name] = row[column.name] ?? null;
  }
  return values;
}

/** One empty list per component field, so absent and empty look the same. */
export function emptyComponents(table: TableNode): ComponentTrees {
  const components: ComponentTrees = {};
  for (const component of table.components) {
    components[component.field.name] = [];
  }
  return components;
}
