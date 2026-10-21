import type { ContentDocument } from '../content-engine/content.repository';
import type { FieldDefinition } from '../content-engine/definition.schema';
import type {
  RegisteredContentType,
  TableNode,
} from '../content-engine/registry.service';
import type {
  ComponentNode,
  ComponentTrees,
} from '../content-engine/tree-loader';
import type { FieldValues } from '../content-engine/tree-input';
import {
  MASK_SENTINEL,
  MASK_SENTINEL_FIELD_TYPES,
  MASKED_FIELDS_KEY,
  RECORD_SYSTEM_FIELDS,
  type RecordSystemField,
} from './access.constants';
import { joinFieldPath } from './field-paths';
import type { FieldSelection } from './policy-evaluator';
import type { RecordReadAccess } from './record-read-access';

declare const serializedBrand: unique symbol;

export interface SerializedComponent {
  componentUid: string;
  values: FieldValues;
  components: SerializedComponents;
}

/** A masked component is `null`; a readable one is its item list. */
export type SerializedComponents = Record<string, SerializedComponent[] | null>;

/**
 * A record as an actor may see it. System fields the actor may not see
 * (`createdBy` / `updatedBy` for anonymous and reviewer actors) are
 * omitted, not masked: they are not content fields, so they are not listed
 * in `_maskedFields` either. The brand means only `RecordSerializer`
 * can produce one: response types of document endpoints (T20/T21) must use
 * it, so a raw `ContentDocument` cannot be returned by mistake.
 */
export type SerializedRecord = Partial<
  Pick<ContentDocument, RecordSystemField>
> & {
  values: FieldValues;
  components: SerializedComponents;
  [MASKED_FIELDS_KEY]: string[];
  readonly [serializedBrand]: true;
};

const SENTINEL_TYPES: ReadonlySet<string> = new Set(MASK_SENTINEL_FIELD_TYPES);

/** SPEC §6: `"***"` for string/text/richtext, `null` for every other type and components. */
export function maskValueFor(
  field: FieldDefinition,
): typeof MASK_SENTINEL | null {
  return SENTINEL_TYPES.has(field.type) ? MASK_SENTINEL : null;
}

/**
 * The masked paths of a type for a selection, in definition order. A fully
 * masked component is listed once by its own path (its sub-fields are not
 * listed); a partly readable component lists its masked sub-fields. Paths
 * have no item index: field permissions are the same for every item.
 */
export function maskedFieldPaths(
  table: TableNode,
  readable: FieldSelection,
  prefix = '',
): string[] {
  const paths: string[] = [];
  for (const column of table.plan.columns) {
    const path = joinFieldPath(prefix, column.field.name);
    if (!readable.allows(path)) paths.push(path);
  }
  for (const { field, table: child } of table.components) {
    const path = joinFieldPath(prefix, field.name);
    if (!readable.reaches(path)) paths.push(path);
    else paths.push(...maskedFieldPaths(child, readable, path));
  }
  return paths;
}

/**
 * The one path from a loaded record to a response body (SPEC D3): list,
 * detail, 409 conflict, bulk conflicts, audit metadata views and error
 * details all go through `serialize`. An architecture test
 * (`record-serializer.architecture.spec.ts`) enforces it.
 *
 * Output is built from the definition, never by copying the record: a
 * masked field gets its mask value even if the record carries a raw value
 * (e.g. it was loaded without the projection), and keys the definition does
 * not have are never copied. Build the access with `recordReadAccess()`.
 */
export class RecordSerializer {
  constructor(private readonly type: RegisteredContentType) {}

  serialize(
    record: ContentDocument,
    access: RecordReadAccess,
  ): SerializedRecord {
    const { root } = this.type;
    const { fields } = access;
    const tree = serializeTree(
      root,
      record.values,
      record.components,
      fields,
      '',
    );
    const system = Object.fromEntries(
      RECORD_SYSTEM_FIELDS.filter((key) => access.systemFields.has(key)).map(
        (key) => [key, record[key]],
      ),
    ) as Partial<Pick<ContentDocument, RecordSystemField>>;
    return {
      ...system,
      ...tree,
      [MASKED_FIELDS_KEY]: maskedFieldPaths(root, fields),
    } as SerializedRecord;
  }

  serializeMany(
    records: readonly ContentDocument[],
    access: RecordReadAccess,
  ): SerializedRecord[] {
    return records.map((record) => this.serialize(record, access));
  }
}

function serializeTree(
  table: TableNode,
  values: FieldValues,
  components: ComponentTrees,
  readable: FieldSelection,
  prefix: string,
): Pick<SerializedComponent, 'values' | 'components'> {
  const outValues: FieldValues = {};
  for (const column of table.plan.columns) {
    const { field } = column;
    const path = joinFieldPath(prefix, field.name);
    outValues[field.name] = readable.allows(path)
      ? (values[field.name] ?? null)
      : maskValueFor(field);
  }

  const outComponents: SerializedComponents = {};
  for (const { field, table: child } of table.components) {
    const path = joinFieldPath(prefix, field.name);
    outComponents[field.name] = readable.reaches(path)
      ? (components[field.name] ?? []).map((node) =>
          serializeNode(child, node, readable, path),
        )
      : null;
  }
  return { values: outValues, components: outComponents };
}

function serializeNode(
  table: TableNode,
  node: ComponentNode,
  readable: FieldSelection,
  path: string,
): SerializedComponent {
  return {
    componentUid: node.componentUid,
    ...serializeTree(table, node.values, node.components, readable, path),
  };
}
