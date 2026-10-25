import { PermissionAction } from '../../../generated/prisma/client';
import {
  customRole,
  grant,
  systemRole,
  testCatalog,
} from '../../../../test/fixtures/access.fixture';
import type { TokenScope } from './ActorContext.entity';
import {
  scopeEntriesBeyondCreator,
  validateTokenScope,
} from './TokenScope.rules';

const { read, create, update, delete: remove } = PermissionAction;
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

function scope(
  ...permissions: TokenScope['permissions'][number][]
): TokenScope {
  return { permissions };
}

describe('scopeEntriesBeyondCreator (D5 subset check)', () => {
  it('lets the owner hold anything', () => {
    expect(
      scopeEntriesBeyondCreator(
        scope({ subject: '*', action: remove }),
        systemRole('owner'),
      ),
    ).toEqual([]);
  });

  it('accepts entries the creator holds and flags the rest', () => {
    const creator = customRole(20, [
      grant('*', read),
      grant('article', update),
    ]);
    const result = scopeEntriesBeyondCreator(
      scope(
        { subject: 'article', action: read },
        { subject: 'article', action: update },
        { subject: 'article', action: create },
        { subject: 'note', action: update },
      ),
      creator,
    );
    expect(result).toEqual([2, 3]);
  });

  it('needs a * row to hold a * entry', () => {
    const perType = customRole(20, [grant('article', read)]);
    const wildcard = customRole(21, [grant('*', read)]);
    const entry = scope({ subject: '*', action: read });
    expect(scopeEntriesBeyondCreator(entry, perType)).toEqual([0]);
    expect(scopeEntriesBeyondCreator(entry, wildcard)).toEqual([]);
  });

  it('uses the slug rows instead of * when the creator has them (override)', () => {
    const creator = customRole(20, [
      grant('*', read),
      grant('article', read, { readableFields: ['title'] }),
    ]);
    expect(
      scopeEntriesBeyondCreator(
        scope({ subject: 'article', action: read }),
        creator,
      ),
    ).toEqual([0]);
  });

  describe('field lists', () => {
    const creator = customRole(20, [
      grant('article', read, { readableFields: ['title', 'reference'] }),
      grant('article', update, { writableFields: ['title'] }),
    ]);

    it('accepts a list inside the creator list, a component path included', () => {
      expect(
        scopeEntriesBeyondCreator(
          scope({
            subject: 'article',
            action: read,
            readableFields: ['title', 'reference.phone'],
          }),
          creator,
        ),
      ).toEqual([]);
    });

    it('rejects a field outside the list, and null (all) against a list', () => {
      const result = scopeEntriesBeyondCreator(
        scope(
          { subject: 'article', action: read, readableFields: ['priority'] },
          { subject: 'article', action: read, readableFields: null },
          { subject: 'article', action: read },
          { subject: 'article', action: update, writableFields: ['title'] },
          { subject: 'article', action: update, writableFields: ['body'] },
        ),
        creator,
      );
      expect(result).toEqual([0, 1, 2, 4]);
    });

    it('unions the lists of several rows of one action', () => {
      const two = customRole(20, [
        grant('article', read, { readableFields: ['title'] }),
        grant('article', read, { readableFields: ['priority'] }),
      ]);
      expect(
        scopeEntriesBeyondCreator(
          scope({
            subject: 'article',
            action: read,
            readableFields: ['title', 'priority'],
          }),
          two,
        ),
      ).toEqual([]);
    });

    it('ignores row conditions: they only narrow the token', () => {
      const conditional = customRole(20, [
        grant('article', read, {
          conditions: {
            all: [{ field: 'createdBy', op: 'eq', value: '$actor.id' }],
          },
        }),
      ]);
      expect(
        scopeEntriesBeyondCreator(
          scope({ subject: 'article', action: read }),
          conditional,
        ),
      ).toEqual([]);
    });
  });
});
