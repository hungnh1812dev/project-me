import { COMPONENT_FIELD_TYPE } from './FieldTypes.registry';
import {
  MAX_IMPORT_FIELDS,
  type ImportedField,
  type ImportedTree,
  type OptionalFieldKey,
  type OptionalTypeKey,
  type SchemaField,
  type SchemaTree,
} from './SchemaTree.reducer';

/** Why an import is refused; the screen copy maps each to one message (SB-3). */
export type ImportRefusal =
  'notJson' | 'notObject' | 'fieldsMissing' | 'fieldNotObject' | 'tooManyFields';

export type ImportResult = { ok: true; tree: ImportedTree } | { ok: false; refusal: ImportRefusal };

/** Key order of the exported JSON (content-schema.md); kept unknown keys follow. */
const TYPE_KEY_ORDER = ['slug', 'displayName', 'kind', 'draftAndPublish', 'fields'] as const;
const FIELD_KEY_ORDER = [
  'name',
  'displayName',
  'type',
  'component',
  'repeatable',
  'required',
  'sensitive',
  'width',
  'fields',
] as const;

const TYPE_OPTIONAL_KEYS: readonly OptionalTypeKey[] = ['displayName', 'kind', 'draftAndPublish'];
const FIELD_OPTIONAL_KEYS: readonly OptionalFieldKey[] = [
  'displayName',
  'component',
  'repeatable',
  'required',
  'sensitive',
  'width',
];

/** Values an absent key stands for; an optional key equal to its default is written only when held. */
const TYPE_DEFAULTS: Partial<Record<OptionalTypeKey, unknown>> = {
  kind: 'collection',
  draftAndPublish: true,
};
const FIELD_DEFAULTS: Partial<Record<OptionalFieldKey, unknown>> = {
  repeatable: false,
  required: false,
  sensitive: false,
};

const FIELD_STRING_KEYS = ['name', 'type', 'displayName', 'component', 'width'];
const FIELD_BOOLEAN_KEYS = ['repeatable', 'required', 'sensitive'];
const TYPE_STRING_KEYS = ['slug', 'displayName', 'kind'];
const TYPE_BOOLEAN_KEYS = ['draftAndPublish'];

const JSON_INDENT = 2;

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

class ImportRefused extends Error {
  constructor(readonly refusal: ImportRefusal) {
    super(refusal);
  }
}

/** True when the value has the type the builder controls the key with. */
function hasKnownShape(
  key: string,
  value: unknown,
  stringKeys: readonly string[],
  booleanKeys: readonly string[],
): boolean {
  if (stringKeys.includes(key)) return typeof value === 'string';
  if (booleanKeys.includes(key)) return typeof value === 'boolean';
  return false;
}

/** Splits an object into the keys the builder controls and the rest (kept as they are). */
function splitKeys(
  source: PlainObject,
  stringKeys: readonly string[],
  booleanKeys: readonly string[],
): { known: PlainObject; unknownKeys: PlainObject } {
  const known: PlainObject = {};
  const unknownKeys: PlainObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'fields') continue;
    if (hasKnownShape(key, value, stringKeys, booleanKeys)) known[key] = value;
    else unknownKeys[key] = value;
  }
  return { known, unknownKeys };
}

function importField(raw: unknown): ImportedField {
  if (!isPlainObject(raw)) throw new ImportRefused('fieldNotObject');
  const { known, unknownKeys } = splitKeys(raw, FIELD_STRING_KEYS, FIELD_BOOLEAN_KEYS);
  const isComponent = known.type === COMPONENT_FIELD_TYPE;
  if (isComponent && !Array.isArray(raw.fields)) throw new ImportRefused('fieldsMissing');
  const children = isComponent ? (raw.fields as unknown[]).map(importField) : [];
  if (!isComponent && 'fields' in raw) unknownKeys.fields = raw.fields;
  const heldKeys = FIELD_OPTIONAL_KEYS.filter((key) => key in known);
  const { name, type, ...optional } = known;
  return {
    name: typeof name === 'string' ? name : '',
    type: typeof type === 'string' ? type : '',
    ...optional,
    heldKeys,
    unknownKeys,
    fields: children,
  };
}

/** Fields of all levels, counting stops once the import cap is passed. */
function exceedsFieldCap(fields: readonly unknown[], counted = { total: 0 }): boolean {
  for (const field of fields) {
    counted.total += 1;
    if (counted.total > MAX_IMPORT_FIELDS) return true;
    if (
      isPlainObject(field) &&
      Array.isArray(field.fields) &&
      exceedsFieldCap(field.fields, counted)
    )
      return true;
  }
  return false;
}

/** Builds the editor tree from pasted or picked text; refuses with one reason (SB-3). */
export function parseSchemaJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, refusal: 'notJson' };
  }
  if (!isPlainObject(parsed)) return { ok: false, refusal: 'notObject' };
  if (!Array.isArray(parsed.fields)) return { ok: false, refusal: 'fieldsMissing' };
  if (exceedsFieldCap(parsed.fields)) return { ok: false, refusal: 'tooManyFields' };
  try {
    const { known, unknownKeys } = splitKeys(parsed, TYPE_STRING_KEYS, TYPE_BOOLEAN_KEYS);
    const { slug, ...optional } = known;
    return {
      ok: true,
      tree: {
        slug: typeof slug === 'string' ? slug : '',
        ...optional,
        heldKeys: TYPE_OPTIONAL_KEYS.filter((key) => key in known),
        unknownKeys,
        fields: parsed.fields.map(importField),
      },
    };
  } catch (error) {
    if (error instanceof ImportRefused) return { ok: false, refusal: error.refusal };
    throw error;
  }
}

/** Writes `source` keys in `order`, then the kept unknown keys. */
function inOrder(
  order: readonly string[],
  source: PlainObject,
  unknownKeys: Readonly<PlainObject>,
): PlainObject {
  const result: PlainObject = {};
  for (const key of order) if (source[key] !== undefined) result[key] = source[key];
  return { ...result, ...unknownKeys };
}

function shouldWrite(
  key: string,
  value: unknown,
  held: readonly string[],
  defaults: PlainObject,
): boolean {
  if (value === undefined) return false;
  return held.includes(key) || value !== defaults[key];
}

function fieldDefinition(field: SchemaField): PlainObject {
  const source: PlainObject = { name: field.name, type: field.type };
  for (const key of FIELD_OPTIONAL_KEYS) {
    if (shouldWrite(key, field[key], field.heldKeys, FIELD_DEFAULTS)) source[key] = field[key];
  }
  if (field.type === COMPONENT_FIELD_TYPE) source.fields = field.fields.map(fieldDefinition);
  return inOrder(FIELD_KEY_ORDER, source, field.unknownKeys);
}

export interface SerializedSchema {
  /** 2-space JSON with a final newline, in content-schema.md key order. */
  json: string;
  /** The plain object sent to the validator. */
  definition: PlainObject;
}

export function serializeSchemaTree(tree: SchemaTree): SerializedSchema {
  const source: PlainObject = { slug: tree.slug };
  for (const key of TYPE_OPTIONAL_KEYS) {
    if (shouldWrite(key, tree[key], tree.heldKeys, TYPE_DEFAULTS)) source[key] = tree[key];
  }
  source.fields = tree.fields.map(fieldDefinition);
  const definition = inOrder(TYPE_KEY_ORDER, source, tree.unknownKeys);
  return { json: `${JSON.stringify(definition, null, JSON_INDENT)}\n`, definition };
}

export type ErrorPathPart = string | number;

export interface ErrorPathTarget {
  /** Field the path points into; `null` when it points at the type itself or nowhere. */
  fieldId: string | null;
  /** The key the path ends on (`name`, `slug`, `fields`); `undefined` when it ends on a field. */
  key: string | undefined;
}

/** A validator error placed on the tree: the field and key it points at, with its message. */
export interface LocatedError extends ErrorPathTarget {
  message: string;
}

/** Follows `fields[i].fields[j].<key>` through the tree. */
export function fieldIdOfErrorPath(
  tree: SchemaTree,
  path: readonly ErrorPathPart[],
): ErrorPathTarget {
  let list: readonly SchemaField[] = tree.fields;
  let fieldId: string | null = null;
  let position = 0;
  while (path[position] === 'fields' && typeof path[position + 1] === 'number') {
    const field: SchemaField | undefined = list[path[position + 1] as number];
    if (!field) return { fieldId: null, key: undefined };
    fieldId = field.id;
    list = field.fields;
    position += 2;
  }
  const key = path[position];
  return { fieldId, key: key === undefined ? undefined : String(key) };
}

/** Renders `['fields', 5, 'fields', 2, 'name']` as `fields[5].fields[2].name`. */
export function formatErrorPath(path: readonly ErrorPathPart[]): string {
  return path.reduce<string>((text, part) => {
    if (typeof part === 'number') return `${text}[${part}]`;
    return text === '' ? part : `${text}.${part}`;
  }, '');
}
