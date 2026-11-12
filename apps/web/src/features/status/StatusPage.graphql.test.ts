import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSchema, parse, validate, type FieldNode, type SelectionSetNode } from 'graphql';

import { MOCK_VIEW } from '@/apis/server/restful/mocks/MockView';
import { STATUS_PAGE_MOCK } from '@/apis/server/restful/mocks/StatusPage.mock';

import { STATUS_PAGE_OPERATION_NAME, STATUS_PAGE_ROOT_FIELDS } from './StatusPage.graphql';
import { STATUS_PAGE_QUERY } from './StatusPage.server';

// Read by path: the web app never imports cms-api code.
const SDL_PATH = resolve(import.meta.dirname, '../../../../cms-api/content/schema.graphql');
const schema = buildSchema(readFileSync(SDL_PATH, 'utf8'));

// D18 limits of the content API.
const MAX_ROOT_FIELDS = 5;
const MAX_DEPTH = 8;
const MAX_FIELD_NODES = 500;

const operation = parse(STATUS_PAGE_QUERY.document.query).definitions[0];
if (operation?.kind !== 'OperationDefinition') throw new Error('Expected one operation');
const rootSelection = operation.selectionSet;

const fieldsOf = (selectionSet: SelectionSetNode): FieldNode[] =>
  selectionSet.selections.filter((selection): selection is FieldNode => selection.kind === 'Field');

/** The key a field has in the response: its alias when it has one. */
const responseKeyOf = (field: FieldNode): string => (field.alias ?? field.name).value;

function selectionPaths(selectionSet: SelectionSetNode, prefix = ''): string[] {
  return fieldsOf(selectionSet).flatMap((field) => {
    const path = `${prefix}${responseKeyOf(field)}`;
    return field.selectionSet === undefined
      ? [path]
      : [path, ...selectionPaths(field.selectionSet, `${path}.`)];
  });
}

function depthOf(selectionSet: SelectionSetNode): number {
  return (
    1 +
    Math.max(
      0,
      ...fieldsOf(selectionSet).map((f) => (f.selectionSet && depthOf(f.selectionSet)) || 0),
    )
  );
}

/** Key paths of a mock value; an array contributes the keys of its first item, an empty one only itself. */
function mockPaths(value: unknown, prefix = ''): string[] {
  const item: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof item !== 'object' || item === null) return [];
  return Object.entries(item).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    return [path, ...mockPaths(child, `${path}.`)];
  });
}

describe('StatusPage mock and query', () => {
  it('is valid against the generated cms-api schema', () => {
    expect(validate(schema, parse(STATUS_PAGE_QUERY.document.query))).toEqual([]);
  });

  it('names its operation and is registered in the mock view', () => {
    expect(STATUS_PAGE_QUERY.document.query).toContain(`query ${STATUS_PAGE_OPERATION_NAME}`);
    expect(MOCK_VIEW[STATUS_PAGE_OPERATION_NAME]).toBe(STATUS_PAGE_MOCK);
  });

  it('has a mock for every root field and a root field for every mock', () => {
    expect(Object.keys(STATUS_PAGE_MOCK).sort()).toEqual(
      Object.keys(STATUS_PAGE_ROOT_FIELDS).sort(),
    );
  });

  it('has every field the mock holds in the query, and every query field in the mock', () => {
    const querySelected = selectionPaths(rootSelection);
    const mocked = mockPaths(STATUS_PAGE_MOCK);
    expect(mocked.sort()).toEqual(querySelected.sort());
  });
});

describe('StatusPage document limits (D18)', () => {
  it('has at most the allowed root fields', () => {
    expect(fieldsOf(rootSelection).length).toBeLessThanOrEqual(MAX_ROOT_FIELDS);
  });

  it('is at most the allowed depth', () => {
    expect(depthOf(rootSelection)).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('has at most the allowed field nodes', () => {
    expect(selectionPaths(rootSelection).length).toBeLessThanOrEqual(MAX_FIELD_NODES);
  });
});
