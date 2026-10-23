import type { RegisteredContentType, TableNode } from '../content-engine';
import type {
  ComponentInput,
  ComponentsInput,
  FieldValues,
  TreeInput,
} from '../content-engine';
import { MASKED_FIELDS_KEY, WRITE_TREE_KEYS } from './access.constants';
import { fieldErrors } from './field-errors';
import { joinFieldPath } from './field-paths';
import type { FieldAccess } from './policy-evaluator';
import { maskValueFor } from './record.serializer';

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * SPEC D4 (C5): turns a client write payload (the document tree:
 * `{ values, components }`) into the tree the repository may write, using
 * the writable fields computed from policy for this request.
 *
 * Per key:
 * - `_maskedFields` (at the root or in an item) is ignored: the client never
 *   decides what is masked.
 * - A field the actor cannot read that comes back with its mask value
 *   (`"***"`, or `null` for other types and components) is dropped. An
 *   absent key keeps the stored value (replaceTree rule), so the DB value is
 *   unchanged.
 * - A field the definition does not have → 400 `FIELD_UNKNOWN`.
 * - Any other field that is not writable → 400 `FIELD_NOT_WRITABLE`.
 *
 * Sending a component list replaces that list (items not sent are deleted),
 * so it needs the whole component to be writable (decision T16): write
 * access to only some sub-fields does not allow sending the list.
 * Value types and tree shape (uids, item counts) are checked later by
 * `assertTreeInput` and Postgres.
 */
export class WriteAllowlist {
  constructor(private readonly type: RegisteredContentType) {}

  apply(payload: unknown, fields: FieldAccess): TreeInput {
    return applyTree(this.type.root, payload, fields, '', false);
  }
}

function applyTree(
  table: TableNode,
  input: unknown,
  fields: FieldAccess,
  prefix: string,
  isItem: boolean,
): ComponentInput {
  if (!isPlainObject(input)) throw fieldErrors.invalidPayload();
  const output: ComponentInput = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case MASKED_FIELDS_KEY:
        break;
      case WRITE_TREE_KEYS.VALUES:
        output.values = applyValues(table, value, fields, prefix);
        break;
      case WRITE_TREE_KEYS.COMPONENTS:
        output.components = applyComponents(table, value, fields, prefix);
        break;
      case WRITE_TREE_KEYS.COMPONENT_UID:
        if (!isItem) throw fieldErrors.unknown();
        output.componentUid = value as string;
        break;
      default:
        throw fieldErrors.unknown();
    }
  }
  return output;
}

function applyValues(
  table: TableNode,
  input: unknown,
  { readable, writable }: FieldAccess,
  prefix: string,
): FieldValues {
  if (!isPlainObject(input)) throw fieldErrors.invalidPayload();
  const output: FieldValues = {};
  for (const [name, value] of Object.entries(input)) {
    const column = table.columnsByField.get(name);
    if (column === undefined) throw fieldErrors.unknown();
    const path = joinFieldPath(prefix, name);
    if (!readable.allows(path) && value === maskValueFor(column.field)) {
      continue;
    }
    if (!writable.allows(path)) throw fieldErrors.notWritable(path);
    output[name] = value;
  }
  return output;
}

function applyComponents(
  table: TableNode,
  input: unknown,
  fields: FieldAccess,
  prefix: string,
): ComponentsInput {
  if (!isPlainObject(input)) throw fieldErrors.invalidPayload();
  const children = new Map(
    table.components.map((component) => [component.field.name, component]),
  );
  const output: ComponentsInput = {};
  for (const [name, value] of Object.entries(input)) {
    const component = children.get(name);
    if (component === undefined) throw fieldErrors.unknown();
    const path = joinFieldPath(prefix, name);
    if (
      !fields.readable.reaches(path) &&
      value === maskValueFor(component.field)
    ) {
      continue;
    }
    if (!fields.writable.allows(path)) throw fieldErrors.notWritable(path);
    if (!Array.isArray(value)) throw fieldErrors.invalidPayload();
    output[name] = value.map((item: unknown) =>
      applyTree(component.table, item, fields, path, true),
    );
  }
  return output;
}
