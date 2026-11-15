import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSchema, parse, validate, type FieldNode, type SelectionSetNode } from 'graphql';

import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import { PAGE_CV_QUERY, PAGE_CV_VISITOR_QUERY } from './PageCv.data';
import {
  PAGE_CV_OPERATION_NAME,
  PAGE_CV_ROOT_FIELDS,
  PAGE_CV_VISITOR_OPERATION_NAME,
  sanitizeCvRichtext,
  type PageCvData,
} from './PageCv.graphql';

// Read by path: the web app never imports cms-api code.
const SDL_PATH = resolve(import.meta.dirname, '../../../../cms-api/content/schema.graphql');
const schema = buildSchema(readFileSync(SDL_PATH, 'utf8'));

// D18 limits of the content API.
const MAX_ROOT_FIELDS = 5;
const MAX_DEPTH = 8;
const MAX_FIELD_NODES = 500;

const operation = parse(PAGE_CV_QUERY.document.query).definitions[0];
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

describe('PageCvVisitor document', () => {
  it('is valid against the generated cms-api schema', () => {
    expect(validate(schema, parse(PAGE_CV_VISITOR_QUERY.document.query))).toEqual([]);
  });

  it('fails on a field the schema does not have', () => {
    const unknown = PAGE_CV_VISITOR_QUERY.document.query.replace('position', 'posistion');
    expect(validate(schema, parse(unknown)).length).toBeGreaterThan(0);
  });

  it('names its operation and asks the data fields only, written once', () => {
    expect(PAGE_CV_VISITOR_QUERY.document.query).toContain(
      `query ${PAGE_CV_VISITOR_OPERATION_NAME}`,
    );
    expect(Object.keys(PAGE_CV_VISITOR_QUERY.rootFields)).toEqual(['pageCvAList', 'profile']);
    expect(PAGE_CV_VISITOR_QUERY.rootFields.pageCvAList).toBe(PAGE_CV_ROOT_FIELDS.pageCvAList);
    expect(PAGE_CV_VISITOR_QUERY.rootFields.profile).toBe(PAGE_CV_ROOT_FIELDS.profile);
  });
});

describe('PageCv document', () => {
  it('asks the main CV by isMain, newest first, one entry', () => {
    expect(PAGE_CV_ROOT_FIELDS.pageCvAList).toContain('filter: { isMain: { eq: true } }');
    expect(PAGE_CV_ROOT_FIELDS.pageCvAList).toContain('pageSize: 1');
  });
});

describe('PageCv mock and query', () => {
  it('names its operation and has every mock registered in the mock view by key', () => {
    expect(PAGE_CV_QUERY.document.query).toContain(`query ${PAGE_CV_OPERATION_NAME}`);
    expect(MOCK_VIEW).toMatchObject(PAGE_CV_MOCK);
  });

  it('has a mock for every root field and a root field for every mock', () => {
    expect(Object.keys(PAGE_CV_MOCK).sort()).toEqual(Object.keys(PAGE_CV_ROOT_FIELDS).sort());
  });

  it('has every field the mock holds in the query, and every query field in the mock', () => {
    expect(mockPaths(PAGE_CV_MOCK).sort()).toEqual(selectionPaths(rootSelection).sort());
  });

  it('masks the company so the masked rendering shows', () => {
    expect(PAGE_CV_MOCK.pageCvAList.data[0]?.['_maskedFields']).toContain('experiences.company');
  });
});

describe('PageCv document is valid against the SDL', () => {
  it('validates the page query', () => {
    expect(validate(schema, parse(PAGE_CV_QUERY.document.query))).toEqual([]);
  });
});

describe('PageCv document limits (D18)', () => {
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

describe('sanitizeCvRichtext', () => {
  const upper = (html: string) => html.toUpperCase();
  const data: PageCvData = {
    pageCvAList: {
      data: [
        {
          documentId: 'c1',
          name: null,
          position: null,
          summary: 'summary',
          skills: null,
          experiences: [
            {
              company: 'kept',
              location: null,
              period: null,
              roles: [
                {
                  position: null,
                  period: null,
                  teamSize: null,
                  projects: 'plain',
                  techStacks: null,
                  responsibilities: 'role',
                },
              ],
            },
          ],
          projects: [
            {
              name: 'kept',
              teamSize: null,
              role: null,
              liveLink: null,
              repositoryLink: null,
              techStack: null,
              responsibilities: 'project',
            },
          ],
          educations: null,
          _maskedFields: [],
        },
      ],
    },
    profile: null,
  };

  it('sanitizes the summary, role responsibilities and project responsibilities only', () => {
    const [cv] = sanitizeCvRichtext(data, upper).pageCvAList.data;
    expect(cv?.summary).toBe('SUMMARY');
    expect(cv?.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('ROLE');
    expect(cv?.experiences?.[0]?.roles?.[0]?.projects).toBe('plain');
    expect(cv?.experiences?.[0]?.company).toBe('kept');
    expect(cv?.projects?.[0]?.responsibilities).toBe('PROJECT');
    expect(cv?.projects?.[0]?.name).toBe('kept');
  });

  it('turns a non-string richtext into null', () => {
    const [cv] = sanitizeCvRichtext(
      { ...data, pageCvAList: { data: [{ ...data.pageCvAList.data[0]!, summary: null }] } },
      upper,
    ).pageCvAList.data;
    expect(cv?.summary).toBeNull();
  });
});
