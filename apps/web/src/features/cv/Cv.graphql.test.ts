import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSchema, parse, validate, type FieldNode, type SelectionSetNode } from 'graphql';

import { CV_PAGE_MOCK } from '@/apis/server/restful/mocks/CvPage.mock';
import { MOCK_VIEW } from '@/apis/server/restful/mocks/MockView';

import {
  CV_PAGE_OPERATION_NAME,
  CV_PAGE_ROOT_FIELDS,
  CV_PAGE_VISITOR_OPERATION_NAME,
} from './Cv.graphql';
import { CV_PAGE_QUERY, CV_PAGE_VISITOR_QUERY } from './CvPage.server';

// Read by path: the web app never imports cms-api code.
const SDL_PATH = resolve(import.meta.dirname, '../../../../cms-api/content/schema.graphql');
const schema = buildSchema(readFileSync(SDL_PATH, 'utf8'));

// D18 limits of the content API.
const MAX_ROOT_FIELDS = 5;
const MAX_DEPTH = 8;
const MAX_FIELD_NODES = 500;

const operation = parse(CV_PAGE_QUERY.document.query).definitions[0];
if (operation?.kind !== 'OperationDefinition') throw new Error('Expected one operation');
const rootSelection = operation.selectionSet;

const fieldsOf = (selectionSet: SelectionSetNode): FieldNode[] =>
  selectionSet.selections.filter((selection): selection is FieldNode => selection.kind === 'Field');

function selectionPaths(selectionSet: SelectionSetNode, prefix = ''): string[] {
  return fieldsOf(selectionSet).flatMap((field) => {
    const path = `${prefix}${field.name.value}`;
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

describe('CvPageVisitor document', () => {
  it('is valid against the generated cms-api schema', () => {
    expect(validate(schema, parse(CV_PAGE_VISITOR_QUERY.document.query))).toEqual([]);
  });

  it('fails on a field the schema does not have', () => {
    const unknown = CV_PAGE_VISITOR_QUERY.document.query.replace('position', 'posistion');
    expect(validate(schema, parse(unknown)).length).toBeGreaterThan(0);
  });

  it('names its operation and asks the data fields only, written once', () => {
    expect(CV_PAGE_VISITOR_QUERY.document.query).toContain(
      `query ${CV_PAGE_VISITOR_OPERATION_NAME}`,
    );
    expect(Object.keys(CV_PAGE_VISITOR_QUERY.rootFields)).toEqual(['cvPageList', 'cvContact']);
    expect(CV_PAGE_VISITOR_QUERY.rootFields.cvPageList).toBe(CV_PAGE_ROOT_FIELDS.cvPageList);
    expect(CV_PAGE_VISITOR_QUERY.rootFields.cvContact).toBe(CV_PAGE_ROOT_FIELDS.cvContact);
  });
});

describe('CvPage document', () => {
  it('asks the main CV by isMain, newest first, one entry', () => {
    expect(CV_PAGE_ROOT_FIELDS.cvPageList).toContain('filter: { isMain: { eq: true } }');
    expect(CV_PAGE_ROOT_FIELDS.cvPageList).toContain('pageSize: 1');
  });
});

describe('CvPage mock and query', () => {
  it('names its operation and is registered in the mock view', () => {
    expect(CV_PAGE_QUERY.document.query).toContain(`query ${CV_PAGE_OPERATION_NAME}`);
    expect(MOCK_VIEW[CV_PAGE_OPERATION_NAME]).toBe(CV_PAGE_MOCK);
  });

  it('has a mock for every root field and a root field for every mock', () => {
    expect(Object.keys(CV_PAGE_MOCK).sort()).toEqual(Object.keys(CV_PAGE_ROOT_FIELDS).sort());
  });

  it('has every field the mock holds in the query, and every query field in the mock', () => {
    expect(mockPaths(CV_PAGE_MOCK).sort()).toEqual(selectionPaths(rootSelection).sort());
  });

  it('masks the phone of a reference and the company so the masked rendering shows', () => {
    const [{ _maskedFields: maskedFields }] = CV_PAGE_MOCK.cvPageList.data as [
      { _maskedFields: string[] },
    ];
    expect(maskedFields).toEqual(
      expect.arrayContaining(['references.phone', 'experiences.company']),
    );
  });
});

describe('CvPage document limits (D18)', () => {
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
