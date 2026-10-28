import { type Kysely, sql } from 'kysely';

import {
  COMPONENT_SYSTEM_COLUMNS,
  CONTENT_DB_SCHEMA,
} from '../domain/ContentEngine.constants';
import {
  type ComponentNode,
  type ComponentTrees,
  type ContentRow,
  emptyComponents,
  rowToValues,
} from '../domain/ContentTree.entity';
import type { TableNode } from '../domain/ContentTypeRegistry.entity';

export type ContentDatabase = Record<string, ContentRow>;

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
  const treesByParentId = new Map<number, ComponentTrees>(
    rootIds.map((id) => [id, emptyComponents(root)]),
  );
  const queue: PendingLevel[] = [{ table: root, containers: treesByParentId }];

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
  return treesByParentId;
}
