import type { FieldValues, TableNode } from '../../content-engine';

/** Any node of a tree: root, component item, input or serialized. */
export interface TreeNodeLike {
  values?: FieldValues | undefined;
  components?:
    Record<string, readonly TreeNodeLike[] | null | undefined> | undefined;
}

export type MediaSlot = { values: FieldValues; name: string; path: string };

/** Every `media` field value in the tree, with its input path. */
export function mediaSlots(
  mediaFields: ReadonlyMap<string, readonly string[]>,
  table: TableNode,
  node: TreeNodeLike,
  path: string,
  out: MediaSlot[] = [],
): MediaSlot[] {
  if (node.values !== undefined) {
    for (const name of mediaFields.get(table.plan.name) ?? []) {
      if (name in node.values) {
        out.push({
          values: node.values,
          name,
          path: `${path}values.${name}`,
        });
      }
    }
  }
  for (const { field, table: child } of table.components) {
    (node.components?.[field.name] ?? []).forEach((item, index) =>
      mediaSlots(
        mediaFields,
        child,
        item,
        `${path}components.${field.name}[${index}].`,
        out,
      ),
    );
  }
  return out;
}

/** Copies the levels the walk may write to (values objects); same-realm plain objects. */
export function cloneTree<T extends TreeNodeLike>(node: T): T {
  const copy: TreeNodeLike = { ...node };
  if (node.values !== undefined) copy.values = { ...node.values };
  if (node.components !== undefined) {
    copy.components = Object.fromEntries(
      Object.entries(node.components).map(([name, items]) => [
        name,
        items?.map((item) => cloneTree(item)),
      ]),
    );
  }
  return copy as T;
}
