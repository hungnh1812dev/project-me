import { parse } from 'graphql';

import { GRAPHQL_LIMITS } from '../graphql.constants';
import {
  findLimitViolations,
  MaxDepthRule,
  MaxFieldNodesRule,
  MaxRootFieldsRule,
} from './limits.rules';
import {
  validate,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: { _: { type: GraphQLString } },
  }),
});
const run = (rule: typeof MaxDepthRule, query: string) =>
  validate(schema, parse(query), [rule]).map((error) => error.message);

/** `a { a { ... { x } } }` with exactly `levels` nested fields. */
const nested = (levels: number) =>
  `${'a { '.repeat(levels - 1)}x${' }'.repeat(levels - 1)}`;
const rootFields = (count: number) =>
  `{ ${Array.from({ length: count }, (_, i) => `f${i}: a`).join(' ')} }`;

describe('MaxDepthRule', () => {
  it('passes at the limit and fails one level deeper', () => {
    expect(
      run(MaxDepthRule, `{ ${nested(GRAPHQL_LIMITS.MAX_DEPTH)} }`),
    ).toEqual([]);
    expect(
      run(MaxDepthRule, `{ ${nested(GRAPHQL_LIMITS.MAX_DEPTH + 1)} }`),
    ).toHaveLength(1);
  });

  it('counts depth through fragments and inline fragments', () => {
    const deep = nested(GRAPHQL_LIMITS.MAX_DEPTH);
    expect(
      run(MaxDepthRule, `{ ...F } fragment F on Query { ${deep} }`),
    ).toEqual([]);
    expect(
      run(MaxDepthRule, `{ ...F } fragment F on Query { a { ${deep} } }`),
    ).toHaveLength(1);
    expect(
      run(MaxDepthRule, `{ ... on Query { a { ${deep} } } }`),
    ).toHaveLength(1);
  });

  it('does not loop on a fragment cycle', () => {
    expect(
      run(MaxDepthRule, 'fragment A on Query { ...A a } { ...A }'),
    ).toEqual([]);
  });
});

describe('MaxRootFieldsRule', () => {
  it('passes at the limit and fails with one more', () => {
    expect(
      run(MaxRootFieldsRule, rootFields(GRAPHQL_LIMITS.MAX_ROOT_FIELDS)),
    ).toEqual([]);
    expect(
      run(MaxRootFieldsRule, rootFields(GRAPHQL_LIMITS.MAX_ROOT_FIELDS + 1)),
    ).toHaveLength(1);
  });

  it('counts aliases of the same field and root fields behind fragments', () => {
    expect(
      run(MaxRootFieldsRule, '{ a: x a: x b: x c: x d: x e: x }'),
    ).toHaveLength(1);
    expect(
      run(
        MaxRootFieldsRule,
        '{ x ...F ... on Query { y z } } fragment F on Query { a b c }',
      ),
    ).toHaveLength(1);
    expect(
      run(MaxRootFieldsRule, '{ x ...F } fragment F on Query { a b c d }'),
    ).toEqual([]);
  });

  it('counts only the root level, not nested fields', () => {
    expect(
      run(MaxRootFieldsRule, `{ a { ${nested(7)} b c d e f g } }`),
    ).toEqual([]);
  });

  it('ignores the dev introspection roots', () => {
    expect(
      run(MaxRootFieldsRule, '{ a b c d e __schema { types { name } } }'),
    ).toEqual([]);
  });
});

describe('MaxFieldNodesRule', () => {
  const fields = (count: number) =>
    `{ a { ${Array.from({ length: count - 1 }, (_, i) => `f${i}`).join(' ')} } }`;

  it('passes at the limit and fails with one more', () => {
    expect(
      run(MaxFieldNodesRule, fields(GRAPHQL_LIMITS.MAX_FIELD_NODES)),
    ).toEqual([]);
    expect(
      run(MaxFieldNodesRule, fields(GRAPHQL_LIMITS.MAX_FIELD_NODES + 1)),
    ).toHaveLength(1);
  });

  it('counts fields behind fragments each time they are spread', () => {
    const body = Array.from({ length: 200 }, (_, i) => `f${i}`).join(' ');
    const spread = (times: number) =>
      `{ ${Array.from({ length: times }, (_, i) => `a${i}: a { ...F }`).join(' ')} } fragment F on A { ${body} }`;
    // 2 x (1 + 200) = 402 fields
    expect(run(MaxFieldNodesRule, spread(2))).toEqual([]);
    // 3 x (1 + 200) = 603 fields
    expect(run(MaxFieldNodesRule, spread(3))).toHaveLength(1);
  });

  it('stays fast on fragments that spread each other many times', () => {
    const count = 60;
    const fragments = Array.from(
      { length: count },
      (_, i) => `fragment F${i} on A { ...F${i + 1} ...F${i + 1} }`,
    ).join(' ');
    const query = `{ ...F0 } ${fragments} fragment F${count} on A { x }`;
    const started = Date.now();
    expect(run(MaxFieldNodesRule, query)).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('findLimitViolations', () => {
  it('reports GRAPHQL_LIMIT_EXCEEDED without echoing the query', () => {
    const [error] = findLimitViolations(
      parse(`{ ${nested(GRAPHQL_LIMITS.MAX_DEPTH + 1)} }`),
    );
    expect(error?.extensions['code']).toBe('GRAPHQL_LIMIT_EXCEEDED');
    expect(error?.message).not.toContain('a {');
  });

  it('judges each operation on its own', () => {
    const op = (name: string) => `query ${name} ${rootFields(5)}`;
    expect(findLimitViolations(parse(`${op('A')} ${op('B')}`))).toEqual([]);
  });

  it('is clean for a normal query', () => {
    expect(
      findLimitViolations(
        parse('{ cvPageList { data { a } meta { total } } }'),
      ),
    ).toEqual([]);
  });
});
