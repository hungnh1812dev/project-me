import type { FieldDefinition, FilterOperator } from './types';

/** How the UI treats a field: its type, with repeatable components and unknown types told apart. */
export type FieldKind =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'media'
  | 'json'
  | 'component'
  | 'repeatable'
  | 'unknown';

const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'text',
  'richtext',
  'number',
  'boolean',
  'media',
  'json',
  'component',
]);

/** The label of an entry without a text value to show (SPEC breadcrumbs). */
export const UNTITLED_ENTRY = 'Untitled entry';

/** The field's kind. A type the client doesn't know (sent by a newer backend) is `unknown`. */
export function fieldKind(field: FieldDefinition): FieldKind {
  const type: string = field.type;
  if (!KNOWN_TYPES.has(type)) return 'unknown';
  if (type === 'component' && field.repeatable) return 'repeatable';
  return type as FieldKind;
}

const isScalar = (field: FieldDefinition): boolean => {
  const kind = fieldKind(field);
  return kind === 'text' || kind === 'number' || kind === 'boolean';
};

/** Whether the list can sort by this top-level schema field: text, number and boolean only. */
export function isSortableField(field: FieldDefinition): boolean {
  return isScalar(field);
}

/** Whether the column chooser offers this top-level schema field: text, number and boolean only. */
export function isListableField(field: FieldDefinition): boolean {
  return isScalar(field);
}

const TEXT_OPERATORS: readonly FilterOperator[] = ['$eq', '$ne', '$contains'];
/** Number fields and the timestamp system columns. */
export const RANGE_OPERATORS: readonly FilterOperator[] = [
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
];
/** Boolean fields, `id` and `documentId`. */
export const EQUALITY_OPERATORS: readonly FilterOperator[] = ['$eq', '$ne'];

/** The filter operators the backend accepts for a schema field. Empty when it isn't filterable. */
export function filterOperatorsFor(field: FieldDefinition): readonly FilterOperator[] {
  switch (fieldKind(field)) {
    case 'text':
      return TEXT_OPERATORS;
    case 'number':
      return RANGE_OPERATORS;
    case 'boolean':
      return EQUALITY_OPERATORS;
    default:
      return [];
  }
}

const WIDTH_CLASSES: Readonly<Record<string, string>> = {
  '100%': 'md:col-span-6',
  '50%': 'md:col-span-3',
  '1/3': 'md:col-span-2',
};

/**
 * The grid span of a field in the 6-column form grid from `md`. Any other width is full width, and
 * every field is full width below `md` (the grid has one column there).
 */
export function widthClass(width: string | undefined): string {
  if (width !== undefined && Object.hasOwn(WIDTH_CLASSES, width)) return WIDTH_CLASSES[width]!;
  return 'md:col-span-6';
}

/** The field's name in words: "coverImage", "cover_image" and "cover-image" become "Cover image". */
export function fieldLabel(field: Pick<FieldDefinition, 'name'>): string {
  const words = field.name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const textOf = (values: Record<string, unknown>, field: FieldDefinition): string | null => {
  const value = values[field.name];
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
};

/**
 * A short preview of an entry (a document or a component value): the value of the first text field
 * marked `header`, otherwise of the first text field. Fields with an empty value are skipped. `null`
 * when there is no such value.
 */
export function entryHint(fields: readonly FieldDefinition[], values: unknown): string | null {
  if (typeof values !== 'object' || values === null) return null;
  const record = values as Record<string, unknown>;
  const texts = fields.filter((f) => fieldKind(f) === 'text');
  for (const candidates of [texts.filter((f) => f.header), texts]) {
    for (const f of candidates) {
      const text = textOf(record, f);
      if (text !== null) return text;
    }
  }
  return null;
}

/** The label of an entry in breadcrumbs and headings: its `entryHint`, or "Untitled entry". */
export function entryLabel(fields: readonly FieldDefinition[], values: unknown): string {
  return entryHint(fields, values) ?? UNTITLED_ENTRY;
}
