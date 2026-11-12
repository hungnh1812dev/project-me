import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  fieldIdOfErrorPath,
  formatErrorPath,
  parseSchemaJson,
  serializeSchemaTree,
} from './SchemaJson.rules';
import { createNewSchemaTree, schemaTreeReducer, type SchemaTree } from './SchemaTree.reducer';

const SCHEMAS_DIR = join(__dirname, '../../../../cms-api/content/schemas');
const schemaFiles = readdirSync(SCHEMAS_DIR).filter((name) => name.endsWith('.json'));

interface ExportedType {
  fields: Record<string, unknown>[];
  [key: string]: unknown;
}

function exportedOf(tree: SchemaTree): ExportedType {
  return JSON.parse(serializeSchemaTree(tree).json) as ExportedType;
}

function load(text: string): SchemaTree {
  const result = parseSchemaJson(text);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return schemaTreeReducer(createNewSchemaTree(), { type: 'load', tree: result.tree });
}

describe('schema files round trip', () => {
  it('finds the 10 repository schemas', () => {
    expect(schemaFiles).toHaveLength(10);
  });

  it.each(schemaFiles)('%s keeps the same JSON value', (name) => {
    const text = readFileSync(join(SCHEMAS_DIR, name), 'utf8');
    const { json, definition } = serializeSchemaTree(load(text));
    expect(JSON.parse(json)).toEqual(JSON.parse(text));
    expect(definition).toEqual(JSON.parse(text));
    expect(json.endsWith('}\n')).toBe(true);
  });
});

describe('parseSchemaJson refusals', () => {
  it('refuses text that is not JSON', () => {
    expect(parseSchemaJson('{ nope')).toEqual({ ok: false, refusal: 'notJson' });
  });

  it('refuses an array and a scalar', () => {
    expect(parseSchemaJson('[]')).toEqual({ ok: false, refusal: 'notObject' });
    expect(parseSchemaJson('3')).toEqual({ ok: false, refusal: 'notObject' });
  });

  it('refuses a root without a fields array', () => {
    expect(parseSchemaJson('{"slug":"a"}')).toEqual({ ok: false, refusal: 'fieldsMissing' });
  });

  it('refuses a component without fields at any level', () => {
    const text = JSON.stringify({
      slug: 'a',
      fields: [{ name: 'c', type: 'component', fields: [{ name: 'd', type: 'component' }] }],
    });
    expect(parseSchemaJson(text)).toEqual({ ok: false, refusal: 'fieldsMissing' });
  });

  it('refuses a field that is not an object', () => {
    expect(parseSchemaJson('{"slug":"a","fields":["x"]}')).toEqual({
      ok: false,
      refusal: 'fieldNotObject',
    });
  });
});

describe('kept keys', () => {
  it('writes unknown keys last and keeps them unchanged', () => {
    const text = JSON.stringify({
      zeta: { a: 1 },
      fields: [{ extra: [1], type: 'text', name: 'a' }],
      slug: 's',
    });
    const exported = exportedOf(load(text));
    expect(Object.keys(exported)).toEqual(['slug', 'fields', 'zeta']);
    expect(Object.keys(exported.fields[0] ?? {})).toEqual(['name', 'type', 'extra']);
    expect(exported.zeta).toEqual({ a: 1 });
  });

  it('keeps a wrongly typed known key as an unknown key', () => {
    const text = JSON.stringify({
      slug: 's',
      fields: [{ name: 'a', type: 'text', required: 'yes' }],
    });
    expect(exportedOf(load(text)).fields[0]?.required).toBe('yes');
  });

  it('keeps held default keys and drops unheld default values', () => {
    const held = load(
      JSON.stringify({
        slug: 's',
        kind: 'collection',
        draftAndPublish: true,
        fields: [{ name: 'a', type: 'text', required: false }],
      }),
    );
    expect(exportedOf(held)).toMatchObject({
      kind: 'collection',
      draftAndPublish: true,
      fields: [{ required: false }],
    });
    const bare = schemaTreeReducer(load('{"slug":"s","fields":[]}'), {
      type: 'setTypeKey',
      key: 'kind',
      value: undefined,
    });
    expect(exportedOf(bare)).toEqual({ slug: 's', fields: [] });
  });

  it('writes a non-default optional key that was not held', () => {
    const tree: SchemaTree = {
      ...load('{"slug":"s","fields":[{"name":"a","type":"text"}]}'),
      kind: 'single',
    };
    expect(exportedOf(tree).kind).toBe('single');
  });

  it('orders keys as content-schema.md', () => {
    const text = JSON.stringify({
      fields: [
        {
          fields: [],
          width: 'full',
          sensitive: true,
          required: true,
          repeatable: true,
          component: 'c',
          type: 'component',
          displayName: 'C',
          name: 'c',
        },
      ],
      draftAndPublish: false,
      kind: 'single',
      displayName: 'S',
      slug: 's',
    });
    const parsed = exportedOf(load(text));
    expect(Object.keys(parsed)).toEqual([
      'slug',
      'displayName',
      'kind',
      'draftAndPublish',
      'fields',
    ]);
    expect(Object.keys(parsed.fields[0] ?? {})).toEqual([
      'name',
      'displayName',
      'type',
      'component',
      'repeatable',
      'required',
      'sensitive',
      'width',
      'fields',
    ]);
  });
});

describe('error paths', () => {
  const tree = load(
    JSON.stringify({
      slug: 's',
      fields: [
        { name: 'a', type: 'text' },
        { name: 'c', type: 'component', fields: [{ name: 'x', type: 'text' }] },
      ],
    }),
  );
  const first = tree.fields[0]!;
  const component = tree.fields[1]!;

  it('maps root errors to no field', () => {
    expect(fieldIdOfErrorPath(tree, ['slug'])).toEqual({ fieldId: null, key: 'slug' });
    expect(fieldIdOfErrorPath(tree, [])).toEqual({ fieldId: null, key: undefined });
  });

  it('maps a field and a nested field with their key', () => {
    expect(fieldIdOfErrorPath(tree, ['fields', 0, 'name'])).toEqual({
      fieldId: first.id,
      key: 'name',
    });
    expect(fieldIdOfErrorPath(tree, ['fields', 1])).toEqual({
      fieldId: component.id,
      key: undefined,
    });
    expect(fieldIdOfErrorPath(tree, ['fields', 1, 'fields', 0, 'type'])).toEqual({
      fieldId: component.fields[0]!.id,
      key: 'type',
    });
  });

  it('maps an index that is gone to nowhere', () => {
    expect(fieldIdOfErrorPath(tree, ['fields', 9, 'name'])).toEqual({
      fieldId: null,
      key: undefined,
    });
  });

  it('formats paths', () => {
    expect(formatErrorPath(['fields', 5, 'fields', 2, 'name'])).toBe('fields[5].fields[2].name');
    expect(formatErrorPath(['slug'])).toBe('slug');
    expect(formatErrorPath([])).toBe('');
  });
});
