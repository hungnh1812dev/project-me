import { randomUUID } from 'node:crypto';

import type { Transaction } from 'kysely';

import {
  CONTENT_DB_SCHEMA,
  CONTENT_ERROR_CODES,
} from './domain/ContentEngine.constants';
import { toColumnValues } from './domain/ContentRowMapping.rules';
import type { ComponentTableNode, TableNode } from './registry.service';
import type { ContentRow } from './domain/ContentTree.entity';
import {
  type ComponentInput,
  type ComponentsInput,
  ContentTreeError,
  type TreePath,
} from './domain/TreeInput.rules';
import { anyInt, type ContentDatabase } from './tree-loader';

export type WriteMode = 'insert' | 'replace';

export interface ParentWrite {
  id: number;
  /** Inserted by this call, so it has no stored children yet. */
  isNew: boolean;
  components: ComponentsInput | undefined;
  /** Input path of `components`, for error messages. */
  path: TreePath;
}

const uidKey = (parentId: number, uid: string) => `${parentId}:${uid}`;

/** Writes every component table below `table`, one level at a time. */
export async function syncChildren(
  trx: Transaction<ContentDatabase>,
  table: TableNode,
  parents: ParentWrite[],
  mode: WriteMode,
): Promise<void> {
  for (const component of table.components) {
    const targets = parents.flatMap((parent) => {
      const items = parent.components?.[component.field.name];
      return items === undefined ? [] : [{ parent, items }];
    });
    if (targets.length > 0) {
      await syncComponentTable(trx, component, targets, mode);
    }
  }
}

async function syncComponentTable(
  trx: Transaction<ContentDatabase>,
  component: ComponentTableNode,
  targets: { parent: ParentWrite; items: ComponentInput[] }[],
  mode: WriteMode,
): Promise<void> {
  const { table, field } = component;
  const db = trx.withSchema(CONTENT_DB_SCHEMA);
  const storedParentIds = targets
    .filter(({ parent }) => !parent.isNew)
    .map(({ parent }) => parent.id);

  // Stored items of exactly these parents: the only rows this call may touch.
  const stored = new Map<string, number>();
  if (storedParentIds.length > 0) {
    const rows = await db
      .selectFrom(table.plan.name)
      .select(['id', 'parent_id', 'component_uid'])
      .where('parent_id', '=', anyInt(storedParentIds))
      .execute();
    for (const row of rows) {
      stored.set(
        uidKey(row.parent_id as number, row.component_uid as string),
        row.id as number,
      );
    }
  }

  const kept = new Set<number>();
  const updates: { id: number; parentId: number; row: ContentRow }[] = [];
  const inserts: ContentRow[] = [];
  const insertedItems = new Map<
    string,
    { item: ComponentInput; path: TreePath }
  >();
  const next: ParentWrite[] = [];

  for (const { parent, items } of targets) {
    items.forEach((item, index) => {
      const itemPath = [...parent.path, field.name, index];
      const childPath = [...itemPath, 'components'];
      const sentUid = item.componentUid?.toLowerCase();
      const row = {
        ...toColumnValues(table, item.values),
        order_index: index,
      };
      if (mode === 'replace' && sentUid !== undefined) {
        const id = stored.get(uidKey(parent.id, sentUid));
        if (id === undefined) {
          throw new ContentTreeError(
            CONTENT_ERROR_CODES.TREE_UNKNOWN_UID,
            [...itemPath, 'componentUid'],
            `not an item of this ${field.name} list`,
          );
        }
        kept.add(id);
        updates.push({ id, parentId: parent.id, row });
        next.push({
          id,
          isNew: false,
          components: item.components,
          path: childPath,
        });
        return;
      }
      // Insert keeps a sent uid (publish clones draft -> published with the same uids).
      const uid = sentUid ?? randomUUID();
      insertedItems.set(uidKey(parent.id, uid), { item, path: childPath });
      inserts.push({ ...row, parent_id: parent.id, component_uid: uid });
    });
  }

  const removed = [...stored.values()].filter((id) => !kept.has(id));
  if (removed.length > 0) {
    await db
      .deleteFrom(table.plan.name)
      .where('id', '=', anyInt(removed))
      .where('parent_id', '=', anyInt(storedParentIds))
      .execute();
  }

  for (const update of updates) {
    await db
      .updateTable(table.plan.name)
      .set(update.row)
      .where('id', '=', update.id)
      .where('parent_id', '=', update.parentId)
      .execute();
  }

  if (inserts.length > 0) {
    const rows = await db
      .insertInto(table.plan.name)
      .values(inserts)
      .returning(['id', 'parent_id', 'component_uid'])
      .execute();
    for (const row of rows) {
      const inserted = insertedItems.get(
        uidKey(row.parent_id as number, row.component_uid as string),
      );
      next.push({
        id: row.id as number,
        isNew: true,
        components: inserted?.item.components,
        path: inserted?.path ?? [],
      });
    }
  }

  if (next.length > 0) await syncChildren(trx, table, next, mode);
}
