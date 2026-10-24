import { COPY } from '../../config/copy.constants';
import { FIELD_TYPE } from './content.constants';
import type { ConflictDetails, ConflictItem, DiffEntry } from './conflict';
import { type FieldNode } from './field-tree';
import { fieldPathOf, isMaskedPath, parseEntryPath } from './merge.reducer';

const copy = COPY.content.conflict;

const NEW_ITEM = /^new#(\d+)$/;

function nodeAt(
  nodes: readonly FieldNode[],
  names: readonly string[],
): FieldNode | undefined {
  let level = nodes;
  let found: FieldNode | undefined;
  for (const name of names) {
    found = level.find((node) => node.name === name);
    if (found === undefined) return undefined;
    level = found.children;
  }
  return found;
}

/** "Skill 2 > Level" for `components.skill[uid].values.level`. */
export function entryTitle(
  entry: DiffEntry,
  fields: readonly FieldNode[],
  details: ConflictDetails,
): string {
  const parsed = parseEntryPath(entry.path);
  if (parsed === null) return entry.path;
  const parts: string[] = [];
  const names: string[] = [];
  let level: { components: Record<string, ConflictItem[] | null> } =
    details.server;
  for (const step of parsed.steps) {
    names.push(step.name);
    const label = nodeAt(fields, names)?.label ?? step.name;
    if (step.uid === undefined) {
      parts.push(label);
      continue;
    }
    const added = NEW_ITEM.exec(step.uid);
    if (added !== null) {
      // A new item is the last step: its place is its index in the sent list.
      parts.push(copy.itemTitle(label, Number(added[1]) + 1));
      break;
    }
    const items = level.components[step.name] ?? [];
    const index = items.findIndex((item) => item.componentUid === step.uid);
    parts.push(index < 0 ? label : copy.itemTitle(label, index + 1));
    const next = items[index];
    if (next === undefined) break;
    level = next;
  }
  if (parsed.field !== undefined) {
    names.push(parsed.field);
    parts.push(nodeAt(fields, names)?.label ?? parsed.field);
  }
  return parts.join(copy.titleSeparator);
}

export function changeLabel(entry: DiffEntry): string {
  return copy.change[entry.change];
}

function stripTags(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').trim();
}

/** A scalar for display, as plain text. Null means "no value". */
export function formatValue(value: unknown, type?: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? copy.yes : copy.no;
  if (typeof value === 'string') {
    const text = type === FIELD_TYPE.RICHTEXT ? stripTags(value) : value;
    return text === '' ? null : text;
  }
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** An added / removed item as lines of "Label: value", without masked fields. */
function summarizeItem(
  item: ConflictItem,
  nodes: readonly FieldNode[],
  prefix: string,
  masked: ReadonlySet<string>,
): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const path = prefix === '' ? node.name : `${prefix}.${node.name}`;
    if (isMaskedPath(path, masked)) continue;
    if (node.children.length > 0) {
      const children = item.components[node.name];
      if (children != null && children.length > 0) {
        lines.push(`${node.label}: ${copy.itemCount(children.length)}`);
      }
      continue;
    }
    const text = formatValue(item.values[node.name], node.type);
    if (text !== null) lines.push(`${node.label}: ${text}`);
  }
  return lines.join('\n');
}

/** What one side of an entry shows; null = nothing on that side. */
export function sideContent(
  entry: DiffEntry,
  side: 'server' | 'submitted',
  fields: readonly FieldNode[],
  masked: ReadonlySet<string>,
): string | null {
  const parsed = parseEntryPath(entry.path);
  const raw = entry[side];
  if (parsed === null || raw === undefined || raw === null) return null;
  const node = nodeAt(fields, fieldPathOf(parsed).split('.'));
  if (parsed.kind === 'value') return formatValue(raw, node?.type);
  if (parsed.kind === 'item') {
    if (node === undefined) return null;
    const text = summarizeItem(
      raw as ConflictItem,
      node.children,
      fieldPathOf(parsed),
      masked,
    );
    return text === '' ? copy.itemWithoutFields : text;
  }
  // moved: both sides list the kept uids; show each side's order by the
  // item's place in the saved version.
  const saved = entry.server;
  if (!Array.isArray(raw) || !Array.isArray(saved)) return null;
  return copy.order(raw.map((uid) => saved.indexOf(uid) + 1));
}
