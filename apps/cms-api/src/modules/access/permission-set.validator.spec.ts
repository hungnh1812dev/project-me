import { testCatalog } from '../../../test/fixtures/access.fixture';
import { ACCESS_ERROR_CODES } from './access.constants';
import { validatePermissionSet } from './permission-set.validator';

const catalog = testCatalog();
const own = { all: [{ field: 'createdBy', op: 'eq', value: '$actor.id' }] };

function issuesOf(input: unknown) {
  const result = validatePermissionSet(input, catalog);
  if (result.ok) throw new Error('expected the set to be rejected');
  return result.issues;
}

describe('validatePermissionSet', () => {
  it('accepts a valid set and normalises missing lists to null', () => {
    const result = validatePermissionSet(
      [
        { subject: '*', action: 'read' },
        {
          subject: 'article',
          action: 'read',
          readableFields: ['title', 'reference.phone'],
        },
        {
          subject: 'article',
          action: 'update',
          writableFields: ['title'],
          conditions: {
            all: [
              { field: 'createdBy', op: 'eq', value: '$actor.id' },
              { field: 'title', op: 'ne', value: 'locked' },
            ],
          },
        },
        { subject: '*', action: 'delete', conditions: own },
        { subject: 'audit_logs', action: 'read' },
      ],
      catalog,
    );
    expect(result.ok && result.value[0]).toEqual({
      subject: '*',
      action: 'read',
      readableFields: null,
      writableFields: null,
      conditions: null,
    });
  });

  it.each([
    [
      'unknown subject',
      [{ subject: 'nope', action: 'read' }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
      [0, 'subject'],
    ],
    [
      'not an array',
      { subject: '*', action: 'read' },
      ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
      [],
    ],
    [
      'extra keys',
      [{ subject: '*', action: 'read', sql: 'x' }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
      [0],
    ],
    [
      'unknown action',
      [{ subject: '*', action: 'admin' }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_ACTION,
      [0, 'action'],
    ],
    [
      'prototype action',
      [{ subject: '*', action: 'toString' }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_ACTION,
      [0, 'action'],
    ],
    [
      'action invalid on a system subject',
      [{ subject: 'audit_logs', action: 'delete' }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_ACTION,
      [0, 'action'],
    ],
    [
      'fields on *',
      [{ subject: '*', action: 'read', readableFields: ['title'] }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'readableFields'],
    ],
    [
      'fields on a system subject',
      [{ subject: 'media', action: 'update', writableFields: ['alt'] }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'writableFields'],
    ],
    [
      'readable list on update',
      [{ subject: 'article', action: 'update', readableFields: ['title'] }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'readableFields'],
    ],
    [
      'writable list on read',
      [{ subject: 'article', action: 'read', writableFields: ['title'] }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'writableFields'],
    ],
    [
      'unknown field',
      [{ subject: 'article', action: 'read', readableFields: ['nope'] }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'readableFields', 0],
    ],
    [
      'duplicate field',
      [
        {
          subject: 'article',
          action: 'read',
          readableFields: ['title', 'title'],
        },
      ],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'readableFields', 1],
    ],
    [
      'non-list fields',
      [{ subject: 'article', action: 'read', readableFields: 'title' }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
      [0, 'readableFields'],
    ],
    [
      'conditions on a system subject',
      [{ subject: 'accounts', action: 'read', conditions: own }],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
      [0, 'conditions'],
    ],
    [
      'bad operator',
      [
        {
          subject: 'article',
          action: 'read',
          conditions: { all: [{ field: 'title', op: 'like', value: '%' }] },
        },
      ],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
      [0, 'conditions', 'all', 0, 'op'],
    ],
    [
      'bad variable',
      [
        {
          subject: 'article',
          action: 'read',
          conditions: {
            all: [{ field: 'priority', op: 'eq', value: '$actor.secret' }],
          },
        },
      ],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
      [0, 'conditions', 'all', 0, 'value'],
    ],
    [
      'content field on *',
      [
        {
          subject: '*',
          action: 'read',
          conditions: { all: [{ field: 'title', op: 'eq', value: 'x' }] },
        },
      ],
      ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
      [0, 'conditions', 'all', 0, 'field'],
    ],
  ])('rejects %s', (_label, input, code, path) => {
    expect(
      issuesOf(input).map((found) => ({ code: found.code, path: found.path })),
    ).toContainEqual({ code, path });
  });

  it('rejects conditions on create rows (T21)', () => {
    expect(
      issuesOf([{ subject: 'article', action: 'create', conditions: own }]),
    ).toEqual([
      expect.objectContaining({
        code: ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
        path: [0, 'conditions'],
      }),
    ]);
  });

  it('conditions may only use fields the set makes readable', () => {
    const conditions = { all: [{ field: 'priority', op: 'eq', value: 1 }] };
    expect(
      issuesOf([
        { subject: 'article', action: 'read', readableFields: ['title'] },
        { subject: 'article', action: 'update', conditions },
      ]),
    ).toContainEqual(
      expect.objectContaining({ path: [1, 'conditions', 'all', 0, 'field'] }),
    );
    // No read row at all: nothing readable either.
    expect(
      issuesOf([{ subject: 'article', action: 'update', conditions }]).length,
    ).toBe(1);
    // A * read row with all fields makes them readable.
    expect(
      validatePermissionSet(
        [
          { subject: '*', action: 'read' },
          { subject: 'article', action: 'update', conditions },
        ],
        catalog,
      ).ok,
    ).toBe(true);
  });

  it('reports every issue, not only the first', () => {
    expect(
      issuesOf([
        { subject: 'nope', action: 'read' },
        { subject: '*', action: 'nope' },
      ]),
    ).toHaveLength(2);
  });
});
