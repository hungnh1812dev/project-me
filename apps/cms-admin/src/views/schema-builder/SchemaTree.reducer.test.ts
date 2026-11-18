import { describe, expect, it } from 'vitest';

import { FIELD_TYPES, paletteItemOfType, paletteItems, variantOf } from './FieldTypes.registry';
import {
  canPlaceComponentIn,
  createNewSchemaTree,
  MAX_COMPONENT_DEPTH,
  moveTargetsOf,
  schemaTreeReducer,
  typeChangeRefusal,
  type ImportedField,
  type SchemaTree,
  type SchemaTreeAction,
} from './SchemaTree.reducer';

const run = (tree: SchemaTree, ...actions: SchemaTreeAction[]) =>
  actions.reduce(schemaTreeReducer, tree);

const add = (tree: SchemaTree, fieldType: string, parentId: string | null = null, index = 99) =>
  schemaTreeReducer(tree, {
    type: 'addField',
    parentId,
    index,
    fieldType: fieldType as never,
  });

/** Nests `levels` components inside each other; returns the tree and the ids, outermost first. */
function nested(levels: number) {
  let tree = createNewSchemaTree();
  const ids: string[] = [];
  for (let i = 0; i < levels; i += 1) {
    tree = add(tree, 'component', ids[i - 1] ?? null);
    ids.push(tree.lastAddedId as string);
  }
  return { tree, ids: ids as [string, string, string] };
}

const names = (tree: SchemaTree) => tree.fields.map((field) => field.name);

describe('field type registry', () => {
  it('lists the sixteen field types', () => {
    expect(FIELD_TYPES.map((entry) => entry.type)).toEqual([
      'text',
      'string',
      'richtext',
      'integer',
      'biginteger',
      'float',
      'double',
      'decimal',
      'boolean',
      'date',
      'datetime',
      'time',
      'enumeration',
      'json',
      'media',
      'component',
    ]);
  });

  it('gives the palette one item per group in place of its members', () => {
    expect(paletteItems().map((item) => item.group ?? item.defaultType)).toEqual([
      'textInput',
      'richtext',
      'number',
      'boolean',
      'datetimePicker',
      'enumeration',
      'json',
      'media',
      'component',
    ]);
    expect(paletteItemOfType('integer')?.group).toBe('number');
    expect(paletteItemOfType('datetime')?.group).toBe('datetimePicker');
  });

  it('finds the group and variant of a field from its type and unsigned', () => {
    const keyOf = (field: { type: string; unsigned?: boolean }) => variantOf(field)?.variant.key;
    expect(keyOf({ type: 'integer' })).toBe('integer');
    expect(keyOf({ type: 'integer', unsigned: true })).toBe('unsignedInteger');
    expect(keyOf({ type: 'integer', unsigned: false })).toBe('integer');
    expect(keyOf({ type: 'biginteger', unsigned: true })).toBe('biginteger');
    expect(keyOf({ type: 'time' })).toBe('time');
    expect(keyOf({ type: 'text' })).toBe('singleLine');
    expect(keyOf({ type: 'string' })).toBe('multiLine');
    expect(variantOf({ type: 'richtext' })).toBeUndefined();
  });
});

describe('schemaTreeReducer', () => {
  it('starts new with the SB-2 defaults and no changes', () => {
    const tree = run(add(createNewSchemaTree(), 'text'), { type: 'startNew' });
    expect(tree).toMatchObject({
      slug: '',
      displayName: '',
      kind: 'collection',
      draftAndPublish: true,
      fields: [],
      changedSinceSnapshot: false,
    });
  });

  it('loads an imported tree with ids, kept keys and a clean flag', () => {
    const child: ImportedField = {
      name: 'b',
      type: 'text',
      heldKeys: [],
      unknownKeys: { x: 1 },
    };
    const tree = run(add(createNewSchemaTree(), 'text'), {
      type: 'load',
      tree: {
        slug: 'post',
        heldKeys: [],
        unknownKeys: { extra: true },
        fields: [
          {
            name: 'a',
            type: 'component',
            component: 'a',
            required: false,
            heldKeys: ['component', 'required'],
            unknownKeys: {},
            fields: [child],
          },
        ],
      },
    });
    expect(tree.changedSinceSnapshot).toBe(false);
    expect(tree.unknownKeys).toEqual({ extra: true });
    expect(tree.fields[0]).toMatchObject({ required: false, heldKeys: ['component', 'required'] });
    expect(tree.fields[0]?.fields[0]).toMatchObject({ name: 'b', unknownKeys: { x: 1 } });
    const ids = [tree.fields[0]?.id, tree.fields[0]?.fields[0]?.id];
    expect(new Set(ids).size).toBe(2);
  });

  it('sets type keys, marks the tree changed and snapshotTaken clears it', () => {
    let tree = run(
      createNewSchemaTree(),
      { type: 'setTypeKey', key: 'slug', value: 'post' },
      { type: 'setTypeKey', key: 'kind', value: 'single' },
      { type: 'setTypeKey', key: 'draftAndPublish', value: false },
    );
    expect(tree).toMatchObject({ slug: 'post', kind: 'single', draftAndPublish: false });
    expect(tree.changedSinceSnapshot).toBe(true);
    tree = run(tree, { type: 'snapshotTaken' });
    expect(tree.changedSinceSnapshot).toBe(false);
  });

  it('adds fields at an index with the lowest free name and selects the new one', () => {
    let tree = add(add(createNewSchemaTree(), 'text'), 'integer');
    expect(names(tree)).toEqual(['field1', 'field2']);
    tree = add(tree, 'boolean', null, 0);
    expect(names(tree)).toEqual(['field3', 'field1', 'field2']);
    expect(tree.lastAddedId).toBe(tree.fields[0]?.id);
  });

  it('reuses a free name after a delete', () => {
    let tree = add(add(add(createNewSchemaTree(), 'text'), 'text'), 'text');
    tree = run(tree, { type: 'deleteField', fieldId: tree.fields[1]?.id as string });
    tree = add(tree, 'text');
    expect(names(tree)).toEqual(['field1', 'field3', 'field2']);
  });

  it('gives a new component the same component value as its name (SB-6)', () => {
    const tree = add(createNewSchemaTree(), 'component');
    expect(tree.fields[0]).toMatchObject({ name: 'field1', component: 'field1' });
  });

  it('keeps names free per level', () => {
    const { tree, ids } = nested(1);
    const withChild = add(tree, 'text', ids[0]);
    expect(withChild.fields[0]?.fields[0]?.name).toBe('field1');
  });

  it('refuses an add to a missing or non-component owner', () => {
    const tree = add(createNewSchemaTree(), 'text');
    expect(add(tree, 'text', tree.lastAddedId)).toBe(tree);
    expect(add(tree, 'text', 'nope')).toBe(tree);
  });

  it('adds components up to the depth limit and refuses the next one', () => {
    const { tree, ids } = nested(MAX_COMPONENT_DEPTH);
    expect(ids).toHaveLength(3);
    expect(add(tree, 'component', ids[2])).toBe(tree);
    expect(add(tree, 'text', ids[2]).fields[0]?.fields[0]?.fields[0]?.fields).toHaveLength(1);
  });

  it('reorders inside a list', () => {
    const tree = add(add(add(createNewSchemaTree(), 'text'), 'text'), 'text');
    const first = tree.fields[0]?.id as string;
    const moved = run(tree, { type: 'moveField', fieldId: first, parentId: null, index: 2 });
    expect(names(moved)).toEqual(['field2', 'field3', 'field1']);
  });

  it('moves a field into a component and back out', () => {
    let tree = add(add(createNewSchemaTree(), 'component'), 'text');
    const [box, leaf] = [tree.fields[0]?.id as string, tree.fields[1]?.id as string];
    tree = run(tree, { type: 'moveField', fieldId: leaf, parentId: box, index: 0 });
    expect(tree.fields).toHaveLength(1);
    expect(tree.fields[0]?.fields[0]?.id).toBe(leaf);
    tree = run(tree, { type: 'moveField', fieldId: leaf, parentId: null, index: 0 });
    expect(tree.fields.map((f) => f.id)).toEqual([leaf, box]);
  });

  it('refuses to move a component into its own subtree', () => {
    const { tree, ids } = nested(2);
    expect(
      schemaTreeReducer(tree, { type: 'moveField', fieldId: ids[0], parentId: ids[1], index: 0 }),
    ).toBe(tree);
    expect(
      schemaTreeReducer(tree, { type: 'moveField', fieldId: ids[0], parentId: ids[0], index: 0 }),
    ).toBe(tree);
  });

  it('refuses a move that takes a subtree past level 3', () => {
    const { tree: deep, ids } = nested(3);
    let tree = add(deep, 'component');
    const loose = tree.lastAddedId as string;
    expect(
      schemaTreeReducer(tree, { type: 'moveField', fieldId: loose, parentId: ids[2], index: 0 }),
    ).toBe(tree);
    tree = add(tree, 'component', loose);
    // loose now holds a component (depth 2): fits under level-1 owner only.
    expect(
      schemaTreeReducer(tree, { type: 'moveField', fieldId: loose, parentId: ids[1], index: 0 }),
    ).toBe(tree);
    expect(
      schemaTreeReducer(tree, { type: 'moveField', fieldId: loose, parentId: ids[0], index: 0 }),
    ).not.toBe(tree);
  });

  it('lists only the lists where the field fits', () => {
    const { tree, ids } = nested(3);
    const withLeaf = add(tree, 'text');
    const leaf = withLeaf.lastAddedId as string;
    expect(moveTargetsOf(withLeaf, leaf).map((t) => t.parentId)).toEqual([null, ...ids]);
    const withBox = add(tree, 'component');
    const box = withBox.lastAddedId as string;
    const targets = moveTargetsOf(withBox, box).map((t) => t.parentId);
    expect(targets).toEqual([null, ids[0], ids[1]]);
    expect(moveTargetsOf(withBox, ids[0]).map((t) => t.parentId)).toEqual([null]);
    expect(moveTargetsOf(withBox, 'nope')).toEqual([]);
  });

  it('duplicates a field with a free name next to it and fresh ids', () => {
    let tree = add(createNewSchemaTree(), 'text');
    const id = tree.fields[0]?.id as string;
    tree = run(
      tree,
      { type: 'duplicateField', fieldId: id },
      { type: 'duplicateField', fieldId: id },
    );
    expect(names(tree)).toEqual(['field1', 'field1_copy2', 'field1_copy']);
    expect(new Set(tree.fields.map((f) => f.id)).size).toBe(3);
    expect(tree.lastAddedId).toBe(tree.fields[1]?.id);
  });

  it('duplicates a component with children, and stays allowed at depth 3', () => {
    const { tree: base, ids } = nested(3);
    let tree = base;
    tree = add(tree, 'text', ids[2]);
    const copy = schemaTreeReducer(tree, { type: 'duplicateField', fieldId: ids[2] });
    const list = copy.fields[0]?.fields[0]?.fields ?? [];
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ name: 'field1_copy', component: 'field1_copy' });
    expect(list[1]?.fields).toHaveLength(1);
    expect(list[1]?.fields[0]?.id).not.toBe(list[0]?.fields[0]?.id);
  });

  it('deletes a field with its subtree', () => {
    const { tree, ids } = nested(2);
    const next = run(tree, { type: 'deleteField', fieldId: ids[0] });
    expect(next.fields).toEqual([]);
    expect(run(tree, { type: 'deleteField', fieldId: 'nope' })).toBe(tree);
  });

  it('sets a field name and optional keys, tracking held keys', () => {
    let tree = add(createNewSchemaTree(), 'text');
    const fieldId = tree.fields[0]?.id as string;
    tree = run(
      tree,
      { type: 'setFieldKey', fieldId, key: 'name', value: 'title' },
      { type: 'setFieldKey', fieldId, key: 'required', value: false },
      { type: 'setFieldKey', fieldId, key: 'width', value: '1/2' },
    );
    expect(tree.fields[0]).toMatchObject({
      name: 'title',
      required: false,
      width: '1/2',
      heldKeys: ['required', 'width'],
    });
    tree = run(tree, { type: 'setFieldKey', fieldId, key: 'width', value: undefined });
    expect(tree.fields[0]?.width).toBeUndefined();
    expect(tree.fields[0]?.heldKeys).toEqual(['required']);
  });

  it('refuses keys the field type does not allow', () => {
    let tree = add(add(createNewSchemaTree(), 'text'), 'component');
    const [text, box] = [tree.fields[0]?.id as string, tree.fields[1]?.id as string];
    const same = tree;
    tree = run(
      tree,
      { type: 'setFieldKey', fieldId: text, key: 'repeatable', value: true },
      { type: 'setFieldKey', fieldId: box, key: 'width', value: 'full' },
    );
    expect(tree.fields).toEqual(same.fields);
  });

  it('changes type to a component, dropping width and setting component', () => {
    let tree = add(createNewSchemaTree(), 'text');
    const fieldId = tree.fields[0]?.id as string;
    tree = run(
      tree,
      { type: 'setFieldKey', fieldId, key: 'width', value: 'full' },
      { type: 'changeFieldType', fieldId, fieldType: 'component' },
    );
    expect(tree.fields[0]).toMatchObject({ type: 'component', component: 'field1' });
    expect(tree.fields[0]?.width).toBeUndefined();
    expect(tree.fields[0]?.heldKeys).toEqual(['component']);
  });

  it('changes a component without fields to a scalar, dropping component keys', () => {
    let tree = add(createNewSchemaTree(), 'component');
    const fieldId = tree.fields[0]?.id as string;
    tree = run(
      tree,
      { type: 'setFieldKey', fieldId, key: 'repeatable', value: true },
      { type: 'changeFieldType', fieldId, fieldType: 'integer' },
    );
    expect(tree.fields[0]).toMatchObject({ type: 'integer', heldKeys: [] });
    expect(tree.fields[0]?.component).toBeUndefined();
    expect(tree.fields[0]?.repeatable).toBeUndefined();
  });

  it('refuses leaving component while it holds fields', () => {
    const { tree, ids } = nested(1);
    const withChild = add(tree, 'text', ids[0]);
    expect(
      schemaTreeReducer(withChild, { type: 'changeFieldType', fieldId: ids[0], fieldType: 'text' }),
    ).toBe(withChild);
  });

  it('refuses a change to component that would pass level 3', () => {
    const { tree, ids } = nested(3);
    const withLeaf = add(tree, 'text', ids[2]);
    const leaf = withLeaf.lastAddedId as string;
    expect(
      schemaTreeReducer(withLeaf, {
        type: 'changeFieldType',
        fieldId: leaf,
        fieldType: 'component',
      }),
    ).toBe(withLeaf);
  });
});

describe('refusal helpers', () => {
  it('says why a type change is refused, and when it is allowed', () => {
    const withChild = add(add(createNewSchemaTree(), 'component'), 'string', 'f1');
    expect(typeChangeRefusal(withChild, 'f1', 'string')).toBe('holdsFields');
    expect(typeChangeRefusal(withChild, 'f2', 'integer')).toBeUndefined();
    const deep = add(
      add(add(createNewSchemaTree(), 'component'), 'component', 'f1'),
      'component',
      'f2',
    );
    const leaf = add(deep, 'string', 'f3');
    expect(typeChangeRefusal(leaf, 'f4', 'component')).toBe('tooDeep');
  });

  it('knows which lists can take a component', () => {
    const deep = add(
      add(add(createNewSchemaTree(), 'component'), 'component', 'f1'),
      'component',
      'f2',
    );
    expect(canPlaceComponentIn(deep, null)).toBe(true);
    expect(canPlaceComponentIn(deep, 'f2')).toBe(true);
    expect(canPlaceComponentIn(deep, 'f3')).toBe(false);
  });
});

describe('number, datetime and enumeration fields', () => {
  const fieldOf = (tree: SchemaTree) => tree.fields[0]!;
  const withField = (type: string) => {
    const tree = add(createNewSchemaTree(), type);
    return { tree, id: fieldOf(tree).id };
  };

  it('starts an enumeration field with an empty options list', () => {
    const { tree } = withField('enumeration');
    expect(fieldOf(tree)).toMatchObject({ options: [], heldKeys: ['options'] });
  });

  it('keeps unsigned only on integer and options only on enumeration', () => {
    const { tree, id } = withField('integer');
    const unsigned = run(tree, { type: 'setFieldKey', fieldId: id, key: 'unsigned', value: true });
    expect(fieldOf(unsigned).unsigned).toBe(true);
    const options = run(unsigned, {
      type: 'setFieldKey',
      fieldId: id,
      key: 'options',
      value: ['a'],
    });
    expect(fieldOf(options).options).toBeUndefined();
    const big = withField('biginteger');
    const refused = run(big.tree, {
      type: 'setFieldKey',
      fieldId: big.id,
      key: 'unsigned',
      value: true,
    });
    expect(fieldOf(refused).unsigned).toBeUndefined();
    const enumeration = withField('enumeration');
    const set = run(enumeration.tree, {
      type: 'setFieldKey',
      fieldId: enumeration.id,
      key: 'options',
      value: ['a', 'b'],
    });
    expect(fieldOf(set).options).toEqual(['a', 'b']);
  });

  it('drops the keys a new type does not allow when retyping', () => {
    const { tree, id } = withField('enumeration');
    const set = run(
      tree,
      { type: 'setFieldKey', fieldId: id, key: 'options', value: ['a'] },
      { type: 'changeFieldType', fieldId: id, fieldType: 'text' },
    );
    expect(fieldOf(set).options).toBeUndefined();
    expect(fieldOf(set).heldKeys).not.toContain('options');
    const back = run(set, { type: 'changeFieldType', fieldId: id, fieldType: 'enumeration' });
    expect(fieldOf(back)).toMatchObject({ options: [], heldKeys: ['options'] });
    const unsigned = withField('integer');
    const retyped = run(
      unsigned.tree,
      { type: 'setFieldKey', fieldId: unsigned.id, key: 'unsigned', value: true },
      { type: 'changeFieldType', fieldId: unsigned.id, fieldType: 'float' },
    );
    expect(fieldOf(retyped).unsigned).toBeUndefined();
    expect(fieldOf(retyped).heldKeys).toEqual([]);
  });

  it('changes the variant: sets the type and presets, drops unsigned when leaving', () => {
    const { tree, id } = withField('integer');
    const unsigned = run(tree, {
      type: 'changeFieldVariant',
      fieldId: id,
      variant: 'unsignedInteger',
    });
    expect(fieldOf(unsigned)).toMatchObject({
      type: 'integer',
      unsigned: true,
      heldKeys: ['unsigned'],
    });
    const big = run(unsigned, { type: 'changeFieldVariant', fieldId: id, variant: 'biginteger' });
    expect(fieldOf(big)).toMatchObject({ type: 'biginteger', heldKeys: [] });
    expect(fieldOf(big).unsigned).toBeUndefined();
    const plain = run(unsigned, { type: 'changeFieldVariant', fieldId: id, variant: 'integer' });
    expect(fieldOf(plain).unsigned).toBeUndefined();
    const date = run(plain, { type: 'changeFieldVariant', fieldId: id, variant: 'time' });
    expect(fieldOf(date).type).toBe('time');
  });

  it('changes between single and multi-line text and keeps the other keys', () => {
    const { tree, id } = withField('text');
    const required = run(
      tree,
      { type: 'setFieldKey', fieldId: id, key: 'required', value: true },
      { type: 'changeFieldVariant', fieldId: id, variant: 'multiLine' },
    );
    expect(fieldOf(required)).toMatchObject({ type: 'string', required: true });
    const back = run(required, { type: 'changeFieldVariant', fieldId: id, variant: 'singleLine' });
    expect(fieldOf(back)).toMatchObject({ type: 'text', required: true, heldKeys: ['required'] });
  });

  it('ignores an unknown variant', () => {
    const { tree, id } = withField('integer');
    expect(run(tree, { type: 'changeFieldVariant', fieldId: id, variant: 'nope' })).toBe(tree);
  });

  it('copies options when duplicating', () => {
    const { tree, id } = withField('enumeration');
    const copied = run(
      tree,
      { type: 'setFieldKey', fieldId: id, key: 'options', value: ['a', 'b'] },
      { type: 'duplicateField', fieldId: id },
    );
    expect(copied.fields[1]).toMatchObject({ options: ['a', 'b'], heldKeys: ['options'] });
  });

  describe('default key', () => {
    const setDefault = (id: string, value: unknown) =>
      ({ type: 'setFieldKey', fieldId: id, key: 'default', value }) as const;

    it('sets the key on a type that takes it and refuses media and component', () => {
      const { tree, id } = withField('integer');
      const set = run(tree, setDefault(id, 5));
      expect(fieldOf(set)).toMatchObject({ default: 5, heldKeys: ['default'] });
      expect(run(set, setDefault(id, undefined)).fields[0]).not.toHaveProperty('default');
      for (const type of ['media', 'component']) {
        const other = withField(type);
        expect(run(other.tree, setDefault(other.id, 'x'))).toBe(other.tree);
      }
    });

    it('drops the default on a type change, except between text and multi-line text', () => {
      const text = withField('text');
      const typed = run(text.tree, setDefault(text.id, 'hi'));
      const multi = run(typed, {
        type: 'changeFieldVariant',
        fieldId: text.id,
        variant: 'multiLine',
      });
      expect(fieldOf(multi)).toMatchObject({ type: 'string', default: 'hi' });
      const rich = run(typed, { type: 'changeFieldType', fieldId: text.id, fieldType: 'richtext' });
      expect(fieldOf(rich).default).toBeUndefined();
      expect(fieldOf(rich).heldKeys).not.toContain('default');

      const number = withField('integer');
      const numbered = run(number.tree, setDefault(number.id, 3));
      const asEnum = run(numbered, {
        type: 'changeFieldType',
        fieldId: number.id,
        fieldType: 'enumeration',
      });
      expect(fieldOf(asEnum).default).toBeUndefined();
    });

    it('keeps the default when the same type takes another variant', () => {
      const { tree, id } = withField('integer');
      const unsigned = run(tree, setDefault(id, 3), {
        type: 'changeFieldVariant',
        fieldId: id,
        variant: 'unsignedInteger',
      });
      expect(fieldOf(unsigned)).toMatchObject({ default: 3, unsigned: true });
    });

    it('keeps a default the options no longer hold, and copies it when duplicating', () => {
      const { tree, id } = withField('enumeration');
      const kept = run(
        tree,
        { type: 'setFieldKey', fieldId: id, key: 'options', value: ['a', 'b'] },
        setDefault(id, 'b'),
        { type: 'setFieldKey', fieldId: id, key: 'options', value: ['a'] },
        { type: 'duplicateField', fieldId: id },
      );
      expect(kept.fields[0]).toMatchObject({ options: ['a'], default: 'b' });
      expect(kept.fields[1]).toMatchObject({ default: 'b' });
      expect(kept.fields[1]!.heldKeys).toContain('default');
    });
  });
});
