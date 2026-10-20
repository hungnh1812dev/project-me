import { type Kysely, sql } from 'kysely';

import {
  COMPONENT_SYSTEM_COLUMNS,
  CONTENT_DB_SCHEMA,
} from './content-engine.constants';
import type { TableNode } from './registry.service';
import type { FieldValues } from './tree-input';

/**
 * Kysely view of the generated content tables. Their names and columns are
 * only known at runtime (from the registry plans), so rows are loose records.
 */
export type ContentRow = Record<string, unknown>;
export type ContentDatabase = Record<string, ContentRow>;

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

/** `= ANY($1::int[])`: one bound parameter for any number of parent ids. */
export function anyInt(ids: readonly number[]) {
  return sql<number>`any(${ids}::int[])`;
}

interface PendingLevel {
  table: TableNode;
  /** Parent row id -> the component lists of that parent. */
  containers: Map<number, ComponentTrees>;
}

/**
 * Loads the component trees of the given root rows. Runs at most one query
 * per component table, and none for a table whose parents have no rows:
 * each level is fetched for all parents at once with `parent_id = ANY(...)`,
 * ordered by `order_index`. Returns root id -> component lists.
 */
export async function loadComponentTrees(
  db: Kysely<ContentDatabase>,
  root: TableNode,
  rootIds: readonly number[],
): Promise<Map<number, ComponentTrees>> {
  const result = new Map<number, ComponentTrees>(
    rootIds.map((id) => [id, emptyComponents(root)]),
  );
  const queue: PendingLevel[] = [{ table: root, containers: result }];

  for (let level = queue.shift(); level; level = queue.shift()) {
    const parentIds = [...level.containers.keys()];
    if (parentIds.length === 0) continue;

    for (const component of level.table.components) {
      const { table, field } = component;
      const rows = await db
        .withSchema(CONTENT_DB_SCHEMA)
        .selectFrom(table.plan.name)
        .select([
          ...COMPONENT_SYSTEM_COLUMNS,
          ...table.plan.columns.map((column) => column.name),
        ])
        .where('parent_id', '=', anyInt(parentIds))
        .orderBy('parent_id')
        .orderBy('order_index')
        .orderBy('id')
        .execute();

      const children = new Map<number, ComponentTrees>();
      for (const row of rows) {
        const node: ComponentNode = {
          id: row.id as number,
          componentUid: row.component_uid as string,
          orderIndex: row.order_index as number,
          values: rowToValues(table, row),
          components: emptyComponents(table),
        };
        level.containers.get(row.parent_id as number)?.[field.name]?.push(node);
        children.set(node.id, node.components);
      }
      queue.push({ table, containers: children });
    }
  }
  return result;
}
