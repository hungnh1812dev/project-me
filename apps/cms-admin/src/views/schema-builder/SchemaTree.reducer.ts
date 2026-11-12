import { COMPONENT_FIELD_TYPE, type FieldTypeName } from './FieldTypes.registry';

/** Components nest at most this deep (canonical-values "Component depth"). */
export const MAX_COMPONENT_DEPTH = 3;

const FIELD_NAME_PREFIX = 'field';
const COPY_SUFFIX = '_copy';

/** Keys of a field that may be absent; `heldKeys` lists the ones present. */
export type OptionalFieldKey =
  'displayName' | 'required' | 'sensitive' | 'width' | 'component' | 'repeatable';

/** Optional keys only a component may hold / only a non-component may hold (SB-8). */
const COMPONENT_ONLY_KEYS: readonly OptionalFieldKey[] = ['component', 'repeatable'];
const NON_COMPONENT_ONLY_KEYS: readonly OptionalFieldKey[] = ['width'];

export interface SchemaField {
  /** Stable client id; never exported. */
  id: string;
  name: string;
  type: string;
  displayName?: string;
  required?: boolean;
  sensitive?: boolean;
  width?: string;
  component?: string;
  repeatable?: boolean;
  /** Optional keys present on the field (an import's `required: false` stays exported). */
  heldKeys: readonly OptionalFieldKey[];
  /** Keys the builder has no control for, kept and exported unchanged (SB-3). */
  unknownKeys: Readonly<Record<string, unknown>>;
  /** Children; empty unless the field is a component. */
  fields: readonly SchemaField[];
}

export type OptionalTypeKey = 'displayName' | 'kind' | 'draftAndPublish';

export interface SchemaTree {
  slug: string;
  displayName?: string;
  kind?: string;
  draftAndPublish?: boolean;
  heldKeys: readonly OptionalTypeKey[];
  unknownKeys: Readonly<Record<string, unknown>>;
  fields: readonly SchemaField[];
  /** True after an edit; cleared by load, start and export (SB-13). */
  changedSinceSnapshot: boolean;
  /** Id of the field the last add created, for selection (SB-6). */
  lastAddedId: string | null;
  nextFieldNumber: number;
}

/** A field as imported, before ids are assigned. */
export interface ImportedField extends Omit<SchemaField, 'id' | 'fields'> {
  fields?: readonly ImportedField[];
}

export interface ImportedTree extends Omit<
  SchemaTree,
  'fields' | 'changedSinceSnapshot' | 'lastAddedId' | 'nextFieldNumber'
> {
  fields: readonly ImportedField[];
}

/** `null` is the root list; otherwise the id of the component that owns the list. */
export type ListOwnerId = string | null;

export type SchemaTreeAction =
  | { type: 'startNew' }
  | { type: 'load'; tree: ImportedTree }
  | { type: 'snapshotTaken' }
  | {
      type: 'setTypeKey';
      key: 'slug' | OptionalTypeKey;
      value: string | boolean | undefined;
    }
  | { type: 'addField'; parentId: ListOwnerId; index: number; fieldType: FieldTypeName }
  | { type: 'moveField'; fieldId: string; parentId: ListOwnerId; index: number }
  | { type: 'duplicateField'; fieldId: string }
  | { type: 'deleteField'; fieldId: string }
  | {
      type: 'setFieldKey';
      fieldId: string;
      key: 'name' | OptionalFieldKey;
      value: string | boolean | undefined;
    }
  | { type: 'changeFieldType'; fieldId: string; fieldType: string };

/** SB-2 defaults. */
export function createNewSchemaTree(): SchemaTree {
  return {
    slug: '',
    displayName: '',
    kind: 'collection',
    draftAndPublish: true,
    heldKeys: ['displayName', 'kind', 'draftAndPublish'],
    unknownKeys: {},
    fields: [],
    changedSinceSnapshot: false,
    lastAddedId: null,
    nextFieldNumber: 1,
  };
}

const isComponent = (field: SchemaField) => field.type === COMPONENT_FIELD_TYPE;

/** How many component levels the field's subtree takes (0 for a non-component). */
function componentDepth(field: SchemaField): number {
  if (!isComponent(field)) return 0;
  return 1 + Math.max(0, ...field.fields.map(componentDepth));
}

export function findField(fields: readonly SchemaField[], id: string): SchemaField | undefined {
  for (const field of fields) {
    if (field.id === id) return field;
    const inChild = findField(field.fields, id);
    if (inChild) return inChild;
  }
  return undefined;
}

/** Level of the list a component owns (1 for a top-level component); root is 0. */
function levelOfList(
  fields: readonly SchemaField[],
  ownerId: ListOwnerId,
  level = 0,
): number | undefined {
  if (ownerId === null) return 0;
  for (const field of fields) {
    if (field.id === ownerId) return level + 1;
    const inChild = levelOfList(field.fields, ownerId, level + 1);
    if (inChild !== undefined) return inChild;
  }
  return undefined;
}

function collectIds(field: SchemaField): string[] {
  return [field.id, ...field.fields.flatMap(collectIds)];
}

function updateList(
  fields: readonly SchemaField[],
  ownerId: ListOwnerId,
  update: (list: readonly SchemaField[]) => readonly SchemaField[],
): readonly SchemaField[] {
  if (ownerId === null) return update(fields);
  return fields.map((field) =>
    field.id === ownerId
      ? { ...field, fields: update(field.fields) }
      : field.fields.length > 0
        ? { ...field, fields: updateList(field.fields, ownerId, update) }
        : field,
  );
}

function updateField(
  fields: readonly SchemaField[],
  id: string,
  update: (field: SchemaField) => SchemaField,
): readonly SchemaField[] {
  return fields.map((field) =>
    field.id === id
      ? update(field)
      : field.fields.length > 0
        ? { ...field, fields: updateField(field.fields, id, update) }
        : field,
  );
}

/** The list owner holding a field (`null` for the top level); undefined when the field is not in the tree. */
export function findParentId(
  fields: readonly SchemaField[],
  id: string,
  parentId: ListOwnerId = null,
): ListOwnerId | undefined {
  for (const field of fields) {
    if (field.id === id) return parentId;
    const inChild = findParentId(field.fields, id, field.id);
    if (inChild !== undefined) return inChild;
  }
  return undefined;
}

export function listOf(tree: SchemaTree, ownerId: ListOwnerId): readonly SchemaField[] | undefined {
  if (ownerId === null) return tree.fields;
  const owner = findField(tree.fields, ownerId);
  return owner && isComponent(owner) ? owner.fields : undefined;
}

function fitsDepth(tree: SchemaTree, ownerId: ListOwnerId, subtreeDepth: number): boolean {
  const level = levelOfList(tree.fields, ownerId);
  return level !== undefined && level + subtreeDepth <= MAX_COMPONENT_DEPTH;
}

/** Whether a new component (or a retyped field) may sit in this list without passing the depth limit (SB-7). */
export function canPlaceComponentIn(tree: SchemaTree, ownerId: ListOwnerId): boolean {
  return fitsDepth(tree, ownerId, 1);
}

function insertAt<T>(list: readonly T[], index: number, item: T): readonly T[] {
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

function edited(tree: SchemaTree, changes: Partial<SchemaTree>): SchemaTree {
  return { ...tree, ...changes, changedSinceSnapshot: true };
}

/** Lowest `field<n>` not used by a sibling. */
function freeFieldName(siblings: readonly SchemaField[]): string {
  const taken = new Set(siblings.map((field) => field.name));
  let n = 1;
  while (taken.has(`${FIELD_NAME_PREFIX}${n}`)) n += 1;
  return `${FIELD_NAME_PREFIX}${n}`;
}

function freeCopyName(name: string, siblings: readonly SchemaField[]): string {
  const taken = new Set(siblings.map((field) => field.name));
  let candidate = `${name}${COPY_SUFFIX}`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${name}${COPY_SUFFIX}${n}`;
  return candidate;
}

function newField(id: string, name: string, type: string): SchemaField {
  const base = { id, name, type, unknownKeys: {}, fields: [] as readonly SchemaField[] };
  return type === COMPONENT_FIELD_TYPE
    ? { ...base, component: name, heldKeys: ['component'] }
    : { ...base, heldKeys: [] };
}

function withoutKeys(field: SchemaField, keys: readonly OptionalFieldKey[]): SchemaField {
  const next: SchemaField = {
    ...field,
    heldKeys: field.heldKeys.filter((key) => !keys.includes(key)),
  };
  for (const key of keys) delete next[key];
  return next;
}

/** Result of an add: the new tree and the id of the field it created. */
export function addField(
  tree: SchemaTree,
  parentId: ListOwnerId,
  index: number,
  fieldType: string,
): { tree: SchemaTree; fieldId: string } | undefined {
  const siblings = listOf(tree, parentId);
  if (!siblings) return undefined;
  const depth = fieldType === COMPONENT_FIELD_TYPE ? 1 : 0;
  if (!fitsDepth(tree, parentId, depth)) return undefined;
  const fieldId = `f${tree.nextFieldNumber}`;
  const field = newField(fieldId, freeFieldName(siblings), fieldType);
  return {
    fieldId,
    tree: edited(tree, {
      fields: updateList(tree.fields, parentId, (list) => insertAt(list, index, field)),
      lastAddedId: fieldId,
      nextFieldNumber: tree.nextFieldNumber + 1,
    }),
  };
}

/** Lists a field can move to (the root and components); never its own subtree, never past the depth limit. */
export function moveTargetsOf(
  tree: SchemaTree,
  fieldId: string,
): { parentId: ListOwnerId; level: number }[] {
  const field = findField(tree.fields, fieldId);
  if (!field) return [];
  const own = new Set(collectIds(field));
  const depth = componentDepth(field);
  const owners: ListOwnerId[] = [null];
  const walk = (list: readonly SchemaField[]) => {
    for (const item of list) {
      if (!isComponent(item)) continue;
      owners.push(item.id);
      walk(item.fields);
    }
  };
  walk(tree.fields);
  return owners
    .filter((ownerId) => ownerId === null || !own.has(ownerId))
    .flatMap((ownerId) => {
      const level = levelOfList(tree.fields, ownerId);
      return level !== undefined && level + depth <= MAX_COMPONENT_DEPTH
        ? [{ parentId: ownerId, level }]
        : [];
    });
}

function moveField(
  tree: SchemaTree,
  fieldId: string,
  parentId: ListOwnerId,
  index: number,
): SchemaTree {
  const field = findField(tree.fields, fieldId);
  if (!field) return tree;
  const allowed = moveTargetsOf(tree, fieldId).some((target) => target.parentId === parentId);
  if (!allowed) return tree;
  const without = updateList(tree.fields, findParentId(tree.fields, fieldId) ?? null, (list) =>
    list.filter((item) => item.id !== fieldId),
  );
  return edited(tree, {
    fields: updateList(without, parentId, (list) => insertAt(list, index, field)),
  });
}

function duplicateField(tree: SchemaTree, fieldId: string): SchemaTree {
  const source = findField(tree.fields, fieldId);
  const parentId = findParentId(tree.fields, fieldId);
  if (!source || parentId === undefined) return tree;
  const siblings = listOf(tree, parentId) ?? [];
  let next = tree.nextFieldNumber;
  const clone = (field: SchemaField): SchemaField => ({
    ...field,
    id: `f${next++}`,
    fields: field.fields.map(clone),
  });
  const copy = clone(source);
  const name = freeCopyName(source.name, siblings);
  const renamed: SchemaField = isComponent(copy)
    ? { ...copy, name, component: name }
    : { ...copy, name };
  const position = siblings.findIndex((item) => item.id === fieldId) + 1;
  return edited(tree, {
    fields: updateList(tree.fields, parentId, (list) => insertAt(list, position, renamed)),
    lastAddedId: renamed.id,
    nextFieldNumber: next,
  });
}

function setFieldKey(
  tree: SchemaTree,
  fieldId: string,
  key: 'name' | OptionalFieldKey,
  value: string | boolean | undefined,
): SchemaTree {
  const field = findField(tree.fields, fieldId);
  if (!field) return tree;
  const forbidden = isComponent(field) ? NON_COMPONENT_ONLY_KEYS : COMPONENT_ONLY_KEYS;
  if (key !== 'name' && forbidden.includes(key)) return tree;
  if (key === 'name' && typeof value !== 'string') return tree;
  return edited(tree, {
    fields: updateField(tree.fields, fieldId, (current) => {
      if (key === 'name') return { ...current, name: value as string };
      if (value === undefined) return withoutKeys(current, [key]);
      return {
        ...current,
        [key]: value,
        heldKeys: current.heldKeys.includes(key) ? current.heldKeys : [...current.heldKeys, key],
      };
    }),
  });
}

export type TypeChangeRefusal = 'holdsFields' | 'tooDeep';

/** Why a field cannot take this type, or `undefined` when it can (SB-8, SB-7). */
export function typeChangeRefusal(
  tree: SchemaTree,
  fieldId: string,
  fieldType: string,
): TypeChangeRefusal | undefined {
  const field = findField(tree.fields, fieldId);
  if (!field) return undefined;
  const toComponent = fieldType === COMPONENT_FIELD_TYPE;
  if (!toComponent && field.fields.length > 0) return 'holdsFields';
  if (toComponent && !isComponent(field)) {
    const parentId = findParentId(tree.fields, fieldId) ?? null;
    if (!fitsDepth(tree, parentId, 1)) return 'tooDeep';
  }
  return undefined;
}

function changeFieldType(tree: SchemaTree, fieldId: string, fieldType: string): SchemaTree {
  const field = findField(tree.fields, fieldId);
  if (!field || field.type === fieldType) return tree;
  if (typeChangeRefusal(tree, fieldId, fieldType) !== undefined) return tree;
  const toComponent = fieldType === COMPONENT_FIELD_TYPE;
  return edited(tree, {
    fields: updateField(tree.fields, fieldId, (current) => {
      const retyped = withoutKeys(
        { ...current, type: fieldType },
        toComponent ? NON_COMPONENT_ONLY_KEYS : COMPONENT_ONLY_KEYS,
      );
      if (!toComponent) return retyped;
      return { ...retyped, component: retyped.name, heldKeys: [...retyped.heldKeys, 'component'] };
    }),
  });
}

function assignIds(
  fields: readonly ImportedField[],
  start: number,
): { fields: SchemaField[]; next: number } {
  let next = start;
  const build = (list: readonly ImportedField[]): SchemaField[] =>
    list.map(({ fields: children, ...rest }) => {
      const id = `f${next++}`;
      return { ...rest, id, fields: build(children ?? []) };
    });
  const built = build(fields);
  return { fields: built, next };
}

export function schemaTreeReducer(tree: SchemaTree, action: SchemaTreeAction): SchemaTree {
  switch (action.type) {
    case 'startNew':
      return createNewSchemaTree();
    case 'load': {
      const { fields, next } = assignIds(action.tree.fields, 1);
      return {
        ...action.tree,
        fields,
        changedSinceSnapshot: false,
        lastAddedId: null,
        nextFieldNumber: next,
      };
    }
    case 'snapshotTaken':
      return { ...tree, changedSinceSnapshot: false };
    case 'setTypeKey': {
      const { key, value } = action;
      if (key === 'slug') {
        return typeof value === 'string' ? edited(tree, { slug: value }) : tree;
      }
      const held =
        value === undefined
          ? tree.heldKeys.filter((heldKey) => heldKey !== key)
          : tree.heldKeys.includes(key)
            ? tree.heldKeys
            : [...tree.heldKeys, key];
      return edited(tree, { [key]: value, heldKeys: held });
    }
    case 'addField':
      return addField(tree, action.parentId, action.index, action.fieldType)?.tree ?? tree;
    case 'moveField':
      return moveField(tree, action.fieldId, action.parentId, action.index);
    case 'duplicateField':
      return duplicateField(tree, action.fieldId);
    case 'deleteField': {
      const parentId = findParentId(tree.fields, action.fieldId);
      if (parentId === undefined) return tree;
      return edited(tree, {
        fields: updateList(tree.fields, parentId, (list) =>
          list.filter((item) => item.id !== action.fieldId),
        ),
      });
    }
    case 'setFieldKey':
      return setFieldKey(tree, action.fieldId, action.key, action.value);
    case 'changeFieldType':
      return changeFieldType(tree, action.fieldId, action.fieldType);
  }
}
