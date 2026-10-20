import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTENT_ERROR_CODES } from './content-engine.constants';
import { RegistryService, type TableNode } from './registry.service';
import { assertTreeInput, ContentTreeError } from './tree-input';

const CV_PAGE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'content',
  'schemas',
  'cv-page.json',
);
const UID = '0b9e7c1e-4c4e-4b8a-9f00-5d2a3c1b7e10';

function cvPageRoot(): TableNode {
  const definition: unknown = JSON.parse(readFileSync(CV_PAGE_PATH, 'utf8'));
  return RegistryService.fromDefinitions([definition]).resolve('cv-page').root;
}

function treeError(input: unknown): ContentTreeError {
  try {
    assertTreeInput(cvPageRoot(), input);
  } catch (error) {
    if (error instanceof ContentTreeError) return error;
    throw error;
  }
  throw new Error('expected a ContentTreeError');
}

describe('assertTreeInput', () => {
  it('accepts a valid nested tree', () => {
    expect(() =>
      assertTreeInput(cvPageRoot(), {
        values: { position: 'Lead', isMain: true },
        components: {
          experience: [
            {
              componentUid: UID,
              values: { company: 'Acme' },
              components: { role: [{ values: { teamSize: 4 } }] },
            },
          ],
          skill: [],
        },
      }),
    ).not.toThrow();
  });

  it.each([
    ['a non-object tree', [], []],
    ['an unknown top-level key', { status: 'x' }, ['status']],
    [
      'an unknown root field',
      { values: { team_size: 1 } },
      ['values', 'team_size'],
    ],
    [
      'a field of another table',
      { values: { location: 'x' } },
      ['values', 'location'],
    ],
    [
      'an unknown component',
      { components: { roles: [] } },
      ['components', 'roles'],
    ],
    [
      'a component that is not a list',
      { components: { skill: {} } },
      ['components', 'skill'],
    ],
    [
      'an unknown item key',
      { components: { skill: [{ id: 1 }] } },
      ['components', 'skill', 0, 'id'],
    ],
    [
      'an unknown nested field',
      {
        components: {
          experience: [{ components: { role: [{ values: { salary: 1 } }] } }],
        },
      },
      [
        'components',
        'experience',
        0,
        'components',
        'role',
        0,
        'values',
        'salary',
      ],
    ],
  ])('rejects %s', (_label, input, path) => {
    const error = treeError(input);
    expect(error.code).toBe(CONTENT_ERROR_CODES.TREE_INVALID);
    expect(error.path).toEqual(path);
  });

  it('rejects a uid that is not a UUID', () => {
    const error = treeError({
      components: { skill: [{ componentUid: '1 OR 1=1' }] },
    });
    expect(error.code).toBe(CONTENT_ERROR_CODES.TREE_INVALID_UID);
    expect(error.path).toEqual(['components', 'skill', 0, 'componentUid']);
  });

  it('rejects the same uid twice in one list (case-insensitive)', () => {
    const error = treeError({
      components: {
        skill: [{ componentUid: UID }, { componentUid: UID.toUpperCase() }],
      },
    });
    expect(error.code).toBe(CONTENT_ERROR_CODES.TREE_DUPLICATE_UID);
    expect(error.path).toEqual(['components', 'skill', 1, 'componentUid']);
  });

  it('allows more than one item only for repeatable components', () => {
    const definition = {
      slug: 'profile',
      kind: 'single',
      draftAndPublish: false,
      fields: [
        {
          name: 'contact',
          type: 'component',
          fields: [{ name: 'email', type: 'string' }],
        },
      ],
    };
    const root = RegistryService.fromDefinitions([definition]).resolve(
      'profile',
    ).root;
    expect(() =>
      assertTreeInput(root, { components: { contact: [{}] } }),
    ).not.toThrow();
    expect(() =>
      assertTreeInput(root, { components: { contact: [{}, {}] } }),
    ).toThrow(ContentTreeError);
  });
});
