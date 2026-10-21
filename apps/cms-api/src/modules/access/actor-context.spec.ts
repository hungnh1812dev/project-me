import { PermissionAction } from '../../generated/prisma/client';
import {
  InvalidPolicyDataError,
  parseTokenScope,
  rolePolicyFromRows,
} from './actor-context';
import { intersectFieldLists, unionFieldLists } from './field-paths';

const ROLE = {
  id: 1,
  slug: 'editor',
  rank: 30,
  isSystem: true,
  policyVersion: 2,
};

describe('rolePolicyFromRows', () => {
  it('maps Prisma rows, null jsonb meaning all fields / no condition', () => {
    const policy = rolePolicyFromRows(ROLE, [
      {
        subject: 'article',
        action: PermissionAction.read,
        readableFields: ['title'],
        writableFields: null,
        conditions: null,
      },
    ]);
    expect(policy).toEqual({
      ...ROLE,
      permissions: [
        {
          subject: 'article',
          action: 'read',
          readableFields: ['title'],
          writableFields: null,
          conditions: null,
        },
      ],
    });
  });

  it.each([{ title: true }, 'title', [1], ['']])(
    'fails closed on a malformed stored field list %j',
    (readableFields) => {
      expect(() =>
        rolePolicyFromRows(ROLE, [
          {
            subject: 'article',
            action: PermissionAction.read,
            readableFields,
            writableFields: null,
            conditions: null,
          },
        ]),
      ).toThrow(InvalidPolicyDataError);
    },
  );
});

describe('parseTokenScope', () => {
  it('parses a stored scope', () => {
    expect(
      parseTokenScope({ permissions: [{ subject: '*', action: 'read' }] }),
    ).toEqual({ permissions: [{ subject: '*', action: 'read' }] });
  });

  it.each([null, {}, { permissions: [{ subject: '*', action: 'own' }] }])(
    'rejects %j',
    (raw) => {
      expect(() => parseTokenScope(raw)).toThrow(InvalidPolicyDataError);
    },
  );
});

describe('field list algebra', () => {
  it('union: null wins, otherwise distinct paths', () => {
    expect(unionFieldLists([['a'], null])).toBeNull();
    expect(unionFieldLists([['a'], ['a', 'b']])).toEqual(['a', 'b']);
  });

  it('intersection narrows component paths', () => {
    expect(intersectFieldLists(null, ['a'])).toEqual(['a']);
    expect(intersectFieldLists(['ref'], ['ref.phone', 'x'])).toEqual([
      'ref.phone',
    ]);
    expect(intersectFieldLists(['a'], ['b'])).toEqual([]);
    // `ref` is not a prefix match for `reference`.
    expect(intersectFieldLists(['ref'], ['reference'])).toEqual([]);
  });
});
