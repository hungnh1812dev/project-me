import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSchema, parse, validate, type FieldNode, type SelectionSetNode } from 'graphql';

// Read by path: the web app never imports cms-api code.
const SDL_PATH = resolve(import.meta.dirname, '../../../../../cms-api/content/schema.graphql');
const schema = buildSchema(readFileSync(SDL_PATH, 'utf8'));

// D18 limits of the content API.
const MAX_ROOT_FIELDS = 5;
const MAX_DEPTH = 8;
const MAX_FIELD_NODES = 500;

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

export interface ContentQueryContractInput {
  operationName: string;
  /** The built document text of the query (`<QUERY>.document.query`). */
  queryText: string;
  rootFields: Readonly<Record<string, string>>;
  mock: Readonly<Record<string, unknown>>;
  /** `MOCK_VIEW`, passed by the spec: only specs import the mock view by value. */
  mockView: Readonly<Record<string, unknown>>;
  /** Selection paths left out of the two-way mock check because the mock holds an empty list there. */
  emptyMockPathPrefixes?: readonly string[];
}

/** The spec every content query has: valid against the cms-api schema, mock and selection match both ways, D18 limits. */
export function describeContentQueryContract({
  operationName,
  queryText,
  rootFields,
  mock,
  mockView,
  emptyMockPathPrefixes = [],
}: ContentQueryContractInput): void {
  const operation = parse(queryText).definitions[0];
  if (operation?.kind !== 'OperationDefinition') throw new Error('Expected one operation');
  const rootSelection = operation.selectionSet;

  describe(`${operationName} mock and query`, () => {
    it('is valid against the generated cms-api schema', () => {
      expect(validate(schema, parse(queryText))).toEqual([]);
    });

    it('names its operation and has every mock registered in the mock view by key', () => {
      expect(queryText).toContain(`query ${operationName}`);
      expect(mockView).toMatchObject(mock);
    });

    it('has a mock for every root field and a root field for every mock', () => {
      expect(Object.keys(mock).sort()).toEqual(Object.keys(rootFields).sort());
    });

    it('has every field the mock holds in the query, and every query field in the mock', () => {
      const querySelected = selectionPaths(rootSelection).filter(
        (path) => !emptyMockPathPrefixes.some((prefix) => path.startsWith(prefix)),
      );
      expect(mockPaths(mock).sort()).toEqual(querySelected.sort());
    });
  });

  describe(`${operationName} document limits (D18)`, () => {
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
}
