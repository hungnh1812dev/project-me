import { isDeepStrictEqual } from 'node:util';

import type {
  SerializedComponent,
  SerializedComponents,
  SerializedRecord,
} from '../access/record.serializer';
import type { ContentDocument } from '../content-engine/content.repository';
import type { ComponentInput, TreeInput } from '../content-engine/tree-input';
import type {
  ComponentNode,
  ComponentTrees,
} from '../content-engine/tree-loader';
import { NEW_ITEM_UID } from './documents.constants';

export type DiffChange = 'added' | 'removed' | 'changed' | 'moved';

/**
 * One difference between the stored document and a submitted one.
 * `path` is `values.<field>` or `components.<field>[<componentUid>]...`; an
 * item that has no uid yet is `[new#<index>]`. `server` / `submitted` hold
 * the value (or the whole item) on that side, as serialized for the actor.
 */
export interface DiffEntry {
  path: string;
  change: DiffChange;
  server?: unknown;
  submitted?: unknown;
}

/**
 * The document as it would look once `tree` is applied to `server`: values
 * overwrite, a sent component list replaces the stored one (items matched
 * by `componentUid`; others are new). Fields not sent stay as stored.
 */
export function overlaySubmitted(
  server: ContentDocument,
  tree: TreeInput,
): ContentDocument {
  return {
    ...server,
    values: { ...server.values, ...tree.values },
    components: overlayComponents(server.components, tree.components),
  };
}

function overlayComponents(
  base: ComponentTrees,
  sent: Record<string, ComponentInput[]> | undefined,
): ComponentTrees {
  const result: ComponentTrees = { ...base };
  for (const [name, items] of Object.entries(sent ?? {})) {
    const stored = new Map(
      (base[name] ?? []).map((node) => [node.componentUid, node]),
    );
    result[name] = items.map((item, index): ComponentNode => {
      const known =
        item.componentUid === undefined
          ? undefined
          : stored.get(item.componentUid.toLowerCase());
      return {
        id: known?.id ?? 0,
        componentUid: known?.componentUid ?? NEW_ITEM_UID,
        orderIndex: index,
        values: { ...known?.values, ...item.values },
        components: overlayComponents(known?.components ?? {}, item.components),
      };
    });
  }
  return result;
}

/** A numeric string and a number with the same value are equal (`"1.50"` vs `1.5`). */
function sameValue(a: unknown, b: unknown): boolean {
  if (isDeepStrictEqual(a, b)) return true;
  if (
    (typeof a === 'number' && typeof b === 'string') ||
    (typeof a === 'string' && typeof b === 'number')
  ) {
    return Number(a) === Number(b) && a !== '' && b !== '';
  }
  return false;
}

function normalize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Field-level diff of two serialized records of the same content type.
 * Works on serialized output only, so a field the actor cannot read is the
 * same mask on both sides and never shows up: the diff cannot leak it.
 * Components are matched by `componentUid` (SPEC D11).
 */
export function diffRecords(
  server: SerializedRecord,
  submitted: SerializedRecord,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  diffLevel(normalize(server), normalize(submitted), '', entries);
  return entries;
}

interface Level {
  values: Record<string, unknown>;
  components: SerializedComponents;
}

const at = (base: string, rest: string) =>
  base === '' ? rest : `${base}.${rest}`;

function diffLevel(
  server: Level,
  submitted: Level,
  base: string,
  entries: DiffEntry[],
): void {
  for (const [name, serverValue] of Object.entries(server.values)) {
    const submittedValue = submitted.values[name];
    if (!sameValue(serverValue, submittedValue)) {
      entries.push({
        path: at(base, `values.${name}`),
        change: 'changed',
        server: serverValue,
        submitted: submittedValue,
      });
    }
  }
  for (const [name, serverItems] of Object.entries(server.components)) {
    // A masked component is null on both sides.
    const submittedItems = submitted.components[name];
    if (serverItems === null || submittedItems == null) continue;
    diffList(
      serverItems,
      submittedItems,
      at(base, `components.${name}`),
      entries,
    );
  }
}

function diffList(
  server: SerializedComponent[],
  submitted: SerializedComponent[],
  base: string,
  entries: DiffEntry[],
): void {
  const serverByUid = new Map(server.map((item) => [item.componentUid, item]));
  const submittedUids = new Set(
    submitted
      .map((item) => item.componentUid)
      .filter((uid) => uid !== NEW_ITEM_UID),
  );

  for (const item of server) {
    if (!submittedUids.has(item.componentUid)) {
      entries.push({
        path: `${base}[${item.componentUid}]`,
        change: 'removed',
        server: item,
      });
    }
  }
  submitted.forEach((item, index) => {
    const match =
      item.componentUid === NEW_ITEM_UID
        ? undefined
        : serverByUid.get(item.componentUid);
    if (match === undefined) {
      entries.push({
        path: `${base}[new#${index}]`,
        change: 'added',
        submitted: item,
      });
      return;
    }
    diffLevel(match, item, `${base}[${item.componentUid}]`, entries);
  });

  const keptServer = server
    .map((item) => item.componentUid)
    .filter((uid) => submittedUids.has(uid));
  const keptSubmitted = submitted
    .map((item) => item.componentUid)
    .filter((uid) => serverByUid.has(uid));
  if (!isDeepStrictEqual(keptServer, keptSubmitted)) {
    entries.push({
      path: base,
      change: 'moved',
      server: keptServer,
      submitted: keptSubmitted,
    });
  }
}
