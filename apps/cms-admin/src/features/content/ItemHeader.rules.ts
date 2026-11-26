import type { ScreenText } from '@configs/locales';

import { FIELD_TYPE, ITEM_SUBTITLE_SEPARATOR, MASKED_VALUE } from './Content.constants';
import { adapterFor } from './Field.registry';
import type { FieldNode } from './FieldTree.rules';

const NUMBER_TYPES: ReadonlySet<string> = new Set([
  FIELD_TYPE.INTEGER,
  FIELD_TYPE.DECIMAL,
  FIELD_TYPE.BIGINTEGER,
  FIELD_TYPE.FLOAT,
  FIELD_TYPE.DOUBLE,
]);

type ItemCopy = Pick<ScreenText<'content'>['content']['list'], 'itemHeader' | 'itemTitle'>;

/** An API value as one line of text: the first line of a string, trimmed; '' when empty. */
export function oneLineTextOf(value: unknown): string {
  const isScalar =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  if (!isScalar) return '';
  const text = String(value);
  return (text.split(/\r?\n/, 1)[0] ?? '').trim();
}

function childTextOf(
  node: FieldNode,
  childName: string | undefined,
  itemValues: Readonly<Record<string, unknown>>,
  masked: ReadonlySet<string>,
): string {
  if (childName === undefined) return '';
  const child = node.children.find((candidate) => candidate.name === childName);
  if (child === undefined || masked.has(child.path)) return '';
  const apiValue = adapterFor(child.type).toApi(itemValues[childName]);
  const isUnreadableNumber =
    NUMBER_TYPES.has(child.type) && apiValue !== null && !Number.isFinite(Number(apiValue));
  if (isUnreadableNumber) return '';
  const text = oneLineTextOf(apiValue);
  return text === MASKED_VALUE ? '' : text;
}

/**
 * Header text of one item of a repeatable component (CE-7). `itemValues` are the
 * item's form values. A child that is absent, masked or empty counts as empty.
 */
export function itemHeaderTextOf(
  node: FieldNode,
  itemValues: Readonly<Record<string, unknown>>,
  masked: ReadonlySet<string>,
  position: number,
  copy: ItemCopy,
): string {
  const title = childTextOf(node, node.titleField, itemValues, masked);
  const subtitle = childTextOf(node, node.subtitleField, itemValues, masked);
  const shown = [title, subtitle].filter((part) => part !== '').join(ITEM_SUBTITLE_SEPARATOR);
  return shown === '' ? copy.itemTitle(node.label, position - 1) : copy.itemHeader(position, shown);
}
