import { describe, expect, it } from 'vitest';

import { FIELD_TYPES } from './FieldTypes.registry';
import {
  createNewSchemaTree,
  MAX_COMPONENT_DEPTH,
  moveTargetsOf,
  schemaTreeReducer,
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

describe('FIELD_TYPES', () => {
  it('lists the eleven field types in palette order', () => {
    expect(FIELD_TYPES.map((entry) => entry.type)).toEqual([
      'text',
      'string',
      'richtext',
      'integer',
      'decimal',
      'boolean',
      'date',
      'datetime',
      'json',
      'media',
      'component',
    ]);
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
