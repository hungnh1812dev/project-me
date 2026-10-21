import {
  DummyDriver,
  type Expression,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type SqlBool,
} from 'kysely';

import { testCatalog } from '../../../test/fixtures/access.fixture';
import { ACCESS_ERROR_CODES, CONDITION_LIMITS } from './access.constants';
import {
  compileConditions,
  type ConditionActor,
  InvalidConditionError,
  validateConditions,
} from './conditions.compiler';

const db = new Kysely<Record<string, Record<string, unknown>>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const ACTOR: ConditionActor = { id: 7, roleRank: 30 };
const catalog = testCatalog().conditionFields('article', null);

function toSql(where: Expression<SqlBool>) {
  return db.selectFrom('article').selectAll().where(where).compile();
}

function clause(field: string, op: string, value: unknown) {
  return { all: [{ field, op, value }] };
}

function issuesOf(raw: unknown) {
  const result = validateConditions(raw, catalog);
  if (result.ok) throw new Error('expected the conditions to be rejected');
  return result.issues;
}

describe('validateConditions', () => {
  it('accepts the SPEC §8.3 example shape', () => {
    const result = validateConditions(
      {
        all: [
          { field: 'createdBy', op: 'eq', value: '$actor.id' },
          { field: 'title', op: 'in', value: ['a', 'b'] },
        ],
      },
      catalog,
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['eq', 'title', 'x'],
    ['ne', 'priority', 3],
    ['eq', 'score', 1.5],
    ['eq', 'featured', true],
    ['eq', 'releaseDate', '2026-01-31'],
    ['ne', 'releasedAt', '2026-01-31T10:00:00Z'],
    ['eq', 'documentId', '0190a3c2-7b1e-7c3d-9f00-000000000001'],
    ['eq', 'priority', '$actor.roleRank'],
    ['ne', 'updatedBy', '$actor.id'],
    ['eq', 'title', null],
  ])('accepts %s on %s', (op, field, value) => {
    expect(validateConditions(clause(field, op, value), catalog).ok).toBe(true);
  });

  it('flags every problem with PERMISSION_INVALID_CONDITION and a path', () => {
    const issues = issuesOf({
      all: [
        { field: 'title', op: 'eq', value: 'ok' },
        { field: 'nope', op: 'eq', value: 'x' },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
      path: ['all', 1, 'field'],
    });
  });

  describe('rejects', () => {
    it.each([
      ['a non-object', 'createdBy = 1'],
      ['null', null],
      ['an empty list', { all: [] }],
      [
        'another combinator',
        { any: [{ field: 'title', op: 'eq', value: 'x' }] },
      ],
      [
        'extra top-level keys',
        { all: [{ field: 'title', op: 'eq', value: 'x' }], sql: '1=1' },
      ],
      [
        'extra clause keys',
        { all: [{ field: 'title', op: 'eq', value: 'x', raw: 'or 1=1' }] },
      ],
      [
        'nested sets',
        { all: [{ all: [{ field: 'title', op: 'eq', value: 'x' }] }] },
      ],
    ])('%s', (_label, raw) => {
      expect(issuesOf(raw).length).toBeGreaterThan(0);
    });

    it.each(['gt', 'like', 'EQ', 'raw', 'or', '= 1 or 1=1 --'])(
      'operator %j',
      (op) => {
        expect(issuesOf(clause('title', op, 'x'))[0]?.path).toEqual([
          'all',
          0,
          'op',
        ]);
      },
    );

    it.each([
      '$actor.email',
      '$actor.id; drop table accounts',
      '$ACTOR.ID',
      '$env.JWT_ACCESS_SECRET',
      '$',
    ])('variable %j', (value) => {
      expect(issuesOf(clause('priority', 'eq', value))[0]?.path).toEqual([
        'all',
        0,
        'value',
      ]);
    });

    it.each([
      ['a json field', 'meta'],
      ['a component', 'reference'],
      ['a nested field', 'reference.phone'],
      ['a raw column name', 'created_by'],
      ['an injected column', 'title" or 1=1 --'],
      ['a qualified name', 'accounts.password_hash'],
      ['a prototype key', '__proto__'],
      ['a prototype key', 'toString'],
    ])('%s (%s)', (_label, field) => {
      expect(issuesOf(clause(field, 'eq', 'x'))[0]?.path).toEqual([
        'all',
        0,
        'field',
      ]);
    });

    it.each([
      ['a string for an integer', 'priority', 'x'],
      ['a float for an integer', 'priority', 1.5],
      ['a number for a string', 'title', 1],
      ['a string for a boolean', 'featured', 'true'],
      ['a bad date', 'releaseDate', '2026-13-45'],
      ['a non-date', 'releaseDate', "2026-01-01' or '1'='1"],
      ['a non-uuid', 'documentId', "x' or 1=1 --"],
      ['a variable on a string field', 'title', '$actor.id'],
      [
        'a too long string',
        'title',
        'x'.repeat(CONDITION_LIMITS.MAX_STRING_LENGTH + 1),
      ],
      ['an object value', 'title', { $raw: '1=1' }],
      ['an array for eq', 'title', ['a']],
    ])('%s', (_label, field, value) => {
      expect(issuesOf(clause(field, 'eq', value)).length).toBeGreaterThan(0);
    });

    it.each([
      ['a scalar', 'x'],
      ['an empty list', []],
      ['null inside', ['a', null]],
      [
        'too many values',
        Array.from(
          { length: CONDITION_LIMITS.MAX_IN_VALUES + 1 },
          (_, i) => `v${i}`,
        ),
      ],
    ])('"in" with %s', (_label, value) => {
      expect(issuesOf(clause('title', 'in', value)).length).toBeGreaterThan(0);
    });

    it('more clauses than the limit', () => {
      const all = Array.from(
        { length: CONDITION_LIMITS.MAX_CLAUSES + 1 },
        () => ({
          field: 'title',
          op: 'eq',
          value: 'x',
        }),
      );
      expect(issuesOf({ all }).length).toBeGreaterThan(0);
    });
  });

  it('only allows readable fields when given a readable list', () => {
    const restricted = testCatalog().conditionFields('article', ['title']);
    expect(validateConditions(clause('title', 'eq', 'x'), restricted).ok).toBe(
      true,
    );
    expect(validateConditions(clause('priority', 'eq', 1), restricted).ok).toBe(
      false,
    );
    expect(
      validateConditions(clause('createdBy', 'eq', '$actor.id'), restricted).ok,
    ).toBe(true);
  });
});

describe('compileConditions', () => {
  it('compiles to parameterized SQL with resolved variables', () => {
    const where = compileConditions(
      {
        all: [
          { field: 'createdBy', op: 'eq', value: '$actor.id' },
          { field: 'title', op: 'in', value: ['a', 'b'] },
          { field: 'priority', op: 'ne', value: '$actor.roleRank' },
        ],
      },
      catalog,
      ACTOR,
    );
    const { sql, parameters } = toSql(where);
    expect(sql).toBe(
      'select * from "article" where ("created_by" = $1 and "title" in ($2, $3) and "priority" is distinct from $4)',
    );
    expect(parameters).toEqual([7, 'a', 'b', 30]);
  });

  it('maps camelCase fields to columns through the content engine names', () => {
    const { sql } = toSql(
      compileConditions(
        clause('releaseDate', 'eq', '2026-01-01'),
        catalog,
        ACTOR,
      ),
    );
    expect(sql).toContain('"release_date" = $1');
  });

  it('uses IS NULL / IS NOT NULL for null literals', () => {
    expect(
      toSql(compileConditions(clause('title', 'eq', null), catalog, ACTOR)).sql,
    ).toContain('"title" is null');
    expect(
      toSql(compileConditions(clause('title', 'ne', null), catalog, ACTOR)).sql,
    ).toContain('"title" is not null');
  });

  it('qualifies columns with the table when asked', () => {
    const { sql } = toSql(
      compileConditions(
        clause('createdBy', 'eq', 1),
        catalog,
        ACTOR,
        'article',
      ),
    );
    expect(sql).toContain('"article"."created_by" = $1');
  });

  it('keeps hostile strings as bind parameters, never as SQL text', () => {
    const hostile = [
      "x' or '1'='1",
      'x"; drop table accounts; --',
      'x $$ or true $$',
    ];
    const { sql, parameters } = toSql(
      compileConditions(clause('title', 'in', hostile), catalog, ACTOR),
    );
    for (const value of hostile) expect(sql).not.toContain(value);
    expect(parameters).toEqual(hostile);
  });

  it('refuses to compile an invalid condition (a hand-edited row fails closed)', () => {
    expect(() =>
      compileConditions(clause('title" or 1=1 --', 'eq', 'x'), catalog, ACTOR),
    ).toThrow(InvalidConditionError);
    expect(() =>
      compileConditions(clause('title', 'like', '%'), catalog, ACTOR),
    ).toThrow(InvalidConditionError);
  });
});

describe('compileConditions with an actor without id', () => {
  it('keeps a null variable as a parameter (= NULL matches nothing)', () => {
    const where = compileConditions(
      clause('createdBy', 'eq', '$actor.id'),
      catalog,
      { id: null, roleRank: 0 },
    );
    expect(toSql(where)).toMatchObject({
      sql: 'select * from "article" where ("created_by" = $1)',
      parameters: [null],
    });
  });
});
