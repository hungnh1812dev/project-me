import type { ConflictDetails, ConflictItem, DiffEntry } from './conflict';
import type { ComponentItem, DocumentTree, FieldValueMap } from './content.api';
import { isMaskedPath, type MergeState, sideOf } from './merge.reducer';

/** Marks a diff item that has no uid yet (`[new#<index>]`). */
const NEW_ITEM_PREFIX = 'new#';

interface Level {
  values: FieldValueMap;
  components: Record<string, ConflictItem[] | null>;
}

interface Context {
  entries: ReadonlyMap<string, DiffEntry>;
  state: MergeState;
  masked: ReadonlySet<string>;
}

const join = (prefix: string, name: string) =>
  prefix === '' ? name : `${prefix}.${name}`;

const chosenClient = (context: Context, path: string) =>
  context.entries.has(path) && sideOf(context.state, path) === 'client';

function hasClientChoice(context: Context, listPath: string): boolean {
  for (const path of context.entries.keys()) {
    const inside = path === listPath || path.startsWith(`${listPath}[`);
    if (inside && chosenClient(context, path)) return true;
  }
  return false;
}

/** A whole item the user keeps from the client side: no uid, no masked fields. */
function newItemInput(
  item: ConflictItem,
  namePath: string,
  masked: ReadonlySet<string>,
): ComponentItem {
  const values: FieldValueMap = {};
  for (const [name, value] of Object.entries(item.values)) {
    if (value === null || value === undefined) continue;
    if (!isMaskedPath(join(namePath, name), masked)) values[name] = value;
  }
  const components: Record<string, ComponentItem[]> = {};
  for (const [name, children] of Object.entries(item.components)) {
    const childPath = join(namePath, name);
    if (children === null || isMaskedPath(childPath, masked)) continue;
    if (children.length > 0) {
      components[name] = children.map((child) =>
        newItemInput(child, childPath, masked),
      );
    }
  }
  return {
    values,
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
}

function resolveLevel(
  context: Context,
  server: Level,
  submitted: Level,
  prefix: string,
  namePath: string,
): { values: FieldValueMap; components: Record<string, ComponentItem[]> } {
  const values: FieldValueMap = {};
  for (const name of Object.keys(server.values)) {
    const path = `${prefix}values.${name}`;
    if (isMaskedPath(join(namePath, name), context.masked)) continue;
    const value = submitted.values[name];
    if (chosenClient(context, path) && value !== undefined)
      values[name] = value;
  }
  const components: Record<string, ComponentItem[]> = {};
  for (const [name, serverItems] of Object.entries(server.components)) {
    const submittedItems = submitted.components[name];
    const childPath = join(namePath, name);
    if (
      serverItems === null ||
      submittedItems == null ||
      isMaskedPath(childPath, context.masked)
    ) {
      continue;
    }
    const list = resolveList(
      context,
      serverItems,
      submittedItems,
      `${prefix}components.${name}`,
      childPath,
    );
    if (list !== null) components[name] = list;
  }
  return { values, components };
}

/**
 * One component list after the user's choices, or null when nothing in it
 * keeps a client change (the stored list stays). A sent list replaces the
 * stored one, so every item the result keeps is named by its uid; an item
 * with only a uid keeps its stored row as is.
 */
function resolveList(
  context: Context,
  server: ConflictItem[],
  submitted: ConflictItem[],
  listPath: string,
  namePath: string,
): ComponentItem[] | null {
  if (!hasClientChoice(context, listPath)) return null;

  const serverByUid = new Map(server.map((item) => [item.componentUid, item]));
  const submittedByUid = new Map(
    submitted.map((item) => [item.componentUid, item]),
  );
  const reordered = chosenClient(context, listPath);
  const basis = reordered ? submitted : server;
  const result: ComponentItem[] = [];
  const seen = new Set<string>();

  const keep = (item: ConflictItem, index: number, fromSubmitted: boolean) => {
    const uid = item.componentUid;
    const inServer = serverByUid.has(uid);
    const inSubmitted = submittedByUid.has(uid);
    if (inServer && inSubmitted) {
      if (seen.has(uid)) return;
      seen.add(uid);
      const serverItem = serverByUid.get(uid) as ConflictItem;
      const submittedItem = submittedByUid.get(uid) as ConflictItem;
      const level = resolveLevel(
        context,
        serverItem,
        submittedItem,
        `${listPath}[${uid}].`,
        namePath,
      );
      result.push({
        componentUid: uid,
        ...(Object.keys(level.values).length > 0
          ? { values: level.values }
          : {}),
        ...(Object.keys(level.components).length > 0
          ? { components: level.components }
          : {}),
      });
    } else if (inServer) {
      // Removed by the user's edit: only a "server" choice brings it back.
      if (!chosenClient(context, `${listPath}[${uid}]`)) {
        result.push({ componentUid: uid });
      }
    } else if (fromSubmitted) {
      // New item: its index is its place in the submitted list.
      const path = `${listPath}[${NEW_ITEM_PREFIX}${index}]`;
      if (chosenClient(context, path)) {
        result.push(newItemInput(item, namePath, context.masked));
      }
    }
  };

  basis.forEach((item, index) => keep(item, index, basis === submitted));
  if (basis === server) {
    submitted.forEach((item, index) => keep(item, index, true));
  } else {
    server.forEach((item, index) => keep(item, index, false));
  }
  return result;
}

/**
 * The PUT body that applies the user's choices on top of the latest saved
 * version. A client choice is sent; a server choice is simply not sent
 * (the stored value stays). Masked fields are never part of it.
 */
export function buildResolvedTree(
  details: ConflictDetails,
  entries: readonly DiffEntry[],
  state: MergeState,
  masked: ReadonlySet<string>,
): DocumentTree {
  const context: Context = {
    entries: new Map(entries.map((entry) => [entry.path, entry])),
    state,
    masked,
  };
  const level = resolveLevel(
    context,
    details.server,
    details.submitted,
    '',
    '',
  );
  return {
    ...(Object.keys(level.values).length > 0 ? { values: level.values } : {}),
    ...(Object.keys(level.components).length > 0
      ? { components: level.components }
      : {}),
  };
}

export const isEmptyTree = (tree: DocumentTree) =>
  tree.values === undefined && tree.components === undefined;
