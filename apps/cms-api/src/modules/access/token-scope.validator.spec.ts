import { testCatalog } from '../../../test/fixtures/access.fixture';
import { validateTokenScope } from './token-scope.validator';

const catalog = testCatalog();
const own = { all: [{ field: 'createdBy', op: 'eq', value: '$actor.id' }] };

describe('validateTokenScope', () => {
  it('accepts content subjects with valid lists', () => {
    expect(
      validateTokenScope(
        {
          permissions: [
            { subject: '*', action: 'read' },
            { subject: 'article', action: 'update', writableFields: ['title'] },
          ],
        },
        catalog,
      ).ok,
    ).toBe(true);
  });

  it.each([
    [
      'a system subject',
      { permissions: [{ subject: 'accounts', action: 'read' }] },
    ],
    [
      'an unknown subject',
      { permissions: [{ subject: 'nope', action: 'read' }] },
    ],
    ['an unknown action', { permissions: [{ subject: '*', action: 'own' }] }],
    [
      'conditions (tokens have none)',
      { permissions: [{ subject: '*', action: 'read', conditions: own }] },
    ],
    ['a wrong shape', [{ subject: '*', action: 'read' }]],
    [
      'an unknown field',
      {
        permissions: [
          { subject: 'article', action: 'read', readableFields: ['nope'] },
        ],
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(validateTokenScope(input, catalog).ok).toBe(false);
  });
});
