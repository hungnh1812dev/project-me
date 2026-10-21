import { ITEM_UID_KEY } from '../../config/content.constants';
import type {
  ComponentItem,
  DocumentRecord,
  DocumentTree,
  FieldValueMap,
} from './content.api';
import { adapterFor } from './field-registry';
import type { FieldNode } from './field-tree';

export type FormValues = Record<string, unknown>;

const isComponent = (node: FieldNode) => node.children.length > 0;

/** A blank component item: no uid yet, every field empty. */
export function emptyItem(node: FieldNode): FormValues {
  const item: FormValues = { [ITEM_UID_KEY]: '' };
  for (const child of node.children) {
    item[child.name] = isComponent(child)
      ? []
      : adapterFor(child.type).toForm(null);
  }
  return item;
}

function itemToForm(node: FieldNode, source: ComponentItem): FormValues {
  const item: FormValues = { [ITEM_UID_KEY]: source.componentUid ?? '' };
  fillLevel(item, node.children, source.values ?? {}, source.components ?? {});
  return item;
}

function fillLevel(
  into: FormValues,
  nodes: readonly FieldNode[],
  values: FieldValueMap,
  components: Record<string, ComponentItem[] | null | undefined>,
): void {
  for (const node of nodes) {
    if (isComponent(node)) {
      into[node.name] = (components[node.name] ?? []).map((item) =>
        itemToForm(node, item),
      );
    } else {
      into[node.name] = adapterFor(node.type).toForm(values[node.name]);
    }
  }
}

/** Form defaults from a loaded draft (or blank for a new document). */
export function toFormValues(
  nodes: readonly FieldNode[],
  record: Pick<DocumentRecord, 'values' | 'components'> | null,
): FormValues {
  const form: FormValues = {};
  fillLevel(form, nodes, record?.values ?? {}, record?.components ?? {});
  return form;
}

function itemToApi(
  node: FieldNode,
  item: FormValues,
  masked: ReadonlySet<string>,
): ComponentItem {
  const uid = item[ITEM_UID_KEY];
  const known = typeof uid === 'string' && uid !== '';
  const { values, components } = levelToApi(node.children, item, masked, known);
  return {
    ...(known ? { componentUid: uid } : {}),
    values,
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
}

function levelToApi(
  nodes: readonly FieldNode[],
  source: FormValues,
  masked: ReadonlySet<string>,
  keepNulls: boolean,
): { values: FieldValueMap; components: Record<string, ComponentItem[]> } {
  const values: FieldValueMap = {};
  const components: Record<string, ComponentItem[]> = {};
  for (const node of nodes) {
    if (masked.has(node.path)) continue;
    if (isComponent(node)) {
      const items = Array.isArray(source[node.name])
        ? (source[node.name] as FormValues[])
        : [];
      components[node.name] = items.map((item) =>
        itemToApi(node, item, masked),
      );
      continue;
    }
    const adapter = adapterFor(node.type);
    if (!adapter.editable) continue;
    const value = adapter.toApi(source[node.name]);
    if (value !== null || keepNulls) values[node.name] = value;
  }
  return { values, components };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The request body for a form. A new document sends every filled field.
 * An update sends only the top-level fields (and component lists) that
 * differ from `initial`, so fields the role cannot change are never
 * resent. Masked paths and editors not built yet are
 * never sent.
 */
export function toDocumentTree(
  nodes: readonly FieldNode[],
  current: FormValues,
  initial: FormValues | null,
  masked: ReadonlySet<string>,
): DocumentTree {
  const full = levelToApi(nodes, current, masked, false);
  if (initial === null) {
    const filled = nonEmpty(full.components);
    return {
      ...(Object.keys(full.values).length > 0 ? { values: full.values } : {}),
      ...(Object.keys(filled).length > 0 ? { components: filled } : {}),
    };
  }
  const values: FieldValueMap = {};
  const components: Record<string, ComponentItem[]> = {};
  const all = levelToApi(nodes, current, masked, true);
  for (const node of nodes) {
    if (same(current[node.name], initial[node.name])) continue;
    if (isComponent(node)) {
      const list = all.components[node.name];
      if (list !== undefined) components[node.name] = list;
    } else if (node.name in all.values) {
      values[node.name] = all.values[node.name];
    }
  }
  return {
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
}

function nonEmpty(
  components: Record<string, ComponentItem[]>,
): Record<string, ComponentItem[]> {
  return Object.fromEntries(
    Object.entries(components).filter(([, items]) => items.length > 0),
  );
}
