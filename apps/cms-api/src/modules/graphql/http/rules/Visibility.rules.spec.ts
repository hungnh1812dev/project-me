import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  parse,
  validate,
} from 'graphql';

import { ContentTypeVisibilityRule } from './Visibility.rules';

const field = (slug: string) => ({
  type: GraphQLString,
  extensions: { abyss: { slug, operation: 'list' } },
});
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      articleList: field('article'),
      noteList: field('note'),
      plain: { type: GraphQLString },
    },
  }),
});

const run = (query: string, readable: string[]) =>
  validate(schema, parse(query), [
    ContentTypeVisibilityRule((slug) => readable.includes(slug)),
  ]).map((error) => error.message);

describe('ContentTypeVisibilityRule', () => {
  it('passes readable and extension-less fields', () => {
    expect(run('{ articleList noteList plain }', ['article', 'note'])).toEqual(
      [],
    );
  });

  it('reports a hidden root field as an unknown field, aliases and fragments included', () => {
    expect(run('{ noteList }', ['article'])).toEqual([
      'Cannot query field "noteList" on type "Query".',
    ]);
    expect(run('{ a: noteList }', [])).toHaveLength(1);
    expect(run('fragment F on Query { noteList } { ...F }', [])).toHaveLength(
      1,
    );
    expect(run('{ ... on Query { noteList } }', [])).toHaveLength(1);
  });

  it('is the same text a really unknown field gets', () => {
    const [unknown] = validate(schema, parse('{ zzzz }')).map((e) => e.message);
    const [hidden] = run('{ noteList }', []);
    expect(hidden?.replace('noteList', 'zzzz')).toBe(unknown);
  });
});
